import { AsyncLocalStorage } from 'async_hooks';
import { UnauthorizedException } from '@nestjs/common';

const tenantStorage = new AsyncLocalStorage<string>();

export function runWithTenant<T>(tenantId: string, fn: () => T): T {
  return tenantStorage.run(tenantId, fn);
}

/**
 * Returns the tenant id established by TenantMiddleware for the current
 * request. Throws when called outside of an authenticated, tenant-scoped
 * request — there is deliberately NO default-tenant fallback, so that data
 * can never silently leak into (or out of) a shared default tenant.
 */
export function getCurrentTenantId(): string {
  const tenantId = tenantStorage.getStore();
  if (!tenantId) {
    throw new UnauthorizedException('No tenant context: authentication with a tenant-scoped token is required');
  }
  return tenantId;
}
