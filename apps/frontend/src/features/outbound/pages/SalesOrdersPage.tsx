import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/shared/components/layout/AppLayout';
import { Plus, ShoppingCart, CheckCircle, Clock, Package, Truck, XCircle, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table';
import { Textarea } from '@/shared/components/ui/textarea';
import { useToast } from '@/shared/hooks/use-toast';
import { useSalesOrders, useOrderStats, useCreateOrder, useConfirmOrder, useCancelOrder } from '@/features/outbound/hooks/useSalesOrders';
import { useSKUs } from '@/features/inventory/hooks/useSKUs';
import { useWarehouses } from '@/features/warehouse/hooks/useWarehouses';
import { safeParseInt, safeParseFloat } from '@/shared/utils/input';
import { CustomerCombobox } from '@/features/customers/components/CustomerCombobox';
import { CustomerFormDialog } from '@/features/customers/components/CustomerFormDialog';
import {
  useCustomer,
  useCustomerAddresses,
  useCreditCheck,
} from '@/features/customers/hooks/useCustomers';
import { useDebouncedValue } from '@/features/customers/hooks/useDebouncedValue';
import {
  formatAddress,
  formatCustomerAddress,
  formatCurrency,
  formatPaymentTerms,
  type CustomerSearchResult,
} from '@/features/customers/types';

export default function SalesOrdersPage() {
  const { toast } = useToast();
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [customerFilter, setCustomerFilter] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  const { data: ordersData, isLoading } = useSalesOrders({
    page,
    limit: 50,
    status: statusFilter === 'all' ? undefined : statusFilter,
    customer: customerFilter || undefined,
  });
  const { data: stats } = useOrderStats();
  const createOrder = useCreateOrder();
  const confirmOrder = useConfirmOrder();
  const cancelOrder = useCancelOrder();

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; icon: any }> = {
      draft: { variant: 'secondary', icon: Clock },
      confirmed: { variant: 'default', icon: CheckCircle },
      picking: { variant: 'default', icon: Package },
      packing: { variant: 'default', icon: Package },
      ready_to_ship: { variant: 'default', icon: Truck },
      shipped: { variant: 'default', icon: Truck },
      delivered: { variant: 'default', icon: CheckCircle },
      cancelled: { variant: 'destructive', icon: XCircle },
    };
    const config = variants[status] || variants.draft;
    const Icon = config.icon;
    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {status.replace(/_/g, ' ')}
      </Badge>
    );
  };

  return (
    <AppLayout title="Sales Orders" breadcrumbs={[{ label: 'Outbound' }, { label: 'Sales Orders' }]}>
      <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Sales Orders</h1>
          <p className="text-muted-foreground">Manage customer orders and fulfillment</p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Order
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Draft</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.draft || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Confirmed</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.confirmed || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Picking</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.picking || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Packing</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.packing || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Shipped</CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.shipped || 0}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Sales Orders</CardTitle>
              <CardDescription>View and manage all customer orders</CardDescription>
            </div>
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="picking">Picking</SelectItem>
                  <SelectItem value="packing">Packing</SelectItem>
                  <SelectItem value="shipped">Shipped</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="Search customer..."
                value={customerFilter}
                onChange={(e) => setCustomerFilter(e.target.value)}
                className="w-[200px]"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order Number</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Order Date</TableHead>
                  <TableHead>Expected Delivery</TableHead>
                  <TableHead>Total Value</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordersData?.data?.map((order: any) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">{order.orderNumber || order.soNumber || order.order_number}</TableCell>
                    <TableCell>{order.customer?.name || order.customer_name || '-'}</TableCell>
                    <TableCell>{getStatusBadge(order.status)}</TableCell>
                    <TableCell>{new Date(order.orderDate || order.order_date).toLocaleDateString()}</TableCell>
                    <TableCell>
                      {(order.requiredDate || order.expectedDeliveryDate || order.expected_delivery_date) ? new Date(order.requiredDate || order.expectedDeliveryDate || order.expected_delivery_date).toLocaleDateString() : '-'}
                    </TableCell>
                    <TableCell>₹{Number(order.totalAmount || order.total_value || 0).toFixed(2)}</TableCell>
                    <TableCell>{order._count?.items || order.items?.length || order.sales_order_items?.[0]?.count || 0}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedOrder(order)}
                        >
                          View
                        </Button>
                        {order.status === 'draft' && (
                          <>
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => confirmOrder.mutate(order.id)}
                            >
                              Confirm
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => cancelOrder.mutate(order.id)}
                            >
                              Cancel
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {ordersData?.data?.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No sales orders found. Create your first order to get started.
            </div>
          )}
        </CardContent>
      </Card>

      <CreateOrderDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSubmit={(data) => {
          createOrder.mutate(data, {
            onSuccess: () => setCreateDialogOpen(false),
          });
        }}
      />

      {selectedOrder && (
        <OrderDetailDialog
          order={selectedOrder}
          open={!!selectedOrder}
          onOpenChange={(open) => !open && setSelectedOrder(null)}
        />
      )}
      </div>
    </AppLayout>
  );
}

const MANUAL_ADDRESS = '__manual__';

const emptyOrderForm = () => ({
  customer_name: '',
  customer_code: '',
  customer_contact: '',
  customer_address: '',
  customer_gstin: '',
  payment_terms: '',
  shipping_address: '',
  warehouse_id: '',
  expected_delivery_date: '',
  priority: 'medium',
  notes: '',
  items: [{ sku_id: '', ordered_quantity: 1, unit_price: 0, tax_percentage: 0, notes: '' }],
});

function CreateOrderDialog({ open, onOpenChange, onSubmit }: any) {
  const { toast } = useToast();
  const [formData, setFormData] = useState(emptyOrderForm);

  // A selected saved customer (spec §6). Null keeps the original free-text path
  // alive for walk-in / one-off B2C orders.
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSearchResult | null>(null);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [shippingAddressId, setShippingAddressId] = useState<string>(MANUAL_ADDRESS);

  const { data: skus } = useSKUs();
  const { data: warehouses } = useWarehouses();
  const { data: customerDetail } = useCustomer(selectedCustomer?.id);
  const { data: savedAddresses = [] } = useCustomerAddresses(selectedCustomer?.id);

  // Start from a clean slate every time the dialog is opened.
  useEffect(() => {
    if (!open) return;
    setFormData(emptyOrderForm());
    setSelectedCustomer(null);
    setShippingAddressId(MANUAL_ADDRESS);
  }, [open]);

  // Auto-fill from the selected customer. Uses a functional update so nothing
  // already typed into the rest of the order form is lost.
  useEffect(() => {
    if (!customerDetail) return;
    setFormData((prev) => ({
      ...prev,
      customer_name: customerDetail.name || prev.customer_name,
      customer_code: customerDetail.code || '',
      customer_contact: customerDetail.contactPerson || customerDetail.phone || '',
      customer_gstin: customerDetail.gstNumber || '',
      payment_terms: customerDetail.paymentTerms || '',
      customer_address: formatCustomerAddress(customerDetail),
    }));
  }, [customerDetail]);

  // Default the shipping dropdown to the customer's default (or first) address.
  useEffect(() => {
    if (!selectedCustomer) {
      setShippingAddressId(MANUAL_ADDRESS);
      return;
    }
    if (savedAddresses.length === 0) {
      setShippingAddressId(MANUAL_ADDRESS);
      return;
    }
    const preferred = savedAddresses.find((a) => a.isDefault) || savedAddresses[0];
    setShippingAddressId(preferred.id);
  }, [selectedCustomer?.id, savedAddresses]);

  const chosenAddress = useMemo(
    () => savedAddresses.find((a) => a.id === shippingAddressId) || null,
    [savedAddresses, shippingAddressId]
  );

  const orderTotal = useMemo(
    () =>
      formData.items.reduce((sum, item) => {
        const line = Number(item.ordered_quantity || 0) * Number(item.unit_price || 0);
        return sum + line + (line * Number(item.tax_percentage || 0)) / 100;
      }, 0),
    [formData.items]
  );
  const debouncedTotal = useDebouncedValue(orderTotal, 500);
  const { data: creditCheck } = useCreditCheck(selectedCustomer?.id, debouncedTotal);

  const resetCustomer = () => {
    setSelectedCustomer(null);
    setShippingAddressId(MANUAL_ADDRESS);
    setFormData((prev) => ({
      ...prev,
      customer_name: '',
      customer_code: '',
      customer_contact: '',
      customer_gstin: '',
      payment_terms: '',
      customer_address: '',
      shipping_address: '',
    }));
  };

  const handleSelectCustomer = (customer: CustomerSearchResult) => {
    setSelectedCustomer(customer);
    // Seed immediately from the lightweight search hit; the detail fetch fills
    // in contact person and billing address a moment later.
    setFormData((prev) => ({
      ...prev,
      customer_name: customer.name || '',
      customer_code: customer.code || '',
      customer_contact: prev.customer_contact || customer.phone || '',
      customer_gstin: customer.gstNumber || '',
      payment_terms: customer.paymentTerms || prev.payment_terms,
    }));
  };

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { sku_id: '', ordered_quantity: 1, unit_price: 0, tax_percentage: 0, notes: '' }],
    });
  };

  const removeItem = (index: number) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index),
    });
  };

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    setFormData({ ...formData, items: newItems });
  };

  const handleSubmit = () => {
    if (!formData.customer_name || !formData.warehouse_id || formData.items.length === 0) {
      toast({
        title: 'Missing Required Fields',
        description: 'Please enter a customer name, select a warehouse, and add at least one item.',
        variant: 'destructive',
      });
      return;
    }

    const hasEmptySku = formData.items.some(item => !item.sku_id);
    if (hasEmptySku) {
      toast({
        title: 'Invalid Order Items',
        description: 'Please select an SKU for all order items.',
        variant: 'destructive',
      });
      return;
    }

    const usingSavedAddress = !!chosenAddress && shippingAddressId !== MANUAL_ADDRESS;
    const shippingText = usingSavedAddress
      ? formatAddress(chosenAddress)
      : formData.shipping_address || formData.customer_address;

    // UUID fields must be omitted rather than sent empty.
    const payload: Record<string, any> = {
      customer_name: formData.customer_name,
      customer_code: formData.customer_code || undefined,
      customer_contact: formData.customer_contact || undefined,
      customer_address: formData.customer_address || undefined,
      shipping_address: shippingText || undefined,
      payment_terms: formData.payment_terms || undefined,
      warehouse_id: formData.warehouse_id,
      expected_delivery_date: formData.expected_delivery_date || undefined,
      priority: formData.priority,
      notes: formData.notes || undefined,
      items: formData.items,
    };
    if (selectedCustomer?.id) payload.customer_id = selectedCustomer.id;
    if (usingSavedAddress) payload.shipping_address_id = chosenAddress!.id;

    onSubmit(payload);
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Sales Order</DialogTitle>
          <DialogDescription>Add a new customer order</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* ---- Customer (spec §6) ---- */}
          <div className="space-y-2">
            <Label>Customer *</Label>
            <CustomerCombobox
              value={selectedCustomer}
              onSelect={handleSelectCustomer}
              onCreateNew={() => setQuickCreateOpen(true)}
              onClear={resetCustomer}
            />
            <p className="text-xs text-muted-foreground">
              Search a saved customer, or leave this empty and type the details below for a walk-in
              order.
            </p>
          </div>

          {selectedCustomer && (
            <div className="rounded-lg border bg-muted/40 p-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Code</p>
                <p className="font-medium">{formData.customer_code || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Contact</p>
                <p className="font-medium">{formData.customer_contact || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">GSTIN</p>
                <p className="font-medium font-mono text-xs">{formData.customer_gstin || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Payment Terms</p>
                <p className="font-medium">{formatPaymentTerms(formData.payment_terms)}</p>
              </div>
              <div className="col-span-2 md:col-span-4">
                <p className="text-xs text-muted-foreground">Billing Address</p>
                <p className="font-medium">{formData.customer_address || '-'}</p>
              </div>
            </div>
          )}

          {/* Non-blocking credit warning — spec §4 warns at launch, blocks later. */}
          {creditCheck?.wouldExceed && (
            <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
              <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Credit limit would be exceeded</p>
                <p className="text-muted-foreground">
                  {formData.customer_name || 'This customer'} has{' '}
                  {formatCurrency(creditCheck.outstanding)} unpaid against a credit limit of{' '}
                  {formatCurrency(creditCheck.creditLimit)}. This order of{' '}
                  {formatCurrency(orderTotal)} pushes them over. You can still proceed.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="customer_name">Customer Name *</Label>
              <Input
                id="customer_name"
                value={formData.customer_name}
                onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                placeholder="Enter customer name"
                disabled={!!selectedCustomer}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="warehouse_id">Warehouse *</Label>
              <Select value={formData.warehouse_id} onValueChange={(v) => setFormData({ ...formData, warehouse_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select warehouse" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses?.map((wh: any) => (
                    <SelectItem key={wh.id} value={wh.id}>{wh.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {!selectedCustomer && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="customer_code">Customer Code</Label>
                <Input
                  id="customer_code"
                  value={formData.customer_code}
                  onChange={(e) => setFormData({ ...formData, customer_code: e.target.value })}
                  placeholder="Customer code"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer_contact">Contact</Label>
                <Input
                  id="customer_contact"
                  value={formData.customer_contact}
                  onChange={(e) => setFormData({ ...formData, customer_contact: e.target.value })}
                  placeholder="Phone number"
                />
              </div>
            </div>
          )}

          {/* ---- Shipping address ---- */}
          <div className="space-y-2">
            <Label>Shipping Address</Label>
            {selectedCustomer && savedAddresses.length > 0 && (
              <Select value={shippingAddressId} onValueChange={setShippingAddressId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a saved address" />
                </SelectTrigger>
                <SelectContent>
                  {savedAddresses.map((address) => (
                    <SelectItem key={address.id} value={address.id}>
                      {address.label}
                      {address.isDefault ? ' (default)' : ''} — {formatAddress(address)}
                    </SelectItem>
                  ))}
                  <SelectItem value={MANUAL_ADDRESS}>Enter a different address…</SelectItem>
                </SelectContent>
              </Select>
            )}

            {shippingAddressId !== MANUAL_ADDRESS && chosenAddress ? (
              <p className="text-sm text-muted-foreground rounded-md border p-3">
                {formatAddress(chosenAddress) || 'No address details on file.'}
              </p>
            ) : (
              <Textarea
                id="shipping_address"
                value={formData.shipping_address}
                onChange={(e) => setFormData({ ...formData, shipping_address: e.target.value })}
                placeholder="Full delivery address"
                rows={2}
              />
            )}
          </div>

          {!selectedCustomer && (
            <div className="space-y-2">
              <Label htmlFor="customer_address">Billing Address</Label>
              <Textarea
                id="customer_address"
                value={formData.customer_address}
                onChange={(e) => setFormData({ ...formData, customer_address: e.target.value })}
                placeholder="Billing address (defaults to the delivery address)"
                rows={2}
              />
            </div>
          )}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="expected_delivery_date">Expected Delivery</Label>
              <Input
                id="expected_delivery_date"
                type="date"
                value={formData.expected_delivery_date}
                onChange={(e) => setFormData({ ...formData, expected_delivery_date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select value={formData.priority} onValueChange={(v) => setFormData({ ...formData, priority: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Order notes"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Order Items *</Label>
              <Button type="button" variant="outline" size="sm" onClick={addItem}>
                <Plus className="h-4 w-4 mr-1" />
                Add Item
              </Button>
            </div>
            <div className="border rounded-lg p-4 space-y-3">
              {formData.items.map((item, index) => (
                <div key={index} className="flex gap-2 items-end">
                  <div className="flex-1 space-y-2">
                    <Label>SKU</Label>
                    <Select value={item.sku_id} onValueChange={(v) => updateItem(index, 'sku_id', v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select SKU" />
                      </SelectTrigger>
                      <SelectContent>
                        {skus?.map((sku: any) => (
                          <SelectItem key={sku.id} value={sku.id}>
                            {sku.skuCode || sku.sku_code} - {sku.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-24 space-y-2">
                    <Label>Quantity</Label>
                    <Input
                      type="number"
                      min="1"
                      value={item.ordered_quantity}
                      onChange={(e) => updateItem(index, 'ordered_quantity', safeParseInt(e.target.value, 1))}
                    />
                  </div>
                  <div className="w-28 space-y-2">
                    <Label>Unit Price</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unit_price}
                      onChange={(e) => updateItem(index, 'unit_price', safeParseFloat(e.target.value, 0))}
                    />
                  </div>
                  <div className="w-24 space-y-2">
                    <Label>Tax %</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.tax_percentage}
                      onChange={(e) => updateItem(index, 'tax_percentage', safeParseFloat(e.target.value, 0))}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => removeItem(index)}
                    disabled={formData.items.length === 1}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter className="sm:justify-between items-center">
          <span className="text-sm text-muted-foreground">
            Order total: <span className="font-semibold text-foreground">{formatCurrency(orderTotal)}</span>
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSubmit}>Create Order</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/*
      Quick create lives outside the order dialog so creating a customer never
      unmounts the order form — everything already entered survives, and the
      new customer is auto-selected on success (spec §6).
    */}
    <CustomerFormDialog
      open={quickCreateOpen}
      onOpenChange={setQuickCreateOpen}
      mode="quick"
      onSuccess={(customer) => {
        if (!customer?.id) return;
        handleSelectCustomer({
          id: customer.id,
          code: customer.code,
          name: customer.name,
          phone: customer.phone,
          gstNumber: customer.gstNumber,
          paymentTerms: customer.paymentTerms,
        });
      }}
    />
    </>
  );
}

function OrderDetailDialog({ order, open, onOpenChange }: any) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Sales Order: {order.orderNumber || order.soNumber || order.order_number}</DialogTitle>
          <DialogDescription>View order details</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-muted-foreground">Customer</Label>
              <p className="font-medium">{order.customer?.name || order.customer_name}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Status</Label>
              <div className="mt-1">
                <Badge>{order.status}</Badge>
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground">Order Date</Label>
              <p className="font-medium">{new Date(order.orderDate || order.order_date).toLocaleDateString()}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Expected Delivery</Label>
              <p className="font-medium">
                {(order.requiredDate || order.expectedDeliveryDate || order.expected_delivery_date) ? new Date(order.requiredDate || order.expectedDeliveryDate || order.expected_delivery_date).toLocaleDateString() : 'Not set'}
              </p>
            </div>
          </div>
          {(order.shippingAddress || order.customer_address) && (
            <div>
              <Label className="text-muted-foreground">Delivery Address</Label>
              <p className="text-sm">{order.shippingAddress || order.customer_address}</p>
            </div>
          )}
          {order.notes && (
            <div>
              <Label className="text-muted-foreground">Notes</Label>
              <p className="text-sm">{order.notes}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
