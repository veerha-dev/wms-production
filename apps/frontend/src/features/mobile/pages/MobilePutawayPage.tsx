import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { ArrowLeft, Boxes, CheckCircle2, MapPin, XCircle } from 'lucide-react';
import { api } from '@/shared/lib/api';
import { toast } from 'sonner';
import { useAuth } from '@/shared/contexts/AuthContext';
import { ScanField } from '../components/ScanField';

interface PutawayTask {
  id: string;
  putawayNumber: string;
  status: string;
  quantity: number;
  quantityPutaway: number;
  skuCode?: string;
  skuName?: string;
  destinationBinCode?: string;
  suggestedBinCode?: string;
  grnNumber?: string;
}

export default function MobilePutawayPage() {
  const { user } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scan, setScan] = useState('');

  const { data: tasks = [], isLoading, refetch } = useQuery({
    queryKey: ['m-putaway-tasks', user?.id],
    queryFn: async () => {
      const res = await api.get('/api/v1/putaway', {
        params: { status: 'assigned', limit: 50 },
      });
      return (res.data.data || []) as PutawayTask[];
    },
  });

  const scanBin = useMutation({
    mutationFn: ({ id, barcode }: { id: string; barcode: string }) =>
      api.post(`/api/v1/putaway/${id}/scan-bin`, { barcode }).then((r) => r.data.data),
    onSuccess: () => { toast.success('Bin confirmed'); refetch(); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Wrong bin'),
  });
  const complete = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/putaway/${id}/complete`).then((r) => r.data.data),
    onSuccess: () => { toast.success('Putaway complete'); setSelectedId(null); setScan(''); refetch(); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  useEffect(() => { if (selectedId) setScan(''); }, [selectedId]);

  const selected = tasks.find((t) => t.id === selectedId);

  /**
   * One submit path for all three triggers: the Confirm button, an Enter from a
   * keyboard-wedge scanner, and a camera read.
   */
  const confirmBin = useCallback(
    (barcode: string) => {
      // Posted exactly as decoded/typed — the backend owns barcode matching.
      if (!barcode || !selectedId || scanBin.isPending) return;
      scanBin.mutate({ id: selectedId, barcode });
    },
    [scanBin, selectedId]
  );

  if (selectedId && selected) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="mx-auto max-w-md space-y-3">
          <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>

          <Card className="p-4 space-y-2">
            <div className="text-xs text-muted-foreground">{selected.putawayNumber}</div>
            <div className="text-lg font-semibold">{selected.skuCode} · {selected.skuName}</div>
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="outline">{selected.quantity} units</Badge>
              {selected.grnNumber && <span className="text-muted-foreground">from {selected.grnNumber}</span>}
            </div>
            <div className="rounded-md border bg-muted/40 p-3 flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              <div>
                <div className="text-xs text-muted-foreground">Destination bin</div>
                <div className="text-lg font-bold">{selected.destinationBinCode || selected.suggestedBinCode || '—'}</div>
              </div>
            </div>
          </Card>

          <Card className="p-4 space-y-3">
            {/*
              submitOnScan: a camera read of the bin label confirms immediately.
              The value being posted is the *only* thing this call carries, the
              worker is already staring at the destination bin printed above,
              and a mismatch is rejected by the backend with a toast rather than
              changing any stock — so a confirmation tap would only cost a
              gloved hand a second per carton without preventing anything.
            */}
            <ScanField
              label="Scan bin barcode to confirm"
              cameraLabel="Scan bin with camera"
              scannerHint={`Destination ${selected.destinationBinCode || selected.suggestedBinCode || ''}`.trim()}
              autoFocus
              value={scan}
              onValueChange={setScan}
              onSubmit={confirmBin}
              submitOnScan
              placeholder="Scan or type bin code"
            />
            <div className="flex gap-2">
              <Button
                className="h-12 flex-1"
                onClick={() => confirmBin(scan)}
                disabled={!scan || scanBin.isPending}
              >
                <CheckCircle2 className="h-4 w-4 mr-1" /> Confirm
              </Button>
            </div>
          </Card>

          <Button
            className="w-full"
            variant="default"
            disabled={complete.isPending}
            onClick={() => complete.mutate(selected.id)}
          >
            Mark putaway complete
          </Button>
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
            <div className="text-base font-semibold flex items-center gap-1"><Boxes className="h-4 w-4" /> Putaway</div>
            <div className="text-xs text-muted-foreground">Your assigned tasks</div>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center text-muted-foreground py-8">Loading…</div>
        ) : tasks.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground">
            <XCircle className="h-6 w-6 mx-auto mb-2 opacity-50" />
            No assigned putaway tasks. Check back later.
          </Card>
        ) : (
          <div className="space-y-2">
            {tasks.map((t) => (
              <Card key={t.id} className="p-3 active:scale-[0.99]" onClick={() => setSelectedId(t.id)}>
                <div className="flex justify-between gap-2">
                  <div>
                    <div className="font-medium">{t.skuCode} · <span className="text-muted-foreground">{t.skuName}</span></div>
                    <div className="text-xs text-muted-foreground">{t.putawayNumber} · {t.quantity} units</div>
                  </div>
                  <Badge>{(t.destinationBinCode || t.suggestedBinCode) ?? '—'}</Badge>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
