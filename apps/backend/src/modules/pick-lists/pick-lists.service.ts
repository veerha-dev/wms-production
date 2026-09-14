import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PickListsRepository } from './pick-lists.repository';
import { GeneratePickListDto } from './dto';
import { getCurrentTenantId } from '../common/tenant.context';
import { DocumentNumberingService } from '../document-numbering/document-numbering.service';
import { NotificationsService } from '../notifications/notifications.service';

interface AuthUser { id: string; role: string; warehouseId?: string | null }

@Injectable()
export class PickListsService {
  constructor(
    private repository: PickListsRepository,
    private numbering: DocumentNumberingService,
    private readonly notifications: NotificationsService,
  ) {}


  async findAll(query: any, user?: AuthUser) {
    const { page = 1, limit = 50 } = query;
    const scopedQuery = user?.role === 'manager' && user.warehouseId
      ? { ...query, warehouseId: user.warehouseId }
      : query;
    const { data, total } = await this.repository.findAll(getCurrentTenantId(), scopedQuery);
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const item = await this.repository.findById(id, getCurrentTenantId());
    if (!item) throw new NotFoundException(`PickList ${id} not found`);
    return item;
  }

  async create(dto: any) {
    const pickListNumber = dto.pickListNumber || await this.generateCode();
    return this.repository.create(getCurrentTenantId(), { ...dto, pickListNumber });
  }

  async generate(dto: GeneratePickListDto, user?: AuthUser) {
    if (user?.role === 'manager' && user.warehouseId) {
      if (dto.warehouseId && dto.warehouseId !== user.warehouseId) {
        throw new ForbiddenException('Manager can only generate pick lists for their assigned warehouse');
      }
      dto = { ...dto, warehouseId: user.warehouseId };
    }
    const { strategy, orderIds, warehouseId, assignedTo, priority, batchSize, notes } = dto;

    if (!orderIds || orderIds.length === 0) {
      throw new BadRequestException('At least one order ID is required');
    }

    // 1. Query sales order items for all orders
    const soItems = await this.repository.findSalesOrderItems(getCurrentTenantId(), orderIds);
    if (soItems.length === 0) {
      throw new BadRequestException('No items found for the selected orders');
    }

    // 2. Generate pick list number
    const pickListNumber = await this.generateCode();

    // 3. Create pick list header
    const pickList = await this.repository.create(getCurrentTenantId(), {
      pickListNumber,
      soId: strategy === 'single' ? orderIds[0] : null,
      warehouseId,
      strategy: strategy || 'single',
      priority: priority || 'medium',
      batchSize: strategy === 'batch' ? (batchSize || orderIds.length) : null,
      assignedTo: assignedTo || null,
      notes: notes || `${strategy === 'batch' ? 'Batch' : 'Single'} pick for ${orderIds.length} order(s)`,
      status: assignedTo ? 'assigned' : 'pending',
    });

    // Batch picking: assign a tote per SO (Tote A, Tote B, ...). This lets the picker walk once
    // and drop items into the correct slot for each order (PDF §3.3 Batch Picking).
    const toteForSo: Record<string, string | null> = {};
    if (strategy === 'batch') {
      const uniqueSoIds = Array.from(new Set(soItems.map((it) => it.soId)));
      uniqueSoIds.forEach((soId, idx) => {
        toteForSo[soId] = `Tote ${toteCodeForIndex(idx)}`;
      });
    }

    // 4. Allocate items — find bins with stock for each SKU
    const pickItems: any[] = [];

    for (const soItem of soItems) {
      const qtyNeeded = soItem.quantityOrdered - soItem.quantityPicked;
      if (qtyNeeded <= 0) continue;

      const toteCode = toteForSo[soItem.soId] ?? null;

      // Find bins with available stock, ordered by proximity
      const bins = await this.repository.findAvailableStock(getCurrentTenantId(), soItem.skuId, warehouseId);

      let remaining = qtyNeeded;
      for (const bin of bins) {
        if (remaining <= 0) break;
        const pickQty = Math.min(remaining, bin.available);
        pickItems.push({
          skuId: soItem.skuId,
          binId: bin.binId,
          quantityRequired: pickQty,
          soId: soItem.soId,
          toteCode,
        });
        remaining -= pickQty;
      }

      // If no bins found or insufficient stock, create item without bin (worker finds it)
      if (remaining > 0) {
        pickItems.push({
          skuId: soItem.skuId,
          binId: null,
          quantityRequired: remaining,
          soId: soItem.soId,
          toteCode,
        });
      }
    }

    // 5. Sort by bin proximity for efficient walking
    pickItems.sort((a, b) => {
      if (!a.binId) return 1;
      if (!b.binId) return -1;
      return 0; // bins already sorted by proximity from findAvailableStock
    });

    // 6. Insert pick list items
    if (pickItems.length > 0) {
      await this.repository.createItems(pickList.id, pickItems);
    }

    // 7. Return complete pick list with items
    return this.repository.findById(pickList.id, getCurrentTenantId());
  }

  async update(id: string, dto: any) {
    await this.findOne(id);
    return this.repository.update(id, getCurrentTenantId(), dto);
  }

  async remove(id: string) {
    const deleted = await this.repository.delete(id, getCurrentTenantId());
    if (!deleted) throw new NotFoundException(`PickList ${id} not found`);
  }

  async getStats() {
    const rows = await this.repository.countByStatus(getCurrentTenantId());
    const stats: Record<string, number> = {};
    rows.forEach((r: any) => stats[r.status] = parseInt(r.count, 10));
    return stats;
  }

  async updateStatus(id: string, status: string, extraFields?: Record<string, any>) {
    await this.findOne(id);
    const tenantId = getCurrentTenantId();
    const updated = await this.repository.updateStatus(id, tenantId, status, extraFields);
    if (status === 'in_progress') {
      await this.markOrdersPicking(tenantId, id);
    }
    return updated;
  }

  /**
   * Reflects "picking has started" onto the orders themselves. The dashboard has
   * always counted orders in a `picking` bucket; until now nothing ever wrote
   * that status, so the tile read zero no matter how much picking was underway.
   */
  private async markOrdersPicking(tenantId: string, pickListId: string): Promise<void> {
    const db = (this.repository as any).db;
    await db.query(
      `UPDATE sales_orders
          SET status = 'picking', updated_at = NOW()
        WHERE tenant_id = $1
          AND status IN ('confirmed', 'approved')
          AND id IN (
            SELECT pli.so_id FROM pick_list_items pli WHERE pli.pick_list_id = $2 AND pli.so_id IS NOT NULL
            UNION
            SELECT pl.so_id FROM pick_lists pl WHERE pl.id = $2 AND pl.so_id IS NOT NULL
          )`,
      [tenantId, pickListId],
    );
  }

  /**
   * Completing a pick list is what tells the warehouse manager the order is
   * ready to pack, so it is its own method rather than a bare status write:
   * the manager of THAT warehouse gets notified once the state change has
   * actually landed. `warehouseId` is passed on purpose — without it the
   * engine notifies no manager at all (notifications.service, resolveRecipients).
   */
  async complete(id: string, user?: AuthUser) {
    const tenantId = getCurrentTenantId();
    const pickList = await this.findOne(id);
    const updated = await this.repository.updateStatus(id, tenantId, 'completed', {
      completedAt: new Date(),
    });

    await this.advanceOrdersToPicked(tenantId, id);

    void this.notifications
      .emit('pick_list.completed', {
        tenantId,
        warehouseId: pickList.warehouseId ?? null,
        entityType: 'pick_list',
        entityId: id,
        data: {
          actorUserId: user?.id,
          pickListNumber: pickList.pickListNumber,
          code: pickList.pickListNumber,
          warehouseName: pickList.warehouseName,
          pickerName: pickList.assigneeName,
          totalItems: pickList.items?.length ?? pickList.itemCount ?? null,
        },
      })
      .catch(() => undefined);

    return updated;
  }

  /**
   * Moves every order this pick list served to `picked` — but only once nothing
   * is still being picked for that order.
   *
   * This is the handover to packing: `picked` is what puts an order on the
   * packing queue. A batch pick serves several orders and an order can be split
   * across several pick lists (zone picking), so the check is per order, not per
   * pick list, and an order with a sibling list still open stays where it is.
   *
   * Orders already past picking are left alone so a late-completing list cannot
   * drag a packed order backwards.
   */
  private async advanceOrdersToPicked(tenantId: string, pickListId: string): Promise<void> {
    const db = (this.repository as any).db;

    const ordersRes = await db.query(
      `SELECT DISTINCT so_id FROM (
         SELECT pli.so_id FROM pick_list_items pli WHERE pli.pick_list_id = $1 AND pli.so_id IS NOT NULL
         UNION
         SELECT pl.so_id FROM pick_lists pl WHERE pl.id = $1 AND pl.so_id IS NOT NULL
       ) s WHERE so_id IS NOT NULL`,
      [pickListId],
    );

    for (const row of ordersRes.rows) {
      const soId = row.so_id;
      const openRes = await db.query(
        `SELECT COUNT(*)::int AS open_count
           FROM pick_lists pl
          WHERE pl.tenant_id = $1
            AND pl.status NOT IN ('completed', 'cancelled')
            AND (pl.so_id = $2 OR EXISTS (
                  SELECT 1 FROM pick_list_items pli
                   WHERE pli.pick_list_id = pl.id AND pli.so_id = $2))`,
        [tenantId, soId],
      );
      if ((openRes.rows[0]?.open_count ?? 0) > 0) continue;

      await db.query(
        `UPDATE sales_orders
            SET status = 'picked', updated_at = NOW()
          WHERE id = $1 AND tenant_id = $2
            AND status IN ('confirmed', 'approved', 'picking')`,
        [soId, tenantId],
      );
    }
  }

  /**
   * Mobile pick: scan a SKU label to mark a pick list item picked.
   *
   * Label encoding contract (see labels.service.ts): a SKU label encodes the
   * SKU's `barcode` when it has one, else the SKU `code`. Both are therefore
   * accepted here — barcode first, then code — so that:
   *   - a label printed before a barcode was assigned still scans,
   *   - a manufacturer's own printed EAN on the carton scans,
   *   - and a generated EAN-13 scans.
   * Bin labels encode the plain bin `code`, which is what `binBarcode` matches.
   *
   * Increments quantity_picked by qty. Returns the matched item or a friendly error.
   */
  async scanItem(pickListId: string, payload: { barcode: string; binBarcode?: string; quantity?: number }) {
    if (!payload.barcode) throw new BadRequestException('barcode is required');
    const tid = getCurrentTenantId();
    const db = (this.repository as any).db;
    const qty = payload.quantity ?? 1;

    const candidates = await db.query(
      `SELECT pli.id, pli.sku_id, pli.bin_id, pli.quantity_required, pli.quantity_picked, pli.status,
              s.code AS sku_code, s.barcode AS sku_barcode, b.code AS bin_code
         FROM pick_list_items pli
         LEFT JOIN skus s ON pli.sku_id = s.id
         LEFT JOIN bins b ON pli.bin_id = b.id
        WHERE pli.pick_list_id = $1 AND pli.status != 'completed'
        ORDER BY pli.id`,
      [pickListId],
    );

    const upper = payload.barcode.trim().toUpperCase();
    const upperBin = payload.binBarcode?.trim().toUpperCase();

    const pending = (r: any) => (r.quantity_picked ?? 0) < (r.quantity_required ?? 0);
    const binOk = (r: any) => !upperBin || String(r.bin_code || '').toUpperCase() === upperBin;

    // Barcode first: it is the more specific identifier and unique per tenant
    // (migration 090), so it can never resolve to the wrong SKU. The code
    // fallback covers labels printed before a barcode existed.
    const match =
      candidates.rows.find(
        (r: any) =>
          String(r.sku_barcode || '').toUpperCase() === upper && r.sku_barcode && binOk(r) && pending(r),
      ) ??
      candidates.rows.find(
        (r: any) => String(r.sku_code || '').toUpperCase() === upper && binOk(r) && pending(r),
      );

    if (!match) {
      throw new BadRequestException(
        upperBin
          ? `No matching pending item found for SKU ${payload.barcode} in bin ${payload.binBarcode}.`
          : `No matching pending item found for SKU ${payload.barcode} on this pick list.`,
      );
    }

    const newPicked = Math.min(match.quantity_picked + qty, match.quantity_required);
    const newStatus = newPicked >= match.quantity_required ? 'completed' : 'in_progress';
    await db.query(
      `UPDATE pick_list_items
          SET quantity_picked = $1, status = $2
        WHERE id = $3`,
      [newPicked, newStatus, match.id],
    );

    // Bump pick list status to in_progress if it was pending/assigned
    await db.query(
      `UPDATE pick_lists SET status = 'in_progress', started_at = COALESCE(started_at, NOW()), updated_at = NOW()
        WHERE id = $1 AND tenant_id = $2 AND status IN ('pending', 'assigned')`,
      [pickListId, tid],
    );
    await this.markOrdersPicking(tid, pickListId);

    return {
      ok: true,
      itemId: match.id,
      skuCode: match.sku_code,
      binCode: match.bin_code,
      quantityPicked: newPicked,
      quantityRequired: match.quantity_required,
      status: newStatus,
    };
  }

  /**
   * Issued by the tenant's configurable sequence (Settings > Document
   * Numbering) instead of row count, which ignored the configured
   * prefix/length and collided after a delete. Migration 078 backfills
   * the counter past existing documents, so this is safe on upgrades.
   */
  private async generateCode(): Promise<string> {
    return this.numbering.nextNumber(getCurrentTenantId(), 'pick_list');
  }
}

/**
 * Map a zero-based index to a tote label: 0 → A, 25 → Z, 26 → AA, ...
 * Matches the PDF example: SO-001 = Tote A, SO-002 = Tote B.
 */
function toteCodeForIndex(idx: number): string {
  let n = idx;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}
