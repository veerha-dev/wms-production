import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { CycleCountsRepository } from './cycle-counts.repository';
import { CreateCycleCountDto, UpdateCycleCountDto, QueryCycleCountDto } from './dto';
import { getCurrentTenantId } from '../common/tenant.context';
import { DatabaseService } from '../../database/database.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StockAlertsService } from '../inventory/stock-alerts.service';

interface AuthUser { id: string; role: string; fullName?: string; warehouseId?: string | null }

@Injectable()
export class CycleCountsService {
  private readonly logger = new Logger(CycleCountsService.name);

  constructor(
    private repository: CycleCountsRepository,
    private db: DatabaseService,
    private readonly notifications: NotificationsService,
    private readonly stockAlerts: StockAlertsService,
  ) {}


  async findAll(query: QueryCycleCountDto) {
    const { page = 1, limit = 50 } = query;
    const { data, total } = await this.repository.findAll(getCurrentTenantId(), query);
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findById(id: string) {
    const cc = await this.repository.findById(getCurrentTenantId(), id);
    if (!cc) throw new NotFoundException('Cycle count not found');
    return cc;
  }

  async create(dto: CreateCycleCountDto) {
    const countNumber = await this.repository.getNextCode(getCurrentTenantId());

    const cc = await this.repository.create(getCurrentTenantId(), { ...dto, countNumber });

    // Auto-populate items from stock_levels based on scope
    const stockItems = await this.repository.getStockForScope(
      getCurrentTenantId(), dto.countScope,
      dto.warehouseId, dto.zoneId, dto.rackId, dto.binId, dto.skuId,
    );

    if (stockItems.length > 0) {
      await this.repository.createItems(getCurrentTenantId(), cc.id, stockItems);
    }

    return this.repository.findById(getCurrentTenantId(), cc.id);
  }

  async update(id: string, dto: UpdateCycleCountDto) {
    await this.findById(id);
    return this.repository.update(getCurrentTenantId(), id, dto);
  }

  async assign(id: string, assignedTo: string) {
    await this.findById(id);
    return this.repository.update(getCurrentTenantId(), id, { assignedTo, status: 'assigned' });
  }

  async start(id: string) {
    const cc = await this.findById(id);
    if (!['scheduled', 'assigned'].includes(cc.status)) {
      throw new BadRequestException(`Cannot start count in ${cc.status} status`);
    }
    return this.repository.update(getCurrentTenantId(), id, { status: 'in_progress' });
  }

  async submit(id: string, items: { id: string; physicalQty: number }[], user?: AuthUser) {
    const cc = await this.findById(id);
    if (cc.status !== 'in_progress') {
      throw new BadRequestException(`Cannot submit count in ${cc.status} status`);
    }

    await this.repository.updateItems(id, items.map(i => ({ id: i.id, physicalQty: i.physicalQty })));

    // Check if any variance exists
    const updated = await this.repository.findById(getCurrentTenantId(), id);
    const varianceItems = (updated?.items ?? []).filter(
      (item: any) => item.variance !== null && item.variance !== 0,
    );
    const hasVariance = varianceItems.length > 0;

    await this.repository.update(getCurrentTenantId(), id, {
      status: hasVariance ? 'under_review' : 'counted',
    });

    const result = await this.repository.findById(getCurrentTenantId(), id);

    // The count is submitted and its status is persisted — only now do we tell
    // the warehouse manager there is a variance to look at.
    if (hasVariance) {
      const worstPct = varianceItems.reduce(
        (max: number, item: any) => Math.max(max, Math.abs(Number(item.variancePercent ?? 0))),
        0,
      );
      void this.notifications
        .emit('cycle_count.variance_found', {
          tenantId: getCurrentTenantId(),
          warehouseId: cc.warehouseId ?? null,
          entityType: 'cycle_count',
          entityId: id,
          data: {
            actorUserId: user?.id ?? null,
            countNumber: cc.countNumber,
            varianceCount: varianceItems.length,
            variancePct: worstPct ? worstPct.toFixed(2) : null,
            warehouseName: cc.warehouseName ?? null,
          },
        })
        .catch(() => undefined);
    }

    return result;
  }

  async review(id: string, items: { id: string; action: string; notes?: string }[]) {
    const cc = await this.findById(id);
    if (!['counted', 'under_review'].includes(cc.status)) {
      throw new BadRequestException(`Cannot review count in ${cc.status} status`);
    }

    await this.repository.updateItems(id, items);
    return this.repository.findById(getCurrentTenantId(), id);
  }

  async complete(id: string) {
    const cc = await this.findById(id);
    if (!['counted', 'under_review'].includes(cc.status)) {
      throw new BadRequestException(`Cannot complete count in ${cc.status} status`);
    }

    return this.repository.update(getCurrentTenantId(), id, {
      status: 'completed',
      completedAt: new Date(),
    });
  }

  /**
   * Approve a count under review. For each variance line, reconcile stock_levels and write an
   * audit row into stock_adjustments + stock_movements so the change is traceable. Then mark
   * the count completed and clone the next recurrence instance if any.
   */
  async approve(id: string, user?: AuthUser) {
    const tid = getCurrentTenantId();
    const cc = await this.findById(id);
    if (!['counted', 'under_review'].includes(cc.status)) {
      throw new BadRequestException(`Cannot approve count in ${cc.status} status`);
    }

    const items = (cc.items || []).filter((it: any) =>
      it.variance !== null && it.variance !== undefined && it.physicalQty !== null && it.physicalQty !== undefined,
    );

    await this.db.transaction(async (client) => {
      for (const item of items) {
        const variance = Number(item.variance);
        if (!variance) continue;

        // Reconcile stock_levels for the matching SKU/warehouse/bin
        await client.query(
          `UPDATE stock_levels
              SET quantity_available = $1, last_counted_at = NOW(), last_updated = NOW()
            WHERE tenant_id = $2 AND sku_id = $3
              AND ($4::uuid IS NULL OR warehouse_id = $4)
              AND ($5::uuid IS NULL OR bin_id = $5)`,
          [item.physicalQty, tid, item.skuId, cc.warehouseId || null, item.binId || null],
        );

        // Audit trail: a stock_adjustment row marked auto-approved by this cycle count
        const adjNumberRes = await client.query<{ c: string }>(
          `SELECT COUNT(*)::text AS c FROM stock_adjustments WHERE tenant_id = $1`,
          [tid],
        );
        const adjNumber = `ADJ-CC-${String(parseInt(adjNumberRes.rows[0].c, 10) + 1).padStart(4, '0')}`;
        await client.query(
          // `location` is NOT NULL in stock_adjustments — omitting it made every
          // approve() fail with 23502 before the reconciliation could commit.
          `INSERT INTO stock_adjustments
             (tenant_id, adjustment_number, sku_id, sku_code, sku_name, warehouse_id,
              location_id, location,
              quantity_before, quantity_after, adjustment_qty, adjustment_type,
              reason, reason_category, status, requested_by, approved_by, approved_at, applied_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'cycle_count',
                   $12, 'cycle_count', 'approved', $13, $13, NOW(), NOW())`,
          [
            tid, adjNumber, item.skuId, item.skuCode || '', item.skuName || '',
            cc.warehouseId || null,
            item.binId || null, item.binCode || cc.warehouseName || 'Warehouse',
            item.systemQty ?? 0, item.physicalQty ?? 0, variance,
            `Cycle count ${cc.countNumber} variance reconciliation`,
            user?.id || null,
          ],
        );

        // stock_movement row for full audit trail
        const movNumberRes = await client.query<{ c: string }>(
          `SELECT COUNT(*)::text AS c FROM stock_movements WHERE tenant_id = $1`,
          [tid],
        );
        const movNumber = `MOV-${String(parseInt(movNumberRes.rows[0].c, 10) + 1).padStart(5, '0')}`;
        await client.query(
          `INSERT INTO stock_movements
             (tenant_id, movement_number, movement_type, sku_id, warehouse_id,
              quantity, reference_type, reference_id, notes, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, 'cycle_count', $7, $8, $9)`,
          [
            tid, movNumber, variance > 0 ? 'adjustment_in' : 'adjustment_out',
            item.skuId, cc.warehouseId || null, Math.abs(variance),
            cc.id, `Cycle count ${cc.countNumber} approved (variance ${variance})`,
            user?.id || null,
          ],
        );
      }

      // Mark cycle count completed
      await client.query(
        `UPDATE cycle_counts
            SET status = 'completed', completed_at = NOW(), reviewed_by = $2, reviewed_at = NOW(), updated_at = NOW()
          WHERE id = $1 AND tenant_id = $3`,
        [id, user?.id || null, tid],
      );
    });

    // AFTER COMMIT. Each reconciled line moved quantity_available by exactly its
    // variance, so the variance IS the delta the threshold watchdog needs.
    this.stockAlerts.evaluate({
      tenantId: tid,
      actorUserId: user?.id ?? null,
      changes: items.map((item: any) => ({
        skuId: item.skuId,
        warehouseId: cc.warehouseId ?? null,
        delta: Number(item.variance) || 0,
      })),
    });

    // Clone next instance if recurring
    await this.cloneNextRecurrence(id);

    return this.findById(id);
  }

  /**
   * Reject the count — worker must physically recount. Status flips back to in_progress.
   */
  async reject(id: string, user?: AuthUser) {
    const cc = await this.findById(id);
    if (!['counted', 'under_review'].includes(cc.status)) {
      throw new BadRequestException(`Cannot reject count in ${cc.status} status`);
    }
    return this.repository.update(getCurrentTenantId(), id, {
      status: 'in_progress',
      reviewedBy: user?.id,
      reviewedAt: new Date(),
    });
  }

  /**
   * Escalate to admin (possible theft / damage). Keeps status under_review and raises
   * `cycle_count.variance_escalated`, which routes to admins in-app and by email.
   */
  async escalate(id: string, user?: AuthUser, notes?: string) {
    const cc = await this.findById(id);
    if (!['counted', 'under_review'].includes(cc.status)) {
      throw new BadRequestException(`Cannot escalate count in ${cc.status} status`);
    }

    const tid = getCurrentTenantId();
    await this.db.query(
      `UPDATE cycle_counts
          SET status = 'under_review',
              reviewed_by = $2, reviewed_at = NOW(),
              instructions = COALESCE(instructions, '') || E'\n[ESCALATED] ' || $3,
              updated_at = NOW()
        WHERE id = $1 AND tenant_id = $4`,
      [id, user?.id || null, notes || 'Escalated for investigation', tid],
    );

    // The escalation is persisted — raise it through the notification engine,
    // which now owns admin routing, the in-app row, the approvals inbox entry
    // and the email. (This replaced a hand-rolled per-admin email loop.)
    void this.notifications
      .emit('cycle_count.variance_escalated', {
        tenantId: tid,
        warehouseId: cc.warehouseId ?? null,
        entityType: 'cycle_count',
        entityId: id,
        data: {
          actorUserId: user?.id ?? null,
          countNumber: cc.countNumber,
          escalatedBy: user?.fullName ?? 'A manager',
          reason: notes || 'Escalated for investigation',
          varianceCount: cc.varianceCount ?? null,
          warehouseName: cc.warehouseName ?? null,
        },
      })
      .catch(() => undefined);

    return this.findById(id);
  }

  /**
   * Clone the next instance of a recurring cycle count.
   * Called automatically on approve/complete and on a daily scheduler sweep.
   */
  async cloneNextRecurrence(parentId: string): Promise<{ cloned: boolean; newCountId?: string }> {
    const tid = getCurrentTenantId();
    const parentRes = await this.db.query(
      `SELECT * FROM cycle_counts WHERE id = $1 AND tenant_id = $2`,
      [parentId, tid],
    );
    const parent = parentRes.rows[0];
    if (!parent) return { cloned: false };
    if (parent.recurrence_type === 'one_time' || !parent.recurrence_type) return { cloned: false };

    const nextDate = computeNextDate(parent.scheduled_date, parent.recurrence_type, parent.recurrence_interval || 1);
    if (parent.recurrence_until && nextDate > new Date(parent.recurrence_until)) {
      return { cloned: false };
    }

    // Avoid duplicate clones: only clone if no child with this scheduled_date already exists
    const dupe = await this.db.query(
      `SELECT id FROM cycle_counts
        WHERE parent_count_id = $1 AND tenant_id = $2 AND scheduled_date = $3
        LIMIT 1`,
      [parent.parent_count_id || parent.id, tid, nextDate.toISOString().slice(0, 10)],
    );
    if ((dupe.rowCount ?? 0) > 0) return { cloned: false };

    const newNumber = await this.repository.getNextCode(tid);
    const newRes = await this.db.query(
      `INSERT INTO cycle_counts
         (tenant_id, count_number, name, warehouse_id, count_scope, zone_id, rack_id, bin_id, sku_id,
          assigned_to, scheduled_date, priority, status, instructions,
          recurrence_type, recurrence_interval, recurrence_until, parent_count_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
               $10, $11, $12, 'scheduled', $13,
               $14, $15, $16, $17)
       RETURNING id`,
      [
        tid, newNumber, parent.name, parent.warehouse_id, parent.count_scope,
        parent.zone_id, parent.rack_id, parent.bin_id, parent.sku_id,
        parent.assigned_to, nextDate.toISOString().slice(0, 10), parent.priority,
        parent.instructions,
        parent.recurrence_type, parent.recurrence_interval, parent.recurrence_until,
        parent.parent_count_id || parent.id,
      ],
    );

    this.logger.log(`Cloned cycle count ${parent.count_number} → ${newNumber} (next ${nextDate.toISOString().slice(0, 10)})`);
    return { cloned: true, newCountId: newRes.rows[0].id };
  }

  async cancel(id: string) {
    await this.findById(id);
    return this.repository.update(getCurrentTenantId(), id, { status: 'cancelled' });
  }

  async delete(id: string) {
    await this.findById(id);
    return this.repository.delete(getCurrentTenantId(), id);
  }

  async getStats(warehouseId?: string) {
    return this.repository.getStats(getCurrentTenantId(), warehouseId);
  }
}

function computeNextDate(from: string | Date | null, type: string, interval: number): Date {
  const base = from ? new Date(from) : new Date();
  const next = new Date(base);
  const n = Math.max(1, interval || 1);
  switch (type) {
    case 'daily': next.setDate(next.getDate() + n); break;
    case 'weekly': next.setDate(next.getDate() + 7 * n); break;
    case 'monthly': next.setMonth(next.getMonth() + n); break;
    default: next.setDate(next.getDate() + n);
  }
  return next;
}
