import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useIsMutating } from '@tanstack/react-query';
import { AppLayout } from '@/shared/components/layout/AppLayout';
import {
  Package, Search, CheckCircle2, Plus, ArrowLeft, Trash2, Printer, ScanLine, AlertTriangle,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/shared/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table';
import { Progress } from '@/shared/components/ui/progress';
import { Separator } from '@/shared/components/ui/separator';
import { toast } from 'sonner';
import { useAuth } from '@/shared/contexts/AuthContext';
import { useWarehouses } from '@/features/warehouse/hooks/useWarehouses';
import {
  usePackableOrders, usePackingOrder, useStartPacking, usePackScan, useSetPackedQuantity,
  useAssignItemPackage, useAddPackage, useUpdatePackage, useRemovePackage,
  useSetShippingLabel, useMarkLabelPrinted, useCompletePacking,
  type PackingOrderView, type PackingPackage,
} from '@/features/outbound/hooks/usePacking';

const ORDER_STATUS_LABEL: Record<string, string> = {
  picked: 'Ready to Pack',
  packing: 'Packing',
  packed: 'Packed',
  ready_for_dispatch: 'Ready for Dispatch',
};

export default function PackingPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedOrderId = searchParams.get('order');

  const selectOrder = (id: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set('order', id);
    else next.delete('order');
    setSearchParams(next, { replace: true });
  };

  return (
    <AppLayout title="Packing Station" breadcrumbs={[{ label: 'Outbound' }, { label: 'Packing' }]}>
      {selectedOrderId ? (
        <PackingWorkScreen orderId={selectedOrderId} onBack={() => selectOrder(null)} />
      ) : (
        <OrderQueue onSelect={selectOrder} />
      )}
    </AppLayout>
  );
}

/* ── Screen 1 — select an order to pack ──────────────────────────────────── */

function OrderQueue({ onSelect }: { onSelect: (id: string) => void }) {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [warehouseId, setWarehouseId] = useState<string>('all');

  const { data: warehousesData } = useWarehouses();
  const warehouses = warehousesData?.data ?? [];

  // A manager is scoped server-side anyway; showing them a filter they cannot
  // act on is just a control that does nothing.
  const showWarehouseFilter = user?.role !== 'manager' && warehouses.length > 1;

  const { data, isLoading, isError, refetch } = usePackableOrders({
    search: search.trim() || undefined,
    warehouseId: warehouseId === 'all' ? undefined : warehouseId,
  });

  const orders = data?.data ?? [];
  const startPacking = useStartPacking();

  const handleStart = (orderId: string) => {
    startPacking.mutate(orderId, { onSuccess: () => onSelect(orderId) });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Packing Station</h1>
          <p className="text-muted-foreground">Pack picked orders into boxes and label them for dispatch</p>
        </div>
        <Package className="h-8 w-8 text-muted-foreground shrink-0" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Select Order to Pack</CardTitle>
          <CardDescription>Orders that have finished picking and are waiting to be packed</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="packing-search"
                placeholder="Search by order number or customer…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            {showWarehouseFilter && (
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger className="w-full sm:w-56" id="packing-warehouse-filter">
                  <SelectValue placeholder="All warehouses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All warehouses</SelectItem>
                  {warehouses.map((w: any) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {isError ? (
            <div className="py-10 text-center">
              <p className="text-muted-foreground">Could not load the packing queue.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>Try again</Button>
            </div>
          ) : isLoading ? (
            <div className="py-10 text-center text-muted-foreground">Loading orders…</div>
          ) : orders.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              No orders are waiting to be packed. Complete a pick list first.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order Number</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Items</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order: any) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">{order.soNumber}</TableCell>
                      <TableCell>{order.customerName || '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{order.itemCount}</TableCell>
                      <TableCell>
                        <Badge variant={order.status === 'picked' ? 'default' : 'secondary'}>
                          {ORDER_STATUS_LABEL[order.status] ?? order.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          onClick={() => handleStart(order.id)}
                          disabled={startPacking.isPending}
                        >
                          {order.status === 'picked' ? 'Start Packing' : 'Resume'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Screen 2 — the packing work screen ──────────────────────────────────── */

function PackingWorkScreen({ orderId, onBack }: { orderId: string; onBack: () => void }) {
  const { data, isLoading, isError, refetch } = usePackingOrder(orderId);

  if (isLoading) {
    return <div className="py-16 text-center text-muted-foreground">Loading order…</div>;
  }
  if (isError || !data) {
    return (
      <div className="py-16 text-center">
        <p className="text-muted-foreground">Could not load this order.</p>
        <div className="mt-3 flex justify-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>Try again</Button>
          <Button variant="ghost" size="sm" onClick={onBack}>Back to list</Button>
        </div>
      </div>
    );
  }

  return <PackingWorkbench view={data} orderId={orderId} onBack={onBack} />;
}

function PackingWorkbench({
  view, orderId, onBack,
}: { view: PackingOrderView; orderId: string; onBack: () => void }) {
  const { order, session, items, packages, boxes, summary } = view;

  const [scan, setScan] = useState('');
  const scanRef = useRef<HTMLInputElement>(null);

  const scanItem = usePackScan(orderId);
  const setQuantity = useSetPackedQuantity(orderId);
  const assignPackage = useAssignItemPackage(orderId);
  const addPackage = useAddPackage(orderId);
  const completePacking = useCompletePacking(orderId);

  /*
   * A weight typed into a box commits on blur, and clicking Complete Packing is
   * what blurs it — so the save and the completion fire in the same tick. Without
   * this the packer can be told "package 1 has no weight" while looking straight
   * at the weight they just typed. Hold the button until every pending write lands.
   */
  const pendingWrites = useIsMutating();

  // The bench is a scanning station: focus belongs in the scan field between
  // every beep, or a wedge scanner types into nothing.
  useEffect(() => {
    scanRef.current?.focus();
  }, [items.length]);

  const submitScan = () => {
    const value = scan.trim();
    if (!value || scanItem.isPending) return;
    scanItem.mutate({ barcode: value }, { onSettled: () => { setScan(''); scanRef.current?.focus(); } });
  };

  const packedPct = summary.totalPickedUnits > 0
    ? Math.round((summary.totalPackedUnits / summary.totalPickedUnits) * 100)
    : 0;

  const isComplete = session?.status === 'ready_for_dispatch';

  return (
    <div className="space-y-6">
      {/* Part one — order information */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{order.soNumber}</h1>
            <Badge variant={isComplete ? 'default' : 'secondary'}>
              {ORDER_STATUS_LABEL[order.status] ?? order.status}
            </Badge>
          </div>
          <p className="text-muted-foreground">{order.customerName || 'Customer'}</p>
          {order.shippingAddress && (
            <p className="mt-0.5 max-w-prose text-sm text-muted-foreground">{order.shippingAddress}</p>
          )}
        </div>
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to List
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile label="Items to pack" value={String(summary.totalItems)} />
        <StatTile label="Units packed" value={`${summary.totalPackedUnits}/${summary.totalPickedUnits}`} />
        <StatTile label="Packages" value={String(summary.packageCount)} />
        <StatTile label="Total weight" value={summary.totalWeightKg ? `${summary.totalWeightKg} kg` : '—'} />
      </div>

      <Progress value={packedPct} aria-label={`${packedPct}% packed`} />

      {/* Part two — items to pack */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Items to Pack</CardTitle>
          <CardDescription>
            Scan each item as it goes into the box. Scanning is the check that stops the wrong
            product reaching the customer.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isComplete && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <ScanLine className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="packing-scan"
                  ref={scanRef}
                  value={scan}
                  onChange={(e) => setScan(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitScan(); } }}
                  placeholder="Scan item barcode…"
                  className="pl-8 text-base"
                  autoComplete="off"
                />
              </div>
              <Button onClick={submitScan} disabled={!scan.trim() || scanItem.isPending}>
                Pack item
              </Button>
            </div>
          )}

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Picked</TableHead>
                  <TableHead className="text-right">Packed</TableHead>
                  <TableHead>Package</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      No picked items found for this order.
                    </TableCell>
                  </TableRow>
                ) : items.map((item) => {
                  const done = item.packedQuantity >= item.pickedQuantity;
                  return (
                    <TableRow key={item.id ?? item.skuId}>
                      <TableCell>
                        <p className="font-medium">{item.skuCode}</p>
                        <p className="text-sm text-muted-foreground">{item.skuName}</p>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{item.pickedQuantity}</TableCell>
                      <TableCell className="text-right">
                        {isComplete || !item.id ? (
                          <span className="tabular-nums">{item.packedQuantity}</span>
                        ) : (
                          <Input
                            type="number"
                            min={0}
                            max={item.pickedQuantity}
                            value={item.packedQuantity}
                            aria-label={`Packed quantity for ${item.skuCode}`}
                            className="ml-auto h-9 w-20 text-right tabular-nums"
                            onChange={(e) => {
                              const next = Number(e.target.value);
                              if (!Number.isFinite(next)) return;
                              setQuantity.mutate({
                                itemId: item.id as string,
                                quantity: Math.max(0, Math.min(next, item.pickedQuantity)),
                              });
                            }}
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={item.packageId ?? 'none'}
                          disabled={isComplete || !item.id || packages.length === 0}
                          onValueChange={(v) =>
                            assignPackage.mutate({
                              itemId: item.id as string,
                              packageId: v === 'none' ? null : v,
                            })
                          }
                        >
                          <SelectTrigger className="w-36" aria-label={`Package for ${item.skuCode}`}>
                            <SelectValue placeholder={packages.length ? 'Assign' : 'Add a box'} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Unassigned</SelectItem>
                            {packages.map((p) => (
                              <SelectItem key={p.id} value={p.id}>Package {p.packageNumber}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {done ? (
                          <Badge className="bg-emerald-600 hover:bg-emerald-600">
                            <CheckCircle2 className="mr-1 h-3 w-3" /> Packed
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Pending</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Part three — packages */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 pb-3">
          <div>
            <CardTitle className="text-lg">Packages</CardTitle>
            <CardDescription>
              The courier bills on the greater of actual and volumetric weight — the smallest box
              that fits is the cheapest one to ship.
            </CardDescription>
          </div>
          {!isComplete && (
            <Button variant="outline" size="sm" onClick={() => addPackage.mutate(undefined)} disabled={addPackage.isPending}>
              <Plus className="mr-1 h-4 w-4" /> Add Package
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {packages.length === 0 ? (
            <div className="rounded-lg border border-dashed py-8 text-center text-muted-foreground">
              No packages yet. Add one to assign items into a box.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {packages.map((pkg) => (
                <PackageCard
                  key={pkg.id}
                  pkg={pkg}
                  boxes={boxes}
                  orderId={orderId}
                  readOnly={isComplete}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Screen 3 — shipping label */}
      <ShippingLabelPanel view={view} orderId={orderId} />

      {/* Screen 4 — complete packing */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
          <div className="text-sm text-muted-foreground">
            {isComplete ? (
              <span className="flex items-center gap-2 font-medium text-emerald-600">
                <CheckCircle2 className="h-4 w-4" /> Packed and ready for dispatch
              </span>
            ) : summary.allItemsPacked ? (
              'All items packed. Weigh each box, print the label, then complete packing.'
            ) : (
              `${summary.totalPickedUnits - summary.totalPackedUnits} unit(s) still to pack.`
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onBack}>{isComplete ? 'Back to list' : 'Cancel'}</Button>
            {!isComplete && (
              <Button
                onClick={() => completePacking.mutate()}
                disabled={completePacking.isPending || pendingWrites > 0}
              >
                {pendingWrites > 0 ? 'Saving…' : 'Complete Packing'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

/* ── Package card ────────────────────────────────────────────────────────── */

function PackageCard({
  pkg, boxes, orderId, readOnly,
}: { pkg: PackingPackage; boxes: PackingOrderView['boxes']; orderId: string; readOnly: boolean }) {
  const updatePackage = useUpdatePackage(orderId);
  const removePackage = useRemovePackage(orderId);
  const [weight, setWeight] = useState(pkg.weightKg?.toString() ?? '');

  useEffect(() => { setWeight(pkg.weightKg?.toString() ?? ''); }, [pkg.weightKg]);

  const commitWeight = () => {
    const value = weight === '' ? null : Number(weight);
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      toast.error('Weight must be a positive number');
      setWeight(pkg.weightKg?.toString() ?? '');
      return;
    }
    if (value === pkg.weightKg) return;
    updatePackage.mutate({ packageId: pkg.id, weightKg: value });
  };

  const billableWeight = useMemo(() => {
    const actual = pkg.weightKg ?? 0;
    const volumetric = pkg.volumetricWeightKg ?? 0;
    return Math.max(actual, volumetric);
  }, [pkg.weightKg, pkg.volumetricWeightKg]);

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <p className="font-semibold">Package {pkg.packageNumber}</p>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="tabular-nums">{pkg.itemCount ?? 0} items</Badge>
          {!readOnly && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove package ${pkg.packageNumber}`}
              onClick={() => removePackage.mutate(pkg.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor={`box-${pkg.id}`}>Box size</Label>
          <Select
            value={pkg.boxId ?? 'none'}
            disabled={readOnly}
            onValueChange={(v) => updatePackage.mutate({ packageId: pkg.id, boxId: v === 'none' ? null : v })}
          >
            <SelectTrigger id={`box-${pkg.id}`}>
              <SelectValue placeholder="Select a box" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Custom / no box</SelectItem>
              {boxes.map((box) => (
                <SelectItem key={box.id} value={box.id}>
                  {box.name}
                  {box.lengthCm && box.widthCm && box.heightCm
                    ? ` · ${box.lengthCm}×${box.widthCm}×${box.heightCm} cm`
                    : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {boxes.length === 0 && (
            <p className="flex items-center gap-1 text-xs text-amber-600">
              <AlertTriangle className="h-3 w-3" />
              No boxes in the master yet — add them under Settings → Masters → Packaging boxes.
            </p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {(['lengthCm', 'widthCm', 'heightCm'] as const).map((dim) => (
            <div key={dim} className="space-y-1.5">
              <Label htmlFor={`${dim}-${pkg.id}`} className="text-xs">
                {dim === 'lengthCm' ? 'L (cm)' : dim === 'widthCm' ? 'W (cm)' : 'H (cm)'}
              </Label>
              <Input
                id={`${dim}-${pkg.id}`}
                type="number"
                min={0}
                step="0.1"
                disabled={readOnly}
                defaultValue={pkg[dim] ?? ''}
                onBlur={(e) => {
                  const value = e.target.value === '' ? null : Number(e.target.value);
                  if (value === pkg[dim]) return;
                  updatePackage.mutate({ packageId: pkg.id, [dim]: value });
                }}
                className="tabular-nums"
              />
            </div>
          ))}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`weight-${pkg.id}`}>Weight (kg)</Label>
          <Input
            id={`weight-${pkg.id}`}
            type="number"
            min={0}
            step="0.01"
            disabled={readOnly}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            onBlur={commitWeight}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            placeholder="0.00"
            className="tabular-nums"
          />
        </div>

        {pkg.volumetricWeightKg ? (
          <p className="text-xs text-muted-foreground tabular-nums">
            Volumetric {pkg.volumetricWeightKg} kg · billable{' '}
            <span className="font-medium text-foreground">{billableWeight.toFixed(2)} kg</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}

/* ── Screen 3 — shipping label ───────────────────────────────────────────── */

function ShippingLabelPanel({ view, orderId }: { view: PackingOrderView; orderId: string }) {
  const { order, session, packages, summary } = view;
  const [carrier, setCarrier] = useState(session?.carrier ?? '');
  const [tracking, setTracking] = useState(session?.trackingNumber ?? '');
  const [printing, setPrinting] = useState(false);

  const setLabel = useSetShippingLabel(orderId);
  const markPrinted = useMarkLabelPrinted(orderId);

  useEffect(() => {
    setCarrier(session?.carrier ?? '');
    setTracking(session?.trackingNumber ?? '');
  }, [session?.carrier, session?.trackingNumber]);

  const handlePrint = async () => {
    if (packages.length === 0) {
      toast.error('Add at least one package before printing a label');
      return;
    }
    setPrinting(true);
    try {
      const { printShippingLabel } = await import('@/features/outbound/lib/shippingLabelPdf');
      for (const pkg of packages) {
        await printShippingLabel({
          orderNumber: order.soNumber,
          customerName: order.customerName,
          shippingAddress: order.shippingAddress,
          customerPhone: order.customerPhone ?? null,
          carrier: carrier || session?.carrier || null,
          trackingNumber: tracking || session?.trackingNumber || null,
          warehouseName: order.warehouseName,
          packageNumber: pkg.packageNumber,
          packageCount: packages.length,
          weightKg: pkg.weightKg,
          dimensions: { lengthCm: pkg.lengthCm, widthCm: pkg.widthCm, heightCm: pkg.heightCm },
        });
      }
      markPrinted.mutate();
    } catch {
      toast.error('Could not generate the label PDF');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Shipping Label</CardTitle>
        <CardDescription>
          The real label comes from the courier once the shipment is booked. Until that integration
          is live, enter the tracking number they gave you and print a provisional label.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="label-carrier">Carrier</Label>
            <Input
              id="label-carrier"
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              placeholder="e.g. Delhivery, Blue Dart"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="label-tracking">Tracking / AWB number</Label>
            <Input
              id="label-tracking"
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
              placeholder="Enter the number from the courier"
            />
          </div>
        </div>

        <Separator />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            {packages.length} label{packages.length === 1 ? '' : 's'} · {summary.totalWeightKg || 0} kg total
            {session?.labelPrintedAt && (
              <span className="ml-2 text-emerald-600">· printed</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setLabel.mutate({ carrier: carrier || undefined, trackingNumber: tracking || undefined })}
              disabled={setLabel.isPending || (!carrier && !tracking)}
            >
              Save details
            </Button>
            <Button onClick={handlePrint} disabled={printing || packages.length === 0}>
              <Printer className="mr-1 h-4 w-4" />
              {printing ? 'Preparing…' : 'Print Label'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
