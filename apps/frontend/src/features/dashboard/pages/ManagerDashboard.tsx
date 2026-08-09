import { AppLayout } from '@/shared/components/layout/AppLayout';
import { useAuth } from '@/shared/contexts/AuthContext';
import { useWMS } from '@/shared/contexts/WMSContext';
import { useManagerDashboard } from '@/features/dashboard/hooks/useManagerDashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Progress } from '@/shared/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table';
import { Link } from 'react-router-dom';
import {
  ShoppingCart, ClipboardCheck, Users, ClipboardList, AlertTriangle, Clock, Search, Package,
  Plus, Truck, CheckCircle, ArrowRight, PlayCircle, Loader2, Building2, Calendar, User, Activity,
} from 'lucide-react';

export default function ManagerDashboard() {
  const { user } = useAuth();
  const { selectedWarehouse } = useWMS();
  const warehouseId = user?.warehouseId || selectedWarehouse?.id;
  const { data, isLoading, isError, error, refetch } = useManagerDashboard(warehouseId);

  if (isLoading) {
    return (
      <AppLayout title="Dashboard" breadcrumbs={[{ label: 'Dashboard' }]}>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  // A failed request used to fall through to the spinner branch (isLoading
  // false, data undefined), so a 500 was indistinguishable from "still
  // loading" — the dashboard simply span forever. Show the failure instead.
  if (isError || !data) {
    const message =
      (error as any)?.response?.data?.message || (error as any)?.message || 'Unknown error';
    return (
      <AppLayout title="Dashboard" breadcrumbs={[{ label: 'Dashboard' }]}>
        <div className="flex flex-col items-center justify-center h-[60vh] gap-3 text-center">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <p className="font-medium">Could not load the dashboard</p>
          <p className="text-sm text-muted-foreground max-w-md">{message}</p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
        </div>
      </AppLayout>
    );
  }

  const { warehouse, shift, kpis, workers, inbound, outbound, tasks, zones, shipments, recentActivity, dueToday } = data;
  const formatDate = (d: string) => d ? new Date(d).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const formatTime = (d: string) => d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';
  const timeAgo = (d: string) => {
    if (!d) return '-';
    const diff = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
    if (diff < 1) return 'Just now';
    if (diff < 60) return `${diff} min ago`;
    return `${Math.floor(diff / 60)}h ago`;
  };

  return (
    <AppLayout title="Manager Dashboard" breadcrumbs={[{ label: 'Dashboard' }]}>
      <div className="space-y-6">

        {/* Section 1 — Warehouse Header */}
        <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <Building2 className="h-6 w-6 text-primary" />
                  <h1 className="text-2xl font-bold">{warehouse.name}</h1>
                  <Badge variant="outline">{warehouse.type}</Badge>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{formatDate(data.date)}</span>
                  <span>|</span>
                  <span>{shift}</span>
                  {warehouse.city && <><span>|</span><span>{warehouse.city}</span></>}
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="outline" asChild><Link to="/operations"><Plus className="h-3.5 w-3.5 mr-1" />Create Task</Link></Button>
                <Button size="sm" variant="outline" asChild><Link to="/inbound/grn"><ClipboardCheck className="h-3.5 w-3.5 mr-1" />Create GRN</Link></Button>
                <Button size="sm" variant="outline" asChild><Link to="/outbound/picking"><ClipboardList className="h-3.5 w-3.5 mr-1" />Pick List</Link></Button>
                <Button size="sm" variant="outline" asChild><Link to="/users"><Users className="h-3.5 w-3.5 mr-1" />My Workers</Link></Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 2 — 8 KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { title: 'Orders to Ship Today', value: kpis.ordersToShipToday, icon: ShoppingCart, color: 'text-blue-600' },
            { title: 'Pending GRNs', value: kpis.pendingGRNs, icon: ClipboardCheck, color: 'text-orange-600' },
            { title: 'Active Workers', value: kpis.activeWorkers, icon: Users, color: 'text-green-600' },
            { title: 'Pending Tasks', value: kpis.pendingTasks, icon: ClipboardList, color: 'text-purple-600' },
            { title: 'Low Stock Items', value: kpis.lowStockItems, icon: AlertTriangle, color: 'text-red-600' },
            { title: 'Expiring This Week', value: kpis.expiringThisWeek, icon: Clock, color: 'text-yellow-600' },
            { title: 'Pending QC', value: kpis.pendingQC, icon: Search, color: 'text-indigo-600' },
            { title: 'Pending Putaway', value: kpis.pendingPutaway, icon: Package, color: 'text-teal-600' },
          ].map((kpi) => {
            const Icon = kpi.icon;
            return (
              <Card key={kpi.title}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-xs font-medium">{kpi.title}</CardTitle>
                  <Icon className={`h-4 w-4 ${kpi.color}`} />
                </CardHeader>
                <CardContent><div className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</div></CardContent>
              </Card>
            );
          })}
        </div>

        {/* Section 3 — Worker Activity Panel */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />My Team — Today's Activity</CardTitle>
              <div className="flex gap-2 text-xs">
                <Badge variant="outline">Total: {workers.summary.total}</Badge>
                <Badge className="bg-green-100 text-green-700">Active: {workers.summary.active}</Badge>
                <Badge className="bg-yellow-100 text-yellow-700">Idle: {workers.summary.idle}</Badge>
                <Badge className="bg-gray-100 text-gray-500">Absent: {workers.summary.absent}</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {workers.list.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No workers assigned to this warehouse</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {workers.list.map((w: any) => (
                  <div key={w.id} className="border rounded-lg p-3 flex items-start gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                      {(w.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium text-sm truncate">{w.name}</p>
                        <Badge className={w.status === 'active' ? 'bg-green-100 text-green-700' : w.status === 'idle' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'} variant="outline">
                          {w.status}
                        </Badge>
                      </div>
                      {w.currentTask ? (
                        <p className="text-xs text-muted-foreground">Task: {w.currentTask.taskNumber} ({w.currentTask.type})</p>
                      ) : (
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-muted-foreground">No task assigned</p>
                          <Button size="sm" variant="ghost" className="h-5 text-[10px] px-1.5" asChild>
                            <Link to="/operations">+ Assign</Link>
                          </Button>
                        </div>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-0.5">Last: {timeAgo(w.lastActivity)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Section 4 & 5 — Inbound + Outbound Pipelines */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Inbound Pipeline</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                {[
                  { label: 'GRN Pending', value: inbound.grnPending, color: 'bg-orange-100 text-orange-700' },
                  { label: 'QC Pending', value: inbound.qcPending, color: 'bg-yellow-100 text-yellow-700' },
                  { label: 'Putaway', value: inbound.putawayPending, color: 'bg-blue-100 text-blue-700' },
                ].map((stage, i) => (
                  <div key={stage.label} className="flex items-center gap-2 flex-1">
                    <div className={`rounded-lg p-3 text-center flex-1 ${stage.color}`}>
                      <div className="text-xl font-bold">{stage.value}</div>
                      <div className="text-[10px]">{stage.label}</div>
                    </div>
                    {i < 2 && <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Outbound Pipeline</CardTitle>
                {dueToday?.total > 0 && (
                  <Badge className="bg-red-100 text-red-700 text-[10px]">
                    {dueToday.total} due today
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                {[
                  { label: 'Confirmed', value: outbound.ordersConfirmed, due: dueToday?.confirmed || 0, color: 'bg-blue-100 text-blue-700' },
                  { label: 'Picking', value: outbound.picking, due: dueToday?.picking || 0, color: 'bg-purple-100 text-purple-700' },
                  { label: 'Packing', value: outbound.packing, due: dueToday?.packing || 0, color: 'bg-orange-100 text-orange-700' },
                  { label: 'Shipped', value: outbound.shipped, due: dueToday?.readyToShip || 0, color: 'bg-green-100 text-green-700' },
                ].map((stage, i) => (
                  <div key={stage.label} className="flex items-center gap-2 flex-1">
                    <div className={`rounded-lg p-3 text-center flex-1 ${stage.color} relative`}>
                      <div className="text-xl font-bold">{stage.value}</div>
                      <div className="text-[10px]">{stage.label}</div>
                      {stage.due > 0 && (
                        <div className="text-[9px] mt-0.5 font-semibold text-red-700">
                          {stage.due} due today
                        </div>
                      )}
                    </div>
                    {i < 3 && <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Section 6 — Task Board */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2"><ClipboardList className="h-4 w-4" />Today's Tasks</CardTitle>
              <Button size="sm" variant="ghost" asChild><Link to="/operations">View All</Link></Button>
            </div>
          </CardHeader>
          <CardContent>
            {tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No tasks for today</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Task #</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Assigned To</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.map((t: any) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium text-sm">{t.taskNumber}</TableCell>
                      <TableCell className="text-xs">{t.type}</TableCell>
                      <TableCell className="text-xs">{t.assignedToName || '-'}</TableCell>
                      <TableCell>
                        <Badge className={t.priority === 'high' ? 'bg-red-100 text-red-700' : t.priority === 'urgent' ? 'bg-red-200 text-red-800' : 'bg-blue-100 text-blue-700'}>{t.priority}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{t.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Section 8 — Zone Utilization */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Zone Utilization</CardTitle></CardHeader>
          <CardContent>
            {zones.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No zones configured</p>
            ) : (
              <div className="space-y-3">
                {zones.map((z: any) => (
                  <div key={z.id} className="flex items-center gap-3">
                    <span className="text-sm font-medium w-32 truncate">{z.name}</span>
                    <Badge variant="outline" className="text-[10px] w-16 justify-center">{z.type}</Badge>
                    <div className="flex-1"><Progress value={z.utilization} className="h-2" /></div>
                    <span className={`text-sm font-medium w-12 text-right ${z.utilization > 80 ? 'text-red-600' : ''}`}>{z.utilization}%</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Section 9 — Today's Shipments */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2"><Truck className="h-4 w-4" />Today's Shipments</CardTitle>
              <Button size="sm" variant="ghost" asChild><Link to="/outbound/shipping">View All</Link></Button>
            </div>
          </CardHeader>
          <CardContent>
            {shipments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No shipments today</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Carrier</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shipments.map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium text-sm">{s.orderNumber}</TableCell>
                      <TableCell className="text-xs">{s.customerName || '-'}</TableCell>
                      <TableCell className="text-xs">{s.carrier || '-'}</TableCell>
                      <TableCell><Badge variant="outline">{s.status}</Badge></TableCell>
                      <TableCell className="text-xs">{formatTime(s.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Section 10 — Recent Activity Feed */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4" />Recent Activity</CardTitle></CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No recent activity</p>
            ) : (
              <div className="space-y-2">
                {recentActivity.map((a: any) => (
                  <div key={a.id} className="flex items-center gap-3 py-1.5 border-b last:border-0">
                    <Badge variant="outline" className="text-[10px] w-16 justify-center">{a.type}</Badge>
                    <span className="text-xs flex-1">{a.movementNumber} — {a.quantity} units</span>
                    <span className="text-[10px] text-muted-foreground">{timeAgo(a.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
