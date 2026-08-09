import { PermissionsService, PERMISSION_CACHE_TTL_MS } from './permissions.service';

/**
 * Unit tests for the matrix cache. The database is a stub so every assertion is
 * about *which* tenant was queried and *how often*, which is precisely where a
 * cache can go wrong.
 */

type Row = { role: string; module: string; action: string; allowed: boolean };

/** A stub DatabaseService returning a different matrix per tenant. */
const makeDb = (rowsByTenant: Record<string, Row[]>) => {
  const query = jest.fn(async (_sql: string, params?: any[]) => {
    const tenantId = params?.[0] as string;
    return { rows: rowsByTenant[tenantId] ?? [], rowCount: (rowsByTenant[tenantId] ?? []).length };
  });
  return { query } as any;
};

const TENANT_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const TENANT_B = 'bbbbbbbb-0000-0000-0000-000000000002';

describe('PermissionsService', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('lookup', () => {
    it('returns true when the row allows the action', async () => {
      const db = makeDb({
        [TENANT_A]: [{ role: 'manager', module: 'Customers', action: 'create', allowed: true }],
      });
      const service = new PermissionsService(db);

      await expect(service.isAllowed(TENANT_A, 'manager', 'Customers', 'create')).resolves.toBe(true);
    });

    it('returns false when the row denies the action', async () => {
      const db = makeDb({
        [TENANT_A]: [{ role: 'manager', module: 'Customers', action: 'create', allowed: false }],
      });
      const service = new PermissionsService(db);

      await expect(service.isAllowed(TENANT_A, 'manager', 'Customers', 'create')).resolves.toBe(false);
    });

    it('returns undefined (fail open) when no row exists for the tuple', async () => {
      const db = makeDb({
        [TENANT_A]: [{ role: 'manager', module: 'Customers', action: 'view', allowed: true }],
      });
      const service = new PermissionsService(db);

      await expect(
        service.isAllowed(TENANT_A, 'manager', 'Some New Module', 'create'),
      ).resolves.toBeUndefined();
    });

    it('logs the missing row once per tuple, not once per request', async () => {
      const db = makeDb({ [TENANT_A]: [] });
      const service = new PermissionsService(db);
      const warn = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);

      await service.isAllowed(TENANT_A, 'manager', 'Ghost', 'create');
      await service.isAllowed(TENANT_A, 'manager', 'Ghost', 'create');
      await service.isAllowed(TENANT_A, 'manager', 'Ghost', 'edit');

      expect(warn).toHaveBeenCalledTimes(2); // one per distinct tuple
    });

    it('treats a NULL/absent allowed column as denied rather than allowed', async () => {
      const db = makeDb({
        [TENANT_A]: [{ role: 'worker', module: 'Customers', action: 'create', allowed: null as any }],
      });
      const service = new PermissionsService(db);

      await expect(service.isAllowed(TENANT_A, 'worker', 'Customers', 'create')).resolves.toBe(false);
    });

    it('returns undefined without querying when tenant or role is missing', async () => {
      const db = makeDb({});
      const service = new PermissionsService(db);

      await expect(service.isAllowed('', 'manager', 'Customers', 'create')).resolves.toBeUndefined();
      await expect(service.isAllowed(TENANT_A, '', 'Customers', 'create')).resolves.toBeUndefined();
      expect(db.query).not.toHaveBeenCalled();
    });
  });

  describe('cache', () => {
    it('loads a tenant matrix once and serves later lookups from memory', async () => {
      const db = makeDb({
        [TENANT_A]: [
          { role: 'manager', module: 'Customers', action: 'create', allowed: true },
          { role: 'manager', module: 'Customers', action: 'delete', allowed: false },
        ],
      });
      const service = new PermissionsService(db);

      await service.isAllowed(TENANT_A, 'manager', 'Customers', 'create');
      await service.isAllowed(TENANT_A, 'manager', 'Customers', 'delete');
      await service.isAllowed(TENANT_A, 'manager', 'Customers', 'create');

      expect(db.query).toHaveBeenCalledTimes(1);
    });

    it('collapses a burst of concurrent misses into a single query', async () => {
      const db = makeDb({
        [TENANT_A]: [{ role: 'manager', module: 'Customers', action: 'create', allowed: true }],
      });
      const service = new PermissionsService(db);

      const results = await Promise.all(
        Array.from({ length: 10 }, () => service.isAllowed(TENANT_A, 'manager', 'Customers', 'create')),
      );

      expect(results.every((r) => r === true)).toBe(true);
      expect(db.query).toHaveBeenCalledTimes(1);
    });

    it('re-reads after the TTL expires', async () => {
      jest.useFakeTimers();
      const rows: Record<string, Row[]> = {
        [TENANT_A]: [{ role: 'manager', module: 'Customers', action: 'create', allowed: true }],
      };
      const db = makeDb(rows);
      const service = new PermissionsService(db);

      await expect(service.isAllowed(TENANT_A, 'manager', 'Customers', 'create')).resolves.toBe(true);

      // A change made by another API instance, which never sees our invalidate().
      rows[TENANT_A] = [{ role: 'manager', module: 'Customers', action: 'create', allowed: false }];
      jest.advanceTimersByTime(PERMISSION_CACHE_TTL_MS + 1);

      await expect(service.isAllowed(TENANT_A, 'manager', 'Customers', 'create')).resolves.toBe(false);
      expect(db.query).toHaveBeenCalledTimes(2);
    });

    it('drops only the invalidated tenant', async () => {
      const rows: Record<string, Row[]> = {
        [TENANT_A]: [{ role: 'manager', module: 'Customers', action: 'create', allowed: true }],
        [TENANT_B]: [{ role: 'manager', module: 'Customers', action: 'create', allowed: true }],
      };
      const db = makeDb(rows);
      const service = new PermissionsService(db);

      await service.isAllowed(TENANT_A, 'manager', 'Customers', 'create');
      await service.isAllowed(TENANT_B, 'manager', 'Customers', 'create');
      expect(db.query).toHaveBeenCalledTimes(2);

      rows[TENANT_A] = [{ role: 'manager', module: 'Customers', action: 'create', allowed: false }];
      service.invalidate(TENANT_A);

      await expect(service.isAllowed(TENANT_A, 'manager', 'Customers', 'create')).resolves.toBe(false);
      // Tenant B still served from its own untouched cache entry.
      await expect(service.isAllowed(TENANT_B, 'manager', 'Customers', 'create')).resolves.toBe(true);
      expect(db.query).toHaveBeenCalledTimes(3);
    });
  });

  describe('tenant isolation (cross-tenant leak regression)', () => {
    it('never answers tenant B from tenant A cached matrix', async () => {
      const db = makeDb({
        // A denies create, B allows it — same role, same module, same action.
        [TENANT_A]: [{ role: 'manager', module: 'Customers', action: 'create', allowed: false }],
        [TENANT_B]: [{ role: 'manager', module: 'Customers', action: 'create', allowed: true }],
      });
      const service = new PermissionsService(db);

      // Warm A first, so a tenant-blind cache would return A's answer for B.
      await expect(service.isAllowed(TENANT_A, 'manager', 'Customers', 'create')).resolves.toBe(false);
      await expect(service.isAllowed(TENANT_B, 'manager', 'Customers', 'create')).resolves.toBe(true);
      // ...and the other way round, in case the cache keyed on last-write.
      await expect(service.isAllowed(TENANT_A, 'manager', 'Customers', 'create')).resolves.toBe(false);

      expect(db.query).toHaveBeenCalledTimes(2);
      expect(db.query.mock.calls[0][1]).toEqual([TENANT_A]);
      expect(db.query.mock.calls[1][1]).toEqual([TENANT_B]);
    });

    it('always scopes the SQL to the requested tenant', async () => {
      const db = makeDb({ [TENANT_A]: [] });
      const service = new PermissionsService(db);

      await service.isAllowed(TENANT_A, 'manager', 'Customers', 'view');

      const [sql, params] = db.query.mock.calls[0];
      expect(sql).toMatch(/WHERE tenant_id = \$1/);
      expect(params).toEqual([TENANT_A]);
    });

    it('does not leak a tenant permission after another tenant is invalidated', async () => {
      const rows: Record<string, Row[]> = {
        [TENANT_A]: [{ role: 'worker', module: 'Inventory', action: 'edit', allowed: true }],
        [TENANT_B]: [{ role: 'worker', module: 'Inventory', action: 'edit', allowed: false }],
      };
      const db = makeDb(rows);
      const service = new PermissionsService(db);

      await service.isAllowed(TENANT_B, 'worker', 'Inventory', 'edit');
      service.invalidate(TENANT_A); // unrelated tenant

      await expect(service.isAllowed(TENANT_B, 'worker', 'Inventory', 'edit')).resolves.toBe(false);
    });

    it('invalidateAll clears every tenant', async () => {
      const rows: Record<string, Row[]> = {
        [TENANT_A]: [{ role: 'manager', module: 'Users', action: 'delete', allowed: true }],
        [TENANT_B]: [{ role: 'manager', module: 'Users', action: 'delete', allowed: true }],
      };
      const db = makeDb(rows);
      const service = new PermissionsService(db);

      await service.isAllowed(TENANT_A, 'manager', 'Users', 'delete');
      await service.isAllowed(TENANT_B, 'manager', 'Users', 'delete');

      rows[TENANT_A] = [{ role: 'manager', module: 'Users', action: 'delete', allowed: false }];
      rows[TENANT_B] = [{ role: 'manager', module: 'Users', action: 'delete', allowed: false }];
      service.invalidateAll();

      await expect(service.isAllowed(TENANT_A, 'manager', 'Users', 'delete')).resolves.toBe(false);
      await expect(service.isAllowed(TENANT_B, 'manager', 'Users', 'delete')).resolves.toBe(false);
      expect(db.query).toHaveBeenCalledTimes(4);
    });
  });
});
