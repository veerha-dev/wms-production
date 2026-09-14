import { useState } from 'react';
import { safeParseInt, safeParseFloat } from '@/shared/utils/input';
import { AppLayout } from '@/shared/components/layout/AppLayout';
import { Plus, Truck, Clock, Package, CheckCircle, XCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table';
import { useToast } from '@/shared/hooks/use-toast';
import { useShipments, usePendingShipments, useCreateShipment, useDispatchShipment, useMarkDelivered } from '@/features/outbound/hooks/useShipments';
import { useSalesOrders } from '@/features/outbound/hooks/useSalesOrders';
import { useWarehouses } from '@/features/warehouse/hooks/useWarehouses';

export default function ShipmentsPage() {
  const { toast } = useToast();
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedShipment, setSelectedShipment] = useState<any>(null);

  const { data: shipmentsData, isLoading } = useShipments({
    page,
    limit: 50,
    status: statusFilter === 'all' ? undefined : statusFilter,
  });
  const { data: pendingShipments } = usePendingShipments();
  const dispatchShipment = useDispatchShipment();
  const markDelivered = useMarkDelivered();

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; icon: any }> = {
      pending: { variant: 'secondary', icon: Clock },
      in_transit: { variant: 'default', icon: Truck },
      delivered: { variant: 'default', icon: CheckCircle },
      cancelled: { variant: 'destructive', icon: XCircle },
    };
    const config = variants[status] || variants.pending;
    const Icon = config.icon;
    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {status.replace(/_/g, ' ')}
      </Badge>
    );
  };

  return (
    <AppLayout title="Shipments" breadcrumbs={[{ label: 'Outbound' }, { label: 'Shipments' }]}>
      <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Shipments</h1>
          <p className="text-muted-foreground">Manage order dispatch and delivery</p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Shipment
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingShipments?.data?.length || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Transit</CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {shipmentsData?.data?.filter((s: any) => s.status === 'in_transit').length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Delivered</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {shipmentsData?.data?.filter((s: any) => s.status === 'delivered').length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Shipments</CardTitle>
              <CardDescription>View and manage all shipments</CardDescription>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in_transit">In Transit</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
              </SelectContent>
            </Select>
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
                  <TableHead>Shipment #</TableHead>
                  <TableHead>Order #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Carrier</TableHead>
                  <TableHead>Tracking</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Shipped Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shipmentsData?.data?.map((shipment: any) => (
                  <TableRow key={shipment.id}>
                    <TableCell className="font-medium">{shipment.shipmentNumber || shipment.shipment_number}</TableCell>
                    <TableCell>{shipment.salesOrder?.orderNumber || shipment.salesOrder?.soNumber || shipment.sales_orders?.order_number || '-'}</TableCell>
                    <TableCell>{shipment.salesOrder?.customer?.name || shipment.sales_orders?.customer_name || '-'}</TableCell>
                    <TableCell>{shipment.carrier || shipment.carrierName || shipment.carrier_name || '-'}</TableCell>
                    <TableCell>{shipment.trackingNumber || shipment.tracking_number || '-'}</TableCell>
                    <TableCell>{getStatusBadge(shipment.status)}</TableCell>
                    <TableCell>
                      {(shipment.dispatchDate || shipment.shipped_date) ? new Date(shipment.dispatchDate || shipment.shipped_date).toLocaleDateString() : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedShipment(shipment)}
                        >
                          View
                        </Button>
                        {shipment.status === 'pending' && (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => dispatchShipment.mutate(shipment.id)}
                          >
                            Dispatch
                          </Button>
                        )}
                        {shipment.status === 'in_transit' && (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => markDelivered.mutate(shipment.id)}
                          >
                            Mark Delivered
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {shipmentsData?.data?.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No shipments found. Create a shipment from a packed order.
            </div>
          )}
        </CardContent>
      </Card>

      <CreateShipmentDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />

      {selectedShipment && (
        <ShipmentDetailDialog
          shipment={selectedShipment}
          open={!!selectedShipment}
          onOpenChange={(open) => !open && setSelectedShipment(null)}
        />
      )}
      </div>
    </AppLayout>
  );
}

function CreateShipmentDialog({ open, onOpenChange }: any) {
  const [formData, setFormData] = useState({
    order_id: '',
    warehouse_id: '',
    carrier_name: '',
    tracking_number: '',
    vehicle_number: '',
    driver_name: '',
    driver_contact: '',
    total_packages: 1,
    total_weight: 0,
    notes: '',
  });

  // Only packed orders can be dispatched — a shipment booked before packing has
  // no weight or box dimensions, which is exactly what the courier prices on.
  const { data: ordersData } = useSalesOrders({ page: 0, limit: 100, status: 'ready_for_dispatch' });
  const { data: warehouses } = useWarehouses();
  const createShipment = useCreateShipment();

  const handleSubmit = () => {
    if (!formData.order_id || !formData.warehouse_id) {
      return;
    }
    createShipment.mutate(formData, {
      onSuccess: () => {
        onOpenChange(false);
        setFormData({
          order_id: '',
          warehouse_id: '',
          carrier_name: '',
          tracking_number: '',
          vehicle_number: '',
          driver_name: '',
          driver_contact: '',
          total_packages: 1,
          total_weight: 0,
          notes: '',
        });
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Shipment</DialogTitle>
          <DialogDescription>Create a new shipment for dispatch</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="order_id">Order *</Label>
              <Select value={formData.order_id} onValueChange={(v) => {
                const selectedSO = ordersData?.data?.find((o: any) => o.id === v);
                setFormData({
                  ...formData,
                  order_id: v,
                  warehouse_id: selectedSO?.warehouse_id || selectedSO?.warehouseId || formData.warehouse_id,
                });
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select order" />
                </SelectTrigger>
                <SelectContent>
                  {ordersData?.data?.map((order: any) => (
                    <SelectItem key={order.id} value={order.id}>
                      {order.orderNumber || order.soNumber || order.order_number} - {order.customer?.name || order.customer_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              {formData.order_id && formData.warehouse_id && (
                <p className="text-xs text-muted-foreground">Auto-selected from order</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="carrier_name">Carrier Name</Label>
              <Input
                id="carrier_name"
                value={formData.carrier_name}
                onChange={(e) => setFormData({ ...formData, carrier_name: e.target.value })}
                placeholder="e.g., Blue Dart, DTDC"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tracking_number">Tracking Number</Label>
              <Input
                id="tracking_number"
                value={formData.tracking_number}
                onChange={(e) => setFormData({ ...formData, tracking_number: e.target.value })}
                placeholder="Tracking number"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="vehicle_number">Vehicle Number</Label>
              <Input
                id="vehicle_number"
                value={formData.vehicle_number}
                onChange={(e) => setFormData({ ...formData, vehicle_number: e.target.value })}
                placeholder="e.g., MH-01-AB-1234"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="driver_name">Driver Name</Label>
              <Input
                id="driver_name"
                value={formData.driver_name}
                onChange={(e) => setFormData({ ...formData, driver_name: e.target.value })}
                placeholder="Driver name"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="driver_contact">Driver Contact</Label>
              <Input
                id="driver_contact"
                value={formData.driver_contact}
                onChange={(e) => setFormData({ ...formData, driver_contact: e.target.value })}
                placeholder="Phone number"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="total_packages">Total Packages</Label>
              <Input
                id="total_packages"
                type="number"
                min="1"
                value={formData.total_packages}
                onChange={(e) => setFormData({ ...formData, total_packages: safeParseInt(e.target.value, 1) })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="total_weight">Total Weight (kg)</Label>
              <Input
                id="total_weight"
                type="number"
                min="0"
                step="0.1"
                value={formData.total_weight}
                onChange={(e) => setFormData({ ...formData, total_weight: safeParseFloat(e.target.value, 0) })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Input
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Shipment notes"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={createShipment.isPending}>
            {createShipment.isPending ? 'Creating...' : 'Create Shipment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShipmentDetailDialog({ shipment, open, onOpenChange }: any) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Shipment: {shipment.shipmentNumber || shipment.shipment_number}</DialogTitle>
          <DialogDescription>View shipment details</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-muted-foreground">Order Number</Label>
              <p className="font-medium">{shipment.salesOrder?.orderNumber || shipment.salesOrder?.soNumber || shipment.sales_orders?.order_number}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Customer</Label>
              <p className="font-medium">{shipment.salesOrder?.customer?.name || shipment.sales_orders?.customer_name}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Carrier</Label>
              <p className="font-medium">{shipment.carrier || shipment.carrierName || shipment.carrier_name || '-'}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Tracking Number</Label>
              <p className="font-medium">{shipment.trackingNumber || shipment.tracking_number || '-'}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Status</Label>
              <div className="mt-1">
                <Badge>{shipment.status}</Badge>
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground">Shipped Date</Label>
              <p className="font-medium">
                {(shipment.dispatchDate || shipment.shipped_date) ? new Date(shipment.dispatchDate || shipment.shipped_date).toLocaleDateString() : '-'}
              </p>
            </div>
          </div>
          {shipment.notes && (
            <div>
              <Label className="text-muted-foreground">Notes</Label>
              <p className="text-sm">{shipment.notes}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
