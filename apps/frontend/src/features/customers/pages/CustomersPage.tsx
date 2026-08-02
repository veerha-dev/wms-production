import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/shared/components/layout/AppLayout';
import {
  CalendarPlus,
  CheckCircle2,
  Edit,
  Eye,
  HelpCircle,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  Users,
  Wallet,
} from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Badge } from '@/shared/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { DataState } from '@/shared/components/ui/data-state';
import { PaginationControls } from '@/shared/components/ui/pagination-controls';
import { ConfirmDialog } from '@/shared/components/ui/confirm-dialog';
import { ImportButton, ExportButton } from '@/shared/components/import-export';
import { customerImportExportConfig } from '@/shared/config/import-export/customer-config';
import { usePagination } from '@/shared/hooks/usePagination';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useAuth } from '@/shared/contexts/AuthContext';
import { toast } from 'sonner';
import { useCustomers, useCustomerStats, useDeleteCustomer } from '../hooks/useCustomers';
import { CustomerFormDialog } from '../components/CustomerFormDialog';
import { Customer, INDIAN_STATES } from '../types';

function StatCard({
  icon: Icon,
  tone,
  value,
  label,
  hint,
}: {
  icon: any;
  tone: string;
  value: React.ReactNode;
  label: string;
  hint?: string;
}) {
  return (
    <div className="wms-card p-4">
      <div className="flex items-center gap-3">
        <div className={`h-10 w-10 rounded-lg ${tone} flex items-center justify-center`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-sm text-muted-foreground flex items-center gap-1">
            {label}
            {hint && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">{hint}</TooltipContent>
              </Tooltip>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function CustomersPage() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const isAdmin = role === 'admin';

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [typeFilter, setTypeFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const { page, pageSize, goToPage, changePageSize } = usePagination(25);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [deactivating, setDeactivating] = useState<Customer | null>(null);

  const listParams = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      customerType: typeFilter === 'all' ? undefined : typeFilter,
      state: stateFilter === 'all' ? undefined : stateFilter,
      status: statusFilter === 'all' ? undefined : statusFilter,
      page: page + 1,
      limit: pageSize,
    }),
    [debouncedSearch, typeFilter, stateFilter, statusFilter, page, pageSize]
  );

  // Spec §8: export the FULL customer list, not the loaded page. The same
  // filters go to GET /customers/export, minus the pagination keys.
  const exportFilters = useMemo(() => {
    const { page: _p, limit: _l, ...rest } = listParams;
    return rest as Record<string, unknown>;
  }, [listParams]);

  const { data: result, isLoading, error, refetch } = useCustomers(listParams);
  const { data: stats } = useCustomerStats();
  const deleteCustomer = useDeleteCustomer();

  const customers: Customer[] = result?.data ?? [];
  const total = result?.meta?.total ?? customers.length;
  const totalPages = result?.meta?.totalPages ?? 1;

  const handleCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const handleEdit = (customer: Customer) => {
    setEditing(customer);
    setFormOpen(true);
  };

  const handleConfirmDeactivate = async () => {
    if (!deactivating) return;
    try {
      await deleteCustomer.mutateAsync(deactivating.id);
      toast.success(`${deactivating.name} deactivated`);
      setDeactivating(null);
    } catch {
      // mutation surfaces the error toast
    }
  };

  return (
    <AppLayout
      title="Customers"
      breadcrumbs={[
        { label: 'Home', href: '/' },
        { label: 'Outbound', href: '/outbound' },
        { label: 'Customers' },
      ]}
    >
      {/* Stat cards — spec §3 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={Users}
          tone="bg-primary/10 text-primary"
          value={stats?.total ?? total ?? 0}
          label="Total Customers"
        />
        <StatCard
          icon={CheckCircle2}
          tone="bg-success/10 text-success"
          value={stats?.active ?? '—'}
          label="Active Customers"
        />
        <StatCard
          icon={CalendarPlus}
          tone="bg-info/10 text-info"
          value={stats?.newThisMonth ?? '—'}
          label="New This Month"
        />
        <StatCard
          icon={Wallet}
          tone="bg-muted text-muted-foreground"
          value={stats?.pendingPayments ?? '—'}
          label="Pending Payments"
          hint={
            stats?.pendingPayments == null
              ? 'Requires invoice linkage — this figure will populate once outstanding invoices are wired to customers.'
              : 'Customers with at least one unpaid invoice.'
          }
        />
      </div>

      {/* Filters + actions */}
      <div className="wms-card mb-6">
        {/* Wraps on available width rather than at a viewport breakpoint: the
            sidebar takes 256px, so `xl:` (1280px window) fired while the
            toolbar itself only had ~1024px and pushed the page into a
            horizontal scroll, sliding content under the fixed sidebar. */}
        <div className="p-4 flex flex-wrap gap-4 items-center justify-between">
          <div className="flex flex-col md:flex-row flex-wrap gap-3 flex-1 min-w-0">
            <div className="relative md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search name, code, phone or GSTIN…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  goToPage(0);
                }}
                className="pl-9"
              />
            </div>

            <Select
              value={typeFilter}
              onValueChange={(v) => {
                setTypeFilter(v);
                goToPage(0);
              }}
            >
              <SelectTrigger className="w-full md:w-[150px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="b2b">B2B</SelectItem>
                <SelectItem value="b2c">B2C</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={stateFilter}
              onValueChange={(v) => {
                setStateFilter(v);
                goToPage(0);
              }}
            >
              <SelectTrigger className="w-full md:w-[190px]">
                <SelectValue placeholder="State" />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectItem value="all">All States</SelectItem>
                {INDIAN_STATES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v);
                goToPage(0);
              }}
            >
              <SelectTrigger className="w-full md:w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 shrink-0">
            <ImportButton
              config={customerImportExportConfig}
              size="sm"
              onImportComplete={(res) => {
                refetch();
                if (res.created > 0) toast.success(`Imported ${res.created} customers`);
                if (res.failed > 0) toast.error(`${res.failed} rows failed to import`);
              }}
            />
            <ExportButton
              config={customerImportExportConfig}
              data={customers as unknown as Record<string, unknown>[]}
              filters={exportFilters}
              serverSide
              totalCount={total}
              size="sm"
            />
            <Button size="sm" onClick={handleCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Create Customer
            </Button>
          </div>
        </div>
      </div>

      <DataState
        isLoading={isLoading}
        error={error as Error | null}
        isEmpty={!isLoading && customers.length === 0}
        emptyMessage="No customers found. Create your first customer to get started."
        emptyIcon={<Users className="h-8 w-8 text-muted-foreground mb-3" />}
        onRetry={() => refetch()}
      >
        <div className="wms-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer Code</TableHead>
                <TableHead>Customer Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Contact Person</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>City &amp; State</TableHead>
                <TableHead>GSTIN</TableHead>
                <TableHead className="text-right">Total Orders</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell className="font-medium">{customer.code || '-'}</TableCell>
                  <TableCell>
                    <button
                      className="font-medium text-primary hover:underline text-left"
                      onClick={() => navigate(`/outbound/customers/${customer.id}`)}
                    >
                      {customer.name}
                    </button>
                  </TableCell>
                  <TableCell>
                    <Badge variant={customer.customerType === 'b2b' ? 'default' : 'secondary'}>
                      {customer.customerType === 'b2b' ? 'B2B' : 'B2C'}
                    </Badge>
                  </TableCell>
                  <TableCell>{customer.contactPerson || '-'}</TableCell>
                  <TableCell>{customer.phone || '-'}</TableCell>
                  <TableCell className="text-sm">
                    {[customer.city, customer.state].filter(Boolean).join(', ') || '-'}
                  </TableCell>
                  <TableCell className="text-sm font-mono">{customer.gstNumber || '-'}</TableCell>
                  <TableCell className="text-right">{customer.totalOrders ?? 0}</TableCell>
                  <TableCell>
                    <Badge variant={customer.status === 'active' ? 'default' : 'secondary'}>
                      {customer.status === 'active' ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => navigate(`/outbound/customers/${customer.id}`)}>
                          <Eye className="mr-2 h-4 w-4" />
                          View
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleEdit(customer)}>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        {/* Deactivation is admin-only per spec §7. */}
                        {isAdmin && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              disabled={customer.status !== 'active'}
                              onClick={() => setDeactivating(customer)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Deactivate
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <PaginationControls
            currentPage={page}
            totalPages={totalPages}
            pageSize={pageSize}
            totalCount={total}
            onPageChange={goToPage}
            onPageSizeChange={changePageSize}
          />
        </div>
      </DataState>

      <CustomerFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        customer={editing}
        onSuccess={() => refetch()}
      />

      <ConfirmDialog
        open={!!deactivating}
        onOpenChange={(open) => !open && setDeactivating(null)}
        title="Deactivate customer?"
        description={`${deactivating?.name ?? 'This customer'} will be marked inactive and hidden from new order selection. Existing orders and invoices are untouched.`}
        confirmText="Deactivate"
        variant="destructive"
        isLoading={deleteCustomer.isPending}
        onConfirm={handleConfirmDeactivate}
      />
    </AppLayout>
  );
}
