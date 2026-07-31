import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppLayout } from '@/shared/components/layout/AppLayout';
import { ArrowLeft, CalendarClock, Edit, IndianRupee, ShoppingCart } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import { DataState } from '@/shared/components/ui/data-state';
import { useAuth } from '@/shared/contexts/AuthContext';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { useCustomer, useCustomerOrders } from '../hooks/useCustomers';
import { CustomerFormDialog } from '../components/CustomerFormDialog';
import { CustomerAddressesTab } from '../components/CustomerAddressesTab';
import { CustomerOrdersTab } from '../components/CustomerOrdersTab';
import { CustomerInvoicesTab } from '../components/CustomerInvoicesTab';
import { CustomerNotesTab } from '../components/CustomerNotesTab';
import { formatCurrency, formatCustomerAddress, formatPaymentTerms } from '../types';

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium mt-0.5 break-words">{value || '-'}</p>
    </div>
  );
}

function QuickStat({ icon: Icon, label, value }: { icon: any; label: string; value: React.ReactNode }) {
  return (
    <div className="wms-card p-4 flex items-center gap-3">
      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div>
        <p className="text-xl font-bold">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { role } = useAuth();
  const { canAccess } = usePermissions();
  const isAdmin = role === 'admin';
  // ProtectedRoute only auto-detects modules for exact paths, so this
  // parameterised route enforces the Customers permission itself (spec §7).
  const allowed = canAccess('Customers', 'view');

  const [editOpen, setEditOpen] = useState(false);

  const { data: customer, isLoading, error, refetch } = useCustomer(allowed ? id : null);
  // Must honour `allowed` too, or a worker deep-linking to this URL still
  // fires GET /customers/:id/orders and takes a 403 behind the Access Denied UI.
  const { data: ordersResult } = useCustomerOrders(allowed ? id : null);

  /**
   * Quick stats: prefer server-supplied aggregates, otherwise derive them from
   * the orders list we already have loaded.
   */
  const quickStats = useMemo(() => {
    const orders = ordersResult?.data ?? [];
    const totalOrders = customer?.totalOrders ?? ordersResult?.meta?.total ?? orders.length;
    const totalValue =
      customer?.totalBusinessValue ??
      orders.reduce((sum: number, o: any) => sum + Number(o.totalAmount ?? o.total_value ?? 0), 0);
    const lastOrderDate =
      customer?.lastOrderDate ??
      orders
        .map((o: any) => o.orderDate || o.order_date)
        .filter(Boolean)
        .sort()
        .pop();
    return { totalOrders, totalValue, lastOrderDate };
  }, [customer, ordersResult]);

  return (
    <AppLayout
      title={customer?.name || 'Customer'}
      breadcrumbs={[
        { label: 'Home', href: '/' },
        { label: 'Outbound', href: '/outbound' },
        { label: 'Customers', href: '/outbound/customers' },
        { label: customer?.name || 'Customer' },
      ]}
    >
      {!allowed ? (
        <div className="wms-card p-10 text-center">
          <h2 className="text-xl font-bold mb-2">Access Denied</h2>
          <p className="text-muted-foreground">
            You don’t have permission to view customers. Contact your administrator.
          </p>
        </div>
      ) : (
      <DataState
        isLoading={isLoading}
        error={error as Error | null}
        isEmpty={!isLoading && !customer}
        emptyMessage="Customer not found."
        onRetry={() => refetch()}
      >
        {customer && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={() => navigate('/outbound/customers')}>
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-2xl font-bold">{customer.name}</h1>
                    <Badge variant={customer.customerType === 'b2b' ? 'default' : 'secondary'}>
                      {customer.customerType === 'b2b' ? 'B2B' : 'B2C'}
                    </Badge>
                    <Badge variant={customer.status === 'active' ? 'default' : 'secondary'}>
                      {customer.status === 'active' ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{customer.code}</p>
                </div>
              </div>
              <Button onClick={() => setEditOpen(true)}>
                <Edit className="h-4 w-4 mr-2" />
                Edit Customer
              </Button>
            </div>

            <Tabs defaultValue="overview">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="orders">Orders</TabsTrigger>
                <TabsTrigger value="invoices">Invoices</TabsTrigger>
                <TabsTrigger value="addresses">Addresses</TabsTrigger>
                <TabsTrigger value="notes">Notes</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-6 mt-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <QuickStat icon={ShoppingCart} label="Total Orders" value={quickStats.totalOrders ?? 0} />
                  <QuickStat
                    icon={IndianRupee}
                    label="Total Business Value"
                    value={formatCurrency(quickStats.totalValue)}
                  />
                  <QuickStat
                    icon={CalendarClock}
                    label="Last Order"
                    value={
                      quickStats.lastOrderDate
                        ? new Date(quickStats.lastOrderDate).toLocaleDateString()
                        : '—'
                    }
                  />
                </div>

                <div className="wms-card p-5 space-y-5">
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                      Basic Details
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <Field label="Customer Code" value={customer.code} />
                      <Field label="Contact Person" value={customer.contactPerson} />
                      <Field label="Phone" value={customer.phone} />
                      <Field label="WhatsApp" value={customer.whatsappNumber} />
                      <Field label="Email" value={customer.email} />
                    </div>
                  </div>

                  {customer.customerType === 'b2b' && (
                    <div>
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                        Tax Details
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <Field label="GSTIN" value={customer.gstNumber} />
                        <Field label="PAN" value={customer.panNumber} />
                        <Field label="State" value={customer.state} />
                      </div>
                    </div>
                  )}

                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                      Billing Address
                    </h3>
                    <Field label="Address" value={formatCustomerAddress(customer)} />
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                      Commercial Details
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <Field label="Payment Terms" value={formatPaymentTerms(customer.paymentTerms)} />
                      {/* Credit limit is admin-only (spec §7). */}
                      {isAdmin && (
                        <Field
                          label="Credit Limit"
                          value={customer.creditLimit != null ? formatCurrency(customer.creditLimit) : 'No limit'}
                        />
                      )}
                      <Field label="Status" value={customer.status === 'active' ? 'Active' : 'Inactive'} />
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="orders" className="mt-4">
                <CustomerOrdersTab customerId={customer.id} />
              </TabsContent>

              <TabsContent value="invoices" className="mt-4">
                <CustomerInvoicesTab customerId={customer.id} />
              </TabsContent>

              <TabsContent value="addresses" className="mt-4">
                <CustomerAddressesTab customerId={customer.id} />
              </TabsContent>

              <TabsContent value="notes" className="mt-4">
                <CustomerNotesTab customer={customer} />
              </TabsContent>
            </Tabs>

            <CustomerFormDialog
              open={editOpen}
              onOpenChange={setEditOpen}
              customer={customer}
              onSuccess={() => refetch()}
            />
          </div>
        )}
      </DataState>
      )}
    </AppLayout>
  );
}
