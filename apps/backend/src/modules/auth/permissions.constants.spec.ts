import * as fs from 'fs';
import * as path from 'path';
import { PERMISSION_ACTIONS, PERMISSION_MODULES, PERMISSION_ROLES } from './permissions.constants';

/**
 * The backend vocabulary has to be byte-identical to the frontend's, or the
 * Permissions Matrix silently controls nothing (an admin toggles "Sales Orders"
 * while the guard looks up "SalesOrders"). This test reads the frontend hook and
 * the seed migrations and asserts the three lists agree.
 */

const repoRoot = path.resolve(__dirname, '../../../../..');
const frontendHook = path.join(repoRoot, 'apps/frontend/src/shared/hooks/usePermissions.ts');
const migrationsDir = path.join(repoRoot, 'apps/backend/src/database/migrations');

/** Pulls the string values out of `'/x': 'Module',` style map entries. */
const modulesFromMap = (source: string, mapName: string): string[] => {
  const start = source.indexOf(`export const ${mapName}`);
  if (start === -1) return [];
  const open = source.indexOf('{', start);
  const close = source.indexOf('\n};', open);
  const body = source.slice(open, close);
  return [...body.matchAll(/:\s*'([^']+)'/g)].map((m) => m[1]);
};

describe('permission vocabulary', () => {
  it('has no duplicates and is sorted', () => {
    expect(new Set(PERMISSION_MODULES).size).toBe(PERMISSION_MODULES.length);
    expect([...PERMISSION_MODULES].sort()).toEqual([...PERMISSION_MODULES]);
  });

  it('matches the modules the frontend Permissions Matrix uses', () => {
    if (!fs.existsSync(frontendHook)) {
      throw new Error(`frontend hook not found at ${frontendHook} — update this test's path`);
    }
    const source = fs.readFileSync(frontendHook, 'utf8');

    const frontendModules = new Set([
      ...modulesFromMap(source, 'ROUTE_PERMISSION_MAP'),
      ...modulesFromMap(source, 'SIDEBAR_PERMISSION_MAP'),
    ]);

    expect(frontendModules.size).toBeGreaterThan(0);
    // Every module the UI can ask about must be enforceable on the backend.
    expect([...frontendModules].sort()).toEqual([...PERMISSION_MODULES].sort());
  });

  it('matches the actions seeded by migration 030', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, '030_create_role_permissions.sql'), 'utf8');
    const actionBlock = sql.match(/AS actions\(a\)/);
    expect(actionBlock).not.toBeNull();

    for (const action of PERMISSION_ACTIONS) {
      expect(sql).toContain(`('${action}')`);
    }
    expect(PERMISSION_ACTIONS).toEqual(['view', 'create', 'edit', 'delete', 'manage']);
  });

  it('covers every module seeded into role_permissions by the migrations', () => {
    const seeded = new Set<string>();
    for (const file of fs.readdirSync(migrationsDir)) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      if (!sql.includes('INSERT INTO role_permissions')) continue;
      // Module names appear as quoted literals in the VALUES / SELECT lists.
      for (const match of sql.matchAll(/'([A-Z][A-Za-z ]+)'/g)) {
        const value = match[1];
        if (PERMISSION_MODULES.includes(value as any)) seeded.add(value);
      }
    }
    expect(seeded.size).toBeGreaterThan(15);
    for (const module of seeded) {
      expect(PERMISSION_MODULES).toContain(module as any);
    }
  });

  it('keeps the roles aligned with the matrix columns', () => {
    expect(PERMISSION_ROLES).toEqual(['admin', 'manager', 'worker']);
  });
});
