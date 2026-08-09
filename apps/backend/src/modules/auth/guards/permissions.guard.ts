import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_PERMISSION_KEY, RequiredPermission } from '../decorators/require-permission.decorator';
import { PERMISSION_BYPASS_ROLES } from '../permissions.constants';
import { PermissionsService } from '../permissions.service';

/**
 * Enforces the tenant's Permissions Matrix for routes carrying
 * `@RequirePermission(module, action)`.
 *
 * Registered as the third global APP_GUARD, after JwtAuthGuard (populates
 * `req.user`) and RolesGuard (coarse role gate). Semantics:
 *
 *   - no @RequirePermission metadata  -> allow, untouched. Every pre-existing
 *     route keeps working exactly as before.
 *   - admin (and super_admin)         -> allow, always. See
 *     PERMISSION_BYPASS_ROLES for why this is hard-coded: an admin must not be
 *     able to lock themselves out of the app by toggling their own row off.
 *   - a row exists and allowed=false  -> 403 naming the module and action.
 *   - no row for the tuple            -> allow (fail open). See
 *     PermissionsService.isAllowed for the rationale.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<RequiredPermission | undefined>(
      REQUIRE_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required?.module || !required?.action) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request?.user;
    const role: string | undefined = user?.role;

    // No authenticated user means the route is @Public() (JwtAuthGuard already
    // let it through). There is no role to look up, so nothing to enforce.
    if (!role) return true;

    // Hard-coded admin bypass — deliberate, see PERMISSION_BYPASS_ROLES.
    if (PERMISSION_BYPASS_ROLES.includes(role)) return true;

    // Tenant comes from the verified JWT payload attached by JwtStrategy, so a
    // lookup is always scoped to the caller's own tenant.
    const tenantId: string | undefined = user?.tenantId;
    if (!tenantId) return true;

    const allowed = await this.permissions.isAllowed(tenantId, role, required.module, required.action);

    if (allowed === false) {
      throw new ForbiddenException(
        `Permission denied: your role (${role}) is not allowed to ${required.action} ${required.module}. An administrator can change this in Users → Permissions.`,
      );
    }

    // true, or undefined (no row -> fail open).
    return true;
  }
}
