import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { StockTransfersRepository } from './stock-transfers.repository';
import { DatabaseService } from '../../database/database.service';
import { CreateStockTransferDto, UpdateStockTransferDto, QueryStockTransferDto } from './dto';
import { getCurrentTenantId } from '../common/tenant.context';
import { NotificationsService } from '../notifications/notifications.service';
import { StockAlertsService } from '../inventory/stock-alerts.service';

interface AuthUser {
  id: string;
  role: string;
  fullName?: string;
  warehouseId?: string | null;
}

@Injectable()
export class StockTransfersService {
  constructor(
    private repository: StockTransfersRepository,
    private db: DatabaseService,
    private readonly notifications: NotificationsService,
    private readonly stockAlerts: StockAlertsService,
  ) {}

  async findAll(query: QueryStockTransferDto, user?: AuthUser) {
    const { page = 1, limit = 50 } = query;
    const scopedQuery: any = { ...query };
    // Manager: scope to their warehouse as source
    if (user?.role === 'manager' && user.warehouseId) {
      scopedQuery.sourceWarehouseId = user.warehouseId;
    }
    const { data, total } = await this.repository.findAll(getCurrentTenantId(), scopedQuery);
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findById(id: string) {
    const t = await this.repository.findById(getCurrentTenantId(), id);
    if (!t) throw new NotFoundException('Stock transfer not found');
    return t;
  }

  async create(dto: CreateStockTransferDto, user?: AuthUser) {
    const transferNumber = await this.repository.getNextCode(getCurrentTenantId());

    const isInterWarehouse = !!(
      dto.sourceWarehouseId &&
      dto.destWarehouseId &&
      dto.sourceWarehouseId !== dto.destWarehouseId
    );

    // Manager scoping: enforce source warehouse must be their own
    if (user?.role === 'manager' && user.warehouseId) {
      if (dto.sourceWarehouseId && dto.sourceWarehouseId !== user.warehouseId) {
        throw new ForbiddenException(
          'Manager can only initiate transfers from their assigned warehouse',
        );
      }
    }

    // Per workflow doc:
    // - Manager intra-warehouse → auto-approved (executes directly)
    // - Manager inter-warehouse → 'requested' status awaiting admin approval
    // - Admin: defaults to 'requested' for inter-warehouse but can be approved later
    let initialStatus: string = 'requested';
    if (!isInterWarehouse) {
      initialStatus = 'approved';
    }

    const created = await this.repository.create(getCurrentTenantId(), {
      ...dto,
      transferNumber,
      status: initialStatus,
      requestedBy: user?.id || (dto as any).requestedBy || null,
    });

    // An inter-warehouse transfer parked in 'requested' is waiting on an admin.
    // requiresAction on this event puts it in the inline approvals inbox.
    if (isInterWarehouse && created?.status === 'requested') {
      void this.notifications
        .emit('transfer.approval_pending', {
          tenantId: getCurrentTenantId(),
          // Scoped to the SOURCE warehouse: that is the warehouse giving up stock.
          warehouseId: dto.sourceWarehouseId ?? null,
          entityType: 'stock_transfer',
          entityId: created.id,
          data: {
            actorUserId: user?.id ?? null,
            transferNumber,
            requestedBy: user?.fullName ?? 'A manager',
            totalItems: 1,
            quantity: dto.quantity,
            skuId: dto.skuId ?? null,
            fromWarehouseId: dto.sourceWarehouseId ?? null,
            toWarehouseId: dto.destWarehouseId ?? null,
          },
        })
        .catch(() => undefined);
    }

    return created;
  }

  async update(id: string, dto: UpdateStockTransferDto) {
    await this.findById(id);
    return this.repository.update(getCurrentTenantId(), id, dto);
  }

  async approve(id: string, user?: AuthUser) {
    const t = await this.findById(id);
    if (t.status !== 'requested') throw new BadRequestException(`Cannot approve in ${t.status} status`);

    const isInterWarehouse =
      t.sourceWarehouseId &&
      t.destWarehouseId &&
      t.sourceWarehouseId !== t.destWarehouseId;

    // Per workflow doc: only Admin can approve inter-warehouse transfers
    if (isInterWarehouse && user?.role === 'manager') {
      throw new ForbiddenException(
        'Inter-warehouse transfers require Admin approval',
      );
    }

    const approved = await this.repository.update(getCurrentTenantId(), id, {
      status: 'approved',
      approvedAt: new Date(),
      approvedBy: user?.id,
    });

    // Outcome goes to the requesting manager only (registry: recipients 'user').
    if (t.requestedBy) {
      void this.notifications
        .emit('transfer.approved', {
          tenantId: getCurrentTenantId(),
          userId: t.requestedBy,
          warehouseId: t.sourceWarehouseId ?? null,
          entityType: 'stock_transfer',
          entityId: id,
          data: {
            actorUserId: user?.id ?? null,
            transferNumber: t.transferNumber,
            approvedBy: user?.fullName ?? 'An admin',
            fromWarehouseName: t.sourceWarehouseName ?? null,
            toWarehouseName: t.destWarehouseName ?? null,
          },
        })
        .catch(() => undefined);
    }

    return approved;
  }

  async startTransit(id: string) {
    const t = await this.findById(id);
    if (t.status !== 'approved') throw new BadRequestException(`Cannot start transit in ${t.status} status`);
    return this.repository.update(getCurrentTenantId(), id, { status: 'in_transit' });
  }

  async complete(id: string, user?: AuthUser) {
    const t = await this.findById(id);
    if (t.status !== 'in_transit') throw new BadRequestException(`Cannot complete in ${t.status} status`);

    const tenantId = getCurrentTenantId();

    // What the source bin can actually give up, read BEFORE the transaction so
    // no extra round-trip is added inside the stock write. The deduction below
    // is clamped with GREATEST(0, ...), so anything the source cannot cover is
    // a real shortfall between what was sent and what arrives.
    let sentQty = Number(t.quantity) || 0;
    let receivedQty = sentQty;
    if (t.sourceBinId && t.skuId) {
      const src = await this.db
        .query(
          `SELECT COALESCE(SUM(quantity_available), 0)::int AS qty
             FROM stock_levels
            WHERE sku_id = $1 AND bin_id = $2 AND tenant_id = $3`,
          [t.skuId, t.sourceBinId, tenantId],
        )
        .catch(() => null);
      if (src) receivedQty = Math.min(sentQty, Number(src.rows[0]?.qty ?? 0));
    }

    const result = await this.db.transaction(async (client) => {
      // Deduct from source bin
      if (t.sourceBinId && t.skuId) {
        await client.query(
          `UPDATE stock_levels SET quantity_available = GREATEST(0, quantity_available - $1), last_updated = NOW()
           WHERE sku_id = $2 AND bin_id = $3 AND tenant_id = $4`,
          [t.quantity, t.skuId, t.sourceBinId, getCurrentTenantId()],
        );
      }

      // Add to destination bin
      if (t.destBinId && t.skuId) {
        const existing = await client.query(
          'SELECT id FROM stock_levels WHERE sku_id = $1 AND bin_id = $2 AND tenant_id = $3',
          [t.skuId, t.destBinId, getCurrentTenantId()],
        );
        if (existing.rows.length > 0) {
          await client.query(
            `UPDATE stock_levels SET quantity_available = quantity_available + $1, last_updated = NOW()
             WHERE sku_id = $2 AND bin_id = $3 AND tenant_id = $4`,
            [t.quantity, t.skuId, t.destBinId, getCurrentTenantId()],
          );
        } else {
          await client.query(
            `INSERT INTO stock_levels (tenant_id, sku_id, warehouse_id, bin_id, quantity_available)
             VALUES ($1, $2, $3, $4, $5)`,
            [getCurrentTenantId(), t.skuId, t.destWarehouseId || t.sourceWarehouseId, t.destBinId, t.quantity],
          );
        }
      }

      // Create stock movement
      const movNum = await client.query(`SELECT COALESCE(MAX(CAST(REPLACE(movement_number,'MOV-','') AS INTEGER)),0)+1 as next FROM stock_movements`);
      const movNumber = `MOV-${String(movNum.rows[0].next).padStart(5, '0')}`;

      await client.query(
        `INSERT INTO stock_movements (tenant_id, movement_number, movement_type, sku_id, warehouse_id, from_bin_id, to_bin_id, quantity, reference_type, reference_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [getCurrentTenantId(), movNumber, 'transfer', t.skuId, t.sourceWarehouseId, t.sourceBinId, t.destBinId, t.quantity, 'stock_transfer', id],
      );

      // Update transfer status
      await client.query(
        `UPDATE stock_transfers SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [id],
      );

      return this.repository.findById(getCurrentTenantId(), id);
    });

    // ── AFTER COMMIT ────────────────────────────────────────────────────────
    // Threshold watchdog: the source gave up what it could, the destination bin
    // was credited with the full transfer quantity.
    this.stockAlerts.evaluate({
      tenantId,
      actorUserId: user?.id ?? null,
      changes: [
        { skuId: t.skuId, warehouseId: t.sourceWarehouseId, delta: -receivedQty },
        ...(t.destBinId && t.skuId
          ? [
              {
                skuId: t.skuId,
                warehouseId: t.destWarehouseId || t.sourceWarehouseId,
                delta: sentQty,
              },
            ]
          : []),
      ],
    });

    // Received less than was sent → both warehouses' managers plus admin need
    // to see it. The engine resolves managers from ctx.warehouseId, so the only
    // way to reach BOTH warehouses' managers is to fire once per warehouse id.
    if (receivedQty < sentQty) {
      const shortageData = {
        actorUserId: user?.id ?? null,
        transferNumber: t.transferNumber,
        sentQty,
        receivedQty,
        skuId: t.skuId,
        skuCode: t.skuCode ?? null,
        skuName: t.skuName ?? null,
        fromWarehouseName: t.sourceWarehouseName ?? null,
        toWarehouseName: t.destWarehouseName ?? null,
      };
      const warehouseIds = [t.sourceWarehouseId, t.destWarehouseId].filter(
        (w, i, arr): w is string => !!w && arr.indexOf(w) === i,
      );
      for (const warehouseId of warehouseIds) {
        void this.notifications
          .emit('transfer.received_shortage', {
            tenantId,
            warehouseId,
            entityType: 'stock_transfer',
            entityId: id,
            data: { ...shortageData, warehouseName: shortageData.toWarehouseName },
          })
          .catch(() => undefined);
      }
    }

    return result;
  }

  async cancel(id: string) {
    await this.findById(id);
    return this.repository.update(getCurrentTenantId(), id, { status: 'cancelled' });
  }

  async delete(id: string) {
    await this.findById(id);
    return this.repository.delete(getCurrentTenantId(), id);
  }

  async getStats(warehouseId?: string, user?: AuthUser) {
    const wh = user?.role === 'manager' && user.warehouseId ? user.warehouseId : warehouseId;
    return this.repository.getStats(getCurrentTenantId(), wh);
  }
}
