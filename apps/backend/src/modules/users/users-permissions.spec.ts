import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { runWithTenant } from '../common/tenant.context';
import { UpdatePermissionsDto } from './dto';
import { UsersService } from './users.service';

const TENANT = 'aaaaaaaa-0000-0000-0000-000000000001';

const validate = (payload: any) => {
  const dto = plainToInstance(UpdatePermissionsDto, payload);
  return validateSync(dto, { whitelist: true, forbidUnknownValues: false });
};

const flatten = (errors: any[]): string[] =>
  errors.flatMap((e) => [
    ...Object.values(e.constraints ?? {}),
    ...flatten(e.children ?? []),
  ]) as string[];

describe('PUT /api/v1/users/permissions — payload validation', () => {
  it('accepts a well-formed matrix row', () => {
    expect(
      validate({
        permissions: [
          { module: 'Customers', action: 'create', admin: true, manager: false, worker: false },
        ],
      }),
    ).toHaveLength(0);
  });

  it('rejects an unknown module rather than inserting a junk row', () => {
    const errors = validate({
      permissions: [
        { module: 'Custumers', action: 'create', admin: true, manager: true, worker: false },
      ],
    });
    expect(flatten(errors).join(' ')).toMatch(/module must be one of/);
  });

  it('rejects an unknown action', () => {
    const errors = validate({
      permissions: [
        { module: 'Customers', action: 'approve', admin: true, manager: true, worker: false },
      ],
    });
    expect(flatten(errors).join(' ')).toMatch(/action must be one of/);
  });

  it('rejects non-boolean role flags (e.g. the string "false")', () => {
    const errors = validate({
      permissions: [
        { module: 'Customers', action: 'create', admin: true, manager: 'false', worker: 0 },
      ],
    });
    const messages = flatten(errors).join(' ');
    expect(messages).toMatch(/manager must be a boolean/);
    expect(messages).toMatch(/worker must be a boolean/);
  });

  it('rejects an empty or missing permissions array', () => {
    expect(validate({ permissions: [] }).length).toBeGreaterThan(0);
    expect(validate({}).length).toBeGreaterThan(0);
  });

  it('accepts the full 110-row matrix the UI sends', () => {
    const { PERMISSION_MODULES, PERMISSION_ACTIONS } = require('../auth/permissions.constants');
    const permissions = PERMISSION_MODULES.flatMap((module: string) =>
      PERMISSION_ACTIONS.map((action: string) => ({
        module,
        action,
        admin: true,
        manager: true,
        worker: false,
      })),
    );
    expect(permissions).toHaveLength(110);
    expect(validate({ permissions })).toHaveLength(0);
  });
});

describe('UsersService.updatePermissions', () => {
  const makeService = () => {
    const client = { query: jest.fn(async () => ({ rows: [], rowCount: 0 })) };
    const db = {
      query: jest.fn(async () => ({ rows: [], rowCount: 0 })),
      transaction: jest.fn(async (cb: any) => cb(client)),
    };
    const permissions = { invalidate: jest.fn(), isAllowed: jest.fn() };
    const service = new UsersService(
      {} as any,
      db as any,
      {} as any,
      {} as any,
      permissions as any,
    );
    return { service, db, client, permissions };
  };

  it('invalidates this tenant cached matrix after the write commits', async () => {
    const { service, permissions } = makeService();

    await runWithTenant(TENANT, () =>
      service.updatePermissions([
        { module: 'Customers', action: 'create', admin: true, manager: false, worker: false },
      ]),
    );

    expect(permissions.invalidate).toHaveBeenCalledWith(TENANT);
    expect(permissions.invalidate).toHaveBeenCalledTimes(1);
  });

  it('does not invalidate when the write fails', async () => {
    const { service, db, permissions } = makeService();
    db.transaction.mockRejectedValueOnce(new Error('deadlock'));

    await expect(
      runWithTenant(TENANT, () =>
        service.updatePermissions([
          { module: 'Customers', action: 'create', admin: true, manager: false, worker: false },
        ]),
      ),
    ).rejects.toThrow('deadlock');

    expect(permissions.invalidate).not.toHaveBeenCalled();
  });

  it('writes one row per role, inside a single transaction, scoped to the tenant', async () => {
    const { service, db, client } = makeService();

    await runWithTenant(TENANT, () =>
      service.updatePermissions([
        { module: 'Customers', action: 'create', admin: true, manager: false, worker: false },
        { module: 'Customers', action: 'delete', admin: true, manager: false, worker: false },
      ]),
    );

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenCalledTimes(6); // 2 rows x 3 roles
    for (const call of client.query.mock.calls) {
      expect((call as any[])[1][0]).toBe(TENANT);
    }
    const roles = client.query.mock.calls.map((c: any[]) => c[1][1]);
    expect(roles).toEqual(['admin', 'manager', 'worker', 'admin', 'manager', 'worker']);
  });
});
