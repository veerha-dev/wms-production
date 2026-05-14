import { cn } from '@/shared/lib/utils';
import { useWMS } from '@/shared/contexts/WMSContext';
import { useAuth } from '@/shared/contexts/AuthContext';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { useLocation, Link } from 'react-router-dom';
import {
  Building2,
  Package,
  Map,
  Boxes,
  Workflow,
  RotateCcw,
  ClipboardList,
  BarChart3,
  Users,
  LayoutDashboard,
  Settings,
  ChevronLeft,
  ChevronRight,
  Warehouse,
  ChevronDown,
  LogOut,
  FileBarChart,
  FileText,
  ShoppingCart,
  Truck,
  ListChecks,
  PackageCheck,
  ClipboardCheck,
  ArrowDownToLine,
  ArrowUpFromLine,
  Shield,
  PackageOpen,
  ArrowLeftRight,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { Button } from '@/shared/components/ui/button';

const navItems = [
  { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard, path: '/', section: 'core' },
  { id: 'warehouses', name: 'Warehouses', icon: Building2, path: '/warehouses', section: 'core' },
  { id: 'mapping', name: 'Layout', icon: Map, path: '/mapping', section: 'core' },
  { id: 'inventory', name: 'Inventory', icon: Package, path: '/inventory', section: 'core' },
  { id: 'inbound', name: 'Purchase Orders', icon: ArrowDownToLine, path: '/inbound', section: 'inbound' },
  { id: 'suppliers', name: 'Suppliers', icon: Building2, path: '/inbound/suppliers', section: 'inbound' },
  { id: 'grn', name: 'Goods Receipt', icon: ClipboardCheck, path: '/inbound/grn', section: 'inbound' },
  { id: 'qc', name: 'QC Inspections', icon: Shield, path: '/inbound/qc', section: 'inbound' },
  { id: 'putaway', name: 'Putaway', icon: PackageOpen, path: '/inbound/putaway', section: 'inbound' },
  { id: 'outbound', name: 'Sales Orders', icon: ArrowUpFromLine, path: '/outbound', section: 'outbound' },
  { id: 'picking', name: 'Pick Lists', icon: ListChecks, path: '/outbound/picking', section: 'outbound' },
  { id: 'waves', name: 'Wave Planning', icon: Workflow, path: '/outbound/waves', section: 'outbound' },
  { id: 'consolidation', name: 'Consolidation', icon: Boxes, path: '/outbound/consolidation', section: 'outbound' },
  { id: 'packing', name: 'Packing', icon: PackageCheck, path: '/outbound/packing', section: 'outbound' },
  { id: 'shipping', name: 'Shipments', icon: Truck, path: '/outbound/shipping', section: 'outbound' },
  { id: 'returns', name: 'Returns', icon: RotateCcw, path: '/returns', section: 'operations' },
  { id: 'tasks', name: 'Operations', icon: ClipboardList, path: '/operations', section: 'operations' },
  { id: 'invoices', name: 'Invoices', icon: FileText, path: '/invoices', section: 'operations' },
  { id: 'reports', name: 'Reports', icon: FileBarChart, path: '/reports', section: 'reports' },
  { id: 'users', name: 'Users', icon: Users, path: '/users', section: 'admin' },
];

export function Sidebar() {
  const { tenant, currentUser, warehouses, selectedWarehouse, selectWarehouse, isModuleEnabled, isSidebarCollapsed, toggleSidebar } = useWMS();
  const { signOut } = useAuth();
  const { canAccessSidebarItem } = usePermissions();
  const location = useLocation();

  const calculateUtilization = (used: number, total: number) => {
    if (total === 0) return 0;
    return Math.round((used / total) * 100);
  };

  const NavItemComponent = ({ item }: { item: typeof navItems[0] }) => {
    const Icon = item.icon;
    const isActive = item.path === '/' ? location.pathname === '/' : location.pathname === item.path;
    const isEnabled = canAccessSidebarItem(item.name);

    const content = (
      <Link
        to={isEnabled ? item.path : '#'}
        className={cn(
          'wms-nav-item',
          isActive && 'wms-nav-item-active',
          !isEnabled && 'opacity-40 cursor-not-allowed'
        )}
        onClick={(e) => !isEnabled && e.preventDefault()}
      >
        <Icon className="h-5 w-5 flex-shrink-0" />
        {!isSidebarCollapsed && <span>{item.name}</span>}
        {!isEnabled && !isSidebarCollapsed && (
          <span className="ml-auto text-[10px] bg-sidebar-accent px-1.5 py-0.5 rounded text-sidebar-muted">
            Locked
          </span>
        )}
      </Link>
    );

    if (isSidebarCollapsed) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>{content}</TooltipTrigger>
          <TooltipContent side="right" className="font-medium">
            {item.name}
            {!isEnabled && ' (Locked)'}
          </TooltipContent>
        </Tooltip>
      );
    }

    return content;
  };

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <aside
      key={`sidebar-${currentUser?.id}-${currentUser?.role}`}
      className={cn(
        'fixed left-0 top-0 z-40 h-screen bg-sidebar border-r border-sidebar-border transition-all duration-300 flex flex-col',
        isSidebarCollapsed ? 'w-[72px]' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-sidebar-border">
        {!isSidebarCollapsed && (
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-sidebar-primary flex items-center justify-center">
              <Warehouse className="h-5 w-5 text-sidebar-primary-foreground" />
            </div>
            <div>
              <h1 className="font-bold text-sidebar-foreground tracking-tight">VEERHA</h1>
              <p className="text-[10px] text-sidebar-muted uppercase tracking-widest">WMS</p>
            </div>
          </div>
        )}
        {isSidebarCollapsed && (
          <div className="h-8 w-8 rounded-lg bg-sidebar-primary flex items-center justify-center mx-auto">
            <Warehouse className="h-5 w-5 text-sidebar-primary-foreground" />
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-1" style={{ scrollBehavior: 'auto' }}>
        {navItems.filter(item => canAccessSidebarItem(item.name)).map((item, index, filteredItems) => {
          const prevSection = index > 0 ? filteredItems[index - 1].section : null;
          const showSectionLabel = item.section !== prevSection && item.section !== 'core';
          const sectionLabels: Record<string, string> = {
            inbound: 'Inbound',
            outbound: 'Outbound',
            operations: 'Operations',
            reports: 'Reports',
            admin: 'Admin',
          };
          return (
            <div key={item.path}>
              {showSectionLabel && !isSidebarCollapsed && (
                <p className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted mt-4 mb-1 px-3">
                  {sectionLabels[item.section] || item.section}
                </p>
              )}
              {showSectionLabel && isSidebarCollapsed && (
                <div className="my-2 mx-2 border-t border-sidebar-border" />
              )}
              <NavItemComponent item={item} />
            </div>
          );
        })}
      </nav>

      {/* User & Settings */}
      <div className="border-t border-sidebar-border p-3 space-y-2">
        <Link
          to="/settings"
          className="wms-nav-item"
        >
          <Settings className="h-5 w-5 flex-shrink-0" />
          {!isSidebarCollapsed && <span>Settings</span>}
        </Link>

        {!isSidebarCollapsed && currentUser && (
          <DropdownMenu key={`user-${currentUser.id}-${currentUser.role}`}>
            <DropdownMenuTrigger asChild>
              <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-sidebar-accent cursor-pointer">
                <div className="h-9 w-9 rounded-full bg-sidebar-primary flex items-center justify-center text-sidebar-primary-foreground font-medium text-sm">
                  {currentUser.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-sidebar-foreground truncate">
                    {currentUser.name}
                  </p>
                  <p className="text-xs text-sidebar-muted capitalize">{currentUser.role}</p>
                </div>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem asChild>
                <Link to="/settings" className="cursor-pointer">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Collapse Toggle */}
      <button
        onClick={toggleSidebar}
        className="absolute -right-3 top-20 h-6 w-6 rounded-full bg-card border border-border shadow-sm flex items-center justify-center hover:bg-accent transition-colors"
      >
        {isSidebarCollapsed ? (
          <ChevronRight className="h-3 w-3" />
        ) : (
          <ChevronLeft className="h-3 w-3" />
        )}
      </button>
    </aside>
  );
}
