import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Card } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Badge } from '@/shared/components/ui/badge';
import { Progress } from '@/shared/components/ui/progress';
import { ArrowLeft, PackageCheck, XCircle, CheckCircle2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { ScanField } from '../components/ScanField';
import {
  usePackableOrders, usePackingOrder, useStartPacking, usePackScan,
  useAddPackage, useUpdatePackage, useAssignItemPackage, useCompletePacking,
} from '@/features/outbound/hooks/usePacking';

/**
 * Packing on a phone, for warehouses where the same worker picks and packs
 * rather than walking totes to a bench. Same API as the web station — only the
 * layout differs, so the rules can never drift between the two.
 */
export default function MobilePackPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (selectedId) {
    return <MobilePackOrder orderId={selectedId} onBack={() => setSelectedId(null)} />;
  }
  return <MobilePackQueue onSelect={setSelectedId} />;
}

function MobilePackQueue({ onSelect }: { onSelect: (id: string) => void }) {
  const { data, isLoading } = usePackableOrders();
  const startPacking = useStartPacking();
  const orders = data?.data ?? [];

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="mx-auto max-w-md">
        <div className="mb-4 flex items-center gap-2">
          <Link to="/m"><Button variant="ghost" size="sm" aria-label="Back to menu"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <div>
            <div className="flex items-center gap-1 text-base font-semibold">
              <PackageCheck className="h-4 w-4" /> Pack
            </div>
            <div className="text-xs text-muted-foreground">Orders waiting to be packed</div>
          </div>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">Loading…</div>
        ) : orders.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground">
            <XCircle className="mx-auto mb-2 h-6 w-6 opacity-50" />
            Nothing to pack right now.
          </Card>
        ) : (
          <div className="space-y-2">
            {orders.map((order: any) => (
              <Card
                key={order.id}
                className="p-3 active:scale-[0.99]"
                onClick={() => startPacking.mutate(order.id, { onSuccess: () => onSelect(order.id) })}
              >
                <div className="flex justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{order.soNumber}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {order.customerName || 'Customer'} · {order.itemCount} items
                    </div>
                  </div>
                  <Badge variant={order.status === 'picked' ? 'default' : 'secondary'}>
                    {order.status === 'picked' ? 'Ready' : 'Packing'}
                  </Badge>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MobilePackOrder({ orderId, onBack }: { orderId: string; onBack: () => void }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = usePackingOrder(orderId);
  const [scan, setScan] = useState('');
  const [weight, setWeight] = useState('');
  const [done, setDone] = useState(false);

  const scanItem = usePackScan(orderId);
  const addPackage = useAddPackage(orderId);
  const updatePackage = useUpdatePackage(orderId);
  const assignPackage = useAssignItemPackage(orderId);
  const complete = useCompletePacking(orderId);

  const pkg = data?.packages?.[0] ?? null;

  useEffect(() => {
    setWeight(pkg?.weightKg?.toString() ?? '');
  }, [pkg?.weightKg]);

  if (isLoading || !data) {
    return <div className="min-h-screen bg-background p-8 text-center text-muted-foreground">Loading…</div>;
  }

  const { order, items, summary, packages } = data;

  // Completion screen — the worker's confirmation that the parcel is done.
  if (done) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="mx-auto flex max-w-md flex-col items-center gap-3 pt-16 text-center">
          <CheckCircle2 className="h-16 w-16 text-emerald-600" />
          <h1 className="text-xl font-bold">{order.soNumber} packed</h1>
          <p className="text-sm text-muted-foreground">
            {summary.packageCount} package(s) · {summary.totalWeightKg} kg — ready for dispatch.
          </p>
          <Button className="mt-4 h-12 w-full" onClick={() => { setDone(false); onBack(); }}>
            Pack another order
          </Button>
        </div>
      </div>
    );
  }

  const next = items.find((i) => i.packedQuantity < i.pickedQuantity);
  const pct = summary.totalPickedUnits > 0
    ? Math.round((summary.totalPackedUnits / summary.totalPickedUnits) * 100)
    : 0;

  const submitScan = (barcode: string) => {
    const value = barcode.trim();
    if (!value || scanItem.isPending) return;
    scanItem.mutate({ barcode: value }, { onSettled: () => setScan('') });
  };

  /**
   * One tap does the whole box on mobile: create it if needed, save the weight,
   * sweep every item into it, then complete. A phone packer has one box in hand
   * and no patience for a three-step form.
   */
  const finish = async () => {
    const weightValue = Number(weight);
    if (!Number.isFinite(weightValue) || weightValue <= 0) {
      toast.error('Enter the box weight first');
      return;
    }
    try {
      let target = pkg;
      if (!target) {
        target = await addPackage.mutateAsync(undefined);
      }
      await updatePackage.mutateAsync({ packageId: target.id, weightKg: weightValue });

      for (const item of items) {
        if (item.id && item.packageId !== target.id) {
          await assignPackage.mutateAsync({ itemId: item.id, packageId: target.id });
        }
      }

      await complete.mutateAsync();
      await queryClient.invalidateQueries({ queryKey: ['packing-order', orderId] });
      setDone(true);
    } catch {
      // Each mutation already surfaces its own error toast.
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="mx-auto max-w-md space-y-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>

        <Card className="space-y-2 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{order.soNumber}</div>
              <div className="truncate text-xs text-muted-foreground">{order.customerName}</div>
            </div>
            <Badge variant="outline">{summary.totalItems} items</Badge>
          </div>
          <Progress value={pct} />
          <div className="text-xs tabular-nums text-muted-foreground">
            {summary.totalPackedUnits}/{summary.totalPickedUnits} units packed
          </div>
        </Card>

        {next ? (
          <Card className="space-y-1 border-primary/30 p-4">
            <div className="text-xs uppercase tracking-wide text-primary">Next item</div>
            <div className="text-lg font-bold">{next.skuCode}</div>
            <div className="text-sm text-muted-foreground">{next.skuName}</div>
            <div className="text-xs tabular-nums text-muted-foreground">
              {next.packedQuantity}/{next.pickedQuantity} in the box
            </div>
          </Card>
        ) : (
          <Card className="flex items-center gap-2 border-emerald-500/40 p-4 text-emerald-600">
            <CheckCircle2 className="h-5 w-5" /> All items packed — weigh the box and finish.
          </Card>
        )}

        <Card className="space-y-3 p-4">
          {/*
            submitOnScan is safe here, unlike picking: a pack scan is always one
            unit and carries no quantity the camera could get wrong.
          */}
          <ScanField
            label="Scan item into box"
            cameraLabel="Scan item with camera"
            scannerHint={next ? `${next.skuCode} · ${next.packedQuantity}/${next.pickedQuantity}` : undefined}
            autoFocus
            submitOnScan
            value={scan}
            onValueChange={setScan}
            onSubmit={submitScan}
            placeholder="Item barcode"
          />
          <Button
            className="h-12 w-full"
            variant="secondary"
            disabled={!scan.trim() || scanItem.isPending}
            onClick={() => submitScan(scan)}
          >
            Pack item
          </Button>
        </Card>

        <Card className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Box weight (kg)</span>
            {packages.length > 1 && (
              <Badge variant="outline">{packages.length} boxes — finish on the web station</Badge>
            )}
          </div>
          <Input
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="0.00"
            aria-label="Box weight in kilograms"
            className="h-12 text-lg tabular-nums"
          />
          {packages.length === 0 && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Plus className="h-3 w-3" /> A box is created for you when you finish.
            </p>
          )}
          <Button
            className="h-12 w-full"
            disabled={!summary.allItemsPacked || complete.isPending || packages.length > 1}
            onClick={finish}
          >
            {complete.isPending ? 'Finishing…' : 'Complete packing'}
          </Button>
          {packages.length > 1 && (
            <p className="text-xs text-muted-foreground">
              This order uses multiple boxes. Finish it at the packing station so each box gets its
              own weight and dimensions.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
