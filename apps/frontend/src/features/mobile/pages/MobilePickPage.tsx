import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Badge } from '@/shared/components/ui/badge';
import { Progress } from '@/shared/components/ui/progress';
import { ArrowLeft, ListChecks, XCircle } from 'lucide-react';
import { api } from '@/shared/lib/api';
import { toast } from 'sonner';
import { ScanField } from '../components/ScanField';

interface PickList {
  id: string;
  pickListNumber: string;
  status: string;
  strategy: string;
  totalItems?: number;
  pickedItems?: number;
}

interface PickItem {
  id: string;
  skuCode: string;
  skuName: string;
  binCode: string | null;
  toteCode?: string | null;
  quantityRequired: number;
  quantityPicked: number;
  status: string;
}

export default function MobilePickPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scan, setScan] = useState('');
  const [binScan, setBinScan] = useState('');
  const [qty, setQty] = useState('1');
  const skuInputRef = useRef<HTMLInputElement>(null);

  const { data: lists = [], isLoading, refetch } = useQuery({
    queryKey: ['m-pick-lists'],
    queryFn: async () => {
      const res = await api.get('/api/v1/pick-lists', { params: { status: 'assigned', limit: 50 } });
      return (res.data.data || []) as PickList[];
    },
  });

  const { data: detail, refetch: refetchDetail } = useQuery({
    queryKey: ['m-pick-list', selectedId],
    queryFn: async () => {
      const res = await api.get(`/api/v1/pick-lists/${selectedId}`);
      return res.data.data as PickList & { items: PickItem[] };
    },
    enabled: !!selectedId,
  });

  const scanItem = useMutation({
    mutationFn: (payload: { barcode: string; binBarcode?: string; quantity?: number }) =>
      api.post(`/api/v1/pick-lists/${selectedId}/scan-item`, payload).then((r) => r.data.data),
    onSuccess: (data: any) => {
      toast.success(`${data.skuCode} · ${data.quantityPicked}/${data.quantityRequired}`);
      setScan(''); setBinScan('');
      refetchDetail();
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Scan failed'),
  });

  /** Single submit path for the Record pick button and for a wedge Enter. */
  const recordPick = useCallback(
    (barcode: string) => {
      // Sent exactly as decoded/typed — the backend owns barcode matching.
      if (!barcode || scanItem.isPending) return;
      scanItem.mutate({
        barcode,
        binBarcode: binScan || undefined,
        quantity: parseInt(qty || '1', 10),
      });
    },
    [binScan, qty, scanItem]
  );

  if (selectedId && detail) {
    const total = detail.items.length;
    const done = detail.items.filter((i) => i.status === 'completed').length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const next = detail.items.find((i) => (i.quantityPicked ?? 0) < (i.quantityRequired ?? 0));

    return (
      <div className="min-h-screen bg-background p-4">
        <div className="mx-auto max-w-md space-y-3">
          <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>

          <Card className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">{detail.pickListNumber}</div>
              <Badge variant="outline">{detail.strategy}</Badge>
            </div>
            <Progress value={pct} />
            <div className="text-xs text-muted-foreground tabular-nums">{done}/{total} items complete</div>
          </Card>

          {next && (
            <Card className="p-4 space-y-1 border-primary/30">
              <div className="text-xs uppercase tracking-wide text-primary">Next pick</div>
              <div className="text-lg font-bold">{next.skuCode}</div>
              <div className="text-sm text-muted-foreground">{next.skuName}</div>
              <div className="flex items-center gap-2 mt-1">
                <Badge>{next.binCode || 'No bin'}</Badge>
                {next.toteCode && <Badge variant="outline" className="bg-amber-50 text-amber-700">{next.toteCode}</Badge>}
                <span className="text-xs text-muted-foreground">{next.quantityPicked}/{next.quantityRequired}</span>
              </div>
            </Card>
          )}

          <Card className="p-4 space-y-3">
            {/*
              No submitOnScan on either field here, unlike putaway. A pick posts
              a *quantity* the camera cannot know, and an over- or under-pick
              moves stock and has to be unwound by hand — so the decoded code
              lands in the field and the worker checks the qty and taps.
              A wedge Enter on the bin field advances to the SKU field rather
              than submitting, which is the order those labels get scanned in.
            */}
            <ScanField
              label="Bin code (optional)"
              cameraLabel="Scan bin with camera"
              scannerHint={next?.binCode ? `Pick from ${next.binCode}` : undefined}
              value={binScan}
              onValueChange={setBinScan}
              onSubmit={() => skuInputRef.current?.focus()}
              placeholder="Bin code (optional)"
              showUnavailableHint={false}
            />
            <ScanField
              label="Scan SKU"
              cameraLabel="Scan SKU with camera"
              scannerHint={next ? `${next.skuCode} · ${next.quantityPicked}/${next.quantityRequired}` : undefined}
              autoFocus
              inputRef={skuInputRef}
              value={scan}
              onValueChange={setScan}
              onSubmit={recordPick}
              placeholder="SKU code"
            />
            <div className="flex gap-2">
              <Input
                type="number"
                min={1}
                inputMode="numeric"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                aria-label="Quantity picked"
                className="h-12 w-20 text-lg"
              />
              <Button
                className="h-12 flex-1"
                disabled={!scan || scanItem.isPending}
                onClick={() => recordPick(scan)}
              >
                Record pick
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="mx-auto max-w-md">
        <div className="mb-4 flex items-center gap-2">
          <Link to="/m"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <div>
            <div className="text-base font-semibold flex items-center gap-1"><ListChecks className="h-4 w-4" /> Pick</div>
            <div className="text-xs text-muted-foreground">Your assigned pick lists</div>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center text-muted-foreground py-8">Loading…</div>
        ) : lists.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground">
            <XCircle className="h-6 w-6 mx-auto mb-2 opacity-50" />
            No pick lists assigned right now.
          </Card>
        ) : (
          <div className="space-y-2">
            {lists.map((l) => (
              <Card key={l.id} className="p-3 active:scale-[0.99]" onClick={() => setSelectedId(l.id)}>
                <div className="flex justify-between gap-2">
                  <div>
                    <div className="font-medium">{l.pickListNumber}</div>
                    <div className="text-xs text-muted-foreground">{l.strategy} pick · {l.totalItems ?? 0} items</div>
                  </div>
                  <Badge>{l.status}</Badge>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
