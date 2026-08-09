/**
 * The permission vocabulary shared by the backend guard, the `role_permissions`
 * table and the frontend Permissions Matrix.
 *
 * These strings are NOT free-form. They must match, character for character:
 *   - the module names the Permissions Matrix renders, which come straight from
 *     `GET /api/v1/users/permissions` (i.e. the `module` column), and
 *   - `ROUTE_PERMISSION_MAP` / `SIDEBAR_PERMISSION_MAP` in
 *     `apps/frontend/src/shared/hooks/usePermissions.ts`.
 *
 * Sources of the 22 modules below:
 *   - migration 030_create_role_permissions.sql seeds 20 modules x 5 actions x 3 roles
 *   - migration 031_create_putaway_tasks.sql adds 'Putaway'
 *   - migration 083_extend_customers.sql adds 'Customers'
 * which is exactly the union used by the frontend maps (22 x 5 = 110 matrix rows).
 *
 * Adding a module here without a matching seed row is safe: the guard fails OPEN
 * on a missing row (see PermissionsService.isAllowed).
 */
export const PERMISSION_MODULES = [
  'Analytics',
  'Customers',
  'Dashboard',
  'GRN',
  'Inventory',
  'Invoices',
  'Layout',
  'Operations',
  'Packing',
  'Pick Lists',
  'Purchase Orders',
  'Putaway',
  'QC Inspections',
  'Reports',
  'Returns',
  'Sales Orders',
  'Settings',
  'Shipments',
  'Suppliers',
  'Users',
  'Warehouses',
  'Workflows',
] as const;

export type PermissionModule = (typeof PERMISSION_MODULES)[number];

/** The five actions every module row carries. Matches the matrix columns. */
export const PERMISSION_ACTIONS = ['view', 'create', 'edit', 'delete', 'manage'] as const;

export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

/** Roles the matrix is keyed by. `super_admin` is deliberately absent — it never
 * transits these routes (it has its own /api/v1/sa/* surface) and is bypassed. */
export const PERMISSION_ROLES = ['admin', 'manager', 'worker'] as const;

export type PermissionRole = (typeof PERMISSION_ROLES)[number];

/**
 * Roles that bypass the matrix entirely.
 *
 * ADMIN BYPASS IS INTENTIONAL AND HARD-CODED. The matrix UI lets an admin toggle
 * any cell, including the admin column, so honouring an `admin=false` row would
 * let a tenant's only admin permanently lock themselves (and everyone else) out
 * of Users/Settings with a single mis-click, with no in-app way back. The
 * frontend already treats admin as unconditionally allowed
 * (`usePermissions.canAccess` returns true for admin before reading any row);
 * this keeps the backend consistent with it.
 */
export const PERMISSION_BYPASS_ROLES: readonly string[] = ['admin', 'super_admin'];
