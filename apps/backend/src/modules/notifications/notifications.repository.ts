import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { QueryNotificationDto } from './dto';

/** A resolved recipient — user id plus the address the email queue needs. */
export interface RecipientRow {
  id: string;
  email: string;
  fullName: string | null;
  role: string | null;
  warehouseId: string | null;
}

export interface InsertNotificationRow {
  userId: string;
  eventType: string;
  category: string;
  severity: string;
  title: string;
  body: string | null;
  linkPath: string | null;
  entityType: string | null;
  entityId: string | null;
  warehouseId: string | null;
  requiresAction: boolean;
  actionState: string | null;
  groupKey: string | null;
}

export interface EnqueueEmailRow {
  userId: string;
  toEmail: string;
  eventType: string;
  subject: string;
  payload: Record<string, any>;
  priority: 'immediate' | 'batched';
}

@Injectable()
export class NotificationsRepository {
  constructor(private db: DatabaseService) {}

  // ─── Recipient resolution (spec Part 7) ────────────────────────────────────

  /**
   * Active admins of the tenant. Admins are company-wide by definition, so
   * warehouse never narrows this set.
   */
  async findAdmins(tenantId: string): Promise<RecipientRow[]> {
    const res = await this.db.query(
      `SELECT id, email, full_name, role, warehouse_id
         FROM users
        WHERE tenant_id = $1 AND is_active = true AND role = 'admin'`,
      [tenantId],
    );
    return res.rows.map(mapRecipient);
  }

  /**
   * Active managers. When `warehouseId` is given, ONLY managers assigned to
   * that warehouse are returned — a manager must never receive another
   * warehouse's alerts. Passing null returns every manager and is reserved for
   * genuinely company-wide events (the service enforces that).
   */
  async findManagers(tenantId: string, warehouseId: string | null): Promise<RecipientRow[]> {
    if (warehouseId) {
      const res = await this.db.query(
        `SELECT id, email, full_name, role, warehouse_id
           FROM users
          WHERE tenant_id = $1 AND is_active = true AND role = 'manager'
            AND warehouse_id = $2`,
        [tenantId, warehouseId],
      );
      return res.rows.map(mapRecipient);
    }
    const res = await this.db.query(
      `SELECT id, email, full_name, role, warehouse_id
         FROM users
        WHERE tenant_id = $1 AND is_active = true AND role = 'manager'`,
      [tenantId],
    );
    return res.rows.map(mapRecipient);
  }

  /** A single user, but only if they belong to this tenant and are active. */
  async findUser(tenantId: string, userId: string): Promise<RecipientRow | null> {
    const res = await this.db.query(
      `SELECT id, email, full_name, role, warehouse_id
         FROM users
        WHERE tenant_id = $1 AND id = $2 AND is_active = true`,
      [tenantId, userId],
    );
    return res.rows[0] ? mapRecipient(res.rows[0]) : null;
  }

  // ─── Writes ────────────────────────────────────────────────────────────────

  /** Single multi-row INSERT — one row per recipient. */
  async insertMany(tenantId: string, rows: InsertNotificationRow[]): Promise<any[]> {
    if (rows.length === 0) return [];

    const params: any[] = [tenantId];
    const tuples = rows.map((r) => {
      const b = params.length + 1;
      params.push(
        r.userId,
        r.eventType,
        r.category,
        r.severity,
        r.title,
        r.body,
        r.linkPath,
        r.entityType,
        r.entityId,
        r.warehouseId,
        r.requiresAction,
        r.actionState,
        r.groupKey,
      );
      return `($1, $${b}, $${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8}, $${b + 9}, $${b + 10}, $${b + 11}, $${b + 12})`;
    });

    const res = await this.db.query(
      `INSERT INTO notifications (
         tenant_id, user_id, event_type, category, severity, title, body, link_path,
         entity_type, entity_id, warehouse_id, requires_action, action_state, group_key
       ) VALUES ${tuples.join(', ')}
       RETURNING *`,
      params,
    );
    return res.rows.map(mapRow);
  }

  /**
   * Grouping (spec Part 3): find this user's unread row with the same group key
   * raised inside the window. Returns null when there is nothing to collapse into.
   */
  async findGroupCandidate(
    tenantId: string,
    userId: string,
    groupKey: string,
    windowMinutes: number,
  ): Promise<any | null> {
    const res = await this.db.query(
      `SELECT * FROM notifications
        WHERE tenant_id = $1 AND user_id = $2 AND group_key = $3
          AND is_read = false
          AND created_at > NOW() - ($4 || ' minutes')::interval
        ORDER BY created_at DESC
        LIMIT 1`,
      [tenantId, userId, groupKey, String(windowMinutes)],
    );
    return res.rows[0] ? mapRow(res.rows[0]) : null;
  }

  /** Collapse: bump the counter, refresh the copy, and float the row to the top. */
  async bumpGroup(
    tenantId: string,
    id: string,
    patch: { title: string; body: string | null; linkPath: string | null; severity?: string },
  ): Promise<any | null> {
    const res = await this.db.query(
      `UPDATE notifications
          SET group_count = group_count + 1,
              title = $3,
              body = $4,
              link_path = $5,
              severity = COALESCE($6, severity),
              created_at = NOW(),
              updated_at = NOW()
        WHERE tenant_id = $1 AND id = $2
        RETURNING *`,
      [tenantId, id, patch.title, patch.body, patch.linkPath, patch.severity ?? null],
    );
    return res.rows[0] ? mapRow(res.rows[0]) : null;
  }

  async enqueueEmails(tenantId: string, rows: EnqueueEmailRow[]): Promise<number> {
    if (rows.length === 0) return 0;

    const params: any[] = [tenantId];
    const tuples = rows.map((r) => {
      const b = params.length + 1;
      params.push(r.userId, r.toEmail, r.eventType, r.subject, JSON.stringify(r.payload ?? {}), r.priority);
      return `($1, $${b}, $${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}::jsonb, $${b + 5})`;
    });

    const res = await this.db.query(
      `INSERT INTO notification_email_queue
         (tenant_id, user_id, to_email, event_type, subject, payload, priority)
       VALUES ${tuples.join(', ')}`,
      params,
    );
    return res.rowCount ?? 0;
  }

  // ─── Reads (always scoped to one user) ─────────────────────────────────────

  async findAll(tenantId: string, userId: string, query: QueryNotificationDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const offset = (page - 1) * limit;

    // tenant_id AND user_id are non-negotiable — never parameterised away.
    const conditions: string[] = ['tenant_id = $1', 'user_id = $2'];
    const params: any[] = [tenantId, userId];
    let i = 3;

    if (query.category) {
      conditions.push(`category = $${i++}`);
      params.push(query.category);
    }
    if (query.unread === true || String(query.unread) === 'true') {
      conditions.push('is_read = false');
    }
    if (query.requiresAction === true || String(query.requiresAction) === 'true') {
      conditions.push('requires_action = true');
      // The approvals inbox only shows what is still actionable.
      conditions.push(`(action_state IS NULL OR action_state = 'pending')`);
    }
    if (query.severity) {
      conditions.push(`severity = $${i++}`);
      params.push(query.severity);
    }
    if (query.eventType) {
      conditions.push(`event_type = $${i++}`);
      params.push(query.eventType);
    }
    // Date-only inputs (YYYY-MM-DD) are treated as whole days: dateFrom is the
    // start of that day and dateTo is INCLUSIVE, i.e. everything up to the end
    // of that day. Anything with a time component is used verbatim.
    const dateOnly = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
    if (query.dateFrom) {
      conditions.push(`created_at >= $${i++}::timestamptz`);
      params.push(query.dateFrom);
    }
    if (query.dateTo) {
      conditions.push(
        dateOnly(query.dateTo)
          ? `created_at < ($${i++}::timestamptz + INTERVAL '1 day')`
          : `created_at <= $${i++}::timestamptz`,
      );
      params.push(query.dateTo);
    }
    if (query.search) {
      conditions.push(`(title ILIKE $${i} OR body ILIKE $${i} OR entity_id ILIKE $${i})`);
      params.push(`%${query.search}%`);
      i++;
    }

    const where = conditions.join(' AND ');

    const [countRes, rowsRes] = await Promise.all([
      this.db.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM notifications WHERE ${where}`,
        params,
      ),
      this.db.query(
        `SELECT * FROM notifications WHERE ${where}
          ORDER BY created_at DESC
          LIMIT $${i} OFFSET $${i + 1}`,
        [...params, limit, offset],
      ),
    ]);

    const total = parseInt(countRes.rows[0]?.c ?? '0', 10);
    return {
      data: rowsRes.rows.map(mapRow),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) || 0 },
    };
  }

  async findById(tenantId: string, userId: string, id: string) {
    const res = await this.db.query(
      `SELECT * FROM notifications WHERE tenant_id = $1 AND user_id = $2 AND id = $3`,
      [tenantId, userId, id],
    );
    return res.rows[0] ? mapRow(res.rows[0]) : null;
  }

  async unreadCount(tenantId: string, userId: string): Promise<number> {
    const res = await this.db.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM notifications
        WHERE tenant_id = $1 AND user_id = $2 AND is_read = false`,
      [tenantId, userId],
    );
    return parseInt(res.rows[0]?.c ?? '0', 10);
  }

  /** Unread counts per category — powers the tab badges. */
  async unreadByCategory(tenantId: string, userId: string): Promise<Record<string, number>> {
    const res = await this.db.query(
      `SELECT category, COUNT(*)::text AS c FROM notifications
        WHERE tenant_id = $1 AND user_id = $2 AND is_read = false
        GROUP BY category`,
      [tenantId, userId],
    );
    const out: Record<string, number> = {};
    for (const r of res.rows) out[r.category] = parseInt(r.c, 10);
    return out;
  }

  async markRead(tenantId: string, userId: string, id: string) {
    const res = await this.db.query(
      `UPDATE notifications
          SET is_read = true, read_at = COALESCE(read_at, NOW()), updated_at = NOW()
        WHERE tenant_id = $1 AND user_id = $2 AND id = $3
        RETURNING *`,
      [tenantId, userId, id],
    );
    return res.rows[0] ? mapRow(res.rows[0]) : null;
  }

  async markAllRead(tenantId: string, userId: string): Promise<number> {
    const res = await this.db.query(
      `UPDATE notifications
          SET is_read = true, read_at = COALESCE(read_at, NOW()), updated_at = NOW()
        WHERE tenant_id = $1 AND user_id = $2 AND is_read = false`,
      [tenantId, userId],
    );
    return res.rowCount ?? 0;
  }

  async setActionState(tenantId: string, userId: string, id: string, state: 'approved' | 'rejected') {
    const res = await this.db.query(
      `UPDATE notifications
          SET action_state = $4,
              is_read = true,
              read_at = COALESCE(read_at, NOW()),
              updated_at = NOW()
        WHERE tenant_id = $1 AND user_id = $2 AND id = $3
        RETURNING *`,
      [tenantId, userId, id, state],
    );
    return res.rows[0] ? mapRow(res.rows[0]) : null;
  }

  /**
   * Once one recipient acts on an approval, every other recipient's copy of the
   * same request stops being actionable. Scoped by entity, not by user.
   */
  async resolvePeerActionRows(
    tenantId: string,
    eventType: string,
    entityType: string | null,
    entityId: string | null,
    state: 'approved' | 'rejected',
  ): Promise<number> {
    if (!entityType || !entityId) return 0;
    const res = await this.db.query(
      `UPDATE notifications
          SET action_state = $5, updated_at = NOW()
        WHERE tenant_id = $1 AND event_type = $2 AND entity_type = $3 AND entity_id = $4
          AND requires_action = true
          AND (action_state IS NULL OR action_state = 'pending')`,
      [tenantId, eventType, entityType, entityId, state],
    );
    return res.rowCount ?? 0;
  }

  // ─── Jobs ──────────────────────────────────────────────────────────────────

  /** Retention purge (spec Part 4) — driven by tenants.notification_retention_days. */
  async purgeExpired(tenantId: string, retentionDays: number): Promise<number> {
    const days = Math.max(1, Math.floor(retentionDays));
    const res = await this.db.query(
      `DELETE FROM notifications
        WHERE tenant_id = $1
          AND created_at < NOW() - ($2 || ' days')::interval`,
      [tenantId, String(days)],
    );
    return res.rowCount ?? 0;
  }

  async listTenantsForPurge(): Promise<Array<{ id: string; retentionDays: number }>> {
    const res = await this.db.query(
      `SELECT id, COALESCE(notification_retention_days, 90) AS retention_days FROM tenants`,
    );
    return res.rows.map((r: any) => ({ id: r.id, retentionDays: Number(r.retention_days) || 90 }));
  }

  // ─── Email queue ───────────────────────────────────────────────────────────

  async claimEmailBatch(priority: 'immediate' | 'batched', limit: number): Promise<any[]> {
    const res = await this.db.query(
      `SELECT * FROM notification_email_queue
        WHERE status = 'pending' AND priority = $1 AND scheduled_for <= NOW()
        ORDER BY scheduled_for ASC
        LIMIT $2`,
      [priority, limit],
    );
    return res.rows.map(mapEmailRow);
  }

  async markEmailSent(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const res = await this.db.query(
      `UPDATE notification_email_queue
          SET status = 'sent', sent_at = NOW(), attempts = attempts + 1
        WHERE id = ANY($1::uuid[])`,
      [ids],
    );
    return res.rowCount ?? 0;
  }

  /** Three strikes and the row is parked as failed rather than retried forever. */
  async markEmailFailed(ids: string[], error: string, maxAttempts = 3): Promise<number> {
    if (ids.length === 0) return 0;
    const res = await this.db.query(
      `UPDATE notification_email_queue
          SET attempts = attempts + 1,
              last_error = $2,
              status = CASE WHEN attempts + 1 >= $3 THEN 'failed' ELSE 'pending' END,
              scheduled_for = NOW() + INTERVAL '10 minutes'
        WHERE id = ANY($1::uuid[])`,
      [ids, String(error).slice(0, 2000), maxAttempts],
    );
    return res.rowCount ?? 0;
  }

  async countEmailQueue(tenantId: string, status?: string): Promise<number> {
    const params: any[] = [tenantId];
    let sql = `SELECT COUNT(*)::text AS c FROM notification_email_queue WHERE tenant_id = $1`;
    if (status) {
      sql += ` AND status = $2`;
      params.push(status);
    }
    const res = await this.db.query<{ c: string }>(sql, params);
    return parseInt(res.rows[0]?.c ?? '0', 10);
  }

  // ─── Daily summary source data ─────────────────────────────────────────────

  async listTenantsWithDailySummary(): Promise<Array<{ tenantId: string; recipients: string }>> {
    const res = await this.db.query(
      `SELECT tenant_id, recipients FROM tenant_notification_settings
        WHERE alert_type = 'daily_summary' AND enabled = true`,
    );
    return res.rows.map((r: any) => ({ tenantId: r.tenant_id, recipients: r.recipients }));
  }

  /**
   * Cheap counters for the end-of-day digest. Each figure is fetched
   * independently so a missing table can never sink the whole digest.
   */
  async dailySummaryStats(tenantId: string): Promise<Record<string, number>> {
    const one = async (sql: string): Promise<number> => {
      try {
        const res = await this.db.query<{ c: string }>(sql, [tenantId]);
        return parseInt(res.rows[0]?.c ?? '0', 10);
      } catch {
        return 0;
      }
    };

    const [ordersShipped, grnsReceived, pendingApprovals, lowStockCount] = await Promise.all([
      one(`SELECT COUNT(*)::text AS c FROM shipments
            WHERE tenant_id = $1 AND dispatched_at >= CURRENT_DATE`),
      one(`SELECT COUNT(*)::text AS c FROM grn
            WHERE tenant_id = $1 AND created_at >= CURRENT_DATE`),
      one(`SELECT COUNT(*)::text AS c FROM notifications
            WHERE tenant_id = $1 AND requires_action = true
              AND (action_state IS NULL OR action_state = 'pending')`),
      one(`SELECT COUNT(*)::text AS c FROM (
             SELECT sl.sku_id
               FROM stock_levels sl
               JOIN skus s ON s.id = sl.sku_id
              WHERE sl.tenant_id = $1 AND COALESCE(s.reorder_point, 0) > 0
              GROUP BY sl.sku_id, s.reorder_point
             HAVING SUM(COALESCE(sl.quantity_available, 0)) <= s.reorder_point
           ) low`),
    ]);

    return { ordersShipped, grnsReceived, pendingApprovals, lowStockCount };
  }
}

function mapRecipient(r: any): RecipientRow {
  return {
    id: r.id,
    email: r.email,
    fullName: r.full_name ?? null,
    role: r.role ?? null,
    warehouseId: r.warehouse_id ?? null,
  };
}

export function mapRow(r: any) {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    userId: r.user_id,
    eventType: r.event_type,
    category: r.category,
    severity: r.severity,
    title: r.title,
    body: r.body,
    linkPath: r.link_path,
    entityType: r.entity_type,
    entityId: r.entity_id,
    warehouseId: r.warehouse_id,
    requiresAction: r.requires_action,
    actionState: r.action_state,
    groupKey: r.group_key,
    groupCount: r.group_count,
    isRead: r.is_read,
    readAt: r.read_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function mapEmailRow(r: any) {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    userId: r.user_id,
    toEmail: r.to_email,
    eventType: r.event_type,
    subject: r.subject,
    payload: r.payload,
    priority: r.priority,
    status: r.status,
    attempts: r.attempts,
    lastError: r.last_error,
    scheduledFor: r.scheduled_for,
    sentAt: r.sent_at,
    createdAt: r.created_at,
  };
}
