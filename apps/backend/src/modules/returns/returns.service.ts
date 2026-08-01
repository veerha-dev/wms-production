import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ReturnsRepository } from './returns.repository';
import { getCurrentTenantId } from '../common/tenant.context';
import { DatabaseService } from '../../database/database.service';
import { DocumentNumberingService } from '../document-numbering/document-numbering.service';

interface AuthUser { id: string; role: string; warehouseId?: string | null }

@Injectable()
export class ReturnsService {
  private readonly logger = new Logger(ReturnsService.name);

  constructor(
    private repository: ReturnsRepository,
    private db: DatabaseService,
    private numbering: DocumentNumberingService,
  ) {}


  async findAll(query: any) {
    const { page = 1, limit = 50 } = query;
    const { data, total } = await this.repository.findAll(getCurrentTenantId(), query);
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const item = await this.repository.findById(id, getCurrentTenantId());
    if (!item) throw new NotFoundException(`Return ${id} not found`);
    return item;
  }

  async create(dto: any) {
    const returnNumber = dto.returnNumber || await this.generateCode();
    const { code, ...rest } = dto; return this.repository.create(getCurrentTenantId(), { ...rest, returnNumber });
  }

  async update(id: string, dto: any) {
    await this.findOne(id);
    return this.repository.update(id, getCurrentTenantId(), dto);
  }

  async remove(id: string) {
    const deleted = await this.repository.delete(id, getCurrentTenantId());
    if (!deleted) throw new NotFoundException(`Return ${id} not found`);
  }

  async getStats() {
    const rows = await this.repository.countByStatus(getCurrentTenantId());
    const stats: Record<string, number> = {};
    rows.forEach((r: any) => stats[r.status] = parseInt(r.count, 10));
    return stats;
  }

  async updateStatus(id: string, status: string, extraFields?: Record<string, any>) {
    await this.findOne(id);
    return this.repository.updateStatus(id, getCurrentTenantId(), status, extraFields);
  }

  /**
   * Suggest bins for restocking a returned SKU. Filtered by:
   *  - Same warehouse as the original SO
   *  - Capacity headroom (skip bins flagged 'full' or locked)
   *  - Zone match when SKU has a storage_type hint
   * Ranked by: existing-stock bins of the same SKU first (consolidate), then empties, then partial.
   */
  async suggestRestockBins(returnId: string, limit = 8) {
    const ret = await this.findOne(returnId);
    if (!ret.skuId) throw new BadRequestException('Return has no SKU — cannot suggest bins');

    const tid = getCurrentTenantId();
    // warehouse_id is on the return row directly (added later) or via linked sales order
    const whRes = await this.db.query<{ warehouse_id: string | null }>(
      `SELECT COALESCE(r.warehouse_id, so.warehouse_id) AS warehouse_id
         FROM returns r LEFT JOIN sales_orders so ON r.so_id = so.id
        WHERE r.id = $1 AND r.tenant_id = $2`,
      [returnId, tid],
    );
    const warehouseId = whRes.rows[0]?.warehouse_id;
    if (!warehouseId) throw new BadRequestException('Return is not linked to a warehouse');

    const res = await this.db.query(
      `SELECT b.id AS bin_id, b.code AS bin_code, b.status AS bin_status, b.level,
              z.name AS zone_name, z.type AS zone_type, r.code AS rack_code,
              sk.storage_type AS sku_storage_type,
              (CASE WHEN z.type = sk.storage_type THEN 10 ELSE 0 END
               + CASE WHEN EXISTS(SELECT 1 FROM stock_levels sl WHERE sl.bin_id = b.id AND sl.sku_id = $2) THEN 5 ELSE 0 END
               + CASE WHEN b.status = 'empty' THEN 3 ELSE 0 END
              ) AS score
         FROM bins b
         LEFT JOIN zones z ON b.zone_id = z.id
         LEFT JOIN racks r ON b.rack_id = r.id
         LEFT JOIN skus sk ON sk.id = $2
        WHERE b.warehouse_id = $1
          AND b.is_locked = false
          AND b.status != 'full'
        ORDER BY score DESC, b.code
        LIMIT $3`,
      [warehouseId, ret.skuId, limit],
    );
    return res.rows.map((r: any) => ({
      binId: r.bin_id,
      binCode: r.bin_code,
      binStatus: r.bin_status,
      level: r.level,
      zoneName: r.zone_name,
      zoneType: r.zone_type,
      rackCode: r.rack_code,
      score: Number(r.score),
    }));
  }

  /**
   * Process disposition for a return:
   *  - restock: requires binId. Updates stock_levels + writes a stock_movement row. Marks return restocked.
   *  - refurbish: moves item to staging — status only.
   *  - scrap: removes permanently — status + audit only.
   */
  async processDisposition(
    returnId: string,
    payload: { disposition: 'restock' | 'refurbish' | 'scrap'; binId?: string; notes?: string },
    user?: AuthUser,
  ) {
    const ret = await this.findOne(returnId);
    const tid = getCurrentTenantId();
    const qty = Number(ret.quantity || 0);

    if (payload.disposition === 'restock') {
      if (!payload.binId) throw new BadRequestException('binId is required for restock disposition');
      if (qty <= 0) throw new BadRequestException('Return quantity must be > 0 to restock');

      await this.db.transaction(async (client) => {
        // Confirm bin is not locked / full
        const binRes = await client.query(
          `SELECT id, warehouse_id, zone_id, is_locked, status FROM bins WHERE id = $1`,
          [payload.binId],
        );
        const bin = binRes.rows[0];
        if (!bin) throw new BadRequestException('Bin not found');
        if (bin.is_locked) throw new BadRequestException('Bin is locked');
        if (bin.status === 'full') throw new BadRequestException('Bin is at capacity');

        // Upsert stock_levels (sku + warehouse + bin) — increment available qty
        await client.query(
          `INSERT INTO stock_levels (tenant_id, sku_id, warehouse_id, bin_id, quantity_available, last_updated)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (tenant_id, sku_id, warehouse_id, COALESCE(bin_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(batch_id, '00000000-0000-0000-0000-000000000000'::uuid))
           DO UPDATE SET quantity_available = stock_levels.quantity_available + EXCLUDED.quantity_available, last_updated = NOW()`,
          [tid, ret.skuId, bin.warehouse_id, payload.binId, qty],
        );

        // stock_movements audit row
        const movNumberRes = await client.query<{ c: string }>(
          `SELECT COUNT(*)::text AS c FROM stock_movements WHERE tenant_id = $1`,
          [tid],
        );
        const movNumber = `MOV-${String(parseInt(movNumberRes.rows[0].c, 10) + 1).padStart(5, '0')}`;
        await client.query(
          `INSERT INTO stock_movements
             (tenant_id, movement_number, movement_type, sku_id, warehouse_id, to_bin_id,
              quantity, reference_type, reference_id, notes, created_by)
           VALUES ($1, $2, 'return_restock', $3, $4, $5, $6, 'return', $7, $8, $9)`,
          [tid, movNumber, ret.skuId, bin.warehouse_id, payload.binId, qty, returnId,
            payload.notes || `Restock from return ${ret.returnNumber}`, user?.id || null],
        );

        await client.query(
          `UPDATE returns
              SET status = 'restocked', disposition = 'restock',
                  restock_bin_id = $1, processed_at = NOW(), processed_by = $2, updated_at = NOW()
            WHERE id = $3 AND tenant_id = $4`,
          [payload.binId, user?.id || null, returnId, tid],
        );
      });
      return this.findOne(returnId);
    }

    if (payload.disposition === 'refurbish') {
      await this.db.query(
        `UPDATE returns
            SET status = 'refurbishing', disposition = 'refurbish',
                processed_at = NOW(), processed_by = $1, updated_at = NOW()
          WHERE id = $2 AND tenant_id = $3`,
        [user?.id || null, returnId, tid],
      );
      return this.findOne(returnId);
    }

    if (payload.disposition === 'scrap') {
      await this.db.query(
        `UPDATE returns
            SET status = 'scrapped', disposition = 'scrap',
                processed_at = NOW(), processed_by = $1, updated_at = NOW()
          WHERE id = $2 AND tenant_id = $3`,
        [user?.id || null, returnId, tid],
      );
      return this.findOne(returnId);
    }

    throw new BadRequestException(`Unknown disposition: ${(payload as any).disposition}`);
  }

  /**
   * Atomic per-tenant counter (migration 078/089) instead of `count + 1`, which
   * re-issued a number after any delete and raced under concurrency.
   */
  private async generateCode(): Promise<string> {
    return this.numbering.nextNumber(getCurrentTenantId(), 'return');
  }
}
