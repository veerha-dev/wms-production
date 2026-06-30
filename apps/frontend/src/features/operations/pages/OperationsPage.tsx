import { AppLayout } from '@/shared/components/layout/AppLayout';
import { useState, useEffect } from 'react';
import { safeParseInt } from '@/shared/utils/input';
import { cn } from '@/shared/lib/utils';
import { api } from '@/shared/lib/api';
import { toast } from '@/shared/hooks/use-toast';
import { useWarehouses } from '@/features/warehouse/hooks/useWarehouses';
import { useZones } from '@/features/warehouse/hooks/useZones';
import { useRacksByZone } from '@/features/warehouse/hooks/useRacks';
import { useBinsByRack } from '@/features/warehouse/hooks/useBins';
import { useUsers } from '@/features/users/hooks/useUsers';
import { useSalesOrders } from '@/features/outbound/hooks/useSalesOrders';
import { useGRNs } from '@/features/inbound/hooks/useGRN';
import { useSKUs } from '@/features/inventory/hooks/useSKUs';
import { Badge } from '@/shared/components/ui/badge';
import {
  ClipboardList,
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  Eye,
  Play,
  Pause,
  User,
  Users,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Layers,
  ArrowUpDown,
  Edit,
  Trash2,
  MessageSquare,
  Calendar,
  Package,
} from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Progress } from '@/shared/components/ui/progress';
import { Checkbox } from '@/shared/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { Textarea } from '@/shared/components/ui/textarea';
import { Label } from '@/shared/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';

interface Task {
  id: string;
  tenant_id: string;
  task_number: string;
  template_id?: string;
  type: 'putaway' | 'pick' | 'pack' | 'transfer' | 'cycle_count' | 'replenishment' | 'return_processing';
  status: 'created' | 'assigned' | 'in_progress' | 'on_hold' | 'blocked' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  warehouse_id?: string;
  warehouse?: { id: string; name: string; code: string };
  assigned_to?: string;
  assignee?: { id: string; full_name: string; email: string };
  sku_id?: string;
  sku?: { id: string; sku_code: string; name: string };
  quantity?: number;
  instructions?: string;
  notes?: string;
  due_at?: string;
  sla_breached: boolean;
  created_by?: string;
  creator?: { id: string; full_name: string; email: string };
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
  assigned_at?: string;
}

interface TaskException {
  id: string;
  tenant_id: string;
  task_id: string;
  exception_type: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  status: 'open' | 'in_progress' | 'resolved' | 'escalated';
  reported_by?: string;
  reporter?: { id: string; full_name: string; email: string };
  reported_at: string;
  resolved_by?: string;
  resolver?: { id: string; full_name: string; email: string };
  resolved_at?: string;
  resolution_notes?: string;
  created_at: string;
  updated_at: string;
}

interface TaskComment {
  id: string;
  tenant_id: string;
  task_id: string;
  comment: string;
  commented_by?: string;
  commenter?: { id: string; full_name: string; email: string };
  commented_at: string;
  created_at: string;
  updated_at: string;
}

interface WorkflowTemplate {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  description?: string;
  type: 'putaway' | 'pick' | 'pack' | 'transfer' | 'cycle_count' | 'replenishment' | 'return_processing';
  steps: any[];
  default_priority: 'low' | 'medium' | 'high' | 'urgent';
  sla_minutes?: number;
  auto_assign: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const typeConfig = {
  putaway: { color: 'bg-blue-10 text-blue border-blue/20', icon: Layers },
  pick: { color: 'bg-green-10 text-green border-green/20', icon: ClipboardList },
  pack: { color: 'bg-purple-10 text-purple border-purple/20', icon: Package },
  transfer: { color: 'bg-orange-10 text-orange border-orange/20', icon: ArrowUpDown },
  cycle_count: { color: 'bg-cyan-10 text-cyan border-cyan/20', icon: RefreshCw },
  replenishment: { color: 'bg-indigo-10 text-indigo border-indigo/20', icon: Plus },
  return_processing: { color: 'bg-red-10 text-red border-red/20', icon: AlertTriangle },
};

const statusConfig = {
  pending: { color: 'bg-slate-100 text-slate-700 border-slate-200', label: 'Pending' },
  created: { color: 'bg-slate-100 text-slate-700 border-slate-200', label: 'Created' },
  assigned: { color: 'bg-blue-100 text-blue-700 border-blue-200', label: 'Assigned' },
  in_progress: { color: 'bg-yellow-100 text-yellow-700 border-yellow-200', label: 'In Progress' },
  on_hold: { color: 'bg-orange-100 text-orange-700 border-orange-200', label: 'On Hold' },
  blocked: { color: 'bg-red-100 text-red-700 border-red-200', label: 'Blocked' },
  completed: { color: 'bg-green-100 text-green-700 border-green-200', label: 'Completed' },
  cancelled: { color: 'bg-rose-100 text-rose-700 border-rose-200', label: 'Cancelled' },
  submitted: { color: 'bg-amber-100 text-amber-700 border-amber-200', label: 'Submitted' },
  approved: { color: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: 'Approved' },
  rejected: { color: 'bg-rose-100 text-rose-700 border-rose-200', label: 'Rejected' },
};

const priorityConfig = {
  low: { color: 'bg-gray-100 text-gray-700', label: 'Low' },
  medium: { color: 'bg-blue-100 text-blue-700', label: 'Medium' },
  high: { color: 'bg-orange-100 text-orange-700', label: 'High' },
  urgent: { color: 'bg-red-100 text-red-700', label: 'Urgent' },
};

export default function OperationsPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [exceptions, setExceptions] = useState<TaskException[]>([]);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedPriority, setSelectedPriority] = useState<string>('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showTaskDetail, setShowTaskDetail] = useState<Task | null>(null);
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [newTask, setNewTask] = useState({
    type: 'pick',
    priority: 'medium',
    quantity: 0,
    instructions: '',
    notes: '',
    warehouseId: '',
    assignedTo: '',
    dueDate: '',
    dueTime: '',
    linkedSoId: '',
    sourceBinId: '',
    linkedGrnId: '',
    sourceLocation: '',
    destinationBinId: '',
    countScope: 'full_zone',
    zoneId: '',
    rackId: '',
    binId: '',
    skuId: '',
    recurrence: 'one_time' as 'one_time' | 'recurring',
    repeatPattern: 'daily' as 'daily' | 'weekly' | 'monthly',
    daysOfWeek: [] as string[],
  });

  // Data hooks for dynamic form
  const { data: warehouses } = useWarehouses();
  const { data: workersData } = useUsers({ role: 'worker', warehouseId: newTask.warehouseId || undefined });
  const workers = Array.isArray(workersData) ? workersData : [];
  const { data: zonesData } = useZones({ warehouseId: newTask.warehouseId || undefined });
  const zones = zonesData || [];
  const { data: racks } = useRacksByZone(newTask.zoneId || null);
  const { data: bins } = useBinsByRack(newTask.rackId || null);
  const { data: sosData } = useSalesOrders();
  const salesOrders = sosData?.data || [];
  const { data: grnsData } = useGRNs();
  const grns = grnsData?.data || [];
  const { data: skus } = useSKUs();

  // Real-time data fetching
  useEffect(() => {
    fetchTasks();
    fetchTemplates();
    fetchExceptions();
    
    const interval = setInterval(() => { fetchTasks(); fetchExceptions(); }, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchTasks = async () => {
    try {
      // Start with a simple query to get basic task data
      const { data } = await api.get('/api/v1/tasks', { params: { limit: 100 } });
      setTasks(data.data || []);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch tasks',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      setTemplates([]);
    } catch (error) {
      console.error('Error fetching templates:', error);
    }
  };

  const fetchExceptions = async () => {
    try {
      // Start with a simple query to get basic exception data
      const { data } = await api.get('/api/v1/tasks', { params: { status: 'cancelled', limit: 50 } });
      setExceptions(data.data || []);
    } catch (error) {
      console.error('Error fetching exceptions:', error);
    }
  };

  const resetNewTask = () => setNewTask({
    type: 'pick', priority: 'medium', quantity: 0, instructions: '', notes: '',
    warehouseId: '', assignedTo: '', dueDate: '', dueTime: '',
    linkedSoId: '', sourceBinId: '', linkedGrnId: '', sourceLocation: '', destinationBinId: '',
    countScope: 'full_zone', zoneId: '', rackId: '', binId: '', skuId: '',
    recurrence: 'one_time', repeatPattern: 'daily', daysOfWeek: [],
  });

  const createTask = async () => {
    if (!newTask.warehouseId) {
      toast({ title: 'Validation', description: 'Please select a warehouse', variant: 'destructive' });
      return;
    }
    try {
      const dueDate = newTask.dueDate ? `${newTask.dueDate}T${newTask.dueTime || '00:00'}` : undefined;
      await api.post('/api/v1/tasks', {
        type: newTask.type,
        priority: newTask.priority,
        warehouseId: newTask.warehouseId || undefined,
        assignedTo: newTask.assignedTo || undefined,
        dueDate,
        notes: newTask.notes || undefined,
        instructions: newTask.instructions || undefined,
        // Pick-specific
        ...(newTask.type === 'pick' && {
          quantity: newTask.quantity,
          linkedSoId: newTask.linkedSoId || undefined,
          sourceBinId: newTask.sourceBinId || undefined,
          zoneId: newTask.zoneId || undefined,
          rackId: newTask.rackId || undefined,
        }),
        // Putaway-specific
        ...(newTask.type === 'putaway' && {
          quantity: newTask.quantity,
          linkedGrnId: newTask.linkedGrnId || undefined,
          sourceLocation: newTask.sourceLocation || undefined,
          destinationBinId: newTask.destinationBinId || undefined,
          zoneId: newTask.zoneId || undefined,
          rackId: newTask.rackId || undefined,
        }),
        // Cycle count-specific
        ...(newTask.type === 'cycle_count' && {
          countScope: newTask.countScope,
          zoneId: newTask.zoneId || undefined,
          rackId: newTask.rackId || undefined,
          binId: newTask.binId || undefined,
          skuId: newTask.skuId || undefined,
        }),
        // Pack/Transfer
        ...(['pack', 'transfer'].includes(newTask.type) && {
          quantity: newTask.quantity,
        }),
        // Recurrence
        recurrence: newTask.recurrence,
        ...(newTask.recurrence === 'recurring' && {
          repeatPattern: newTask.repeatPattern,
          ...(newTask.repeatPattern === 'weekly' && newTask.daysOfWeek.length > 0 && {
            daysOfWeek: newTask.daysOfWeek.join(','),
          }),
        }),
      });
      toast({ title: 'Success', description: 'Task created successfully' });
      setShowCreateDialog(false);
      resetNewTask();
      fetchTasks();
    } catch (error) {
      console.error('Error creating task:', error);
      toast({ title: 'Error', description: 'Failed to create task', variant: 'destructive' });
    }
  };

  const updateTaskStatus = async (taskId: string, newStatus: string) => {
    try {
      if (newStatus === 'in_progress') await api.post(`/api/v1/tasks/${taskId}/start`);
      else if (newStatus === 'completed') await api.post(`/api/v1/tasks/${taskId}/complete`);
      else if (newStatus === 'cancelled') await api.post(`/api/v1/tasks/${taskId}/cancel`);
      else await api.put(`/api/v1/tasks/${taskId}`, { status: newStatus });
      toast({
        title: 'Success',
        description: 'Task status updated',
      });
    } catch (error) {
      console.error('Error updating task:', error);
      toast({
        title: 'Error',
        description: 'Failed to update task',
        variant: 'destructive',
      });
    }
  };

  const deleteTask = async (taskId: string) => {
    try {
      await api.delete(`/api/v1/tasks/${taskId}`);
      toast({
        title: 'Success',
        description: 'Task deleted',
      });
    } catch (error) {
      console.error('Error deleting task:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete task',
        variant: 'destructive',
      });
    }
  };

  const filteredTasks = tasks.filter((task: any) => {
    const taskNum = task.taskNumber || task.task_number || '';
    const matchesSearch = taskNum.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         task.instructions?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         task.notes?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = selectedStatus === 'all' || task.status === selectedStatus;
    const matchesType = selectedType === 'all' || task.type === selectedType;
    const matchesPriority = selectedPriority === 'all' || task.priority === selectedPriority;
    
    return matchesSearch && matchesStatus && matchesType && matchesPriority;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'created': return <Clock className="w-4 h-4" />;
      case 'assigned': return <User className="w-4 h-4" />;
      case 'in_progress': return <RefreshCw className="w-4 h-4" />;
      case 'completed': return <CheckCircle2 className="w-4 h-4" />;
      case 'on_hold': return <Pause className="w-4 h-4" />;
      case 'blocked': return <AlertTriangle className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const getTypeIcon = (type: string) => {
    const Icon = typeConfig[type as keyof typeof typeConfig]?.icon || Layers;
    return <Icon className="w-4 h-4" />;
  };
  return (
    <AppLayout 
      title="Operations"
      breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Operations' }]}
    >
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Operations</h1>
            <p className="text-muted-foreground">Manage warehouse operations and tasks</p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Task
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Tasks</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{tasks.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {tasks.filter(t => t.status === 'in_progress').length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Completed Today</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {tasks.filter(t => t.status === 'completed').length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Exceptions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{exceptions.length}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex-1 min-w-[200px]">
            <Input
              placeholder="Search tasks..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full"
            />
          </div>
          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="created">Created</SelectItem>
              <SelectItem value="assigned">Assigned</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={selectedType} onValueChange={setSelectedType}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="putaway">Putaway</SelectItem>
              <SelectItem value="pick">Pick</SelectItem>
              <SelectItem value="pack">Pack</SelectItem>
              <SelectItem value="transfer">Transfer</SelectItem>
            </SelectContent>
          </Select>
          <Select value={selectedPriority} onValueChange={setSelectedPriority}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priority</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Tasks Table */}
        <Card>
          <CardHeader>
            <CardTitle>Tasks</CardTitle>
            <CardDescription>
              Real-time task management with {filteredTasks.length} tasks
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <RefreshCw className="w-6 h-6 animate-spin" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Task Number</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Assignee</TableHead>
                    <TableHead>Warehouse</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTasks.map((task) => (
                    <TableRow key={task.id}>
                      <TableCell className="font-medium">{(task as any).taskNumber || task.task_number}</TableCell>
                      <TableCell>
                        <Badge className={typeConfig[task.type]?.color}>
                          {getTypeIcon(task.type)}
                          <span className="ml-1">{task.type}</span>
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={statusConfig[task.status]?.color}>
                          {getStatusIcon(task.status)}
                          <span className="ml-1">{statusConfig[task.status]?.label}</span>
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={priorityConfig[task.priority]?.color}>
                          {priorityConfig[task.priority]?.label}
                        </Badge>
                      </TableCell>
                      <TableCell>{((task as any).assignedToId || task.assigned_to) ? 'Assigned' : 'Unassigned'}</TableCell>
                      <TableCell>{(task as any).warehouse?.name || task.warehouse_id || 'N/A'}</TableCell>
                      <TableCell>{new Date((task as any).createdAt || task.created_at).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setShowTaskDetail(task)}>
                              <Eye className="w-4 h-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => updateTaskStatus(task.id, 'in_progress')}>
                              <Play className="w-4 h-4 mr-2" />
                              Start Task
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => updateTaskStatus(task.id, 'completed')}>
                              <CheckCircle2 className="w-4 h-4 mr-2" />
                              Complete
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => deleteTask(task.id)} className="text-red-600">
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Create Task Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={(open) => { setShowCreateDialog(open); if (!open) resetNewTask(); }}>
          <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Task</DialogTitle>
              <DialogDescription>Create a new task for warehouse operations.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {/* Task Type */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Task Type <span className="text-red-500">*</span></Label>
                <Select value={newTask.type} onValueChange={(value) => setNewTask({
                  ...newTask, type: value,
                  linkedSoId: '', linkedGrnId: '', sourceBinId: '', destinationBinId: '',
                  sourceLocation: '', countScope: 'full_zone', zoneId: '', rackId: '', binId: '', skuId: '',
                  quantity: 0,
                })}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pick">Pick</SelectItem>
                    <SelectItem value="putaway">Putaway</SelectItem>
                    <SelectItem value="cycle_count">Cycle Count</SelectItem>
                    <SelectItem value="pack">Pack</SelectItem>
                    <SelectItem value="transfer">Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Recurrence */}
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Recurrence</Label>
                  <Select value={newTask.recurrence} onValueChange={(v: 'one_time' | 'recurring') => setNewTask({ ...newTask, recurrence: v, repeatPattern: 'daily', daysOfWeek: [] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="one_time">One Time (no repeat)</SelectItem>
                      <SelectItem value="recurring">Recurring</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {newTask.recurrence === 'recurring' && (
                  <div className="space-y-3 pl-3 border-l-2 border-primary/20">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Repeat</Label>
                      <Select value={newTask.repeatPattern} onValueChange={(v: 'daily' | 'weekly' | 'monthly') => setNewTask({ ...newTask, repeatPattern: v, daysOfWeek: [] })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">Daily</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {newTask.repeatPattern === 'weekly' && (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Every week on</Label>
                        <div className="flex flex-wrap gap-3">
                          {(['mon','tue','wed','thu','fri','sat','sun'] as const).map((day) => (
                            <label key={day} className="flex items-center gap-1.5 cursor-pointer select-none">
                              <Checkbox
                                checked={newTask.daysOfWeek.includes(day)}
                                onCheckedChange={(checked) => {
                                  setNewTask({
                                    ...newTask,
                                    daysOfWeek: checked
                                      ? [...newTask.daysOfWeek, day]
                                      : newTask.daysOfWeek.filter(d => d !== day),
                                  });
                                }}
                              />
                              <span className="text-sm capitalize">{day.charAt(0).toUpperCase() + day.slice(1)}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Common: Warehouse + Assign To */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Warehouse <span className="text-red-500">*</span></Label>
                  <Select value={newTask.warehouseId} onValueChange={(v) => setNewTask({
                    ...newTask, warehouseId: v, assignedTo: '', zoneId: '', rackId: '', binId: '',
                    sourceBinId: '', destinationBinId: '',
                  })}>
                    <SelectTrigger><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                    <SelectContent>
                      {(warehouses || []).map((w: any) => (
                        <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Assign To</Label>
                  <Select value={newTask.assignedTo || 'none'} onValueChange={(v) => setNewTask({ ...newTask, assignedTo: v === 'none' ? '' : v })}>
                    <SelectTrigger><SelectValue placeholder="Select worker" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {workers.map((w: any) => (
                        <SelectItem key={w.id} value={w.id}>{w.fullName || w.full_name || w.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Common: Due Date + Time */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Due Date</Label>
                  <Input type="date" value={newTask.dueDate} onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Due Time</Label>
                  <Input type="time" value={newTask.dueTime} onChange={(e) => setNewTask({ ...newTask, dueTime: e.target.value })} />
                </div>
              </div>

              {/* Common: Priority */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Priority</Label>
                <Select value={newTask.priority} onValueChange={(value) => setNewTask({ ...newTask, priority: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* ═══ PICK-SPECIFIC FIELDS ═══ */}
              {newTask.type === 'pick' && (
                <>
                  <div className="border-t pt-4">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pick Details</Label>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Linked Sales Order</Label>
                    <Select value={newTask.linkedSoId || 'none'} onValueChange={(v) => setNewTask({ ...newTask, linkedSoId: v === 'none' ? '' : v })}>
                      <SelectTrigger><SelectValue placeholder="Select SO" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {salesOrders.map((so: any) => (
                          <SelectItem key={so.id} value={so.id}>{so.so_number || so.soNumber} — {so.customer_name || so.customerName || 'Customer'}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {newTask.warehouseId && (
                    <>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Source Zone</Label>
                        <Select value={newTask.zoneId || 'none'} onValueChange={(v) => setNewTask({ ...newTask, zoneId: v === 'none' ? '' : v, rackId: '', binId: '', sourceBinId: '' })}>
                          <SelectTrigger><SelectValue placeholder="Select zone" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {(Array.isArray(zones) ? zones : []).map((z: any) => (
                              <SelectItem key={z.id} value={z.id}>{z.name} ({z.code})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {newTask.zoneId && (
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Source Rack</Label>
                          <Select value={newTask.rackId || 'none'} onValueChange={(v) => setNewTask({ ...newTask, rackId: v === 'none' ? '' : v, binId: '', sourceBinId: '' })}>
                            <SelectTrigger><SelectValue placeholder="Select rack" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              {(Array.isArray(racks) ? racks : []).map((r: any) => (
                                <SelectItem key={r.id} value={r.id}>{r.name || r.code}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      {newTask.rackId && (
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Source Bin</Label>
                          <Select value={newTask.sourceBinId || 'none'} onValueChange={(v) => setNewTask({ ...newTask, sourceBinId: v === 'none' ? '' : v })}>
                            <SelectTrigger><SelectValue placeholder="Select bin" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              {(Array.isArray(bins) ? bins : []).map((b: any) => (
                                <SelectItem key={b.id} value={b.id}>{b.code || b.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </>
                  )}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Quantity</Label>
                    <Input type="number" min="0" value={newTask.quantity} onChange={(e) => setNewTask({ ...newTask, quantity: safeParseInt(e.target.value, 0) })} />
                  </div>
                </>
              )}

              {/* ═══ PUTAWAY-SPECIFIC FIELDS ═══ */}
              {newTask.type === 'putaway' && (
                <>
                  <div className="border-t pt-4">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Putaway Details</Label>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Linked GRN</Label>
                      <Select value={newTask.linkedGrnId || 'none'} onValueChange={(v) => setNewTask({ ...newTask, linkedGrnId: v === 'none' ? '' : v })}>
                        <SelectTrigger><SelectValue placeholder="Select GRN" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {grns.map((g: any) => (
                            <SelectItem key={g.id} value={g.id}>{g.grn_number || g.grnNumber}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Source Location</Label>
                      <Select value={newTask.sourceLocation || 'none'} onValueChange={(v) => setNewTask({ ...newTask, sourceLocation: v === 'none' ? '' : v })}>
                        <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="receiving_dock">Receiving Dock</SelectItem>
                          <SelectItem value="qc_area">QC Area</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {newTask.warehouseId && (
                    <>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Destination Zone</Label>
                        <Select value={newTask.zoneId || 'none'} onValueChange={(v) => setNewTask({ ...newTask, zoneId: v === 'none' ? '' : v, rackId: '', binId: '', destinationBinId: '' })}>
                          <SelectTrigger><SelectValue placeholder="Select zone" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {(Array.isArray(zones) ? zones : []).map((z: any) => (
                              <SelectItem key={z.id} value={z.id}>{z.name} ({z.code})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {newTask.zoneId && (
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Destination Rack</Label>
                          <Select value={newTask.rackId || 'none'} onValueChange={(v) => setNewTask({ ...newTask, rackId: v === 'none' ? '' : v, binId: '', destinationBinId: '' })}>
                            <SelectTrigger><SelectValue placeholder="Select rack" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              {(Array.isArray(racks) ? racks : []).map((r: any) => (
                                <SelectItem key={r.id} value={r.id}>{r.name || r.code}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      {newTask.rackId && (
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Destination Bin</Label>
                          <Select value={newTask.destinationBinId || 'none'} onValueChange={(v) => setNewTask({ ...newTask, destinationBinId: v === 'none' ? '' : v })}>
                            <SelectTrigger><SelectValue placeholder="Select bin" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              {(Array.isArray(bins) ? bins : []).map((b: any) => (
                                <SelectItem key={b.id} value={b.id}>{b.code || b.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </>
                  )}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Quantity</Label>
                    <Input type="number" min="0" value={newTask.quantity} onChange={(e) => setNewTask({ ...newTask, quantity: safeParseInt(e.target.value, 0) })} />
                  </div>
                </>
              )}

              {/* ═══ CYCLE COUNT-SPECIFIC FIELDS ═══ */}
              {newTask.type === 'cycle_count' && (
                <>
                  <div className="border-t pt-4">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cycle Count Details</Label>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Count Scope</Label>
                    <Select value={newTask.countScope} onValueChange={(v) => setNewTask({ ...newTask, countScope: v, zoneId: '', rackId: '', binId: '', skuId: '' })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="full_zone">Full Zone</SelectItem>
                        <SelectItem value="specific_rack">Specific Rack</SelectItem>
                        <SelectItem value="specific_bin">Specific Bin</SelectItem>
                        <SelectItem value="sku_based">SKU Based</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Zone dropdown — shown for full_zone, specific_rack, specific_bin */}
                  {['full_zone', 'specific_rack', 'specific_bin'].includes(newTask.countScope) && newTask.warehouseId && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Zone</Label>
                      <Select value={newTask.zoneId || 'none'} onValueChange={(v) => setNewTask({ ...newTask, zoneId: v === 'none' ? '' : v, rackId: '', binId: '' })}>
                        <SelectTrigger><SelectValue placeholder="Select zone" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {(Array.isArray(zones) ? zones : []).map((z: any) => (
                            <SelectItem key={z.id} value={z.id}>{z.name} ({z.code})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {/* Rack dropdown — shown for specific_rack, specific_bin */}
                  {['specific_rack', 'specific_bin'].includes(newTask.countScope) && newTask.zoneId && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Rack</Label>
                      <Select value={newTask.rackId || 'none'} onValueChange={(v) => setNewTask({ ...newTask, rackId: v === 'none' ? '' : v, binId: '' })}>
                        <SelectTrigger><SelectValue placeholder="Select rack" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {(Array.isArray(racks) ? racks : []).map((r: any) => (
                            <SelectItem key={r.id} value={r.id}>{r.name || r.code}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {/* Bin dropdown — shown for specific_bin only */}
                  {newTask.countScope === 'specific_bin' && newTask.rackId && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Bin</Label>
                      <Select value={newTask.binId || 'none'} onValueChange={(v) => setNewTask({ ...newTask, binId: v === 'none' ? '' : v })}>
                        <SelectTrigger><SelectValue placeholder="Select bin" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {(Array.isArray(bins) ? bins : []).map((b: any) => (
                            <SelectItem key={b.id} value={b.id}>{b.code || b.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {/* SKU dropdown — shown for sku_based */}
                  {newTask.countScope === 'sku_based' && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">SKU</Label>
                      <Select value={newTask.skuId || 'none'} onValueChange={(v) => setNewTask({ ...newTask, skuId: v === 'none' ? '' : v })}>
                        <SelectTrigger><SelectValue placeholder="Search SKU" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {(Array.isArray(skus) ? skus : []).map((s: any) => (
                            <SelectItem key={s.id} value={s.id}>{s.sku_code || s.skuCode} — {s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </>
              )}

              {/* ═══ PACK / TRANSFER FIELDS ═══ */}
              {['pack', 'transfer'].includes(newTask.type) && (
                <>
                  <div className="border-t pt-4">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{newTask.type === 'pack' ? 'Pack' : 'Transfer'} Details</Label>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Quantity</Label>
                    <Input type="number" min="0" value={newTask.quantity} onChange={(e) => setNewTask({ ...newTask, quantity: safeParseInt(e.target.value, 0) })} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Instructions</Label>
                    <Textarea value={newTask.instructions} onChange={(e) => setNewTask({ ...newTask, instructions: e.target.value })} placeholder="Task instructions..." rows={2} />
                  </div>
                </>
              )}

              {/* Common: Notes */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Notes</Label>
                <Textarea value={newTask.notes} onChange={(e) => setNewTask({ ...newTask, notes: e.target.value })} placeholder="Additional notes..." rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowCreateDialog(false); resetNewTask(); }}>Cancel</Button>
              <Button onClick={createTask}>Create Task</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Task Detail Dialog */}
        <Dialog open={!!showTaskDetail} onOpenChange={() => setShowTaskDetail(null)}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Task Details</DialogTitle>
              <DialogDescription>
                {(showTaskDetail as any)?.taskNumber || showTaskDetail?.task_number}
              </DialogDescription>
            </DialogHeader>
            {showTaskDetail && (
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Type</Label>
                    <p className="text-sm text-muted-foreground">{showTaskDetail.type}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Status</Label>
                    <p className="text-sm text-muted-foreground">{showTaskDetail.status}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Priority</Label>
                    <p className="text-sm text-muted-foreground">{showTaskDetail.priority}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Quantity</Label>
                    <p className="text-sm text-muted-foreground">{showTaskDetail.quantity}</p>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium">Instructions</Label>
                  <p className="text-sm text-muted-foreground">{showTaskDetail.instructions}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Notes</Label>
                  <p className="text-sm text-muted-foreground">{showTaskDetail.notes}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Created</Label>
                    <p className="text-sm text-muted-foreground">
                      {new Date((showTaskDetail as any).createdAt || showTaskDetail.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Assignee</Label>
                    <p className="text-sm text-muted-foreground">{(showTaskDetail as any).assignedTo?.fullName || showTaskDetail.assigned_to || 'Unassigned'}</p>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowTaskDetail(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
