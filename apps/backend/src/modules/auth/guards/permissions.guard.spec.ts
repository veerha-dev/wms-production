import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { PermissionsGuard } from './permissions.guard';

const TENANT = 'aaaaaaaa-0000-0000-0000-000000000001';

const contextFor = (user: any): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  }) as any;

/** A Reflector stub returning fixed @RequirePermission metadata. */
const reflectorFor = (metadata: any): Reflector =>
  ({
    getAllAndOverride: jest.fn((key: string) => (key === REQUIRE_PERMISSION_KEY ? metadata : undefined)),
  }) as any;

const permissionsFor = (answer: boolean | undefined) => ({
  isAllowed: jest.fn(async () => answer),
});

describe('PermissionsGuard', () => {
  it('allows a route with no @RequirePermission metadata without touching the matrix', async () => {
    const permissions = permissionsFor(false);
    const guard = new PermissionsGuard(reflectorFor(undefined), permissions as any);

    await expect(
      guard.canActivate(contextFor({ role: 'worker', tenantId: TENANT })),
    ).resolves.toBe(true);
    expect(permissions.isAllowed).not.toHaveBeenCalled();
  });

  it('allows when the matrix says allowed = true', async () => {
    const permissions = permissionsFor(true);
    const guard = new PermissionsGuard(
      reflectorFor({ module: 'Customers', action: 'create' }),
      permissions as any,
    );

    await expect(
      guard.canActivate(contextFor({ role: 'manager', tenantId: TENANT })),
    ).resolves.toBe(true);
    expect(permissions.isAllowed).toHaveBeenCalledWith(TENANT, 'manager', 'Customers', 'create');
  });

  it('denies with 403 naming the module and action when allowed = false', async () => {
    const permissions = permissionsFor(false);
    const guard = new PermissionsGuard(
      reflectorFor({ module: 'Customers', action: 'create' }),
      permissions as any,
    );

    const promise = guard.canActivate(contextFor({ role: 'manager', tenantId: TENANT }));

    await expect(promise).rejects.toBeInstanceOf(ForbiddenException);
    await expect(promise).rejects.toThrow(/Customers/);
    await expect(promise).rejects.toThrow(/create/);
    await expect(promise).rejects.toThrow(/manager/);
  });

  it('lets an admin through even when their own row says false', async () => {
    // The matrix UI lets an admin toggle the admin column; honouring it would
    // let the only admin lock the whole tenant out of Users/Settings.
    const permissions = permissionsFor(false);
    const guard = new PermissionsGuard(
      reflectorFor({ module: 'Users', action: 'manage' }),
      permissions as any,
    );

    await expect(
      guard.canActivate(contextFor({ role: 'admin', tenantId: TENANT })),
    ).resolves.toBe(true);
    expect(permissions.isAllowed).not.toHaveBeenCalled();
  });

  it('lets a super_admin through', async () => {
    const permissions = permissionsFor(false);
    const guard = new PermissionsGuard(
      reflectorFor({ module: 'Users', action: 'delete' }),
      permissions as any,
    );

    await expect(
      guard.canActivate(contextFor({ role: 'super_admin', tenantId: TENANT })),
    ).resolves.toBe(true);
  });

  it('fails open when the tenant has no row for the tuple', async () => {
    const permissions = permissionsFor(undefined);
    const guard = new PermissionsGuard(
      reflectorFor({ module: 'Customers', action: 'create' }),
      permissions as any,
    );

    await expect(
      guard.canActivate(contextFor({ role: 'manager', tenantId: TENANT })),
    ).resolves.toBe(true);
  });

  it('allows when there is no authenticated user (a @Public route)', async () => {
    const permissions = permissionsFor(false);
    const guard = new PermissionsGuard(
      reflectorFor({ module: 'Customers', action: 'create' }),
      permissions as any,
    );

    await expect(guard.canActivate(contextFor(undefined))).resolves.toBe(true);
    expect(permissions.isAllowed).not.toHaveBeenCalled();
  });

  it('allows when the token carries no tenant, rather than guessing one', async () => {
    const permissions = permissionsFor(false);
    const guard = new PermissionsGuard(
      reflectorFor({ module: 'Customers', action: 'create' }),
      permissions as any,
    );

    await expect(guard.canActivate(contextFor({ role: 'manager' }))).resolves.toBe(true);
    expect(permissions.isAllowed).not.toHaveBeenCalled();
  });

  it('looks the permission up against the caller own tenant only', async () => {
    const permissions = permissionsFor(true);
    const guard = new PermissionsGuard(
      reflectorFor({ module: 'Inventory', action: 'delete' }),
      permissions as any,
    );

    await guard.canActivate(contextFor({ role: 'worker', tenantId: 'tenant-b' }));

    expect(permissions.isAllowed).toHaveBeenCalledWith('tenant-b', 'worker', 'Inventory', 'delete');
  });

  it('ignores malformed metadata instead of throwing', async () => {
    const permissions = permissionsFor(false);
    const guard = new PermissionsGuard(reflectorFor({ module: 'Customers' }), permissions as any);

    await expect(
      guard.canActivate(contextFor({ role: 'manager', tenantId: TENANT })),
    ).resolves.toBe(true);
  });
});
