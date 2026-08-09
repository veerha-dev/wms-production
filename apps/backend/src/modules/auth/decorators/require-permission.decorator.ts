import { SetMetadata } from '@nestjs/common';
import { PermissionAction, PermissionModule } from '../permissions.constants';

export const REQUIRE_PERMISSION_KEY = 'require_permission';

export interface RequiredPermission {
  module: PermissionModule;
  action: PermissionAction;
}

/**
 * Makes a route obey the tenant's Permissions Matrix (`role_permissions`),
 * i.e. the toggles an admin sets on the Users page.
 *
 * Enforced by the global PermissionsGuard, which runs after JwtAuthGuard and
 * RolesGuard — so `@Roles` is still the coarse gate ("who may reach this at
 * all") and `@RequirePermission` is the tenant-configurable one on top of it.
 *
 * Routes WITHOUT this decorator are unaffected: the guard allows them.
 * Applied to a controller class it covers every route in it; a method-level
 * decorator overrides the class-level one.
 *
 * Usage: @RequirePermission('Customers', 'create')
 */
export const RequirePermission = (module: PermissionModule, action: PermissionAction) =>
  SetMetadata<string, RequiredPermission>(REQUIRE_PERMISSION_KEY, { module, action });
