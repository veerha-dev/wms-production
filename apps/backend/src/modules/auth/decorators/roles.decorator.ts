import { SetMetadata } from '@nestjs/common';

/**
 * Restricts a route (or controller) to the given user roles.
 * Enforced by the global RolesGuard, which runs after JwtAuthGuard
 * so `req.user` is populated. Routes without @Roles are open to any
 * authenticated user.
 *
 * Usage: @Roles('admin', 'manager')
 */
export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
