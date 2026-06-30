import { useState } from 'react';
import { safeParseInt } from '@/shared/utils/input';
import { AppLayout } from '@/shared/components/layout/AppLayout';
import { ClipboardCheck, Clock, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { useToast } from '@/shared/hooks/use-toast';
import { useQCInspections, useQCInspection, usePendingQCInspections, useStartInspection, useCompleteInspection, useAddDefect } from '@/features/inbound/hooks/useQCInspections';
import { cn } from '@/shared/lib/utils';

export default function QCInspectionsPage() {
  const { toast } = useToast();
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedInspection, setSelectedInspection] = useState<string | null>(null);

  const { data: inspectionsData, isLoading } = useQCInspections({
    page,
    limit: 50,
    status: statusFilter || undefined,
  });
  const { data: pendingInspections } = usePendingQCInspections();

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; icon: any; className?: string }> = {
      pending: { variant: 'secondary', icon: Clock, className: 'bg-slate-100 text-slate-700 border-slate-200' },
      in_progress: { variant: 'default', icon: ClipboardCheck, className: 'bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100' },
      passed: { variant: 'default', icon: CheckCircle, className: 'bg-green-100 text-green-700 border-green-200 hover:bg-green-100' },
      failed: { variant: 'destructive', icon: XCircle, className: 'bg-rose-100 text-rose-700 border-rose-200 hover:bg-rose-100' },
      conditional_pass: { variant: 'default', icon: AlertTriangle, className: 'bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100' },
    };
    const config = variants[status] || variants.pending;
    const Icon = config.icon;
    return (
      <Badge variant={config.variant} className={cn("gap-1 font-medium px-2 py-0.5 rounded-full border", config.className)}>
        <Icon className="h-3 w-3" />
        {status.replace(/_/g, ' ')}
      </Badge>
    );
  };

  return (
    <AppLayout title="Quality Control" breadcrumbs={[{ label: 'Inbound' }, { label: 'QC Inspections' }]}>
      <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Quality Control</h1>
          <p className="text-muted-foreground">Inspect and approve incoming goods</p>
        </div>
        {pendingInspections?.data && pendingInspections.data.length > 0 && (
          <Badge variant="destructive" className="text-lg px-4 py-2">
            {pendingInspections.data.length} Pending
          </Badge>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingInspections?.data?.length || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {inspectionsData?.data?.filter((i: any) => i.status === 'in_progress').length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Passed</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {inspectionsData?.data?.filter((i: any) => i.status === 'passed').length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed</CardTitle>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {inspectionsData?.data?.filter((i: any) => i.status === 'failed').length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">All Inspections</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="in_progress">In Progress</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <InspectionsTable
            data={inspectionsData?.data}
            isLoading={isLoading}
            onSelectInspection={setSelectedInspection}
            getStatusBadge={getStatusBadge}
          />
        </TabsContent>

        <TabsContent value="pending">
          <InspectionsTable
            data={pendingInspections?.data}
            isLoading={false}
            onSelectInspection={setSelectedInspection}
            getStatusBadge={getStatusBadge}
          />
        </TabsContent>

        <TabsContent value="in_progress">
          <InspectionsTable
            data={inspectionsData?.data?.filter((i: any) => i.status === 'in_progress')}
            isLoading={isLoading}
            onSelectInspection={setSelectedInspection}
            getStatusBadge={getStatusBadge}
          />
        </TabsContent>

        <TabsContent value="completed">
          <InspectionsTable
            data={inspectionsData?.data?.filter((i: any) => ['passed', 'failed', 'conditional_pass'].includes(i.status))}
            isLoading={isLoading}
            onSelectInspection={setSelectedInspection}
            getStatusBadge={getStatusBadge}
          />
        </TabsContent>
      </Tabs>

      {selectedInspection && (
        <InspectionDialog
          inspectionId={selectedInspection}
          open={!!selectedInspection}
          onOpenChange={(open) => !open && setSelectedInspection(null)}
        />
      )}
      </div>
    </AppLayout>
  );
}

function InspectionsTable({ data, isLoading, onSelectInspection, getStatusBadge }: any) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Inspection #</TableHead>
              <TableHead>GRN #</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Sample Size</TableHead>
              <TableHead>Inspector</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.map((inspection: any) => (
              <TableRow key={inspection.id}>
                <TableCell className="font-medium">{inspection.inspectionNumber || inspection.inspection_number}</TableCell>
                <TableCell>{inspection.grn?.grnNumber || inspection.goods_receipt_notes?.grn_number || '-'}</TableCell>
                <TableCell>
                  {inspection.sku?.skuCode || inspection.skus?.sku_code || '-'} - {inspection.sku?.name || inspection.skus?.name || '-'}
                </TableCell>
                <TableCell>{getStatusBadge(inspection.status)}</TableCell>
                <TableCell className="capitalize">{inspection.inspectionType || inspection.inspection_type || '-'}</TableCell>
                <TableCell>{inspection.sampleSize || inspection.sample_size || '-'}</TableCell>
                <TableCell>{(inspection.inspectorId || inspection.inspector_id) ? 'Assigned' : 'Unassigned'}</TableCell>
                <TableCell>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onSelectInspection(inspection.id)}
                  >
                    {inspection.status === 'pending' ? 'Start' : inspection.status === 'in_progress' ? 'Continue' : 'View'}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {(!data || data.length === 0) && (
          <div className="text-center py-8 text-muted-foreground">
            No inspections found.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InspectionDialog({ inspectionId, open, onOpenChange }: any) {
  const { data: inspection, isLoading } = useQCInspection(inspectionId);
  const startInspection = useStartInspection();
  const completeInspection = useCompleteInspection();
  const addDefect = useAddDefect();

  const [formData, setFormData] = useState({
    passed_quantity: 0,
    failed_quantity: 0,
    checklist: [] as any[],
    defect_details: [] as any[],
    result_notes: '',
  });

  const [newDefect, setNewDefect] = useState({
    type: '',
    description: '',
    severity: 'minor',
  });

  const handleStart = () => {
    startInspection.mutate(inspectionId);
  };

  const handleAddDefect = () => {
    if (!newDefect.type || !newDefect.description) return;
    
    const defect = {
      ...newDefect,
      timestamp: new Date().toISOString(),
    };
    
    addDefect.mutate({ id: inspectionId, defect }, {
      onSuccess: () => {
        setNewDefect({ type: '', description: '', severity: 'minor' });
      },
    });
  };

  const handleComplete = () => {
    if (formData.passed_quantity === 0 && formData.failed_quantity === 0) {
      return;
    }
    
    const result = formData.failed_quantity > 0 ? 'failed' : 'passed';
    completeInspection.mutate({
      id: inspectionId,
      result,
      notes: formData.result_notes,
    }, {
      onSuccess: () => onOpenChange(false),
    });
  };

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl">
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const isCompleted = ['passed', 'failed', 'conditional_pass'].includes(inspection?.status);
  const isPending = inspection?.status === 'pending';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>QC Inspection: {inspection?.inspectionNumber || inspection?.inspection_number}</DialogTitle>
          <DialogDescription>
            GRN: {inspection?.grn?.grnNumber || inspection?.goods_receipt_notes?.grn_number || '-'} | SKU: {inspection?.sku?.skuCode || inspection?.skus?.sku_code || '-'} - {inspection?.sku?.name || inspection?.skus?.name || '-'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-4 text-sm">
            <div>
              <Label className="text-muted-foreground">Status</Label>
              <div className="mt-1">
                <Badge>{inspection?.status}</Badge>
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground">Type</Label>
              <p className="font-medium capitalize">{inspection?.inspectionType || inspection?.inspection_type || '-'}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Sample Size</Label>
              <p className="font-medium">{inspection?.sampleSize || inspection?.sample_size || '-'}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Inspection Date</Label>
              <p className="font-medium">
                {(inspection?.inspectionDate || inspection?.inspection_date) ? new Date(inspection.inspectionDate || inspection.inspection_date).toLocaleDateString() : '-'}
              </p>
            </div>
          </div>

          {!isCompleted && (
            <>
              <div className="border rounded-lg p-4 space-y-4">
                <h3 className="font-semibold">Inspection Results</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="passed_quantity">Passed Quantity *</Label>
                    <Input
                      id="passed_quantity"
                      type="number"
                      min="0"
                      value={formData.passed_quantity}
                      onChange={(e) => setFormData({ ...formData, passed_quantity: safeParseInt(e.target.value, 0) })}
                      disabled={isPending}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="failed_quantity">Failed Quantity *</Label>
                    <Input
                      id="failed_quantity"
                      type="number"
                      min="0"
                      value={formData.failed_quantity}
                      onChange={(e) => setFormData({ ...formData, failed_quantity: safeParseInt(e.target.value, 0) })}
                      disabled={isPending}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Total Inspected</Label>
                    <Input
                      value={formData.passed_quantity + formData.failed_quantity}
                      disabled
                      className="bg-muted"
                    />
                  </div>
                </div>
              </div>

              <div className="border rounded-lg p-4 space-y-4">
                <h3 className="font-semibold">Add Defect</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="defect_type">Defect Type</Label>
                    <Input
                      id="defect_type"
                      value={newDefect.type}
                      onChange={(e) => setNewDefect({ ...newDefect, type: e.target.value })}
                      placeholder="e.g., Scratches, Dents"
                      disabled={isPending}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="severity">Severity</Label>
                    <Select
                      value={newDefect.severity}
                      onValueChange={(v) => setNewDefect({ ...newDefect, severity: v })}
                      disabled={isPending}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="minor">Minor</SelectItem>
                        <SelectItem value="major">Major</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button
                      onClick={handleAddDefect}
                      disabled={!newDefect.type || !newDefect.description || isPending}
                      className="w-full"
                    >
                      Add Defect
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="defect_description">Description</Label>
                  <Textarea
                    id="defect_description"
                    value={newDefect.description}
                    onChange={(e) => setNewDefect({ ...newDefect, description: e.target.value })}
                    placeholder="Describe the defect..."
                    disabled={isPending}
                  />
                </div>
              </div>

              {(inspection?.defectDetails || inspection?.defect_details) && Array.isArray(inspection.defectDetails || inspection.defect_details) && (inspection.defectDetails || inspection.defect_details).length > 0 && (
                <div className="border rounded-lg p-4 space-y-2">
                  <h3 className="font-semibold">Logged Defects</h3>
                  {((inspection.defectDetails || inspection.defect_details) as any[]).map((defect: any, index: number) => (
                    <div key={index} className="border-l-4 border-red-500 pl-4 py-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{defect.type}</span>
                        <Badge variant={defect.severity === 'critical' ? 'destructive' : 'secondary'}>
                          {defect.severity}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{defect.description}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="result_notes">Inspection Notes</Label>
                <Textarea
                  id="result_notes"
                  value={formData.result_notes}
                  onChange={(e) => setFormData({ ...formData, result_notes: e.target.value })}
                  placeholder="Additional notes about the inspection..."
                  rows={4}
                  disabled={isPending}
                />
              </div>
            </>
          )}

          {isCompleted && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
                <div>
                  <Label className="text-muted-foreground">Passed</Label>
                  <p className="text-2xl font-bold text-green-600">{inspection?.passedQuantity || inspection?.passed_quantity || 0}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Failed</Label>
                  <p className="text-2xl font-bold text-red-600">{inspection?.failedQuantity || inspection?.failed_quantity || 0}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Total Inspected</Label>
                  <p className="text-2xl font-bold">{inspection?.inspectedQuantity || inspection?.inspected_quantity || 0}</p>
                </div>
              </div>
              {(inspection?.resultNotes || inspection?.result_notes) && (
                <div>
                  <Label className="text-muted-foreground">Notes</Label>
                  <p className="text-sm mt-1">{inspection.resultNotes || inspection.result_notes}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {isCompleted ? 'Close' : 'Cancel'}
          </Button>
          {isPending && (
            <Button onClick={handleStart} disabled={startInspection.isPending}>
              {startInspection.isPending ? 'Starting...' : 'Start Inspection'}
            </Button>
          )}
          {!isCompleted && !isPending && (
            <Button onClick={handleComplete} disabled={completeInspection.isPending}>
              {completeInspection.isPending ? 'Completing...' : 'Complete Inspection'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
