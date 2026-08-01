import { UnauthorizedException } from '@nestjs/common';
import { getCurrentTenantId, runWithTenant } from './tenant.context';

/**
 * There is deliberately NO default-tenant fallback: every repository call
 * derives its tenant id from here, so a silent default would mean one tenant's
 * writes landing in another's data. Outside a request, this must throw.
 */
describe('tenant context', () => {
  describe('getCurrentTenantId outside a request', () => {
    it('throws rather than returning a default', () => {
      expect(() => getCurrentTenantId()).toThrow();
    });

    it('throws an UnauthorizedException (401, not 500)', () => {
      expect(() => getCurrentTenantId()).toThrow(UnauthorizedException);
    });

    it('explains that a tenant-scoped token is required', () => {
      expect(() => getCurrentTenantId()).toThrow(/tenant/i);
    });

    it('never resolves to a falsy-but-usable value', () => {
      let value: unknown;
      try {
        value = getCurrentTenantId();
      } catch {
        value = Symbol('threw');
      }
      expect(typeof value).toBe('symbol');
    });
  });

  describe('inside runWithTenant', () => {
    it('returns the tenant id established for the request', () => {
      runWithTenant('tenant-a', () => {
        expect(getCurrentTenantId()).toBe('tenant-a');
      });
    });

    it('returns the callback result to the caller', () => {
      expect(runWithTenant('tenant-a', () => 42)).toBe(42);
      expect(runWithTenant('tenant-a', () => getCurrentTenantId())).toBe('tenant-a');
    });

    it('survives nested synchronous calls', () => {
      runWithTenant('tenant-a', () => {
        const inner = () => getCurrentTenantId();
        expect(inner()).toBe('tenant-a');
      });
    });

    it('an inner run shadows the outer one and restores it on exit', () => {
      runWithTenant('tenant-a', () => {
        expect(getCurrentTenantId()).toBe('tenant-a');
        runWithTenant('tenant-b', () => {
          expect(getCurrentTenantId()).toBe('tenant-b');
        });
        expect(getCurrentTenantId()).toBe('tenant-a');
      });
    });

    it('propagates across await boundaries', async () => {
      await runWithTenant('tenant-a', async () => {
        expect(getCurrentTenantId()).toBe('tenant-a');
        await new Promise((resolve) => setTimeout(resolve, 1));
        expect(getCurrentTenantId()).toBe('tenant-a');
        await Promise.resolve();
        expect(getCurrentTenantId()).toBe('tenant-a');
      });
    });

    it('propagates into a callback scheduled from inside the run', async () => {
      const seen = await runWithTenant(
        'tenant-a',
        () => new Promise<string>((resolve) => setImmediate(() => resolve(getCurrentTenantId()))),
      );
      expect(seen).toBe('tenant-a');
    });

    it('propagates through a rejected promise handler', async () => {
      await runWithTenant('tenant-a', async () => {
        try {
          await Promise.reject(new Error('boom'));
        } catch {
          expect(getCurrentTenantId()).toBe('tenant-a');
        }
      });
    });
  });

  describe('isolation', () => {
    it('does not leak the tenant id after the run returns', () => {
      runWithTenant('tenant-a', () => getCurrentTenantId());
      expect(() => getCurrentTenantId()).toThrow(UnauthorizedException);
    });

    it('does not leak when the callback throws', () => {
      expect(() =>
        runWithTenant('tenant-a', () => {
          throw new Error('handler blew up');
        }),
      ).toThrow('handler blew up');
      expect(() => getCurrentTenantId()).toThrow(UnauthorizedException);
    });

    it('keeps concurrent requests from seeing each other’s tenant', async () => {
      const request = (tenantId: string, delayMs: number) =>
        runWithTenant(tenantId, async () => {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          return getCurrentTenantId();
        });

      const [a, b, c] = await Promise.all([
        request('tenant-a', 8),
        request('tenant-b', 1),
        request('tenant-c', 4),
      ]);

      expect(a).toBe('tenant-a');
      expect(b).toBe('tenant-b');
      expect(c).toBe('tenant-c');
    });

    it('interleaved runs never cross-contaminate', async () => {
      const seen: string[] = [];
      await Promise.all(
        ['t1', 't2', 't3', 't4', 't5'].map((t, i) =>
          runWithTenant(t, async () => {
            await new Promise((resolve) => setTimeout(resolve, (5 - i) * 2));
            seen.push(`${t}:${getCurrentTenantId()}`);
          }),
        ),
      );
      expect(seen.sort()).toEqual(['t1:t1', 't2:t2', 't3:t3', 't4:t4', 't5:t5']);
    });
  });

  /**
   * The store is typed as `string`, but middleware bugs are the realistic
   * source of an empty value — an empty tenant id must be treated as "no
   * tenant" rather than allowed to reach a WHERE clause.
   */
  describe('degenerate tenant ids', () => {
    it('an empty tenant id is rejected exactly like no context', () => {
      runWithTenant('', () => {
        expect(() => getCurrentTenantId()).toThrow(UnauthorizedException);
      });
    });
  });
});
