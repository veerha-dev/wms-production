import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { AppLayout } from '@/shared/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Progress } from '@/shared/components/ui/progress';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/shared/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { PackageCheck, Layers, Check } from 'lucide-react';
import { api } from '@/shared/lib/api';
import { toast } from 'sonner';

interface ConsolidationTask {
  id: string;
  consolidationNumber: string;
  pickListId: string | null;
  pickListNumber: string | null;
  soId: string | null;
  soNumber: string | null;
  warehouseId: string | null;
  warehouseName: string | null;
  totalSubPicks: number;
  completedSubPicks: number;
  status: 'pending' | 'ready' | 'acknowledged' | 'packed';
  readyAt: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  ready: 'bg-emerald-100 text-emerald-700',
  acknowledged: 'bg-blue-100 text-blue-700',
  packed: 'bg-green-100 text-green-700',
};

export default function ConsolidationPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['pack-consolidations', statusFilter],
    queryFn: async () => {
      const params: any = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      const res = await api.get('/api/v1/pack-consolidations', { params });
      return (res.data.data || []) as ConsolidationTask[];
    },
    refetchInterval: 10_000,
  });

  const acknowledge = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/pack-consolidations/${id}/acknowledge`).then((r) => r.data.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pack-consolidations'] }); toast.success('Acknowledged — ready to pack'); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });
  const markPacked = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/pack-consolidations/${id}/mark-packed`).then((r) => r.data.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pack-consolidations'] }); toast.success('Marked packed'); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  return (
    <AppLayout title="Consolidation" breadcrumbs={[{ label: 'Outbound' }, { label: 'Consolidation' }]}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2"><Layers className="h-7 w-7" /> Consolidation Point</h1>
            <p className="text-muted-foreground">
              Zone picks land here. Wait until every zone's slice arrives, then acknowledge for packing.
            </p>
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="ready">Ready</SelectItem>
              <SelectItem value="acknowledged">Acknowledged</SelectItem>
              <SelectItem value="packed">Packed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{isLoading ? 'Loading…' : `${tasks.length} consolidation task(s)`}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Consolidation</TableHead>
                  <TableHead>Pick list</TableHead>
                  <TableHead>Sales order</TableHead>
                  <TableHead>Warehouse</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ready</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((t) => {
                  const pct = t.totalSubPicks > 0 ? Math.round((t.completedSubPicks / t.totalSubPicks) * 100) : 0;
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono">{t.consolidationNumber}</TableCell>
                      <TableCell className="text-sm">{t.pickListNumber || '—'}</TableCell>
                      <TableCell className="text-sm">{t.soNumber || '—'}</TableCell>
                      <TableCell className="text-sm">{t.warehouseName || '—'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={pct} className="w-32" />
                          <span className="text-xs tabular-nums">{t.completedSubPicks}/{t.totalSubPicks}</span>
                        </div>
                      </TableCell>
                      <TableCell><Badge className={STATUS_COLORS[t.status]}>{t.status}</Badge></TableCell>
                      <TableCell className="text-xs">{t.readyAt ? format(new Date(t.readyAt), 'dd MMM HH:mm') : '—'}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {t.status === 'ready' && (
                            <Button size="sm" onClick={() => acknowledge.mutate(t.id)} disabled={acknowledge.isPending}>
                              <Check className="h-3.5 w-3.5 mr-1" /> Acknowledge
                            </Button>
                          )}
                          {t.status === 'acknowledged' && (
                            <Button size="sm" variant="outline" onClick={() => markPacked.mutate(t.id)} disabled={markPacked.isPending}>
                              <PackageCheck className="h-3.5 w-3.5 mr-1" /> Mark Packed
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!isLoading && tasks.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No consolidation tasks. They appear here when zone-strategy pick lists complete.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
