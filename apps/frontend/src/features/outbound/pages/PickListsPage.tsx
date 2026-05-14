import { useState } from 'react';
import { safeParseInt } from '@/shared/utils/input';
import { AppLayout } from '@/shared/components/layout/AppLayout';
import { Plus, ListChecks, Clock, Package, CheckCircle, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table';
import { Progress } from '@/shared/components/ui/progress';
import { useToast } from '@/shared/hooks/use-toast';
import { usePickLists, usePickList, usePendingPicks, useGeneratePickList, useStartPicking, useRecordPick, useCompletePicking } from '@/features/outbound/hooks/usePickLists';
import { useSalesOrders } from '@/features/outbound/hooks/useSalesOrders';
import { useWarehouses } from '@/features/warehouse/hooks/useWarehouses';
import { useUsers } from '@/features/users/hooks/useUsers';

export default function PickListsPage() {
  const { toast } = useToast();
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [selectedPickList, setSelectedPickList] = useState<string | null>(null);

  const [strategyFilter, setStrategyFilter] = useState<string>('all');
  const { data: pickListsData, isLoading } = usePickLists({
    page: page + 1, limit: 50,
    status: statusFilter === 'all' ? undefined : statusFilter,
    strategy: strategyFilter === 'all' ? undefined : strategyFilter,
  });
  const { data: pendingPicks } = usePendingPicks();

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; icon: any }> = {
      pending: { variant: 'secondary', icon: Clock },
      in_progress: { variant: 'default', icon: Package },
      completed: { variant: 'default', icon: CheckCircle },
      cancelled: { variant: 'destructive', icon: AlertCircle },
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
    <AppLayout title="Pick Lists" breadcrumbs={[{ label: 'Outbound' }, { label: 'Pick Lists' }]}>
      <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Pick Lists</h1>
          <p className="text-muted-foreground">Manage warehouse picking operations</p>
        </div>
        <Button onClick={() => setGenerateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Generate Pick List
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingPicks?.length || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {pickListsData?.data?.filter((p: any) => p.status === 'in_progress').length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {pickListsData?.data?.filter((p: any) => p.status === 'completed').length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Pick Lists</CardTitle>
              <CardDescription>View and execute picking tasks</CardDescription>
            </div>
            <div className="flex gap-2">
              <Select value={strategyFilter} onValueChange={setStrategyFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Strategy" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Strategies</SelectItem>
                  <SelectItem value="single">Single Order</SelectItem>
                  <SelectItem value="batch">Batch</SelectItem>
                  <SelectItem value="wave">Wave</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
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
                  <TableHead>Pick List #</TableHead>
                  <TableHead>Strategy</TableHead>
                  <TableHead>Warehouse</TableHead>
                  <TableHead>Picker</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pickListsData?.data?.map((pickList: any) => (
                  <TableRow key={pickList.id}>
                    <TableCell className="font-medium">{pickList.pickListNumber || pickList.pick_list_number}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={pickList.strategy === 'batch' ? 'bg-purple-50 text-purple-700 border-purple-200' : pickList.strategy === 'wave' ? 'bg-blue-50 text-blue-700 border-blue-200' : ''}>
                        {pickList.strategy || 'single'}
                      </Badge>
                    </TableCell>
                    <TableCell>{pickList.warehouseName || pickList.warehouse?.name || '-'}</TableCell>
                    <TableCell>{(pickList.assignedToId || pickList.picker_id) ? 'Assigned' : 'Unassigned'}</TableCell>
                    <TableCell>{getStatusBadge(pickList.status)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={((pickList.picked_items || pickList._count?.items || 0) / Math.max(1, pickList.total_items || pickList._count?.items || 1)) * 100} className="w-20" />
                        <span className="text-sm text-muted-foreground">
                          {pickList.picked_items || 0}/{pickList.total_items || pickList._count?.items || 0}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={pickList.priority === 'urgent' ? 'destructive' : 'secondary'}>
                        {pickList.priority || 'medium'}
                      </Badge>
                    </TableCell>
                    <TableCell>{new Date(pickList.createdAt || pickList.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedPickList(pickList.id)}
                      >
                        {pickList.status === 'completed' ? 'View' : pickList.status === 'pending' ? 'Start' : 'Continue'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {pickListsData?.data?.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No pick lists found. Generate a pick list from confirmed orders.
            </div>
          )}
        </CardContent>
      </Card>

      <GeneratePickListDialog
        open={generateDialogOpen}
        onOpenChange={setGenerateDialogOpen}
      />

      {selectedPickList && (
        <PickingExecutionDialog
          pickListId={selectedPickList}
          open={!!selectedPickList}
          onOpenChange={(open) => !open && setSelectedPickList(null)}
        />
      )}
      </div>
    </AppLayout>
  );
}

function GeneratePickListDialog({ open, onOpenChange }: any) {
  const [strategy, setStrategy] = useState<string>('single');
  const [formData, setFormData] = useState({
    orderIds: [] as string[],
    warehouseId: '',
    assignedTo: '',
    priority: 'medium',
    batchSize: 10,
  });

  const { data: ordersData } = useSalesOrders({ status: 'confirmed', limit: 100 });
  const { data: warehouses } = useWarehouses();
  const { data: users } = useUsers();
  const generatePickList = useGeneratePickList();

  const handleSubmit = () => {
    if (formData.orderIds.length === 0 || !formData.warehouseId) return;
    generatePickList.mutate({
      strategy,
      orderIds: formData.orderIds,
      warehouseId: formData.warehouseId,
      assignedTo: formData.assignedTo || undefined,
      priority: formData.priority,
      batchSize: strategy === 'batch' ? formData.batchSize : undefined,
    }, {
      onSuccess: () => {
        onOpenChange(false);
        setFormData({ orderIds: [], warehouseId: '', assignedTo: '', priority: 'medium', batchSize: 10 });
        setStrategy('single');
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Generate Pick List</DialogTitle>
          <DialogDescription>Create a new pick list from confirmed orders</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* Strategy Selector */}
          <div className="flex gap-2 border rounded-lg p-1 bg-muted/30">
            <Button variant={strategy === 'single' ? 'default' : 'ghost'} size="sm" className="flex-1" onClick={() => setStrategy('single')}>Single Order</Button>
            <Button variant={strategy === 'batch' ? 'default' : 'ghost'} size="sm" className="flex-1" onClick={() => setStrategy('batch')}>Batch Picking</Button>
            <Button variant={strategy === 'wave' ? 'default' : 'ghost'} size="sm" className="flex-1" onClick={() => setStrategy('wave')} disabled>Wave (Phase 2)</Button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Warehouse *</Label>
              <Select value={formData.warehouseId} onValueChange={(v) => setFormData({ ...formData, warehouseId: v })}>
                <SelectTrigger><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                <SelectContent>
                  {warehouses?.map((wh: any) => (
                    <SelectItem key={wh.id} value={wh.id}>{wh.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Assign Picker</Label>
              <Select value={formData.assignedTo || 'none'} onValueChange={(v) => setFormData({ ...formData, assignedTo: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="Assign later" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Assign later</SelectItem>
                  {(users?.data || users || [])?.map((user: any) => (
                    <SelectItem key={user.id} value={user.id}>{user.fullName || user.full_name || user.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className={`grid gap-4 ${strategy === 'batch' ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <div className="space-y-2">
              <Label>Priority</Label>
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
          {strategy === 'batch' && (
            <div className="space-y-2">
              <Label>Batch Size</Label>
              <Input type="number" min={2} max={50} value={formData.batchSize} onChange={e => setFormData({ ...formData, batchSize: parseInt(e.target.value) || 10 })} />
              <p className="text-xs text-muted-foreground">Max orders per batch</p>
            </div>
          )}
          </div>
          <div className="space-y-2">
            <Label>Select Orders * {strategy === 'single' ? '(pick one)' : '(select multiple)'}</Label>
            <div className="border rounded-lg p-4 max-h-60 overflow-y-auto space-y-2">
              {ordersData?.data?.filter((o: any) => (o.warehouseId || o.warehouse_id) === formData.warehouseId || !formData.warehouseId).map((order: any) => (
                <label key={order.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted p-2 rounded">
                  <input
                    type="checkbox"
                    checked={formData.orderIds.includes(order.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormData({ ...formData, orderIds: [...formData.orderIds, order.id] });
                      } else {
                        setFormData({ ...formData, orderIds: formData.orderIds.filter(id => id !== order.id) });
                      }
                    }}
                    className="h-4 w-4"
                  />
                  <span className="text-sm">
                    {order.orderNumber || order.soNumber || order.order_number} - {order.customer?.name || order.customer_name} ({order._count?.items || order.total_items || 0} items)
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={generatePickList.isPending}>
            {generatePickList.isPending ? 'Generating...' : 'Generate Pick List'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PickingExecutionDialog({ pickListId, open, onOpenChange }: any) {
  const { data: pickList, isLoading } = usePickList(pickListId);
  const startPicking = useStartPicking();
  const recordPick = useRecordPick();
  const completePicking = useCompletePicking();

  const handleStart = () => {
    startPicking.mutate(pickListId);
  };

  const handleRecordPick = (itemId: string, quantity: number, binId: string, skuId: string) => {
    recordPick.mutate({ itemId, quantity, binId, skuId });
  };

  const handleComplete = () => {
    completePicking.mutate(pickListId, {
      onSuccess: () => onOpenChange(false),
    });
  };

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-6xl">
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const isPending = pickList?.status === 'pending';
  const isCompleted = pickList?.status === 'completed';
  const totalItems = pickList?.total_items || pickList?.items?.length || 0;
  const pickedItems = pickList?.picked_items || 0;
  const progress = totalItems > 0 ? (pickedItems / totalItems) * 100 : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pick List: {pickList?.pickListNumber || pickList?.pick_list_number}</DialogTitle>
          <DialogDescription>
            Status: {pickList?.status} | Progress: {pickedItems}/{totalItems} items
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Progress value={progress} className="flex-1" />
            <span className="text-sm font-medium">{Math.round(progress)}%</span>
          </div>

          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bin</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Tote</TableHead>
                  <TableHead>Required</TableHead>
                  <TableHead>Picked</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(pickList?.items || pickList?.pick_list_items)?.map((item: any) => (
                  <PickListItemRow
                    key={item.id}
                    item={item}
                    isPending={isPending}
                    isCompleted={isCompleted}
                    onRecordPick={handleRecordPick}
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
          {isPending && (
            <Button onClick={handleStart} disabled={startPicking.isPending}>
              {startPicking.isPending ? 'Starting...' : 'Start Picking'}
            </Button>
          )}
          {!isCompleted && !isPending && (
            <Button onClick={handleComplete} disabled={completePicking.isPending}>
              {completePicking.isPending ? 'Completing...' : 'Complete Pick List'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PickListItemRow({ item, isPending, isCompleted, onRecordPick }: any) {
  const [pickedQty, setPickedQty] = useState(item.picked_quantity || 0);

  const handlePick = () => {
    onRecordPick(item.id, pickedQty, item.bin_id, item.sku_id);
  };

  return (
    <TableRow>
      <TableCell className="font-bold text-lg">{item.bin?.code || item.bins?.code || '-'}</TableCell>
      <TableCell>
        <div>
          <p className="font-medium">{item.sku?.skuCode || item.skus?.sku_code || '-'}</p>
          <p className="text-sm text-muted-foreground">{item.sku?.name || item.skus?.name || '-'}</p>
        </div>
      </TableCell>
      <TableCell className="text-sm">{item.salesOrder?.orderNumber || item.salesOrder?.soNumber || item.soNumber || item.sales_order_items?.sales_orders?.order_number || '-'}</TableCell>
      <TableCell>
        {item.toteCode ? (
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">{item.toteCode}</Badge>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </TableCell>
      <TableCell>{item.quantityRequired || item.required_quantity || 0}</TableCell>
      <TableCell>
        <Input
          type="number"
          min="0"
          max={item.required_quantity}
          value={pickedQty}
          onChange={(e) => setPickedQty(parseInt(e.target.value) || 0)}
          disabled={isPending || isCompleted || item.status === 'picked'}
          className="w-20"
        />
      </TableCell>
      <TableCell>
        <Badge variant={item.status === 'picked' ? 'default' : item.status === 'short' ? 'destructive' : 'secondary'}>
          {item.status}
        </Badge>
      </TableCell>
      <TableCell>
        {!isPending && !isCompleted && item.status === 'pending' && (
          <Button size="sm" onClick={handlePick}>
            Mark Picked
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}
