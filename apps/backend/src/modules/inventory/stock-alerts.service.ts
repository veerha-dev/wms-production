import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * One committed change to `stock_levels.quantity_available`, expressed as the
 * signed delta the write applied. The delta — not the raw new value — is what
 * lets us reconstruct the previous level without holding a `before` snapshot
 * across the transaction boundary (see `evaluate`).
 */
export interface StockChange {
  skuId?: string | null;
  /** Required: an alert with no warehouse reaches no manager (spec Part 7). */
  warehouseId?: string | null;
  /** Signed change to quantity_available, e.g. -12 for a negative adjustment. */
  delta: number;
}

interface Aggregated {
  skuId: string;
  warehouseId: string;
  delta: number;
}

/**
 * Threshold watchdog for stock writes.
 *
 * Every module that moves stock calls `evaluate()` AFTER its transaction has
 * committed. This service then, off the caller's critical path:
 *
 *   1. re-reads the SKU's CURRENT total available in that warehouse (`after`),
 *   2. derives the PREVIOUS total as `before = after - delta`,
 *   3. emits `inventory.low_stock` / `zero_stock` / `overstock` only when the
 *      pair (`before`, `after`) actually CROSSES the threshold.
 *
 * Deriving `before` from the delta rather than snapshotting it inside the
 * transaction keeps stock writes untouched, and the crossing test is what stops
 * a SKU that is already below its reorder point from re-alerting on every
 * subsequent pick. (The engine's grouping then collapses genuine crossings on
 * many SKUs into one "N SKUs are below reorder point" row — no suppression of
 * our own is needed or wanted.)
 *
 * Thresholds are evaluated on the SKU's total across the warehouse, not per
 * bin, so shuffling stock between two bins of the same warehouse nets to zero
 * and correctly raises nothing.
 */
@Injectable()
export class StockAlertsService {
  private readonly logger = new Logger(StockAlertsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Fire-and-forget entry point. Returns immediately; every failure inside is
   * swallowed. A stock write must never fail or wait on a notification.
   */
  evaluate(params: {
    tenantId: string;
    actorUserId?: string | null;
    changes: StockChange[];
  }): void {
    void this.run(params).catch(() => undefined);
  }

  private async run(params: {
    tenantId: string;
    actorUserId?: string | null;
    changes: StockChange[];
  }): Promise<void> {
    const { tenantId, actorUserId } = params;
    if (!tenantId) return;

    // Net the deltas per (sku, warehouse): an intra-warehouse bin-to-bin move
    // cancels itself out and must not raise anything.
    const byKey = new Map<string, Aggregated>();
    for (const c of params.changes || []) {
      const delta = Number(c?.delta);
      if (!c?.skuId || !c?.warehouseId || !Number.isFinite(delta) || delta === 0) continue;
      const key = `${c.skuId}:${c.warehouseId}`;
      const agg = byKey.get(key);
      if (agg) agg.delta += delta;
      else byKey.set(key, { skuId: c.skuId, warehouseId: c.warehouseId, delta });
    }

    for (const change of byKey.values()) {
      if (change.delta === 0) continue;
      try {
        await this.evaluateOne(tenantId, change, actorUserId ?? null);
      } catch (err) {
        this.logger.warn(
          `stock threshold evaluation failed for sku ${change.skuId}: ${(err as Error).message}`,
        );
      }
    }
  }

  private async evaluateOne(
    tenantId: string,
    change: Aggregated,
    actorUserId: string | null,
  ): Promise<void> {
    const totals = await this.db.query(
      `SELECT COALESCE(SUM(quantity_available), 0)::int AS qty
         FROM stock_levels
        WHERE tenant_id = $1 AND sku_id = $2 AND warehouse_id = $3`,
      [tenantId, change.skuId, change.warehouseId],
    );
    const after = Number(totals.rows[0]?.qty ?? 0);
    const before = after - change.delta;

    const meta = await this.db.query(
      `SELECT s.code AS sku_code, s.name AS sku_name,
              COALESCE(s.reorder_point, 0)::int AS reorder_point,
              COALESCE(s.max_stock, 0)::int AS max_stock,
              w.name AS warehouse_name
         FROM skus s
         LEFT JOIN warehouses w ON w.id = $3
        WHERE s.id = $2 AND s.tenant_id = $1`,
      [tenantId, change.skuId, change.warehouseId],
    );
    const row = meta.rows[0];
    if (!row) return;

    const reorderPoint = Number(row.reorder_point ?? 0);
    const maxLevel = Number(row.max_stock ?? 0);

    const base = {
      tenantId,
      warehouseId: change.warehouseId,
      entityType: 'sku',
      entityId: change.skuId,
    };
    const data = {
      actorUserId,
      skuId: change.skuId,
      skuCode: row.sku_code,
      skuName: row.sku_name,
      currentQty: after,
      previousQty: before,
      warehouseName: row.warehouse_name ?? null,
    };

    // Zero stock — the crossing is "had something, now has nothing".
    if (before > 0 && after <= 0) {
      void this.notifications
        .emit('inventory.zero_stock', { ...base, data })
        .catch(() => undefined);
    }

    // Low stock — matches the low-stock report's `quantity_available <=
    // reorder_point AND reorder_point > 0` rule, fired only on the crossing.
    if (reorderPoint > 0 && before > reorderPoint && after <= reorderPoint) {
      void this.notifications
        .emit('inventory.low_stock', { ...base, data: { ...data, reorderPoint } })
        .catch(() => undefined);
    }

    // Overstock — skus.max_stock is the maximum level; 0 means "not configured".
    if (maxLevel > 0 && before <= maxLevel && after > maxLevel) {
      void this.notifications
        .emit('inventory.overstock', { ...base, data: { ...data, maxLevel } })
        .catch(() => undefined);
    }
  }
}
