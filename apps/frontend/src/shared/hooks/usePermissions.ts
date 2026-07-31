import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/lib/api';
import { useAuth } from '@/shared/contexts/AuthContext';
import { useCallback } from 'react';

interface Permission {
  module: string;
  action: string;
  admin: boolean;
  manager: boolean;
  worker: boolean;
}

// Map route paths to permission module names
export const ROUTE_PERMISSION_MAP: Record<string, string> = {
  '/': 'Dashboard',
  '/warehouses': 'Warehouses',
  '/mapping': 'Layout',
  '/inventory': 'Inventory',
  '/inbound': 'Purchase Orders',
  '/inbound/suppliers': 'Suppliers',
  '/inbound/grn': 'GRN',
  '/inbound/qc': 'QC Inspections',
  '/inbound/putaway': 'Putaway',
  '/outbound': 'Sales Orders',
  '/outbound/customers': 'Customers',
  // ProtectedRoute matches pathnames exactly, so the parameterised detail route
  // can never resolve here — CustomerDetailPage guards itself with canAccess().
  '/outbound/customers/:id': 'Customers',
  '/outbound/picking': 'Pick Lists',
  '/outbound/packing': 'Packing',
  '/outbound/shipping': 'Shipments',
  '/returns': 'Returns',
  '/operations': 'Operations',
  '/workflows': 'Workflows',
  '/invoices': 'Invoices',
  '/reports': 'Reports',
  '/reports/stock': 'Reports',
  '/reports/movements': 'Reports',
  '/reports/purchase-register': 'Reports',
  '/reports/sales-register': 'Reports',
  '/reports/expiry': 'Reports',
  '/reports/low-stock': 'Reports',
  '/reports/warehouse-utilization': 'Reports',
  '/reports/audit-trail': 'Reports',
  '/analytics': 'Analytics',
  '/users': 'Users',
  '/settings': 'Settings',
  '/seed-data': 'Settings',
  '/admin/modules': 'Settings',
};

// Map sidebar label to permission module name
export const SIDEBAR_PERMISSION_MAP: Record<string, string> = {
  'Dashboard': 'Dashboard',
  'Warehouses': 'Warehouses',
  'Layout': 'Layout',
  'Inventory': 'Inventory',
  'Purchase Orders': 'Purchase Orders',
  'Suppliers': 'Suppliers',
  'Goods Receipt': 'GRN',
  'QC Inspections': 'QC Inspections',
  'Putaway': 'Putaway',
  'Customers': 'Customers',
  'Sales Orders': 'Sales Orders',
  'Pick Lists': 'Pick Lists',
  'Packing': 'Packing',
  'Shipping': 'Shipments',
  'Returns': 'Returns',
  'Operations': 'Operations',
  'Workflows': 'Workflows',
  'Invoices': 'Invoices',
  'Reports': 'Reports',
  'Analytics': 'Analytics',
  'Users': 'Users',
  'Settings': 'Settings',
};

/**
 * Modules a role must never reach, enforced client-side.
 * `canAccess` deliberately fails open when a permission row is missing, so
 * hard rules from the spec are listed here instead of relying on seed data.
 * Spec §7: Worker has no access to Customers, Sales Orders or Invoices —
 * workers execute warehouse tasks and must not reach order or billing screens.
 *
 * Deliberately narrow: the fail-open default below stays, so a module whose
 * permission row is simply missing from seed data does not lock out legitimate
 * users. Only hard spec rules belong in this list.
 */
export const ROLE_MODULE_DENYLIST: Record<string, string[]> = {
  worker: ['Customers', 'Sales Orders', 'Invoices'],
};

export function usePermissions() {
  const { role, isAuthenticated } = useAuth();

  const { data: permissions = [] } = useQuery<Permission[]>({
    queryKey: ['role-permissions', role],
    queryFn: async () => {
      try {
        const { data } = await api.get('/api/v1/users/permissions');
        return data.data || [];
      } catch {
        return [];
      }
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchOnWindowFocus: false,
  });

  const canAccess = useCallback((moduleName: string, action: string = 'view'): boolean => {
    // Admin always has full access
    if (role === 'admin') return true;

    // Hard denials from the spec win over the permissive fallbacks below
    if (role && ROLE_MODULE_DENYLIST[role]?.includes(moduleName)) return false;

    // If no permissions loaded yet, allow access (graceful degradation)
    if (permissions.length === 0) return true;

    const perm = permissions.find(
      p => p.module === moduleName && p.action === action
    );

    if (!perm) return true; // If permission not found, allow by default

    // Check the role-specific permission
    const roleKey = role as keyof Permission;
    return !!perm[roleKey];
  }, [role, permissions]);

  const canAccessRoute = useCallback((path: string): boolean => {
    if (role === 'admin') return true;
    const moduleName = ROUTE_PERMISSION_MAP[path];
    if (!moduleName) return true; // Unknown routes are allowed
    return canAccess(moduleName, 'view');
  }, [role, canAccess]);

  const canAccessSidebarItem = useCallback((label: string): boolean => {
    if (role === 'admin') return true;
    const moduleName = SIDEBAR_PERMISSION_MAP[label];
    if (!moduleName) return true;
    return canAccess(moduleName, 'view');
  }, [role, canAccess]);

  return {
    permissions,
    canAccess,
    canAccessRoute,
    canAccessSidebarItem,
    isAdmin: role === 'admin',
  };
}
