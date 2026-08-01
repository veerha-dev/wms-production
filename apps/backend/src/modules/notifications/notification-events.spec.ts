import {
  NOTIFICATION_EVENTS,
  NOTIFICATION_EVENT_TYPES,
  NotificationCategory,
  NotificationContext,
  NotificationEventDef,
  NotificationPriority,
  NotificationRecipients,
  NotificationSeverity,
  findEventDef,
  resolveGroupKey,
} from './notification-events';
import { NOTIFICATION_ALERT_KEYS } from '../settings/notification-alert-types';

/**
 * The registry is the contract between business modules and the delivery
 * engine. The spec's central rule is that every notification must open the
 * page where the recipient can act — so a dead or missing `linkPath` is the
 * defect these tests exist to catch before it ships.
 */

const CATEGORIES: NotificationCategory[] = ['inbound', 'inventory', 'outbound', 'worker', 'system'];
const SEVERITIES: NotificationSeverity[] = ['info', 'warning', 'critical'];
const RECIPIENTS: NotificationRecipients[] = ['admin', 'manager', 'both', 'user'];
const PRIORITIES: NotificationPriority[] = ['immediate', 'batched'];

/** A representative, fully-populated context. */
const richCtx = (over: Partial<NotificationContext> = {}): NotificationContext => ({
  tenantId: 'tenant-1',
  warehouseId: 'wh-1',
  userId: 'user-1',
  entityType: 'purchase_order',
  entityId: '9f3a1c2e-0000-4000-8000-000000000001',
  data: {
    code: 'REF-0001',
    poNumber: 'PO-0012',
    grnNumber: 'GRN-0007',
    orderNumber: 'SO-0031',
    shipmentNumber: 'SHP-0002',
    pickListNumber: 'PL-0004',
    transferNumber: 'TRF-0005',
    adjustmentNumber: 'ADJ-0006',
    countNumber: 'CC-0009',
    batchNumber: 'B-2201',
    taskCode: 'TSK-0003',
    skuName: 'Widget A',
    skuCode: 'SKU-1',
    skuId: 'sku-1',
    warehouseName: 'Chennai DC',
    customerName: 'Acme Ltd',
    supplierName: 'Globex',
    courierName: 'BlueDart',
    channel: 'Shopify',
    fullName: 'Asha R',
    email: 'asha@example.com',
    role: 'manager',
    badgeName: 'Speedster',
    challengeName: 'Pick 100',
    message: 'Please check aisle 3',
    fromName: 'Ravi',
    reason: 'Damaged on arrival',
    quantity: 12,
    currentQty: 3,
    reorderPoint: 10,
    maxLevel: 500,
    daysToExpiry: 7,
    expiryDate: '2026-09-01',
    totalItems: 4,
    totalAmount: '12,000.00',
    percentUsed: 90,
    limitType: 'users',
    planName: 'Growth',
    ordersShipped: 5,
    grnsReceived: 2,
    pendingApprovals: 1,
    lowStockCount: 8,
    date: '2026-08-01',
  },
  ...over,
});

/** The bare minimum a caller can legally pass. */
const bareCtx = (over: Partial<NotificationContext> = {}): NotificationContext => ({
  tenantId: 'tenant-1',
  ...over,
});

const each: Array<[string, NotificationEventDef]> = NOTIFICATION_EVENTS.map((e) => [e.eventType, e]);

describe('notification event registry — shape', () => {
  it('is non-empty', () => {
    expect(NOTIFICATION_EVENTS.length).toBeGreaterThan(0);
  });

  it('has no duplicate eventType', () => {
    const seen = new Set(NOTIFICATION_EVENT_TYPES);
    expect(seen.size).toBe(NOTIFICATION_EVENTS.length);
  });

  it('NOTIFICATION_EVENT_TYPES mirrors the registry in order', () => {
    expect(NOTIFICATION_EVENT_TYPES).toEqual(NOTIFICATION_EVENTS.map((e) => e.eventType));
  });

  it('every eventType is namespaced as "domain.action"', () => {
    for (const e of NOTIFICATION_EVENTS) {
      expect(e.eventType).toMatch(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/);
    }
  });
});

describe.each(each)('registered event "%s"', (eventType, def) => {
  it('has a non-empty eventType', () => {
    expect(typeof def.eventType).toBe('string');
    expect(def.eventType.trim().length).toBeGreaterThan(0);
    expect(def.eventType).toBe(eventType);
  });

  it('has a valid category', () => {
    expect(CATEGORIES).toContain(def.category);
  });

  it('has a valid severity', () => {
    expect(SEVERITIES).toContain(def.severity);
  });

  it('has valid defaultRecipients', () => {
    expect(RECIPIENTS).toContain(def.defaultRecipients);
  });

  it('has a valid priority', () => {
    expect(PRIORITIES).toContain(def.priority);
  });

  it('title() returns a non-empty string for a representative context', () => {
    const title = def.title(richCtx());
    expect(typeof title).toBe('string');
    expect(title.trim().length).toBeGreaterThan(0);
  });

  it('title() still returns a non-empty string for a bare context', () => {
    const title = def.title(bareCtx());
    expect(typeof title).toBe('string');
    expect(title.trim().length).toBeGreaterThan(0);
  });

  it('title() never renders "undefined" or "null" to the user', () => {
    for (const ctx of [richCtx(), bareCtx()]) {
      expect(def.title(ctx)).not.toMatch(/undefined|null|NaN/);
    }
  });

  it('linkPath() returns a path starting with "/"', () => {
    const link = def.linkPath(richCtx());
    expect(typeof link).toBe('string');
    expect(link.startsWith('/')).toBe(true);
  });

  it('linkPath() still returns a usable path for a bare context', () => {
    const link = def.linkPath(bareCtx());
    expect(link.startsWith('/')).toBe(true);
    // A path is never left as a naked query string or a dangling separator.
    expect(link).not.toMatch(/^\/\?$/);
    expect(link).not.toMatch(/[?&]$/);
    expect(link).not.toMatch(/[?&]=/);
  });

  it('linkPath() never embeds "undefined" or "null"', () => {
    for (const ctx of [richCtx(), bareCtx()]) {
      expect(def.linkPath(ctx)).not.toMatch(/undefined|null/);
    }
  });

  it('linkPath() is not a bare "/" unless the event genuinely targets the dashboard', () => {
    const link = def.linkPath(richCtx());
    if (link === '/') {
      expect(['system.daily_summary']).toContain(def.eventType);
    }
  });

  it('body(), when defined, returns a string and never throws', () => {
    if (!def.body) return;
    for (const ctx of [richCtx(), bareCtx()]) {
      const body = def.body(ctx);
      expect(typeof body).toBe('string');
      expect(body).not.toMatch(/undefined|null/);
    }
  });

  it('settingsKey, when present, exists in the alert-type catalog', () => {
    if (!def.settingsKey) return;
    expect(NOTIFICATION_ALERT_KEYS).toContain(def.settingsKey);
  });

  it('is discoverable through findEventDef', () => {
    expect(findEventDef(def.eventType)).toBe(def);
  });
});

describe('registry invariants (spec Part 5)', () => {
  it('every critical event is delivered immediately, never batched', () => {
    const batchedCritical = NOTIFICATION_EVENTS.filter(
      (e) => e.severity === 'critical' && e.priority !== 'immediate',
    ).map((e) => e.eventType);
    expect(batchedCritical).toEqual([]);
  });

  it('every approval request is delivered immediately', () => {
    const batchedApprovals = NOTIFICATION_EVENTS.filter(
      (e) => e.requiresAction && e.priority !== 'immediate',
    ).map((e) => e.eventType);
    expect(batchedApprovals).toEqual([]);
  });

  it('an approval request never routes to a single worker', () => {
    for (const e of NOTIFICATION_EVENTS.filter((x) => x.requiresAction)) {
      expect(e.defaultRecipients).not.toBe('user');
    }
  });

  it('every worker-category event routes to exactly one user', () => {
    for (const e of NOTIFICATION_EVENTS.filter((x) => x.category === 'worker')) {
      expect(e.defaultRecipients).toBe('user');
    }
  });

  it('a user-scoped event is never marked companyWide', () => {
    for (const e of NOTIFICATION_EVENTS.filter((x) => x.defaultRecipients === 'user')) {
      expect(e.companyWide).toBeFalsy();
    }
  });

  it('every groupable event supplies a group title and a group link', () => {
    for (const e of NOTIFICATION_EVENTS.filter((x) => x.groupable)) {
      expect(typeof e.groupTitle).toBe('function');
      expect(typeof e.groupLinkPath).toBe('function');
    }
  });

  it('groupTitle() renders a non-empty string carrying the count', () => {
    for (const e of NOTIFICATION_EVENTS.filter((x) => x.groupable && x.groupTitle)) {
      const title = e.groupTitle!(8, richCtx());
      expect(title.trim().length).toBeGreaterThan(0);
      expect(title).toContain('8');
      expect(title).not.toMatch(/undefined|null/);
    }
  });

  it('groupLinkPath() returns a path starting with "/"', () => {
    for (const e of NOTIFICATION_EVENTS.filter((x) => x.groupable && x.groupLinkPath)) {
      for (const ctx of [richCtx(), bareCtx()]) {
        const link = e.groupLinkPath!(ctx);
        expect(link.startsWith('/')).toBe(true);
        expect(link).not.toMatch(/undefined|null/);
      }
    }
  });

  it('a non-groupable event does not carry grouping helpers', () => {
    for (const e of NOTIFICATION_EVENTS.filter((x) => !x.groupable)) {
      expect(e.groupTitle).toBeUndefined();
      expect(e.groupLinkPath).toBeUndefined();
      expect(e.groupKey).toBeUndefined();
    }
  });
});

describe('findEventDef', () => {
  it('returns undefined for an unregistered event type', () => {
    expect(findEventDef('nope.not_a_thing')).toBeUndefined();
    expect(findEventDef('')).toBeUndefined();
  });

  it('is case-sensitive — a typo is not silently resolved', () => {
    expect(findEventDef('QC.FAILED')).toBeUndefined();
    expect(findEventDef('qc.failed')).toBeDefined();
  });

  it('resolves a known event to the same object held in the array', () => {
    const def = findEventDef('inventory.low_stock');
    expect(def).toBeDefined();
    expect(NOTIFICATION_EVENTS).toContain(def!);
  });
});

/**
 * Grouping key construction. The key MUST carry the warehouse, otherwise a
 * "low stock" collapse in Chennai would swallow the Mumbai alert and a
 * manager would never see their own warehouse's row.
 */
describe('resolveGroupKey', () => {
  const groupable = NOTIFICATION_EVENTS.filter((e) => e.groupable);
  const notGroupable = NOTIFICATION_EVENTS.filter((e) => !e.groupable);

  it('there is at least one groupable and one non-groupable event to test', () => {
    expect(groupable.length).toBeGreaterThan(0);
    expect(notGroupable.length).toBeGreaterThan(0);
  });

  it.each(notGroupable.map((e) => [e.eventType, e] as [string, NotificationEventDef]))(
    'returns null for non-groupable "%s"',
    (_type, def) => {
      expect(resolveGroupKey(def, richCtx())).toBeNull();
    },
  );

  it.each(groupable.map((e) => [e.eventType, e] as [string, NotificationEventDef]))(
    'builds a warehouse-scoped key for groupable "%s"',
    (_type, def) => {
      const key = resolveGroupKey(def, richCtx({ warehouseId: 'wh-chennai' }));
      expect(key).toBe(`${def.eventType}:wh-chennai`);
    },
  );

  it.each(groupable.map((e) => [e.eventType, e] as [string, NotificationEventDef]))(
    'never produces the same key for two warehouses — "%s"',
    (_type, def) => {
      const a = resolveGroupKey(def, richCtx({ warehouseId: 'wh-chennai' }));
      const b = resolveGroupKey(def, richCtx({ warehouseId: 'wh-mumbai' }));
      expect(a).not.toBe(b);
      expect(a).toContain('wh-chennai');
      expect(b).toContain('wh-mumbai');
    },
  );

  it('falls back to the "all" sentinel when no warehouse is supplied', () => {
    const def = findEventDef('inventory.low_stock')!;
    expect(resolveGroupKey(def, bareCtx())).toBe('inventory.low_stock:all');
    expect(resolveGroupKey(def, bareCtx({ warehouseId: null }))).toBe('inventory.low_stock:all');
  });

  it('the unscoped "all" key never collides with a real warehouse key', () => {
    const def = findEventDef('inventory.low_stock')!;
    expect(resolveGroupKey(def, bareCtx())).not.toBe(
      resolveGroupKey(def, richCtx({ warehouseId: 'wh-1' })),
    );
  });

  it('two different groupable events never share a key in the same warehouse', () => {
    const keys = groupable.map((e) => resolveGroupKey(e, richCtx({ warehouseId: 'wh-1' })));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('honours an explicit groupKey builder', () => {
    const def = {
      ...findEventDef('inventory.low_stock')!,
      groupKey: (c: NotificationContext) => `custom:${c.warehouseId}:${c.data?.skuId}`,
    };
    expect(resolveGroupKey(def, richCtx())).toBe('custom:wh-1:sku-1');
  });

  it('truncates an over-long key to the 120-character column limit', () => {
    const def = {
      ...findEventDef('inventory.low_stock')!,
      groupKey: () => 'x'.repeat(500),
    };
    expect(resolveGroupKey(def, richCtx())!.length).toBe(120);
  });

  it('returns null when a custom builder yields an empty key', () => {
    const def = { ...findEventDef('inventory.low_stock')!, groupKey: () => '' };
    expect(resolveGroupKey(def, richCtx())).toBeNull();
  });
});
