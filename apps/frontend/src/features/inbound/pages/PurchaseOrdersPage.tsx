import { useState } from 'react';
import { AppLayout } from '@/shared/components/layout/AppLayout';
import { Plus, FileText, CheckCircle, Clock, Package, XCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table';
import { useToast } from '@/shared/hooks/use-toast';
import { usePurchaseOrders, usePOStats, useCreatePO, useApprovePO, useCancelPO } from '@/features/inbound/hooks/usePurchaseOrders';
import { useSKUs } from '@/features/inventory/hooks/useSKUs';
import { useWarehouses } from '@/features/warehouse/hooks/useWarehouses';
import { useSuppliers } from '@/features/suppliers/hooks/useSuppliers';
import { safeParseInt, safeParseFloat } from '@/shared/utils/input';

export default function PurchaseOrdersPage() {
  const { toast } = useToast();
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedPO, setSelectedPO] = useState<any>(null);

  const { data: posData, isLoading } = usePurchaseOrders({
    page,
    limit: 50,
    status: statusFilter === 'all' ? undefined : statusFilter,
    supplier: supplierFilter || undefined,
  });
  const { data: stats } = usePOStats();
  const createPO = useCreatePO();
  const approvePO = useApprovePO();
  const cancelPO = useCancelPO();

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; icon: any }> = {
      draft: { variant: 'secondary', icon: FileText },
      submitted: { variant: 'default', icon: Clock },
      approved: { variant: 'default', icon: CheckCircle },
      partially_received: { variant: 'default', icon: Package },
      fully_received: { variant: 'default', icon: CheckCircle },
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
    <AppLayout title="Purchase Orders" breadcrumbs={[{ label: 'Inbound' }, { label: 'Purchase Orders' }]}>
      <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Purchase Orders</h1>
          <p className="text-muted-foreground">Manage supplier purchase orders and receipts</p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create PO
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Draft</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.draft || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Submitted</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.submitted || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approved</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.approved || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Received</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.received || 0}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Purchase Orders</CardTitle>
              <CardDescription>View and manage all purchase orders</CardDescription>
            </div>
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="partially_received">Partially Received</SelectItem>
                  <SelectItem value="fully_received">Fully Received</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="Search supplier..."
                value={supplierFilter}
                onChange={(e) => setSupplierFilter(e.target.value)}
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
                  <TableHead>PO Number</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Order Date</TableHead>
                  <TableHead>Expected Delivery</TableHead>
                  <TableHead>Total Amount</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {posData?.data?.map((po: any) => (
                  <TableRow key={po.id}>
                    <TableCell className="font-medium">{po.poNumber || po.po_number}</TableCell>
                    <TableCell>{po.supplier?.name || po.supplier_name || '-'}</TableCell>
                    <TableCell>{getStatusBadge(po.status)}</TableCell>
                    <TableCell>{new Date(po.orderDate || po.order_date).toLocaleDateString()}</TableCell>
                    <TableCell>
                      {(po.expectedDate || po.expected_delivery) ? new Date(po.expectedDate || po.expected_delivery).toLocaleDateString() : '-'}
                    </TableCell>
                    <TableCell>₹{Number(po.totalAmount || po.total_amount || 0).toFixed(2)}</TableCell>
                    <TableCell>{po._count?.items || po.purchase_order_items?.[0]?.count || po.items?.length || 0}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedPO(po)}
                        >
                          View
                        </Button>
                        {po.status === 'submitted' && (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => approvePO.mutate(po.id)}
                          >
                            Approve
                          </Button>
                        )}
                        {po.status === 'draft' && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => cancelPO.mutate(po.id)}
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {posData?.data?.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No purchase orders found. Create your first PO to get started.
            </div>
          )}
        </CardContent>
      </Card>

      <CreatePODialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSubmit={(data) => {
          createPO.mutate(data, {
            onSuccess: () => setCreateDialogOpen(false),
          });
        }}
      />

      {selectedPO && (
        <PODetailDialog
          po={selectedPO}
          open={!!selectedPO}
          onOpenChange={(open) => !open && setSelectedPO(null)}
        />
      )}
      </div>
    </AppLayout>
  );
}

function CreatePODialog({ open, onOpenChange, onSubmit }: any) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    supplierId: '',
    warehouseId: '',
    expectedDate: '',
    notes: '',
    items: [{ skuId: '', quantity: 1, unitCost: 0, notes: '' }],
  });

  const { data: skus } = useSKUs();
  const { data: warehouses } = useWarehouses();
  const { data: suppliers } = useSuppliers();

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { skuId: '', quantity: 1, unitCost: 0, notes: '' }],
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
    if (!formData.supplierId || !formData.warehouseId || formData.items.length === 0) {
      toast({
        title: 'Missing Required Fields',
        description: 'Please select a supplier, warehouse, and add at least one line item.',
        variant: 'destructive',
      });
      return;
    }

    const hasEmptySku = formData.items.some(item => !item.skuId);
    if (hasEmptySku) {
      toast({
        title: 'Invalid Line Items',
        description: 'Please select an SKU for all line items.',
        variant: 'destructive',
      });
      return;
    }
    
    const payload = {
      supplierId: formData.supplierId,
      warehouseId: formData.warehouseId,
      expectedDate: formData.expectedDate ? new Date(formData.expectedDate).toISOString() : undefined,
      notes: formData.notes || undefined,
      items: formData.items.map(item => ({
        skuId: item.skuId,
        quantity: item.quantity,
        unitCost: item.unitCost,
        notes: item.notes || undefined,
      })),
    };
    
    onSubmit(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Purchase Order</DialogTitle>
          <DialogDescription>Add a new purchase order from a supplier</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="supplierId">Supplier *</Label>
              <Select value={formData.supplierId} onValueChange={(v) => setFormData({ ...formData, supplierId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers?.map((supplier: any) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name} {supplier.code ? `(${supplier.code})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="warehouseId">Warehouse *</Label>
              <Select value={formData.warehouseId} onValueChange={(v) => setFormData({ ...formData, warehouseId: v })}>
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
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="expectedDate">Expected Delivery</Label>
              <Input
                id="expectedDate"
                type="date"
                value={formData.expectedDate}
                onChange={(e) => setFormData({ ...formData, expectedDate: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Line Items *</Label>
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
                    <Select value={item.skuId} onValueChange={(v) => updateItem(index, 'skuId', v)}>
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
                      value={item.quantity}
                      onChange={(e) => updateItem(index, 'quantity', safeParseInt(e.target.value, 1))}
                    />
                  </div>
                  <div className="w-32 space-y-2">
                    <Label>Unit Cost</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unitCost}
                      onChange={(e) => updateItem(index, 'unitCost', safeParseFloat(e.target.value, 0))}
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
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit}>Create Purchase Order</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PODetailDialog({ po, open, onOpenChange }: any) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Purchase Order: {po.poNumber || po.po_number}</DialogTitle>
          <DialogDescription>View purchase order details</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-muted-foreground">Supplier</Label>
              <p className="font-medium">{po.supplier?.name || po.supplier_name}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Status</Label>
              <div className="mt-1">
                <Badge>{po.status}</Badge>
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground">Order Date</Label>
              <p className="font-medium">{new Date(po.orderDate || po.order_date).toLocaleDateString()}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Expected Delivery</Label>
              <p className="font-medium">
                {(po.expectedDate || po.expected_delivery) ? new Date(po.expectedDate || po.expected_delivery).toLocaleDateString() : 'Not set'}
              </p>
            </div>
          </div>
          {po.notes && (
            <div>
              <Label className="text-muted-foreground">Notes</Label>
              <p className="text-sm">{po.notes}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
