import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../../database/database.service';
import { NotificationsService } from './notifications.service';
import { NotificationsRepository, RecipientRow } from './notifications.repository';
import { NotificationContext, findEventDef } from './notification-events';

/**
 * Recipient resolution is the security-critical step: a mistake here leaks one
 * warehouse's operational data to another warehouse's manager, or turns a
 * private worker notification into a broadcast.
 *
 * Everything below is pure unit work — the repository and the database are
 * mocked, so these tests assert the service's routing decisions and nothing
 * else. `emit()` deliberately swallows every error, so each test also asserts
 * that the error logger was silent; otherwise a broken mock would masquerade
 * as "zero recipients".
 */

const user = (id: string, over: Partial<RecipientRow> = {}): RecipientRow => ({
  id,
  email: `${id}@example.com`,
  fullName: id.toUpperCase(),
  role: 'admin',
  warehouseId: null,
  ...over,
});

const admin = (id: string) => user(id, { role: 'admin' });
const manager = (id: string, warehouseId: string | null) =>
  user(id, { role: 'manager', warehouseId });

describe('NotificationsService — recipient routing', () => {
  let service: NotificationsService;
  let repo: {
    findAdmins: jest.Mock;
    findManagers: jest.Mock;
    findUser: jest.Mock;
    insertMany: jest.Mock;
    findGroupCandidate: jest.Mock;
    bumpGroup: jest.Mock;
    enqueueEmails: jest.Mock;
  };
  let db: { query: jest.Mock };
  let errorSpy: jest.SpyInstance;

  /** Ids written to the notifications table, in insertion order. */
  const insertedUserIds = (): string[] => {
    const calls = repo.insertMany.mock.calls;
    if (calls.length === 0) return [];
    return calls.flatMap((c) => (c[1] as Array<{ userId: string }>).map((r) => r.userId));
  };

  const insertedRows = (): any[] => repo.insertMany.mock.calls.flatMap((c) => c[1]);

  /** Makes the settings lookup return a tenant row instead of the catalog default. */
  const withTenantSettings = (row: {
    enabled?: boolean;
    email_enabled?: boolean;
    recipients?: string | null;
  }) => {
    db.query.mockResolvedValue({ rows: [{ enabled: true, email_enabled: false, recipients: null, ...row }] });
  };

  beforeEach(async () => {
    repo = {
      findAdmins: jest.fn().mockResolvedValue([]),
      findManagers: jest.fn().mockResolvedValue([]),
      findUser: jest.fn().mockResolvedValue(null),
      // Echo the rows back with ids so the delivery/email stages have something real.
      insertMany: jest.fn(async (_tenantId: string, rows: any[]) =>
        rows.map((r, i) => ({ ...r, id: `notif-${i}` })),
      ),
      findGroupCandidate: jest.fn().mockResolvedValue(null),
      bumpGroup: jest.fn().mockResolvedValue(null),
      enqueueEmails: jest.fn().mockResolvedValue(0),
    };
    db = { query: jest.fn().mockResolvedValue({ rows: [] }) };

    // Keep the test output clean and detect swallowed failures.
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: DatabaseService, useValue: db },
        { provide: NotificationsRepository, useValue: repo },
      ],
    }).compile();

    service = moduleRef.get(NotificationsService);
  });

  afterEach(() => {
    // `emit()` swallows every error, so a broken mock would otherwise look
    // exactly like "zero recipients". Restore first, then assert.
    const swallowed = errorSpy.mock.calls.map((c) => String(c[0]));
    jest.restoreAllMocks();
    expect(swallowed).toEqual([]);
  });

  const ctx = (over: Partial<NotificationContext> = {}): NotificationContext => ({
    tenantId: 'tenant-1',
    ...over,
  });

  // ───────────────────────────────────────────────────────────── guards ──────

  describe('entry guards', () => {
    it('ignores an event that is not in the registry', async () => {
      await service.emit('nope.not_a_thing', ctx());
      expect(db.query).not.toHaveBeenCalled();
      expect(repo.findAdmins).not.toHaveBeenCalled();
      expect(repo.findManagers).not.toHaveBeenCalled();
      expect(repo.findUser).not.toHaveBeenCalled();
      expect(repo.insertMany).not.toHaveBeenCalled();
    });

    it('ignores an event with no tenantId', async () => {
      await service.emit('po.submitted', { tenantId: '' } as NotificationContext);
      expect(repo.findAdmins).not.toHaveBeenCalled();
      expect(repo.insertMany).not.toHaveBeenCalled();
    });

    it('ignores an event with no context at all', async () => {
      await service.emit('po.submitted', undefined as unknown as NotificationContext);
      expect(repo.insertMany).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────── admin ─────────

  describe("recipients: 'admin'", () => {
    it('fans out to every active admin of the tenant', async () => {
      repo.findAdmins.mockResolvedValue([admin('a1'), admin('a2'), admin('a3')]);

      await service.emit('po.submitted', ctx({ entityId: 'po-1' }));

      expect(repo.findAdmins).toHaveBeenCalledWith('tenant-1');
      expect(insertedUserIds()).toEqual(['a1', 'a2', 'a3']);
    });

    it('never consults the manager list for an admin-only event', async () => {
      repo.findAdmins.mockResolvedValue([admin('a1')]);
      await service.emit('po.submitted', ctx({ warehouseId: 'wh-1' }));
      expect(repo.findManagers).not.toHaveBeenCalled();
    });

    it('is company-wide: warehouse never narrows the admin set', async () => {
      repo.findAdmins.mockResolvedValue([admin('a1'), admin('a2')]);
      await service.emit('po.submitted', ctx({ warehouseId: 'wh-9' }));
      // findAdmins takes the tenant only — there is no warehouse argument to leak.
      expect(repo.findAdmins).toHaveBeenCalledWith('tenant-1');
      expect(insertedUserIds()).toEqual(['a1', 'a2']);
    });

    it('writes nothing when the tenant has no admins', async () => {
      repo.findAdmins.mockResolvedValue([]);
      await service.emit('po.submitted', ctx());
      expect(repo.insertMany).not.toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────── manager ─────────

  describe("recipients: 'manager'", () => {
    it('asks only for managers of the event warehouse', async () => {
      repo.findManagers.mockResolvedValue([manager('m1', 'wh-1')]);

      await service.emit('grn.created', ctx({ warehouseId: 'wh-1', entityId: 'grn-1' }));

      expect(repo.findManagers).toHaveBeenCalledTimes(1);
      expect(repo.findManagers).toHaveBeenCalledWith('tenant-1', 'wh-1');
      expect(insertedUserIds()).toEqual(['m1']);
    });

    it('never asks for the unscoped manager list when a warehouse is present', async () => {
      repo.findManagers.mockResolvedValue([manager('m1', 'wh-1')]);
      await service.emit('grn.created', ctx({ warehouseId: 'wh-1' }));
      expect(repo.findManagers).not.toHaveBeenCalledWith('tenant-1', null);
    });

    it('does not fan out to all managers when the event carries no warehouse', async () => {
      repo.findManagers.mockResolvedValue([manager('m1', 'wh-1'), manager('m2', 'wh-2')]);

      await service.emit('grn.created', ctx({ entityId: 'grn-1' }));

      // The manager lookup must not happen at all — no query, no leak.
      expect(repo.findManagers).not.toHaveBeenCalled();
      expect(repo.insertMany).not.toHaveBeenCalled();
    });

    it('treats warehouseId: null exactly like a missing warehouse', async () => {
      await service.emit('grn.created', ctx({ warehouseId: null }));
      expect(repo.findManagers).not.toHaveBeenCalled();
      expect(repo.insertMany).not.toHaveBeenCalled();
    });

    it('falls back to every manager only when the registry marks the event companyWide', async () => {
      // system.daily_summary is companyWide; narrow it to managers via settings.
      withTenantSettings({ enabled: true, recipients: 'manager' });
      repo.findManagers.mockResolvedValue([manager('m1', 'wh-1'), manager('m2', 'wh-2')]);

      await service.emit('system.daily_summary', ctx());

      expect(findEventDef('system.daily_summary')!.companyWide).toBe(true);
      expect(repo.findManagers).toHaveBeenCalledWith('tenant-1', null);
      expect(insertedUserIds()).toEqual(['m1', 'm2']);
    });

    it('stamps the event warehouse onto every inserted row', async () => {
      repo.findManagers.mockResolvedValue([manager('m1', 'wh-1')]);
      await service.emit('grn.created', ctx({ warehouseId: 'wh-1' }));
      expect(insertedRows()[0].warehouseId).toBe('wh-1');
    });
  });

  // ──────────────────────────────────────────────────────────── both ─────────

  describe("recipients: 'both'", () => {
    it('is the union of admins and the warehouse managers', async () => {
      repo.findAdmins.mockResolvedValue([admin('a1')]);
      repo.findManagers.mockResolvedValue([manager('m1', 'wh-1')]);

      await service.emit('qc.failed', ctx({ warehouseId: 'wh-1', entityId: 'insp-1' }));

      expect(insertedUserIds().sort()).toEqual(['a1', 'm1']);
    });

    it('de-duplicates a user returned by both lookups', async () => {
      const dual = user('u1', { role: 'admin', warehouseId: 'wh-1' });
      repo.findAdmins.mockResolvedValue([dual]);
      repo.findManagers.mockResolvedValue([dual]);

      await service.emit('qc.failed', ctx({ warehouseId: 'wh-1' }));

      expect(insertedUserIds()).toEqual(['u1']);
    });

    it('still delivers to admins when the warehouse has no managers', async () => {
      repo.findAdmins.mockResolvedValue([admin('a1')]);
      repo.findManagers.mockResolvedValue([]);

      await service.emit('qc.failed', ctx({ warehouseId: 'wh-1' }));

      expect(insertedUserIds()).toEqual(['a1']);
    });

    it('delivers to admins only when a "both" event carries no warehouse', async () => {
      repo.findAdmins.mockResolvedValue([admin('a1')]);
      repo.findManagers.mockResolvedValue([manager('m1', 'wh-1'), manager('m2', 'wh-2')]);

      await service.emit('qc.failed', ctx());

      expect(repo.findManagers).not.toHaveBeenCalled();
      expect(insertedUserIds()).toEqual(['a1']);
    });
  });

  // ──────────────────────────────────────────────────────────── user ─────────

  describe("recipients: 'user'", () => {
    it('routes to exactly ctx.userId and nobody else', async () => {
      repo.findUser.mockResolvedValue(user('w1', { role: 'worker' }));
      repo.findAdmins.mockResolvedValue([admin('a1'), admin('a2')]);
      repo.findManagers.mockResolvedValue([manager('m1', 'wh-1')]);

      await service.emit('task.assigned', ctx({ userId: 'w1', warehouseId: 'wh-1' }));

      expect(repo.findUser).toHaveBeenCalledWith('tenant-1', 'w1');
      expect(repo.findAdmins).not.toHaveBeenCalled();
      expect(repo.findManagers).not.toHaveBeenCalled();
      expect(insertedUserIds()).toEqual(['w1']);
    });

    it('scopes the user lookup to the tenant', async () => {
      repo.findUser.mockResolvedValue(user('w1'));
      await service.emit('task.assigned', ctx({ tenantId: 'tenant-7', userId: 'w1' }));
      expect(repo.findUser).toHaveBeenCalledWith('tenant-7', 'w1');
    });

    it('writes nothing when the user-scoped event has no userId', async () => {
      await service.emit('task.assigned', ctx());
      expect(repo.findUser).not.toHaveBeenCalled();
      expect(repo.findAdmins).not.toHaveBeenCalled();
      expect(repo.insertMany).not.toHaveBeenCalled();
    });

    it('writes nothing when the target user is inactive or in another tenant', async () => {
      repo.findUser.mockResolvedValue(null); // repository filters by tenant + is_active
      await service.emit('task.assigned', ctx({ userId: 'ghost' }));
      expect(repo.insertMany).not.toHaveBeenCalled();
    });

    /**
     * White-box: the settings screen may narrow or widen admin/manager/both
     * audiences, but it must never be able to turn a private worker
     * notification into a broadcast. The 'user' branch returns before the
     * settings-derived mode is even computed.
     */
    it('cannot be widened into a broadcast by tenant settings', async () => {
      repo.findUser.mockResolvedValue(user('w1'));
      repo.findAdmins.mockResolvedValue([admin('a1'), admin('a2')]);
      repo.findManagers.mockResolvedValue([manager('m1', 'wh-1')]);

      const def = findEventDef('task.assigned')!;
      for (const recipients of ['admin', 'manager', 'both'] as const) {
        const resolved = await (service as any).resolveRecipients(
          def,
          ctx({ userId: 'w1', warehouseId: 'wh-1' }),
          { enabled: true, emailEnabled: false, recipients },
        );
        expect(resolved.map((r: RecipientRow) => r.id)).toEqual(['w1']);
      }
      expect(repo.findAdmins).not.toHaveBeenCalled();
      expect(repo.findManagers).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────── the actor ────────

  describe('actor exclusion', () => {
    it('never notifies the actor about their own action (admin fan-out)', async () => {
      repo.findAdmins.mockResolvedValue([admin('a1'), admin('a2'), admin('a3')]);

      await service.emit('po.submitted', ctx({ data: { actorUserId: 'a2' } }));

      expect(insertedUserIds()).toEqual(['a1', 'a3']);
    });

    it('never notifies the actor about their own action (manager fan-out)', async () => {
      repo.findManagers.mockResolvedValue([manager('m1', 'wh-1'), manager('m2', 'wh-1')]);

      await service.emit('grn.created', ctx({ warehouseId: 'wh-1', data: { actorUserId: 'm1' } }));

      expect(insertedUserIds()).toEqual(['m2']);
    });

    it('excludes the actor from a "both" union too', async () => {
      repo.findAdmins.mockResolvedValue([admin('a1')]);
      repo.findManagers.mockResolvedValue([manager('m1', 'wh-1')]);

      await service.emit('qc.failed', ctx({ warehouseId: 'wh-1', data: { actorUserId: 'a1' } }));

      expect(insertedUserIds()).toEqual(['m1']);
    });

    it('excludes the actor even from a user-scoped event addressed to themselves', async () => {
      repo.findUser.mockResolvedValue(user('w1'));

      await service.emit('task.assigned', ctx({ userId: 'w1', data: { actorUserId: 'w1' } }));

      expect(repo.insertMany).not.toHaveBeenCalled();
    });

    it('leaves the set untouched when there is no actor', async () => {
      repo.findAdmins.mockResolvedValue([admin('a1'), admin('a2')]);
      await service.emit('po.submitted', ctx({ data: { poNumber: 'PO-1' } }));
      expect(insertedUserIds()).toEqual(['a1', 'a2']);
    });
  });

  // ──────────────────────────────────────────────────── tenant settings ──────

  describe('tenant settings gate', () => {
    it('produces zero recipients when the alert type is disabled', async () => {
      withTenantSettings({ enabled: false });
      repo.findAdmins.mockResolvedValue([admin('a1')]);
      repo.findManagers.mockResolvedValue([manager('m1', 'wh-1')]);

      await service.emit('inventory.low_stock', ctx({ warehouseId: 'wh-1' }));

      expect(repo.findAdmins).not.toHaveBeenCalled();
      expect(repo.findManagers).not.toHaveBeenCalled();
      expect(repo.insertMany).not.toHaveBeenCalled();
    });

    it('honours the catalog default when the tenant row is missing', async () => {
      // `overstock` ships disabled by default and has no tenant row here.
      db.query.mockResolvedValue({ rows: [] });
      repo.findManagers.mockResolvedValue([manager('m1', 'wh-1')]);

      await service.emit('inventory.overstock', ctx({ warehouseId: 'wh-1' }));

      expect(repo.insertMany).not.toHaveBeenCalled();
    });

    it('narrows a "both" event to admins only', async () => {
      withTenantSettings({ enabled: true, recipients: 'admin' });
      repo.findAdmins.mockResolvedValue([admin('a1')]);
      repo.findManagers.mockResolvedValue([manager('m1', 'wh-1')]);

      await service.emit('inventory.low_stock', ctx({ warehouseId: 'wh-1' }));

      expect(repo.findManagers).not.toHaveBeenCalled();
      expect(insertedUserIds()).toEqual(['a1']);
    });

    it('narrows a "both" event to managers only', async () => {
      withTenantSettings({ enabled: true, recipients: 'manager' });
      repo.findAdmins.mockResolvedValue([admin('a1')]);
      repo.findManagers.mockResolvedValue([manager('m1', 'wh-1')]);

      await service.emit('inventory.low_stock', ctx({ warehouseId: 'wh-1' }));

      expect(repo.findAdmins).not.toHaveBeenCalled();
      expect(insertedUserIds()).toEqual(['m1']);
    });

    it('a narrowed manager audience is still warehouse-scoped', async () => {
      withTenantSettings({ enabled: true, recipients: 'manager' });
      repo.findManagers.mockResolvedValue([manager('m1', 'wh-1')]);

      await service.emit('inventory.low_stock', ctx({ warehouseId: 'wh-1' }));

      expect(repo.findManagers).toHaveBeenCalledWith('tenant-1', 'wh-1');
    });

    it('ignores a junk recipients value and falls back to the registry default', async () => {
      withTenantSettings({ enabled: true, recipients: 'everyone' });
      repo.findAdmins.mockResolvedValue([admin('a1')]);
      repo.findManagers.mockResolvedValue([manager('m1', 'wh-1')]);

      // low_stock's registry default is 'both'.
      await service.emit('inventory.low_stock', ctx({ warehouseId: 'wh-1' }));

      expect(insertedUserIds().sort()).toEqual(['a1', 'm1']);
    });

    it('queries settings with the tenant id and the event settingsKey', async () => {
      repo.findAdmins.mockResolvedValue([admin('a1')]);
      await service.emit('inventory.low_stock', ctx({ warehouseId: 'wh-1' }));
      expect(db.query).toHaveBeenCalledWith(expect.any(String), ['tenant-1', 'low_stock']);
    });

    it('skips the settings query entirely for an event with no settingsKey', async () => {
      repo.findAdmins.mockResolvedValue([admin('a1')]);
      await service.emit('po.submitted', ctx());
      expect(db.query).not.toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────────── payload ────────

  describe('inserted row payload', () => {
    it('carries the registry category, severity and event type', async () => {
      repo.findAdmins.mockResolvedValue([admin('a1')]);

      await service.emit('po.submitted', ctx({ entityType: 'purchase_order', entityId: 'po-1' }));

      const row = insertedRows()[0];
      expect(row.eventType).toBe('po.submitted');
      expect(row.category).toBe('inbound');
      expect(row.severity).toBe('info');
      expect(row.entityType).toBe('purchase_order');
      expect(row.entityId).toBe('po-1');
    });

    it('marks an approval request as actionable and pending', async () => {
      repo.findAdmins.mockResolvedValue([admin('a1')]);
      await service.emit('po.submitted', ctx({ entityId: 'po-1' }));
      const row = insertedRows()[0];
      expect(row.requiresAction).toBe(true);
      expect(row.actionState).toBe('pending');
    });

    it('leaves a non-approval event non-actionable', async () => {
      repo.findManagers.mockResolvedValue([manager('m1', 'wh-1')]);
      await service.emit('grn.created', ctx({ warehouseId: 'wh-1' }));
      const row = insertedRows()[0];
      expect(row.requiresAction).toBe(false);
      expect(row.actionState).toBeNull();
    });

    it('renders a link path that starts with "/"', async () => {
      repo.findAdmins.mockResolvedValue([admin('a1')]);
      await service.emit('po.submitted', ctx({ entityId: 'po-1' }));
      expect(insertedRows()[0].linkPath.startsWith('/')).toBe(true);
    });

    it('writes one row per recipient with identical content', async () => {
      repo.findAdmins.mockResolvedValue([admin('a1'), admin('a2')]);

      await service.emit('po.submitted', ctx({ entityId: 'po-1', data: { poNumber: 'PO-9' } }));

      const rows = insertedRows();
      expect(rows).toHaveLength(2);
      expect(rows[0].title).toBe(rows[1].title);
      expect(rows[0].title).toContain('PO-9');
    });

    it('inserts everyone in a single call, not one call per recipient', async () => {
      repo.findAdmins.mockResolvedValue([admin('a1'), admin('a2'), admin('a3')]);
      await service.emit('po.submitted', ctx());
      expect(repo.insertMany).toHaveBeenCalledTimes(1);
    });

    it('survives a title template that throws, falling back to the event type', async () => {
      repo.findAdmins.mockResolvedValue([admin('a1')]);
      const def = findEventDef('po.submitted')!;
      const original = def.title;
      def.title = () => {
        throw new Error('bad template');
      };
      try {
        await service.emit('po.submitted', ctx());
      } finally {
        def.title = original;
      }
      expect(insertedRows()[0].title).toBe('po.submitted');
    });
  });

  // ──────────────────────────────────────────────────────── grouping ─────────

  describe('grouping', () => {
    it('looks for a collapse candidate per recipient using a warehouse-scoped key', async () => {
      withTenantSettings({ enabled: true, recipients: 'manager' });
      repo.findManagers.mockResolvedValue([manager('m1', 'wh-1')]);

      await service.emit('inventory.low_stock', ctx({ warehouseId: 'wh-1' }));

      expect(repo.findGroupCandidate).toHaveBeenCalledWith(
        'tenant-1',
        'm1',
        'inventory.low_stock:wh-1',
        60,
      );
    });

    it('collapses into the existing row instead of inserting a new one', async () => {
      withTenantSettings({ enabled: true, recipients: 'manager' });
      repo.findManagers.mockResolvedValue([manager('m1', 'wh-1')]);
      repo.findGroupCandidate.mockResolvedValue({ id: 'existing-1', groupCount: 3 });
      repo.bumpGroup.mockResolvedValue({ id: 'existing-1', userId: 'm1', title: 't' });

      await service.emit('inventory.low_stock', ctx({ warehouseId: 'wh-1' }));

      expect(repo.insertMany).not.toHaveBeenCalled();
      expect(repo.bumpGroup).toHaveBeenCalledTimes(1);
      expect(repo.bumpGroup.mock.calls[0][2].title).toBe('4 SKUs are below reorder point');
    });

    it('does not group a non-groupable event', async () => {
      repo.findAdmins.mockResolvedValue([admin('a1')]);
      await service.emit('po.submitted', ctx());
      expect(repo.findGroupCandidate).not.toHaveBeenCalled();
      expect(insertedRows()[0].groupKey).toBeNull();
    });

    it('a lookup failure degrades to a plain insert rather than losing the event', async () => {
      withTenantSettings({ enabled: true, recipients: 'manager' });
      repo.findManagers.mockResolvedValue([manager('m1', 'wh-1')]);
      repo.findGroupCandidate.mockRejectedValue(new Error('db down'));

      await service.emit('inventory.low_stock', ctx({ warehouseId: 'wh-1' }));

      expect(insertedUserIds()).toEqual(['m1']);
    });
  });

  // ─────────────────────────────────────────────────────── email queue ───────

  describe('email queue', () => {
    it('does not enqueue email when the tenant has it switched off', async () => {
      withTenantSettings({ enabled: true, email_enabled: false, recipients: 'admin' });
      repo.findAdmins.mockResolvedValue([admin('a1')]);

      await service.emit('inventory.low_stock', ctx({ warehouseId: 'wh-1' }));

      expect(repo.enqueueEmails).not.toHaveBeenCalled();
    });

    it('enqueues one email per delivered recipient when it is switched on', async () => {
      withTenantSettings({ enabled: true, email_enabled: true, recipients: 'admin' });
      repo.findAdmins.mockResolvedValue([admin('a1'), admin('a2')]);

      await service.emit('inventory.low_stock', ctx({ warehouseId: 'wh-1' }));

      const rows = repo.enqueueEmails.mock.calls[0][1];
      expect(rows.map((r: any) => r.toEmail)).toEqual(['a1@example.com', 'a2@example.com']);
      expect(rows.every((r: any) => r.priority === 'batched')).toBe(true);
    });

    it('never enqueues email for an event with no settingsKey', async () => {
      repo.findAdmins.mockResolvedValue([admin('a1')]);
      await service.emit('po.submitted', ctx());
      expect(repo.enqueueEmails).not.toHaveBeenCalled();
    });

    it('addresses email only to resolved recipients', async () => {
      withTenantSettings({ enabled: true, email_enabled: true, recipients: 'manager' });
      repo.findManagers.mockResolvedValue([manager('m1', 'wh-1')]);
      repo.findAdmins.mockResolvedValue([admin('a1')]);

      await service.emit('inventory.low_stock', ctx({ warehouseId: 'wh-1' }));

      const rows = repo.enqueueEmails.mock.calls[0][1];
      expect(rows.map((r: any) => r.userId)).toEqual(['m1']);
    });
  });

  // ───────────────────────────────────────────────────── read isolation ──────

  describe('read API scoping', () => {
    it('every read is scoped to one tenant and one user', async () => {
      const reads = {
        findAll: jest.fn().mockResolvedValue({ data: [], meta: {} }),
        findById: jest.fn().mockResolvedValue(null),
        unreadCount: jest.fn().mockResolvedValue(0),
        unreadByCategory: jest.fn().mockResolvedValue({}),
        markRead: jest.fn().mockResolvedValue(null),
        markAllRead: jest.fn().mockResolvedValue(2),
      };
      Object.assign(repo, reads);

      await service.findAll('t1', 'u1', {} as any);
      await service.findById('t1', 'u1', 'n1');
      await service.unreadCount('t1', 'u1');
      await service.markRead('t1', 'u1', 'n1');
      await service.markAllRead('t1', 'u1');

      expect(reads.findAll).toHaveBeenCalledWith('t1', 'u1', {});
      expect(reads.findById).toHaveBeenCalledWith('t1', 'u1', 'n1');
      expect(reads.unreadCount).toHaveBeenCalledWith('t1', 'u1');
      expect(reads.unreadByCategory).toHaveBeenCalledWith('t1', 'u1');
      expect(reads.markRead).toHaveBeenCalledWith('t1', 'u1', 'n1');
      expect(reads.markAllRead).toHaveBeenCalledWith('t1', 'u1');
    });

    it('markAllRead reports how many rows changed', async () => {
      (repo as any).markAllRead = jest.fn().mockResolvedValue(7);
      await expect(service.markAllRead('t1', 'u1')).resolves.toEqual({ updated: 7 });
    });

    it('unreadCount survives a failing per-category breakdown', async () => {
      (repo as any).unreadCount = jest.fn().mockResolvedValue(4);
      (repo as any).unreadByCategory = jest.fn().mockRejectedValue(new Error('no such table'));
      await expect(service.unreadCount('t1', 'u1')).resolves.toEqual({ count: 4, byCategory: {} });
    });
  });
});
