import { useState } from 'react';
import { AppLayout } from '@/shared/components/layout/AppLayout';
import { Plus, FileText, CheckCircle, Clock, Package, XCircle, RefreshCw, AlertCircle } from 'lucide-react';
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
import { 
  usePurchaseOrders, 
  usePOStats, 
  useCreatePO, 
  useApprovePO, 
  useCancelPO,
  useSubmitPurchaseOrder,
  useRejectPO,
  useRecallPO
} from '@/features/inbound/hooks/usePurchaseOrders';
import { useSKUs } from '@/features/inventory/hooks/useSKUs';
import { useWarehouses } from '@/features/warehouse/hooks/useWarehouses';
import { useSuppliers } from '@/features/suppliers/hooks/useSuppliers';
import { useAuth } from '@/shared/contexts/AuthContext';
import { downloadPoPdf } from '@/features/inbound/lib/poPdf';
import { useNavigate } from 'react-router-dom';
import { safeParseInt, safeParseFloat } from '@/shared/utils/input';
import { cn } from '@/shared/lib/utils';

export default function PurchaseOrdersPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedPO, setSelectedPO] = useState<any>(null);
  
  // Rejection Dialog states
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);

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
  const submitPO = useSubmitPurchaseOrder();
  const rejectPO = useRejectPO();
  const recallPO = useRecallPO();

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; icon: any; className?: string }> = {
      draft: { variant: 'secondary', icon: FileText, className: 'bg-slate-100 text-slate-700 border-slate-200' },
      submitted: { variant: 'default', icon: Clock, className: 'bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100' },
      approved: { variant: 'default', icon: CheckCircle, className: 'bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100' },
      received: { variant: 'default', icon: Package, className: 'bg-green-100 text-green-700 border-green-200 hover:bg-green-100' },
      partially_received: { variant: 'default', icon: Package, className: 'bg-green-100 text-green-700 border-green-200 hover:bg-green-100' },
      fully_received: { variant: 'default', icon: CheckCircle, className: 'bg-green-100 text-green-700 border-green-200 hover:bg-green-100' },
      cancelled: { variant: 'destructive', icon: XCircle, className: 'bg-rose-100 text-rose-700 border-rose-200 hover:bg-rose-100' },
      rejected: { variant: 'destructive', icon: XCircle, className: 'bg-rose-100 text-rose-700 border-rose-200 hover:bg-rose-100' },
    };
    const config = variants[status] || variants.draft;
    const Icon = config.icon;
    return (
      <Badge variant={config.variant} className={cn("gap-1 font-medium px-2.5 py-0.5 rounded-full border", config.className)}>
        <Icon className="h-3 w-3" />
        {status.replace(/_/g, ' ')}
      </Badge>
    );
  };

  const handleRejectSubmit = () => {
    if (!rejectTargetId || !rejectReason.trim()) {
      toast({
        title: 'Error',
        description: 'Please provide a reason for rejection.',
        variant: 'destructive',
      });
      return;
    }
    rejectPO.mutate(
      { id: rejectTargetId, reason: rejectReason },
      {
        onSuccess: () => {
          setRejectDialogOpen(false);
          setRejectReason('');
          setRejectTargetId(null);
        },
      }
    );
  };

  return (
    <AppLayout title="Purchase Orders" breadcrumbs={[{ label: 'Inbound' }, { label: 'Purchase Orders' }]}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Purchase Orders</h1>
            <p className="text-muted-foreground">Manage supplier purchase orders and approvals</p>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)} className="bg-primary hover:bg-primary/90">
            <Plus className="h-4 w-4 mr-2" />
            Create PO
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card className="border border-slate-100 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Drafts</CardTitle>
              <FileText className="h-4 w-4 text-slate-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.draft || 0}</div>
            </CardContent>
          </Card>
          <Card className="border border-slate-100 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Submitted</CardTitle>
              <Clock className="h-4 w-4 text-slate-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">{stats?.submitted || 0}</div>
            </CardContent>
          </Card>
          <Card className="border border-slate-100 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Approved</CardTitle>
              <CheckCircle className="h-4 w-4 text-slate-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600">{stats?.approved || 0}</div>
            </CardContent>
          </Card>
          <Card className="border border-slate-100 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Received</CardTitle>
              <Package className="h-4 w-4 text-slate-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {(stats?.received || 0) + (stats?.fully_received || 0) + (stats?.partially_received || 0)}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border border-slate-100 shadow-sm">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle>Purchase Orders</CardTitle>
                <CardDescription>View, submit, and approve purchase orders</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="submitted">Submitted</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="received">Received</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
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
                <RefreshCw className="animate-spin h-8 w-8 text-primary" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PO Number</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Expected Delivery</TableHead>
                    <TableHead>Total Amount</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {posData?.data?.map((po: any) => (
                    <TableRow key={po.id} className="hover:bg-slate-50/50">
                      <TableCell className="font-semibold text-slate-900">{po.poNumber || po.po_number}</TableCell>
                      <TableCell>{po.supplier?.name || po.supplier_name || '-'}</TableCell>
                      <TableCell>{getStatusBadge(po.status)}</TableCell>
                      <TableCell>
                        {(() => {
                          const rawDate = po.expectedDate || po.expected_delivery;
                          if (!rawDate) return '-';
                          const dateObj = new Date(rawDate);
                          return isNaN(dateObj.getTime()) ? '-' : dateObj.toLocaleDateString('en-IN');
                        })()}
                      </TableCell>
                      <TableCell className="font-medium text-slate-900">₹{Number(po.totalAmount || po.total_amount || 0).toFixed(2)}</TableCell>
                      <TableCell>{po._count?.items || po.items?.length || po.purchase_order_items?.[0]?.count || 0}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5 items-center">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedPO(po)}
                          >
                            View
                          </Button>

                          {/* Draft / Rejected PO Actions */}
                          {(po.status === 'draft' || po.status === 'rejected') && (
                            <>
                              <Button
                                variant="default"
                                size="sm"
                                className="bg-primary hover:bg-primary/95 text-white"
                                onClick={() => submitPO.mutate(po.id)}
                              >
                                Submit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                                onClick={() => cancelPO.mutate(po.id)}
                              >
                                Cancel
                              </Button>
                            </>
                          )}

                          {/* Submitted PO Actions */}
                          {po.status === 'submitted' && (
                            <>
                              {isAdmin && (
                                <>
                                  <Button
                                    variant="default"
                                    size="sm"
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                    onClick={() => approvePO.mutate(po.id)}
                                  >
                                    Approve
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => {
                                      setRejectTargetId(po.id);
                                      setRejectDialogOpen(true);
                                    }}
                                  >
                                    Reject
                                  </Button>
                                </>
                              )}
                              {(!isAdmin && po.created_by === user?.id) && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => recallPO.mutate(po.id)}
                                >
                                  Recall to Draft
                                </Button>
                              )}
                            </>
                          )}

                          {/* Approved PO Actions */}
                          {po.status === 'approved' && (
                            <>
                              <Button
                                variant="default"
                                size="sm"
                                className="bg-indigo-600 hover:bg-indigo-700 text-white"
                                onClick={() => navigate('/inbound/grn')}
                              >
                                Create GRN
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => downloadPoPdf(po, { companyName: user?.fullName || 'VEERHA WMS' })}
                              >
                                PDF
                              </Button>
                            </>
                          )}

                          {/* Received / Fully Received Actions */}
                          {(po.status === 'received' || po.status === 'fully_received' || po.status === 'partially_received') && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => downloadPoPdf(po, { companyName: user?.fullName || 'VEERHA WMS' })}
                            >
                              PDF
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
              <div className="text-center py-12 text-slate-400">
                No purchase orders found. Create your first PO to get started.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Rejection Reason Input Dialog */}
        <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject Purchase Order</DialogTitle>
              <DialogDescription>Please provide a reason for rejecting this purchase order.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="reason">Reason for Rejection <span className="text-red-500">*</span></Label>
                <Textarea
                  id="reason"
                  placeholder="Enter rejection comments..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={4}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleRejectSubmit}>Reject PO</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
          <DialogDescription>View purchase order details and status</DialogDescription>
        </DialogHeader>
        
        {po.rejection_reason && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm flex gap-2 items-start">
            <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
            <div>
              <span className="font-semibold">Rejection Reason:</span> {po.rejection_reason}
            </div>
          </div>
        )}

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-muted-foreground">Supplier</Label>
              <p className="font-medium">{po.supplier?.name || po.supplier_name}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Status</Label>
              <div className="mt-1">
                <Badge className="capitalize">{po.status.replace(/_/g, ' ')}</Badge>
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground">Order Date</Label>
              <p className="font-medium">
                {(() => {
                  const rawDate = po.orderDate || po.order_date || po.created_at || po.createdAt;
                  if (!rawDate) return 'Not set';
                  const dateObj = new Date(rawDate);
                  return isNaN(dateObj.getTime()) ? 'Not set' : dateObj.toLocaleDateString('en-IN');
                })()}
              </p>
            </div>
            <div>
              <Label className="text-muted-foreground">Expected Delivery</Label>
              <p className="font-medium">
                {(() => {
                  const rawDate = po.expectedDate || po.expected_delivery;
                  if (!rawDate) return 'Not set';
                  const dateObj = new Date(rawDate);
                  return isNaN(dateObj.getTime()) ? 'Not set' : dateObj.toLocaleDateString('en-IN');
                })()}
              </p>
            </div>
          </div>
          
          {po.notes && (
            <div>
              <Label className="text-muted-foreground">Notes</Label>
              <p className="text-sm">{po.notes}</p>
            </div>
          )}

          {/* Line items details table */}
          {po.items && po.items.length > 0 && (
            <div className="space-y-2">
              <Label className="text-muted-foreground font-semibold">Ordered Items</Label>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU Code</TableHead>
                      <TableHead>SKU Name</TableHead>
                      <TableHead className="text-right">Qty Ordered</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Line Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {po.items.map((item: any) => {
                      const qty = item.quantity ?? item.quantity_ordered ?? 0;
                      const price = item.unitPrice ?? item.unit_price ?? 0;
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.skuCode || item.sku_code || '-'}</TableCell>
                          <TableCell>{item.skuName || item.sku_name || '-'}</TableCell>
                          <TableCell className="text-right">{qty}</TableCell>
                          <TableCell className="text-right">₹{price.toFixed(2)}</TableCell>
                          <TableCell className="text-right font-medium">₹{(qty * price).toFixed(2)}</TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
                      <TableCell colSpan={4} className="font-semibold text-right">Total Amount</TableCell>
                      <TableCell className="text-right font-bold text-slate-900">
                        ₹{Number(po.totalAmount || po.total_amount || 0).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
