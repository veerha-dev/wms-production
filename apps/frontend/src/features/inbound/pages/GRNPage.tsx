import { useState } from 'react';
import { AppLayout } from '@/shared/components/layout/AppLayout';
import { Plus, Package, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table';
import { useToast } from '@/shared/hooks/use-toast';
import { useGRNs, useGRN, useCreateGRN, useUpdateGRNItem, useCompleteGRN } from '@/features/inbound/hooks/useGRN';
import { usePurchaseOrders } from '@/features/inbound/hooks/usePurchaseOrders';
import { useWarehouses } from '@/features/warehouse/hooks/useWarehouses';
import { useBins } from '@/features/warehouse/hooks/useBins';
import { safeParseInt } from '@/shared/utils/input';
import { cn } from '@/shared/lib/utils';

export default function GRNPage() {
  const { toast } = useToast();
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedGRN, setSelectedGRN] = useState<string | null>(null);

  const { data: grnsData, isLoading } = useGRNs({
    page,
    limit: 50,
    status: statusFilter === 'all' ? undefined : statusFilter,
  });

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; icon: any; className?: string }> = {
      draft: { variant: 'secondary', icon: Clock, className: 'bg-slate-100 text-slate-700 border-slate-200' },
      submitted: { variant: 'default', icon: Clock, className: 'bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100' },
      in_progress: { variant: 'default', icon: Package, className: 'bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100' },
      completed: { variant: 'default', icon: CheckCircle, className: 'bg-green-100 text-green-700 border-green-200 hover:bg-green-100' },
      approved: { variant: 'default', icon: CheckCircle, className: 'bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100' },
      cancelled: { variant: 'destructive', icon: AlertCircle, className: 'bg-rose-100 text-rose-700 border-rose-200 hover:bg-rose-100' },
      rejected: { variant: 'destructive', icon: AlertCircle, className: 'bg-rose-100 text-rose-700 border-rose-200 hover:bg-rose-100' },
    };
    const config = variants[status] || variants.draft;
    const Icon = config.icon;
    return (
      <Badge variant={config.variant} className={cn("gap-1 font-medium px-2 py-0.5 rounded-full border", config.className)}>
        <Icon className="h-3 w-3" />
        {status.replace(/_/g, ' ')}
      </Badge>
    );
  };

  return (
    <AppLayout title="Goods Receipt Notes" breadcrumbs={[{ label: 'Inbound', href: '/purchase-orders' }, { label: 'GRN' }]}>
      <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Goods Receipt Notes</h1>
          <p className="text-muted-foreground">Receive and process incoming goods from suppliers</p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create GRN
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Goods Receipt Notes</CardTitle>
              <CardDescription>View and process all GRNs</CardDescription>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
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
                  <TableHead>GRN Number</TableHead>
                  <TableHead>PO Number</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Received Date</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grnsData?.data?.map((grn: any) => (
                  <TableRow key={grn.id}>
                    <TableCell className="font-medium">{grn.grnNumber || grn.grn_number}</TableCell>
                    <TableCell>{grn.purchaseOrder?.poNumber || grn.purchase_orders?.po_number || '-'}</TableCell>
                    <TableCell>{grn.purchaseOrder?.supplier?.name || grn.purchase_orders?.supplier_name || '-'}</TableCell>
                    <TableCell>{getStatusBadge(grn.status)}</TableCell>
                    <TableCell>{new Date(grn.receivedDate || grn.received_date).toLocaleDateString()}</TableCell>
                    <TableCell>{grn._count?.items || grn.items?.length || grn.grn_items?.[0]?.count || 0}</TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedGRN(grn.id)}
                      >
                        {grn.status === 'completed' ? 'View' : 'Process'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {grnsData?.data?.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No GRNs found. Create a GRN from an approved purchase order.
            </div>
          )}
        </CardContent>
      </Card>

      <CreateGRNDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />

      {selectedGRN && (
        <GRNProcessDialog
          grnId={selectedGRN}
          open={!!selectedGRN}
          onOpenChange={(open) => !open && setSelectedGRN(null)}
        />
      )}
      </div>
    </AppLayout>
  );
}

function CreateGRNDialog({ open, onOpenChange }: any) {
  const [formData, setFormData] = useState({
    purchase_order_id: '',
    warehouse_id: '',
    received_date: new Date().toISOString().split('T')[0],
    dock_door: '',
    vehicle_number: '',
    notes: '',
  });

  const { data: posData } = usePurchaseOrders({ status: 'approved', limit: 100 });
  const { data: warehouses } = useWarehouses();
  const createGRN = useCreateGRN();

  const handleSubmit = () => {
    if (!formData.purchase_order_id || !formData.warehouse_id) {
      return;
    }
    createGRN.mutate(formData, {
      onSuccess: () => {
        onOpenChange(false);
        setFormData({
          purchase_order_id: '',
          warehouse_id: '',
          received_date: new Date().toISOString().split('T')[0],
          dock_door: '',
          vehicle_number: '',
          notes: '',
        });
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Goods Receipt Note</DialogTitle>
          <DialogDescription>Create a new GRN from an approved purchase order</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="purchase_order_id">Purchase Order *</Label>
            <Select value={formData.purchase_order_id} onValueChange={(v) => setFormData({ ...formData, purchase_order_id: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Select approved PO" />
              </SelectTrigger>
              <SelectContent>
                {posData?.data?.map((po: any) => (
                  <SelectItem key={po.id} value={po.id}>
                    {po.poNumber || po.po_number} - {po.supplier?.name || po.supplier_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
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
            <div className="space-y-2">
              <Label htmlFor="received_date">Received Date</Label>
              <Input
                id="received_date"
                type="date"
                value={formData.received_date}
                onChange={(e) => setFormData({ ...formData, received_date: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dock_door">Dock Door</Label>
              <Input
                id="dock_door"
                value={formData.dock_door}
                onChange={(e) => setFormData({ ...formData, dock_door: e.target.value })}
                placeholder="e.g., Door 3"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vehicle_number">Vehicle Number</Label>
              <Input
                id="vehicle_number"
                value={formData.vehicle_number}
                onChange={(e) => setFormData({ ...formData, vehicle_number: e.target.value })}
                placeholder="e.g., MH-01-AB-1234"
              />
            </div>
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
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={createGRN.isPending}>
            {createGRN.isPending ? 'Creating...' : 'Create GRN'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GRNProcessDialog({ grnId, open, onOpenChange }: any) {
  const { data: grn, isLoading } = useGRN(grnId);
  const { data: bins } = useBins();
  const updateGRNItem = useUpdateGRNItem();
  const completeGRN = useCompleteGRN();

  const handleItemUpdate = (itemId: string, updates: any) => {
    updateGRNItem.mutate({ id: grnId, itemId, ...updates });
  };

  const handleComplete = () => {
    completeGRN.mutate(grnId, {
      onSuccess: () => onOpenChange(false),
    });
  };

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl">
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const isCompleted = grn?.status === 'completed';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>GRN: {grn?.grnNumber || grn?.grn_number}</DialogTitle>
          <DialogDescription>
            PO: {grn?.purchaseOrder?.poNumber || grn?.purchase_orders?.po_number} | Supplier: {grn?.purchaseOrder?.supplier?.name || grn?.purchase_orders?.supplier_name}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-4 text-sm">
            <div>
              <Label className="text-muted-foreground">Status</Label>
              <div className="mt-1">
                <Badge>{grn?.status}</Badge>
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground">Received Date</Label>
              <p className="font-medium">{new Date(grn?.receivedDate || grn?.received_date).toLocaleDateString()}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Dock Door</Label>
              <p className="font-medium">{grn?.dockDoor || grn?.dock_door || '-'}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Vehicle</Label>
              <p className="font-medium">{grn?.vehicleNumber || grn?.vehicle_number || '-'}</p>
            </div>
          </div>

          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Expected</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead>Rejected</TableHead>
                  <TableHead>Condition</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead>Bin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(grn?.items || grn?.grn_items)?.map((item: any) => (
                  <GRNItemRow
                    key={item.id}
                    item={item}
                    bins={bins}
                    isCompleted={isCompleted}
                    onUpdate={handleItemUpdate}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {isCompleted ? 'Close' : 'Cancel'}
          </Button>
          {!isCompleted && (
            <Button onClick={handleComplete} disabled={completeGRN.isPending}>
              {completeGRN.isPending ? 'Completing...' : 'Complete GRN'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GRNItemRow({ item, bins, isCompleted, onUpdate }: any) {
  const [localItem, setLocalItem] = useState({
    received_quantity: item.received_quantity || 0,
    rejected_quantity: item.rejected_quantity || 0,
    condition: item.condition || 'good',
    batch_number: item.batch_number || '',
    expiry_date: item.expiry_date || '',
    bin_id: item.bin_id || '',
  });

  const handleBlur = (field: string) => {
    if (localItem[field as keyof typeof localItem] !== item[field]) {
      onUpdate(item.id, { [field]: localItem[field as keyof typeof localItem] });
    }
  };

  return (
    <TableRow>
      <TableCell className="font-medium">
        {item.sku?.skuCode || item.skus?.sku_code || '-'} - {item.sku?.name || item.skus?.name || '-'}
      </TableCell>
      <TableCell>{item.quantityReceived || item.expected_quantity || 0}</TableCell>
      <TableCell>
        <Input
          type="number"
          min="0"
          value={localItem.received_quantity}
          onChange={(e) => setLocalItem({ ...localItem, received_quantity: safeParseInt(e.target.value, 0) })}
          onBlur={() => handleBlur('received_quantity')}
          disabled={isCompleted}
          className="w-20"
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          min="0"
          value={localItem.rejected_quantity}
          onChange={(e) => setLocalItem({ ...localItem, rejected_quantity: safeParseInt(e.target.value, 0) })}
          onBlur={() => handleBlur('rejected_quantity')}
          disabled={isCompleted}
          className="w-20"
        />
      </TableCell>
      <TableCell>
        <Select
          value={localItem.condition}
          onValueChange={(v) => {
            setLocalItem({ ...localItem, condition: v });
            onUpdate(item.id, { condition: v });
          }}
          disabled={isCompleted}
        >
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="good">Good</SelectItem>
            <SelectItem value="damaged">Damaged</SelectItem>
            <SelectItem value="short">Short</SelectItem>
            <SelectItem value="excess">Excess</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Input
          value={localItem.batch_number}
          onChange={(e) => setLocalItem({ ...localItem, batch_number: e.target.value })}
          onBlur={() => handleBlur('batch_number')}
          disabled={isCompleted}
          placeholder="Batch"
          className="w-28"
        />
      </TableCell>
      <TableCell>
        <Input
          type="date"
          value={localItem.expiry_date}
          onChange={(e) => setLocalItem({ ...localItem, expiry_date: e.target.value })}
          onBlur={() => handleBlur('expiry_date')}
          disabled={isCompleted}
          className="w-36"
        />
      </TableCell>
      <TableCell>
        <Select
          value={localItem.bin_id}
          onValueChange={(v) => {
            setLocalItem({ ...localItem, bin_id: v });
            onUpdate(item.id, { bin_id: v });
          }}
          disabled={isCompleted}
        >
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Select bin" />
          </SelectTrigger>
          <SelectContent>
            {bins?.map((bin: any) => (
              <SelectItem key={bin.id} value={bin.id}>
                {bin.code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
    </TableRow>
  );
}
