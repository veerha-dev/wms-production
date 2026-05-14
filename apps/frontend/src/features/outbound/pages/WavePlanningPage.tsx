import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { AppLayout } from '@/shared/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/shared/components/ui/dialog';
import { Progress } from '@/shared/components/ui/progress';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/shared/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Play, Plus, Waves, X, RefreshCw } from 'lucide-react';
import { api } from '@/shared/lib/api';
import { toast } from 'sonner';
import { useAuth } from '@/shared/contexts/AuthContext';

interface Wave {
  id: string;
  waveNumber: string;
  name: string;
  type: 'manual' | 'scheduled';
  status: 'draft' | 'scheduled' | 'released' | 'in_progress' | 'completed' | 'cancelled';
  warehouseId: string | null;
  warehouseName: string | null;
  releaseTime: string | null;
  cutoffTime: string | null;
  shippingDeadline: string | null;
  pickListCount: number;
  totalItems: number;
  createdAt: string;
  releasedAt: string | null;
  completedAt: string | null;
}

interface WaveStatus {
  wave: Wave;
  overall: { itemsPicked: number; itemsRequired: number; percentComplete: number };
  workers: Array<{
    workerId: string | null;
    workerName: string;
    presenceStatus: string | null;
    itemsAssigned: number;
    itemsPicked: number;
    itemsRequired: number;
    itemsDone: number;
    itemsRemaining: number;
  }>;
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  scheduled: 'bg-blue-100 text-blue-700',
  released: 'bg-amber-100 text-amber-700',
  in_progress: 'bg-indigo-100 text-indigo-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

export default function WavePlanningPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState<string | null>(null);

  const { data: waves = [], isLoading } = useQuery({
    queryKey: ['waves'],
    queryFn: async () => {
      const res = await api.get('/api/v1/pick-waves');
      return (res.data.data || []) as Wave[];
    },
  });

  const release = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/pick-waves/${id}/release`).then((r) => r.data.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['waves'] }); toast.success('Wave released'); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to release'),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/pick-waves/${id}/cancel`).then((r) => r.data.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['waves'] }); toast.success('Wave cancelled'); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  return (
    <AppLayout title="Wave Planning" breadcrumbs={[{ label: 'Outbound' }, { label: 'Wave Planning' }]}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2"><Waves className="h-7 w-7" /> Wave Planning</h1>
            <p className="text-muted-foreground">Schedule time-windowed batch picks across multiple workers</p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-1" /> New Wave</Button>
            </DialogTrigger>
            <CreateWaveDialog onClose={() => setCreateOpen(false)} defaultWarehouseId={user?.warehouseId || ''} />
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{isLoading ? 'Loading…' : `${waves.length} waves`}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Wave #</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Warehouse</TableHead>
                  <TableHead>Pick Lists</TableHead>
                  <TableHead>Release</TableHead>
                  <TableHead>Deadline</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {waves.map((w) => (
                  <TableRow key={w.id} className="cursor-pointer hover:bg-muted/40">
                    <TableCell className="font-mono">{w.waveNumber}</TableCell>
                    <TableCell className="font-medium">{w.name}</TableCell>
                    <TableCell><Badge variant="outline">{w.type}</Badge></TableCell>
                    <TableCell className="text-sm">{w.warehouseName || '—'}</TableCell>
                    <TableCell>{w.pickListCount}</TableCell>
                    <TableCell className="text-xs">{w.releaseTime ? format(new Date(w.releaseTime), 'dd MMM HH:mm') : '—'}</TableCell>
                    <TableCell className="text-xs">{w.shippingDeadline ? format(new Date(w.shippingDeadline), 'dd MMM HH:mm') : '—'}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_COLORS[w.status] || ''}>{w.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => setStatusOpen(w.id)}>
                          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Status
                        </Button>
                        {(w.status === 'draft' || w.status === 'scheduled') && (
                          <Button size="sm" onClick={() => release.mutate(w.id)} disabled={release.isPending}>
                            <Play className="h-3.5 w-3.5 mr-1" /> Release
                          </Button>
                        )}
                        {['draft', 'scheduled', 'released'].includes(w.status) && (
                          <Button size="sm" variant="ghost" onClick={() => cancel.mutate(w.id)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!isLoading && waves.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      No waves yet. Create one to start scheduling wave picks.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {statusOpen && (
        <WaveStatusDialog waveId={statusOpen} onClose={() => setStatusOpen(null)} />
      )}
    </AppLayout>
  );
}

function CreateWaveDialog({ onClose, defaultWarehouseId }: { onClose: () => void; defaultWarehouseId: string }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: '',
    type: 'manual' as 'manual' | 'scheduled',
    warehouseId: defaultWarehouseId,
    releaseTime: '',
    cutoffTime: '',
    shippingDeadline: '',
    priorityFilter: '',
    autoAssignWorkers: false,
    notes: '',
  });
  const create = useMutation({
    mutationFn: (dto: any) => api.post('/api/v1/pick-waves', dto).then((r) => r.data.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['waves'] }); toast.success('Wave created'); onClose(); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to create'),
  });

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Create wave</DialogTitle>
        <DialogDescription>Wave fields per PDF §3.3 Wave Picking — manual or scheduled, optional auto-assign.</DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <Label>Wave name *</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Morning wave - Bangalore" />
        </div>
        <div>
          <Label>Type</Label>
          <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as any })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">Manual</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Priority filter</Label>
          <Select value={form.priorityFilter || 'all'} onValueChange={(v) => setForm({ ...form, priorityFilter: v === 'all' ? '' : v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              <SelectItem value="high">High only</SelectItem>
              <SelectItem value="medium">Medium and above</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Release time</Label>
          <Input type="datetime-local" value={form.releaseTime} onChange={(e) => setForm({ ...form, releaseTime: e.target.value })} />
        </div>
        <div>
          <Label>Cutoff time</Label>
          <Input type="datetime-local" value={form.cutoffTime} onChange={(e) => setForm({ ...form, cutoffTime: e.target.value })} />
        </div>
        <div className="md:col-span-2">
          <Label>Shipping deadline</Label>
          <Input type="datetime-local" value={form.shippingDeadline} onChange={(e) => setForm({ ...form, shippingDeadline: e.target.value })} />
        </div>
        <label className="md:col-span-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.autoAssignWorkers}
            onChange={(e) => setForm({ ...form, autoAssignWorkers: e.target.checked })}
          />
          Auto-assign workers from this warehouse on release
        </label>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => create.mutate(form)} disabled={create.isPending || !form.name}>
          Create wave
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function WaveStatusDialog({ waveId, onClose }: { waveId: string; onClose: () => void }) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['wave-status', waveId],
    queryFn: async () => {
      const res = await api.get(`/api/v1/pick-waves/${waveId}/status`);
      return res.data.data as WaveStatus;
    },
    refetchInterval: 5000,
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Wave status — {data?.wave.waveNumber}</DialogTitle>
          <DialogDescription>
            {data?.wave.name} · {data?.wave.warehouseName || 'all warehouses'} · refreshes every 5s
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">Loading…</div>
        ) : data ? (
          <div className="space-y-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Overall progress</span>
                  <span className="tabular-nums">
                    {data.overall.itemsPicked} / {data.overall.itemsRequired} units · {data.overall.percentComplete}%
                  </span>
                </div>
                <Progress value={data.overall.percentComplete} className="mt-2" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Per-worker</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Worker</TableHead>
                      <TableHead>Presence</TableHead>
                      <TableHead>Assigned</TableHead>
                      <TableHead>Picked</TableHead>
                      <TableHead>Remaining</TableHead>
                      <TableHead>Progress</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.workers.map((w) => {
                      const pct = w.itemsRequired > 0 ? Math.round((w.itemsPicked / w.itemsRequired) * 100) : 0;
                      return (
                        <TableRow key={w.workerId || w.workerName}>
                          <TableCell className="font-medium">{w.workerName}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={
                              w.presenceStatus === 'active' ? 'bg-green-50 text-green-700' :
                              w.presenceStatus === 'idle' ? 'bg-yellow-50 text-yellow-700' :
                              w.presenceStatus === 'break' ? 'bg-blue-50 text-blue-700' :
                              'bg-gray-50 text-gray-600'
                            }>
                              {w.presenceStatus || 'offline'}
                            </Badge>
                          </TableCell>
                          <TableCell className="tabular-nums">{w.itemsAssigned}</TableCell>
                          <TableCell className="tabular-nums">{w.itemsPicked}</TableCell>
                          <TableCell className="tabular-nums">{w.itemsRemaining}</TableCell>
                          <TableCell><Progress value={pct} className="w-32" /></TableCell>
                        </TableRow>
                      );
                    })}
                    {data.workers.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-4 text-muted-foreground">
                          No pick lists attached yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => refetch()}><RefreshCw className="h-4 w-4 mr-1" /> Refresh</Button>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
