import { UnauthorizedException } from '@nestjs/common';

/**
 * Extract tenantId from the request user (JWT payload).
 * Usage in controllers: const tenantId = getTenantId(req);
 * Throws when the request has no authenticated tenant-scoped user —
 * there is deliberately NO default-tenant fallback.
 */
export function getTenantId(req: any): string {
  const tenantId = req?.user?.tenantId;
  if (!tenantId) {
    throw new UnauthorizedException('No tenant context: authentication with a tenant-scoped token is required');
  }
  return tenantId;
}
