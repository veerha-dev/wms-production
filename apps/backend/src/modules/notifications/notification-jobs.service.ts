import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EmailService } from '../email/email.service';
import { DatabaseService } from '../../database/database.service';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';
import { findAlertType } from '../settings/notification-alert-types';

const IMMEDIATE_BATCH_SIZE = 100;
const DIGEST_BATCH_SIZE = 500;

/**
 * Ceiling on how many rows one scan job considers per tenant per run. A tenant
 * with a five-figure backlog must not turn a cron tick into a long transaction;
 * the oldest/nearest-expiry rows are alerted first and the rest come next tick.
 */
const SCAN_LIMIT_PER_TENANT = 500;

/** Fallback when the tenant has no `task_exception.thresholdHours` configured. */
const DEFAULT_PUTAWAY_THRESHOLD_HOURS = 24;

/** Spec: "7 days or less" to expiry is the critical band. */
const EXPIRY_CRITICAL_DAYS = 7;

/** Fallback when the tenant has no `expiry.daysBefore` configured. */
const DEFAULT_EXPIRY_DAYS_BEFORE = 30;

/**
 * Re-emission cooldowns, in hours. See `alreadyNotifiedRecently` for why the
 * engine's own 60-minute grouping window is not enough for a scheduled scan.
 *
 *  - putaway (hourly scan):      24h — a task overdue for three days is worth
 *    one reminder a day, not 72. Far larger than the 1h cadence, so there is no
 *    clock-jitter ambiguity at the boundary.
 *  - batch critical (daily scan): 20h — ≤7 days to expiry is urgent and the
 *    event is `immediate` priority, so a fresh reminder every daily run is
 *    wanted (at most 7 of them). Deliberately BELOW the 24h cadence so jitter
 *    between two runs can never swallow a day's reminder, yet any repeat or
 *    manual re-run inside the same day is suppressed.
 *  - batch soon (daily scan):    7 days — the "soon" band runs up to 30 days
 *    out. Without this a single batch would raise ~23 identical warnings before
 *    it ever became critical; a weekly nudge keeps it actionable.
 */
const PUTAWAY_OVERDUE_COOLDOWN_HOURS = 24;
const BATCH_EXPIRY_CRITICAL_COOLDOWN_HOURS = 20;
const BATCH_EXPIRY_SOON_COOLDOWN_HOURS = 24 * 7;

/**
 * Background workers for the notification engine.
 *
 * Every job iterates defensively: one tenant (or one email) blowing up must
 * never abort the loop, so each unit of work is individually wrapped and the
 * failure is recorded rather than thrown.
 */
@Injectable()
export class NotificationJobsService {
  private readonly logger = new Logger(NotificationJobsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly repository: NotificationsRepository,
    private readonly notifications: NotificationsService,
    private readonly email: EmailService,
  ) {}

  // ── Email queue: critical alerts go out now (spec Part 5) ─────────────────

  @Cron('0 */10 * * * *', { name: 'notifications:flush-immediate-emails' })
  async flushImmediateEmails(): Promise<void> {
    try {
      const rows = await this.repository.claimEmailBatch('immediate', IMMEDIATE_BATCH_SIZE);
      if (rows.length === 0) return;

      const sent: string[] = [];
      for (const row of rows) {
        try {
          const p = row.payload ?? {};
          await this.email.sendNotificationEmail({
            to: row.toEmail,
            subject: row.subject,
            recipientName: p.recipientName ?? undefined,
            title: p.title ?? row.subject,
            body: p.body ?? undefined,
            severity: p.severity ?? undefined,
            category: p.category ?? undefined,
            entityType: p.entityType ?? undefined,
            entityId: p.entityId ?? undefined,
            warehouseName: p.warehouseName ?? undefined,
            linkPath: p.linkPath ?? undefined,
          });
          sent.push(row.id);
        } catch (err) {
          await this.repository
            .markEmailFailed([row.id], (err as Error).message)
            .catch(() => 0);
        }
      }
      if (sent.length) await this.repository.markEmailSent(sent);
      this.logger.log(`Immediate email flush: ${sent.length}/${rows.length} sent`);
    } catch (err) {
      this.logger.error(`flushImmediateEmails failed: ${(err as Error).message}`);
    }
  }

  // ── Email queue: low-priority alerts batched into ONE email per hour ──────

  @Cron(CronExpression.EVERY_HOUR, { name: 'notifications:flush-batched-digest' })
  async flushBatchedEmailDigest(): Promise<void> {
    try {
      const rows = await this.repository.claimEmailBatch('batched', DIGEST_BATCH_SIZE);
      if (rows.length === 0) return;

      // One digest per recipient — the whole point of the batching rule.
      const byUser = new Map<string, any[]>();
      for (const r of rows) {
        const key = `${r.userId}:${r.toEmail}`;
        const list = byUser.get(key) ?? [];
        list.push(r);
        byUser.set(key, list);
      }

      let sentCount = 0;
      for (const [, group] of byUser) {
        const ids = group.map((g) => g.id);
        try {
          const first = group[0];
          await this.email.sendNotificationDigestEmail({
            to: first.toEmail,
            recipientName: first.payload?.recipientName ?? undefined,
            periodLabel: 'last hour',
            items: group.map((g) => ({
              title: g.payload?.title ?? g.subject,
              body: g.payload?.body ?? undefined,
              linkPath: g.payload?.linkPath ?? undefined,
              severity: g.payload?.severity ?? undefined,
            })),
          });
          await this.repository.markEmailSent(ids);
          sentCount += ids.length;
        } catch (err) {
          await this.repository.markEmailFailed(ids, (err as Error).message).catch(() => 0);
        }
      }
      this.logger.log(
        `Batched digest flush: ${sentCount}/${rows.length} queued rows delivered in ${byUser.size} digest(s)`,
      );
    } catch (err) {
      this.logger.error(`flushBatchedEmailDigest failed: ${(err as Error).message}`);
    }
  }

  // ── End-of-day summary (spec Part 5) ─────────────────────────────────────

  @Cron(CronExpression.EVERY_DAY_AT_6PM, { name: 'notifications:daily-summary' })
  async sendDailySummaries(): Promise<void> {
    let tenants: Array<{ tenantId: string; recipients: string }> = [];
    try {
      tenants = await this.repository.listTenantsWithDailySummary();
    } catch (err) {
      this.logger.error(`daily summary tenant lookup failed: ${(err as Error).message}`);
      return;
    }

    const date = new Date().toISOString().slice(0, 10);
    for (const t of tenants) {
      try {
        const stats = await this.repository.dailySummaryStats(t.tenantId);
        // Goes through the real pipeline: settings gate, routing, in-app row,
        // socket push, and the email queue entry.
        await this.notifications.emit('system.daily_summary', {
          tenantId: t.tenantId,
          data: { date, ...stats },
        });
      } catch (err) {
        // One tenant's failure must not stop the rest.
        this.logger.error(
          `daily summary failed for tenant ${t.tenantId}: ${(err as Error).message}`,
        );
      }
    }
    if (tenants.length) this.logger.log(`Daily summary dispatched for ${tenants.length} tenant(s)`);
  }

  // ── Retention purge (spec Part 4) ────────────────────────────────────────

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'notifications:retention-purge' })
  async purgeExpiredNotifications(): Promise<void> {
    let tenants: Array<{ id: string; retentionDays: number }> = [];
    try {
      tenants = await this.repository.listTenantsForPurge();
    } catch (err) {
      this.logger.error(`retention purge tenant lookup failed: ${(err as Error).message}`);
      return;
    }

    let total = 0;
    for (const t of tenants) {
      try {
        total += await this.repository.purgeExpired(t.id, t.retentionDays);
      } catch (err) {
        this.logger.error(`retention purge failed for tenant ${t.id}: ${(err as Error).message}`);
      }
    }

    // Sent/failed queue rows have no value once the notification is gone.
    try {
      await this.db.query(
        `DELETE FROM notification_email_queue
          WHERE status IN ('sent', 'failed') AND created_at < NOW() - INTERVAL '30 days'`,
      );
    } catch (err) {
      this.logger.warn(`email queue trim failed: ${(err as Error).message}`);
    }

    if (total) this.logger.log(`Retention purge removed ${total} notification(s)`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TIME-BASED SCANS
  //
  // These have no business event to hang off — nothing "happens" when a task
  // becomes overdue or a batch drifts inside its expiry window, so a schedule
  // is the only trigger. That makes idempotence the defining requirement:
  // a scan re-runs over the SAME rows every tick, and an unguarded emit would
  // bury the bell. See `alreadyNotifiedRecently`.
  // ══════════════════════════════════════════════════════════════════════════

  // ── Putaway pending too long (spec Part 2 — putaway.overdue) ─────────────

  @Cron(CronExpression.EVERY_HOUR, { name: 'notifications:putaway-overdue' })
  async scanOverduePutaways(): Promise<void> {
    let tenants: string[] = [];
    try {
      tenants = await this.listActiveTenantIds();
    } catch (err) {
      this.logger.error(`putaway overdue tenant lookup failed: ${(err as Error).message}`);
      return;
    }

    let raised = 0;
    for (const tenantId of tenants) {
      try {
        // Threshold is tenant-configurable via the Task Exceptions alert type.
        const config = await this.alertConfig(tenantId, 'task_exception');
        const thresholdHours = this.positiveInt(
          config.thresholdHours,
          DEFAULT_PUTAWAY_THRESHOLD_HOURS,
        );

        const res = await this.db.query(
          `SELECT p.id,
                  p.putaway_number,
                  p.warehouse_id,
                  w.name AS warehouse_name
             FROM putaway_tasks p
             LEFT JOIN warehouses w ON w.id = p.warehouse_id
            WHERE p.tenant_id = $1
              AND p.status IN ('pending', 'assigned')
              AND p.created_at < NOW() - ($2 || ' hours')::interval
            ORDER BY p.created_at ASC
            LIMIT $3`,
          [tenantId, String(thresholdHours), SCAN_LIMIT_PER_TENANT],
        );

        for (const row of res.rows) {
          // putaway_tasks.warehouse_id is NOT NULL, so manager scoping is
          // guaranteed — this alert can never fan out past its warehouse.
          const already = await this.alreadyNotifiedRecently(
            tenantId,
            'putaway.overdue',
            row.id,
            PUTAWAY_OVERDUE_COOLDOWN_HOURS,
          );
          if (already) continue;

          await this.notifications.emit('putaway.overdue', {
            tenantId,
            warehouseId: row.warehouse_id,
            entityType: 'putaway_task',
            entityId: row.id,
            data: {
              taskCode: row.putaway_number,
              thresholdHours,
              warehouseName: row.warehouse_name ?? null,
            },
          });
          raised++;
        }
      } catch (err) {
        this.logger.error(
          `putaway overdue scan failed for tenant ${tenantId}: ${(err as Error).message}`,
        );
      }
    }

    if (raised) this.logger.log(`Putaway overdue scan raised ${raised} alert(s)`);
  }

  // ── Batch expiry (spec Part 2 — batch_expiring_soon / _critical) ─────────

  /**
   * One daily pass covers BOTH bands. A batch fires exactly one of the two:
   * `daysRemaining <= 7` is critical, anything else inside the tenant's
   * `expiry.daysBefore` window is "soon". Splitting this across two jobs would
   * make double-firing a matter of timing rather than of arithmetic.
   *
   * A batch can hold stock in several warehouses, and a manager only ever sees
   * their own warehouse's alerts, so this emits ONE alert per (batch,
   * warehouse-with-stock) — suppression is scoped the same way. Batches with no
   * stock anywhere raise nothing: there is nothing left to act on.
   */
  @Cron(CronExpression.EVERY_DAY_AT_7AM, { name: 'notifications:batch-expiry' })
  async scanExpiringBatches(): Promise<void> {
    let tenants: string[] = [];
    try {
      tenants = await this.listActiveTenantIds();
    } catch (err) {
      this.logger.error(`batch expiry tenant lookup failed: ${(err as Error).message}`);
      return;
    }

    let soon = 0;
    let critical = 0;
    for (const tenantId of tenants) {
      try {
        const config = await this.alertConfig(tenantId, 'expiry');
        const daysBefore = Math.max(
          EXPIRY_CRITICAL_DAYS,
          this.positiveInt(config.daysBefore, DEFAULT_EXPIRY_DAYS_BEFORE),
        );

        const res = await this.db.query(
          `SELECT b.id                                  AS batch_id,
                  b.batch_number,
                  to_char(b.expiry_date, 'YYYY-MM-DD')  AS expiry_date,
                  (b.expiry_date - CURRENT_DATE)::int   AS days_remaining,
                  s.id                                  AS sku_id,
                  s.code                                AS sku_code,
                  s.name                                AS sku_name,
                  sl.warehouse_id,
                  w.name                                AS warehouse_name,
                  SUM(COALESCE(sl.quantity_available, 0))::int AS quantity
             FROM batches b
             JOIN skus s        ON s.id = b.sku_id
             JOIN stock_levels sl ON sl.batch_id = b.id AND sl.tenant_id = b.tenant_id
             LEFT JOIN warehouses w ON w.id = sl.warehouse_id
            WHERE b.tenant_id = $1
              AND COALESCE(b.status, 'active') = 'active'
              AND b.expiry_date IS NOT NULL
              AND b.expiry_date >= CURRENT_DATE
              AND b.expiry_date <= CURRENT_DATE + $2::int
            GROUP BY b.id, b.batch_number, b.expiry_date, s.id, s.code, s.name,
                     sl.warehouse_id, w.name
           HAVING SUM(COALESCE(sl.quantity_available, 0)) > 0
            ORDER BY b.expiry_date ASC
            LIMIT $3`,
          [tenantId, daysBefore, SCAN_LIMIT_PER_TENANT],
        );

        for (const row of res.rows) {
          const daysRemaining = Number(row.days_remaining);
          const isCritical = daysRemaining <= EXPIRY_CRITICAL_DAYS;
          const eventType = isCritical
            ? 'inventory.batch_expiring_critical'
            : 'inventory.batch_expiring_soon';
          const cooldown = isCritical
            ? BATCH_EXPIRY_CRITICAL_COOLDOWN_HOURS
            : BATCH_EXPIRY_SOON_COOLDOWN_HOURS;

          const already = await this.alreadyNotifiedRecently(
            tenantId,
            eventType,
            row.batch_id,
            cooldown,
            row.warehouse_id,
          );
          if (already) continue;

          await this.notifications.emit(eventType, {
            tenantId,
            warehouseId: row.warehouse_id,
            entityType: 'batch',
            entityId: row.batch_id,
            data: {
              batchNumber: row.batch_number,
              skuId: row.sku_id,
              skuCode: row.sku_code,
              skuName: row.sku_name,
              expiryDate: row.expiry_date,
              daysRemaining,
              // The registry templates read `daysToExpiry`; keep both so the
              // rendered title is right and the payload stays self-describing.
              daysToExpiry: daysRemaining,
              daysBefore,
              quantity: Number(row.quantity ?? 0),
              warehouseName: row.warehouse_name ?? null,
            },
          });
          if (isCritical) critical++;
          else soon++;
        }
      } catch (err) {
        this.logger.error(
          `batch expiry scan failed for tenant ${tenantId}: ${(err as Error).message}`,
        );
      }
    }

    if (soon || critical) {
      this.logger.log(`Batch expiry scan raised ${critical} critical and ${soon} soon alert(s)`);
    }
  }

  // ── NOT BUILT — blocked on missing schema ────────────────────────────────
  //
  // `shipment.dispatch_delayed` (spec: shipment past its expected departure and
  //   not dispatched). BLOCKED: `shipments` (023_create_shipments.sql) has
  //   `dispatched_at` and `delivered_at` — both records of what HAPPENED — but
  //   no planned departure column (`expected_dispatch_at` / `scheduled_at` /
  //   `dispatch_date`). No later migration adds one. There is no schedule to be
  //   late against, and inventing one (e.g. "N hours after created_at") would
  //   fabricate an SLA the product never agreed. Needs a schema field first.
  //
  // `sales_order.due_not_picked` (spec: "order due today not yet picked,
  //   morning check"). BLOCKED: `sales_orders` (019, extended by 084) has
  //   `created_at` and `confirmed_at` only — no `delivery_date` /
  //   `expected_delivery_date` / `due_date` / `ship_by`. "Due today" is not
  //   expressible. The pick-list half of the query is fine (`pick_lists.so_id`
  //   + `status`/`completed_at`); only the due date is missing.

  // ══════════════════════════════════════════════════════════════════════════
  // SHARED HELPERS FOR THE SCAN JOBS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Has this exact alert already gone out recently?
   *
   * The engine's grouping (spec Part 3) collapses repeats into one row, but its
   * window is 60 minutes and only applies to UNREAD rows. That is the right rule
   * for a burst of business events; it is nowhere near enough for a scan that
   * re-reads the same overdue rows on every tick. A putaway task overdue for
   * three days would otherwise mint a fresh row every hour once the group window
   * lapsed — exactly the burial the spec is trying to prevent.
   *
   * So each scan job asks first: is there already a notification for this
   * (tenant, event_type, entity) — optionally narrowed to one warehouse, for
   * entities like a batch that live in several — inside the cooldown? If yes,
   * stay quiet.
   *
   * Reads the notifications table rather than any bookkeeping of its own, so it
   * stays correct across restarts and cannot drift from what users actually saw.
   */
  private async alreadyNotifiedRecently(
    tenantId: string,
    eventType: string,
    entityId: string | null | undefined,
    intervalHours: number,
    warehouseId?: string | null,
  ): Promise<boolean> {
    if (!tenantId || !entityId) return false;

    const hours = Math.max(1, Math.floor(intervalHours));
    const params: any[] = [tenantId, eventType, String(entityId), String(hours)];
    let sql = `SELECT 1 FROM notifications
                WHERE tenant_id = $1
                  AND event_type = $2
                  AND entity_id = $3
                  AND created_at > NOW() - ($4 || ' hours')::interval`;
    if (warehouseId) {
      params.push(warehouseId);
      sql += ` AND warehouse_id = $${params.length}`;
    }
    sql += ' LIMIT 1';

    const res = await this.db.query(sql, params);
    return (res.rowCount ?? 0) > 0;
  }

  /**
   * Per-tenant `config` JSONB for an alert type, falling back to the code
   * catalog for a tenant whose settings row has not been seeded yet — the same
   * precedence NotificationsService.loadSettings uses for the toggles.
   */
  private async alertConfig(tenantId: string, alertType: string): Promise<Record<string, any>> {
    const res = await this.db.query(
      `SELECT config FROM tenant_notification_settings
        WHERE tenant_id = $1 AND alert_type = $2`,
      [tenantId, alertType],
    );
    const config = res.rows[0]?.config;
    if (config && typeof config === 'object' && !Array.isArray(config)) {
      return config as Record<string, any>;
    }
    return findAlertType(alertType)?.defaultConfig ?? {};
  }

  /** Every tenant a scan should walk. Suspended tenants raise nothing. */
  private async listActiveTenantIds(): Promise<string[]> {
    const res = await this.db.query(
      `SELECT id FROM tenants WHERE COALESCE(status, 'active') = 'active'`,
    );
    return res.rows.map((r: any) => r.id);
  }

  /** Settings JSON is user-authored: a missing/garbage value must not disarm a scan. */
  private positiveInt(value: any, fallback: number): number {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  }
}
