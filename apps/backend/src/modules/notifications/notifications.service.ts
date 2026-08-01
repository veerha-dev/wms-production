import { Injectable, Logger, Optional } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { InventoryGateway } from '../../websocket/inventory.gateway';
import {
  NotificationsRepository,
  RecipientRow,
  InsertNotificationRow,
  EnqueueEmailRow,
} from './notifications.repository';
import {
  findEventDef,
  resolveGroupKey,
  NotificationContext,
  NotificationEventDef,
} from './notification-events';
import { findAlertType } from '../settings/notification-alert-types';
import { QueryNotificationDto } from './dto';

/** Grouping window from spec Part 3 — "low stock on 8 SKUs in one hour". */
const GROUP_WINDOW_MINUTES = 60;

interface EffectiveSettings {
  enabled: boolean;
  emailEnabled: boolean;
  recipients: 'admin' | 'manager' | 'both' | null;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly repository: NotificationsRepository,
    @Optional() private readonly gateway?: InventoryGateway,
  ) {}

  // ══════════════════════════════════════════════════════════════════════════
  // THE SINGLE ENTRY POINT
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Raise a notification event. Fire-and-forget: every failure is logged and
   * swallowed, because a notification must never break the business
   * transaction that triggered it.
   *
   *   await notifications.emit('qc.failed', { tenantId, warehouseId, entityId, data });
   *
   * Steps (spec Part 1): registry lookup → tenant settings → recipient
   * resolution → grouping → insert → socket → email queue.
   */
  async emit(eventType: string, ctx: NotificationContext): Promise<void> {
    try {
      // (a) Registry lookup. An unknown event is a programming error, not a
      //     runtime failure — log it and get out of the caller's way.
      const def = findEventDef(eventType);
      if (!def) {
        this.logger.warn(`emit("${eventType}") ignored — no such event in the registry`);
        return;
      }
      if (!ctx?.tenantId) {
        this.logger.warn(`emit("${eventType}") ignored — no tenantId in context`);
        return;
      }

      // (b) Tenant settings gate.
      const settings = await this.loadSettings(ctx.tenantId, def);
      if (!settings.enabled) return;

      // (c) Recipient resolution — the security-critical step.
      const recipients = await this.resolveRecipients(def, ctx, settings);
      if (recipients.length === 0) return;

      const groupKey = resolveGroupKey(def, ctx);
      const rendered = this.render(def, ctx);

      const toInsert: InsertNotificationRow[] = [];
      const delivered: any[] = [];

      for (const r of recipients) {
        // (d) Grouping — collapse instead of flooding the bell.
        if (groupKey) {
          const existing = await this.repository
            .findGroupCandidate(ctx.tenantId, r.id, groupKey, GROUP_WINDOW_MINUTES)
            .catch(() => null);
          if (existing) {
            const nextCount = (existing.groupCount ?? 1) + 1;
            const bumped = await this.repository.bumpGroup(ctx.tenantId, existing.id, {
              title: def.groupTitle ? def.groupTitle(nextCount, ctx) : rendered.title,
              body: rendered.body,
              linkPath: def.groupLinkPath ? def.groupLinkPath(ctx) : rendered.linkPath,
              severity: def.severity,
            });
            if (bumped) delivered.push(bumped);
            continue;
          }
        }

        toInsert.push({
          userId: r.id,
          eventType: def.eventType,
          category: def.category,
          severity: def.severity,
          title: rendered.title,
          body: rendered.body,
          linkPath: rendered.linkPath,
          entityType: ctx.entityType ?? null,
          entityId: ctx.entityId ? String(ctx.entityId) : null,
          warehouseId: ctx.warehouseId ?? null,
          requiresAction: !!def.requiresAction,
          actionState: def.requiresAction ? 'pending' : null,
          groupKey,
        });
      }

      // (e) One multi-row INSERT for everyone who did not get collapsed.
      if (toInsert.length > 0) {
        const inserted = await this.repository.insertMany(ctx.tenantId, toInsert);
        delivered.push(...inserted);
      }

      // (f) Live delivery — the event name the frontend already listens for.
      for (const row of delivered) {
        try {
          this.gateway?.server?.to(`user-${row.userId}`).emit('notification', row);
        } catch (err) {
          this.logger.warn(`socket delivery failed for ${row.id}: ${(err as Error).message}`);
        }
      }

      // (g) Email queue, respecting the immediate/batched split (spec Part 5).
      if (settings.emailEnabled) {
        const byUser = new Map<string, RecipientRow>(recipients.map((r) => [r.id, r]));
        const emails: EnqueueEmailRow[] = [];
        for (const row of delivered) {
          const r = byUser.get(row.userId);
          if (!r?.email) continue;
          emails.push({
            userId: r.id,
            toEmail: r.email,
            eventType: def.eventType,
            subject: `[Veerha] ${row.title}`.slice(0, 300),
            payload: {
              notificationId: row.id,
              title: row.title,
              body: row.body,
              linkPath: row.linkPath,
              severity: row.severity,
              category: row.category,
              entityType: row.entityType,
              entityId: row.entityId,
              recipientName: r.fullName,
              warehouseName: ctx.data?.warehouseName ?? null,
            },
            priority: def.priority,
          });
        }
        await this.repository.enqueueEmails(ctx.tenantId, emails).catch((err) => {
          this.logger.warn(`email enqueue failed for ${eventType}: ${(err as Error).message}`);
          return 0;
        });
      }
    } catch (err) {
      // Never let a notification failure surface into a business flow.
      this.logger.error(`emit("${eventType}") failed: ${(err as Error).message}`, (err as Error).stack);
    }
  }

  // ── (b) Settings ───────────────────────────────────────────────────────────

  /**
   * Tenant row wins; the code catalog is the fallback for a tenant whose
   * settings have not been seeded yet; an event with no settingsKey is always
   * enabled and never emails (spec Part 5: email only where the toggle is on).
   */
  private async loadSettings(tenantId: string, def: NotificationEventDef): Promise<EffectiveSettings> {
    if (!def.settingsKey) {
      return { enabled: true, emailEnabled: false, recipients: null };
    }

    const res = await this.db.query(
      `SELECT enabled, email_enabled, recipients
         FROM tenant_notification_settings
        WHERE tenant_id = $1 AND alert_type = $2`,
      [tenantId, def.settingsKey],
    );

    const row = res.rows[0];
    if (row) {
      return {
        enabled: row.enabled !== false,
        emailEnabled: row.email_enabled === true,
        recipients: row.recipients ?? null,
      };
    }

    const catalog = findAlertType(def.settingsKey);
    if (!catalog) return { enabled: true, emailEnabled: false, recipients: null };
    return {
      enabled: catalog.defaultEnabled,
      emailEnabled: catalog.defaultEmailEnabled,
      recipients: catalog.defaultRecipients,
    };
  }

  // ── (c) Recipient resolution (spec Part 7) ────────────────────────────────

  /**
   * Resolves the exact set of user ids that may see this event.
   *
   *  - 'user'    → exactly ctx.userId, and only if that user is active and in
   *                this tenant. Nobody else, ever (worker/gamification/approval
   *                outcome notifications).
   *  - 'admin'   → every active admin of the tenant. Admins are company-wide.
   *  - 'manager' → active managers whose users.warehouse_id equals the event's
   *                warehouse. If the event carries no warehouse, managers are
   *                only included when the registry marks the event companyWide;
   *                otherwise the manager set is EMPTY. An unscoped event must
   *                never fan out to every warehouse by accident — that is
   *                exactly the leak spec Part 7 forbids.
   *  - 'both'    → the union of admin and manager, de-duplicated.
   *
   * The tenant settings' `recipients` value overrides the registry default for
   * admin/manager/both events (the Settings screen is allowed to narrow or
   * widen the audience); it can never turn a 'user' event into a broadcast.
   *
   * The actor (ctx.data.actorUserId) is always removed at the end — nobody is
   * notified about their own action.
   */
  private async resolveRecipients(
    def: NotificationEventDef,
    ctx: NotificationContext,
    settings: EffectiveSettings,
  ): Promise<RecipientRow[]> {
    const tenantId = ctx.tenantId;

    if (def.defaultRecipients === 'user') {
      if (!ctx.userId) {
        this.logger.warn(`emit("${def.eventType}") ignored — user-scoped event with no userId`);
        return [];
      }
      const user = await this.repository.findUser(tenantId, ctx.userId);
      return user ? this.excludeActor([user], ctx) : [];
    }

    const mode: 'admin' | 'manager' | 'both' =
      settings.recipients && ['admin', 'manager', 'both'].includes(settings.recipients)
        ? (settings.recipients as 'admin' | 'manager' | 'both')
        : (def.defaultRecipients as 'admin' | 'manager' | 'both');

    const wantAdmins = mode === 'admin' || mode === 'both';
    const wantManagers = mode === 'manager' || mode === 'both';

    const out = new Map<string, RecipientRow>();

    if (wantAdmins) {
      for (const a of await this.repository.findAdmins(tenantId)) out.set(a.id, a);
    }

    if (wantManagers) {
      const warehouseId = ctx.warehouseId ?? null;
      if (warehouseId) {
        // Warehouse-scoped: ONLY managers of this warehouse.
        for (const m of await this.repository.findManagers(tenantId, warehouseId)) out.set(m.id, m);
      } else if (def.companyWide) {
        // No warehouse and the event genuinely concerns the whole company.
        for (const m of await this.repository.findManagers(tenantId, null)) out.set(m.id, m);
      } else {
        this.logger.debug(
          `emit("${def.eventType}") has no warehouseId — no manager recipients (event is not company-wide)`,
        );
      }
    }

    return this.excludeActor([...out.values()], ctx);
  }

  private excludeActor(rows: RecipientRow[], ctx: NotificationContext): RecipientRow[] {
    const actor = ctx.data?.actorUserId;
    if (!actor) return rows;
    return rows.filter((r) => r.id !== actor);
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  /** Templates are user-authored data; a throw here must not lose the event. */
  private render(def: NotificationEventDef, ctx: NotificationContext) {
    const safe = (fn: (() => string) | undefined, fallback: string): string => {
      if (!fn) return fallback;
      try {
        const v = fn();
        return v === undefined || v === null ? fallback : String(v);
      } catch {
        return fallback;
      }
    };

    return {
      title: safe(() => def.title(ctx), def.eventType).slice(0, 200),
      body: def.body ? safe(() => def.body!(ctx), '').slice(0, 4000) || null : null,
      linkPath: safe(() => def.linkPath(ctx), '/').slice(0, 300) || null,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // READ / WRITE API — every method is scoped to one user, by construction.
  // ══════════════════════════════════════════════════════════════════════════

  async findAll(tenantId: string, userId: string, query: QueryNotificationDto) {
    return this.repository.findAll(tenantId, userId, query);
  }

  async findById(tenantId: string, userId: string, id: string) {
    return this.repository.findById(tenantId, userId, id);
  }

  async unreadCount(tenantId: string, userId: string) {
    const [count, byCategory] = await Promise.all([
      this.repository.unreadCount(tenantId, userId),
      this.repository.unreadByCategory(tenantId, userId).catch(() => ({})),
    ]);
    return { count, byCategory };
  }

  async markRead(tenantId: string, userId: string, id: string) {
    return this.repository.markRead(tenantId, userId, id);
  }

  async markAllRead(tenantId: string, userId: string) {
    const updated = await this.repository.markAllRead(tenantId, userId);
    return { updated };
  }
}
