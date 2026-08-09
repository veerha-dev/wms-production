import { Global, Module } from '@nestjs/common';
import { PermissionsService } from './permissions.service';

/**
 * Global so that both the PermissionsGuard (an APP_GUARD, resolved from the
 * root injector) and UsersService (which must invalidate the cache after a
 * matrix write) can inject the same singleton without either module having to
 * import the other. Imported once, from AuthModule.
 */
@Global()
@Module({
  providers: [PermissionsService],
  exports: [PermissionsService],
})
export class PermissionsModule {}
