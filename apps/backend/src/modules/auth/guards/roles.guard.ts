import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Global role guard (registered as APP_GUARD after JwtAuthGuard, so
 * `req.user` is already populated by the JWT strategy).
 * Routes without @Roles metadata are allowed for any authenticated user.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const role: string | undefined = request?.user?.role;

    if (!role || !requiredRoles.includes(role)) {
      throw new ForbiddenException(
        `Insufficient permissions: this action requires one of the following roles: ${requiredRoles.join(', ')}`,
      );
    }

    return true;
  }
}
