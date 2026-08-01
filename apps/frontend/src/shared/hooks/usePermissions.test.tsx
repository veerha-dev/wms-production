/**
 * usePermissions deliberately FAILS OPEN: if the permission list has not loaded
 * (or a module simply has no row in it) access is granted, so a gap in seed
 * data never locks a legitimate user out of the app.
 *
 * That default is exactly why ROLE_MODULE_DENYLIST exists. Spec §7 says a
 * worker must never reach Customers, Sales Orders or Invoices — and those
 * denials have to hold even when the backend returns an EMPTY permission list,
 * which is the state every fresh tenant starts in.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  auth: { role: 'worker' as string | null, isAuthenticated: true },
  permissions: [] as Array<Record<string, unknown>>,
  getSpy: vi.fn(),
}));

vi.mock('@/shared/contexts/AuthContext', () => ({
  useAuth: () => mocks.auth,
}));

vi.mock('@/shared/lib/api', () => ({
  api: {
    get: (...args: unknown[]) => {
      mocks.getSpy(...args);
      return Promise.resolve({ data: { data: mocks.permissions } });
    },
  },
}));

import {
  usePermissions,
  ROLE_MODULE_DENYLIST,
  ROUTE_PERMISSION_MAP,
  SIDEBAR_PERMISSION_MAP,
} from './usePermissions';

function perm(
  module: string,
  overrides: Partial<{ admin: boolean; manager: boolean; worker: boolean }> = {}
) {
  return { module, action: 'view', admin: true, manager: true, worker: true, ...overrides };
}

/**
 * A fresh QueryClient per render — the hook caches by ['role-permissions', role]
 * for five minutes, so a shared client would leak one test's roster into the
 * next.
 */
function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

/** Render the hook and wait until the permission query has settled. */
async function renderPermissions() {
  const { result } = renderHook(() => usePermissions(), { wrapper: makeWrapper() });
  await waitFor(() =>
    expect(result.current.permissions).toHaveLength(mocks.permissions.length)
  );
  return result;
}

beforeEach(() => {
  mocks.auth = { role: 'worker', isAuthenticated: true };
  mocks.permissions = [];
  mocks.getSpy.mockClear();
});

describe('ROLE_MODULE_DENYLIST shape', () => {
  it('denies a worker exactly Customers, Sales Orders and Invoices', () => {
    expect(ROLE_MODULE_DENYLIST.worker).toEqual(['Customers', 'Sales Orders', 'Invoices']);
  });

  it('lists no other role — managers and admins are governed by the API', () => {
    expect(Object.keys(ROLE_MODULE_DENYLIST)).toEqual(['worker']);
  });

  it('names modules that actually exist in the route and sidebar maps', () => {
    const known = new Set([
      ...Object.values(ROUTE_PERMISSION_MAP),
      ...Object.values(SIDEBAR_PERMISSION_MAP),
    ]);
    for (const module of ROLE_MODULE_DENYLIST.worker) {
      expect(known).toContain(module);
    }
  });
});

describe('worker denylist with an EMPTY permission list', () => {
  it.each(['Customers', 'Sales Orders', 'Invoices'])(
    'denies %s even though nothing was loaded',
    async (module) => {
      const result = await renderPermissions();
      expect(result.current.permissions).toEqual([]);
      expect(result.current.canAccess(module)).toBe(false);
    }
  );

  it('denies the denylisted modules for every action, not just view', async () => {
    const result = await renderPermissions();
    for (const action of ['view', 'create', 'edit', 'delete']) {
      expect(result.current.canAccess('Customers', action)).toBe(false);
    }
  });

  it('still fails OPEN for every other module', async () => {
    const result = await renderPermissions();
    for (const module of ['Inventory', 'Putaway', 'GRN', 'Reports', 'Dashboard', 'Returns']) {
      expect(result.current.canAccess(module)).toBe(true);
    }
  });
});

describe('worker denylist beats a permissive backend row', () => {
  it('denies Customers even when the API says worker: true', async () => {
    // The denylist is checked before the permission lookup precisely so bad
    // seed data cannot re-open a module the spec closes.
    mocks.permissions = [perm('Customers', { worker: true }), perm('Inventory')];
    const result = await renderPermissions();

    expect(result.current.canAccess('Customers')).toBe(false);
    expect(result.current.canAccess('Inventory')).toBe(true);
  });

  it('honours an explicit denial from the API for a non-denylisted module', async () => {
    mocks.permissions = [perm('Reports', { worker: false })];
    const result = await renderPermissions();

    expect(result.current.canAccess('Reports')).toBe(false);
  });

  it('allows a module whose row is missing from a non-empty list', async () => {
    mocks.permissions = [perm('Reports', { worker: false })];
    const result = await renderPermissions();

    expect(result.current.canAccess('Putaway')).toBe(true);
  });

  it('matches on module AND action — a different action falls back to open', async () => {
    mocks.permissions = [{ ...perm('Reports', { worker: false }), action: 'delete' }];
    const result = await renderPermissions();

    expect(result.current.canAccess('Reports', 'delete')).toBe(false);
    expect(result.current.canAccess('Reports', 'view')).toBe(true);
  });
});

describe('route gating for a worker', () => {
  it.each([
    ['/outbound/customers', false],
    ['/outbound/customers/:id', false],
    ['/outbound', false],
    ['/invoices', false],
    ['/inventory', true],
    ['/inbound/putaway', true],
    ['/', true],
  ])('canAccessRoute(%s) === %s', async (path, expected) => {
    const result = await renderPermissions();
    expect(result.current.canAccessRoute(path as string)).toBe(expected);
  });

  it('allows an unmapped route', async () => {
    const result = await renderPermissions();
    expect(result.current.canAccessRoute('/some/new/page')).toBe(true);
  });
});

describe('sidebar gating for a worker', () => {
  it.each([
    ['Customers', false],
    ['Sales Orders', false],
    ['Invoices', false],
    ['Inventory', true],
    ['Putaway', true],
    ['Goods Receipt', true],
  ])('canAccessSidebarItem(%s) === %s', async (label, expected) => {
    const result = await renderPermissions();
    expect(result.current.canAccessSidebarItem(label as string)).toBe(expected);
  });

  it('allows an unmapped sidebar label', async () => {
    const result = await renderPermissions();
    expect(result.current.canAccessSidebarItem('Something New')).toBe(true);
  });
});

describe('other roles', () => {
  it('admin bypasses everything, including an explicit API denial', async () => {
    mocks.auth = { role: 'admin', isAuthenticated: true };
    mocks.permissions = [perm('Customers', { admin: false })];
    const result = await renderPermissions();

    expect(result.current.isAdmin).toBe(true);
    expect(result.current.canAccess('Customers')).toBe(true);
    expect(result.current.canAccessRoute('/invoices')).toBe(true);
    expect(result.current.canAccessSidebarItem('Invoices')).toBe(true);
  });

  it('a manager is NOT denylisted and reaches Customers, Sales Orders and Invoices', async () => {
    mocks.auth = { role: 'manager', isAuthenticated: true };
    const result = await renderPermissions();

    expect(result.current.isAdmin).toBe(false);
    for (const module of ['Customers', 'Sales Orders', 'Invoices']) {
      expect(result.current.canAccess(module)).toBe(true);
    }
  });

  it('a manager is still bound by an explicit API denial', async () => {
    mocks.auth = { role: 'manager', isAuthenticated: true };
    mocks.permissions = [perm('Customers', { manager: false })];
    const result = await renderPermissions();

    expect(result.current.canAccess('Customers')).toBe(false);
  });

  it('a null role falls open (pre-auth render) and skips the denylist', async () => {
    mocks.auth = { role: null, isAuthenticated: false };
    const { result } = renderHook(() => usePermissions(), { wrapper: makeWrapper() });

    expect(result.current.permissions).toEqual([]);
    expect(result.current.canAccess('Customers')).toBe(true);
    // The query is disabled while unauthenticated, so nothing is fetched.
    expect(mocks.getSpy).not.toHaveBeenCalled();
  });
});

describe('permission fetching', () => {
  it('queries the users permissions endpoint once for an authenticated role', async () => {
    mocks.permissions = [perm('Inventory')];
    await renderPermissions();

    expect(mocks.getSpy).toHaveBeenCalledWith('/api/v1/users/permissions');
  });
});
