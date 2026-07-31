import { SetMetadata } from '@nestjs/common';

/**
 * Marks a route (or a whole controller) as public — the global JwtAuthGuard
 * skips JWT verification for it. Use sparingly: login/signup/refresh and
 * endpoints that implement their own auth (e.g. SuperAdminGuard).
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
