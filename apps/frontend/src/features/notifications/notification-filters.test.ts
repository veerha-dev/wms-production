/**
 * matchesNotificationFilters decides whether a notification that arrived over
 * the socket belongs in an already-cached, already-filtered React Query page.
 * Get it wrong in one direction and live notifications vanish; get it wrong in
 * the other and a filtered view quietly fills with rows that do not match.
 */
import { describe, it, expect } from 'vitest';
import {
  matchesNotificationFilters,
  type Notification,
  type NotificationFilters,
} from './types';

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'n-1',
    eventType: 'grn.created',
    category: 'inbound',
    severity: 'info',
    title: 'GRN-0042 received',
    body: 'Awaiting QC inspection at Dock 3',
    linkPath: '/inbound/grn/42',
    entityType: 'grn',
    entityId: '42',
    requiresAction: false,
    actionState: null,
    groupCount: 1,
    isRead: false,
    readAt: null,
    createdAt: '2026-07-15T10:00:00.000Z',
    ...overrides,
  };
}

describe('matchesNotificationFilters — no filters', () => {
  it('matches everything when the filter object is empty', () => {
    expect(matchesNotificationFilters(makeNotification(), {})).toBe(true);
    expect(
      matchesNotificationFilters(makeNotification({ isRead: true, category: 'system' }), {})
    ).toBe(true);
  });

  it('ignores pagination-only filters', () => {
    expect(matchesNotificationFilters(makeNotification(), { page: 3, limit: 20 })).toBe(true);
  });
});

describe('matchesNotificationFilters — category', () => {
  it('matches when the category is the same', () => {
    expect(
      matchesNotificationFilters(makeNotification({ category: 'inventory' }), {
        category: 'inventory',
      })
    ).toBe(true);
  });

  it.each(['inbound', 'outbound', 'worker', 'system'] as const)(
    'rejects an inventory notification on a %s filter',
    (category) => {
      expect(
        matchesNotificationFilters(makeNotification({ category: 'inventory' }), { category })
      ).toBe(false);
    }
  );

  it('an omitted category means "all categories"', () => {
    for (const category of ['inbound', 'inventory', 'outbound', 'worker', 'system'] as const) {
      expect(matchesNotificationFilters(makeNotification({ category }), {})).toBe(true);
    }
  });
});

/**
 * The semantic that broke once already: an *omitted* boolean filter means
 * "no filter at all", and an explicit `false` must behave the same way — it
 * must NOT be read as "show me only the ones where this is false".
 */
describe('matchesNotificationFilters — boolean filters are opt-in only', () => {
  const unread = makeNotification({ isRead: false });
  const read = makeNotification({ isRead: true });
  const needsAction = makeNotification({ requiresAction: true, actionState: 'pending' });
  const noAction = makeNotification({ requiresAction: false });

  it('unread: true keeps unread and drops read', () => {
    expect(matchesNotificationFilters(unread, { unread: true })).toBe(true);
    expect(matchesNotificationFilters(read, { unread: true })).toBe(false);
  });

  it('unread omitted keeps BOTH read and unread', () => {
    expect(matchesNotificationFilters(unread, {})).toBe(true);
    expect(matchesNotificationFilters(read, {})).toBe(true);
  });

  it('unread: false is "no filter", not "read only"', () => {
    // Regression: a `!== undefined` style check here would drop every unread
    // notification the instant the UI sent unread=false.
    expect(matchesNotificationFilters(unread, { unread: false })).toBe(true);
    expect(matchesNotificationFilters(read, { unread: false })).toBe(true);
  });

  it('requiresAction: true keeps only actionable notifications', () => {
    expect(matchesNotificationFilters(needsAction, { requiresAction: true })).toBe(true);
    expect(matchesNotificationFilters(noAction, { requiresAction: true })).toBe(false);
  });

  it('requiresAction omitted keeps both', () => {
    expect(matchesNotificationFilters(needsAction, {})).toBe(true);
    expect(matchesNotificationFilters(noAction, {})).toBe(true);
  });

  it('requiresAction: false is "no filter", not "non-actionable only"', () => {
    expect(matchesNotificationFilters(needsAction, { requiresAction: false })).toBe(true);
    expect(matchesNotificationFilters(noAction, { requiresAction: false })).toBe(true);
  });

  it('an already-approved actionable notification still matches requiresAction', () => {
    // requiresAction is about the flag, not the outcome — the Approvals inbox
    // shows resolved items with a badge rather than hiding them.
    const approved = makeNotification({ requiresAction: true, actionState: 'approved' });
    expect(matchesNotificationFilters(approved, { requiresAction: true })).toBe(true);
  });
});

describe('matchesNotificationFilters — search', () => {
  const n = makeNotification({
    title: 'GRN-0042 received',
    body: 'Awaiting QC inspection at Dock 3',
    eventType: 'grn.created',
  });

  it('matches on the title', () => {
    expect(matchesNotificationFilters(n, { search: 'GRN-0042' })).toBe(true);
  });

  it('matches on the body', () => {
    expect(matchesNotificationFilters(n, { search: 'Dock 3' })).toBe(true);
  });

  it('matches on the event type', () => {
    expect(matchesNotificationFilters(n, { search: 'grn.created' })).toBe(true);
  });

  it('is case-insensitive in both directions', () => {
    expect(matchesNotificationFilters(n, { search: 'grn-0042' })).toBe(true);
    expect(matchesNotificationFilters(n, { search: 'AWAITING QC' })).toBe(true);
  });

  it('matches on a substring, not just a whole word', () => {
    expect(matchesNotificationFilters(n, { search: 'nspect' })).toBe(true);
  });

  it('rejects a term that appears nowhere', () => {
    expect(matchesNotificationFilters(n, { search: 'shipment' })).toBe(false);
  });

  it('handles a null body without matching the literal string "null"', () => {
    const bodyless = makeNotification({ body: null, title: 'Cycle count due' });
    expect(matchesNotificationFilters(bodyless, { search: 'null' })).toBe(false);
    expect(matchesNotificationFilters(bodyless, { search: 'cycle' })).toBe(true);
  });

  it('an empty search string is treated as no search at all', () => {
    expect(matchesNotificationFilters(n, { search: '' })).toBe(true);
  });
});

describe('matchesNotificationFilters — date range', () => {
  const on15th = makeNotification({ createdAt: '2026-07-15T10:00:00.000Z' });

  it('keeps a notification created after dateFrom', () => {
    expect(matchesNotificationFilters(on15th, { dateFrom: '2026-07-01' })).toBe(true);
  });

  it('drops a notification created before dateFrom', () => {
    expect(matchesNotificationFilters(on15th, { dateFrom: '2026-07-20' })).toBe(false);
  });

  it('treats dateFrom as the start of that day (inclusive)', () => {
    const atMidnight = makeNotification({ createdAt: '2026-07-15T00:00:00.000Z' });
    expect(matchesNotificationFilters(atMidnight, { dateFrom: '2026-07-15' })).toBe(true);
  });

  it('dateTo is an INCLUSIVE day boundary — same-day notifications still match', () => {
    // A naive `created > new Date(dateTo)` would compare against midnight and
    // hide everything that happened during the selected end day.
    expect(matchesNotificationFilters(on15th, { dateTo: '2026-07-15' })).toBe(true);
  });

  it('drops a notification created after the dateTo day', () => {
    const on17th = makeNotification({ createdAt: '2026-07-17T09:00:00.000Z' });
    expect(matchesNotificationFilters(on17th, { dateTo: '2026-07-15' })).toBe(false);
  });

  it('keeps a notification inside a from/to window', () => {
    expect(
      matchesNotificationFilters(on15th, { dateFrom: '2026-07-15', dateTo: '2026-07-15' })
    ).toBe(true);
  });

  it('drops a notification outside a from/to window on either side', () => {
    const before = makeNotification({ createdAt: '2026-07-01T10:00:00.000Z' });
    const after = makeNotification({ createdAt: '2026-07-31T10:00:00.000Z' });
    const window: NotificationFilters = { dateFrom: '2026-07-10', dateTo: '2026-07-20' };
    expect(matchesNotificationFilters(before, window)).toBe(false);
    expect(matchesNotificationFilters(after, window)).toBe(false);
  });

  it('does not mutate the caller\'s filter object while normalising dateTo', () => {
    const filters: NotificationFilters = { dateTo: '2026-07-15' };
    matchesNotificationFilters(on15th, filters);
    expect(filters.dateTo).toBe('2026-07-15');
  });
});

describe('matchesNotificationFilters — combinations', () => {
  it('requires every active filter to pass', () => {
    const n = makeNotification({
      category: 'outbound',
      isRead: false,
      requiresAction: true,
      title: 'SO-1001 needs approval',
      createdAt: '2026-07-15T10:00:00.000Z',
    });

    const allMatch: NotificationFilters = {
      category: 'outbound',
      unread: true,
      requiresAction: true,
      search: 'so-1001',
      dateFrom: '2026-07-01',
      dateTo: '2026-07-15',
    };
    expect(matchesNotificationFilters(n, allMatch)).toBe(true);

    // Flip exactly one dimension at a time; each on its own must reject.
    expect(matchesNotificationFilters(n, { ...allMatch, category: 'inbound' })).toBe(false);
    expect(matchesNotificationFilters({ ...n, isRead: true }, allMatch)).toBe(false);
    expect(matchesNotificationFilters({ ...n, requiresAction: false }, allMatch)).toBe(false);
    expect(matchesNotificationFilters(n, { ...allMatch, search: 'PO-1001' })).toBe(false);
    expect(matchesNotificationFilters(n, { ...allMatch, dateTo: '2026-07-14' })).toBe(false);
    expect(matchesNotificationFilters(n, { ...allMatch, dateFrom: '2026-07-16' })).toBe(false);
  });
});
