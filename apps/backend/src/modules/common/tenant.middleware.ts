import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { runWithTenant } from './tenant.context';

/**
 * Extracts the tenant id from a valid Bearer token and establishes the
 * AsyncLocalStorage tenant context for the request.
 *
 * If there is no token, or the token is invalid/expired, the request runs
 * WITHOUT tenant context. This middleware intentionally never rejects the
 * request itself — public routes (login/signup/refresh, sa/auth/login) must
 * pass through, and the global JwtAuthGuard rejects unauthenticated access
 * to protected routes before any tenant-scoped service code runs.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private configService: ConfigService) {}

  use(req: any, res: any, next: () => void) {
    // Fail fast on misconfiguration — never fall back to a hardcoded secret.
    const secret = this.configService.getOrThrow<string>('JWT_SECRET');

    let tenantId: string | undefined;

    try {
      const authHeader = req.headers?.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const payload = jwt.verify(token, secret) as any;
        if (payload?.tenantId) {
          tenantId = payload.tenantId;
        }
      }
    } catch {
      // Invalid/expired token — proceed without tenant context.
      // The global JwtAuthGuard will reject protected routes with 401.
    }

    if (tenantId) {
      runWithTenant(tenantId, () => next());
    } else {
      next();
    }
  }
}
