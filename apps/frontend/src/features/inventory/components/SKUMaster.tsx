import { useMemo, useState } from 'react';
import { cn } from '@/shared/lib/utils';
import { SKUMaster as SKUType } from '@/shared/types/inventory';
import {
  Package,
  Plus,
  Search,
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ArrowUpDown,
  Download,
  Upload,
  Tag,
  Flame,
  Lock,
  Loader2,
} from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Badge } from '@/shared/components/ui/badge';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Switch } from '@/shared/components/ui/switch';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import { useInventory } from '@/shared/contexts/InventoryContext';
import { useWMS } from '@/shared/contexts/WMSContext';
import { toast } from 'sonner';
import { ImportButton, ExportButton } from '@/shared/components/import-export';
import { skuImportExportConfig } from '@/shared/config/import-export';
import { useSKUs, useBulkCreateSKUs, useBulkUpdateSKUs } from '@/features/inventory/hooks/useSKUs';
import { LabelPrintButton, type LabelSku } from '@/features/labels';

const categories = ['Food & Grocery', 'Electronics', 'Kitchenware', 'Cleaning', 'Textiles', 'Auto Parts', 'Pharma', 'Industrial'];

const statusConfig = {
  active: { label: 'Active', color: 'bg-success/10 text-success border-success/20', icon: CheckCircle2 },
  inactive: { label: 'Inactive', color: 'bg-muted text-muted-foreground', icon: XCircle },
  blocked: { label: 'Blocked', color: 'bg-destructive/10 text-destructive border-destructive/20', icon: Lock },
};

const units = ['pcs', 'kg', 'ltr', 'bags', 'rolls', 'boxes', 'packs', 'sets', 'nos', 'strips'];

const defaultFormData = {
  code: '',
  name: '',
  description: '',
  category: '',
  unit: 'pcs',
  weight: '',
  length: '',
  width: '',
  height: '',
  hazardous: false,
  fragile: false,
  shelfLifeDays: '',
  status: 'active' as SKUType['status'],
  minStock: '',
  maxStock: '',
  reorderPoint: '',
  batchTracking: false,
  expiryTracking: false,
  serialTracking: false,
  tags: '',
};

export function SKUMaster() {
  const { skus, addSKU, updateSKU, deleteSKU, canDeleteSKU } = useInventory();
  const { tenant, currentUser } = useWMS();
  const { refetch: refetchSKUs } = useSKUs();
  const bulkCreate = useBulkCreateSKUs();
  const bulkUpdate = useBulkUpdateSKUs();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedSKUs, setSelectedSKUs] = useState<string[]>([]);
  
  // Dialog states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedSKU, setSelectedSKU] = useState<SKUType | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingDelete, setIsCheckingDelete] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [bulkEditData, setBulkEditData] = useState<Partial<SKUType>>({});
  
  // Form state
  const [formData, setFormData] = useState(defaultFormData);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isAdmin = currentUser?.role === 'admin';
  const maxSKUs = tenant?.limits.maxSKUs || 50000;
  const currentSKUCount = skus.length;
  const canCreateSKU = currentSKUCount < maxSKUs;

  // Bulk edit handler
  const handleBulkEdit = () => {
    if (selectedSKUs.length === 0) return;
    setIsBulkEditOpen(true);
  };

  const handleBulkUpdate = () => {
    const updates = selectedSKUs.map(id => ({
      id,
      data: bulkEditData
    }));
    bulkUpdate.mutate(updates, {
      onSuccess: () => {
        setSelectedSKUs([]);
        setIsBulkEditOpen(false);
        setBulkEditData({});
      }
    });
  };

  const filteredSKUs = skus.filter((sku) => {
    const matchesSearch = (sku.code?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      (sku.name?.toLowerCase() || '').includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'All' || sku.category === categoryFilter;
    const matchesStatus = statusFilter === 'all' || sku.status === statusFilter;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  /**
   * SKUs handed to the label printer.
   *
   * The current filter is what gets passed, so "print what I am looking at"
   * needs no extra state; ticking rows narrows it further via
   * `initialSelectedIds`. `barcode` is passed through as-is — a null one is not
   * papered over here, because the dialog has to flag those SKUs as falling
   * back to encoding their code.
   */
  const labelSkus: LabelSku[] = useMemo(
    () =>
      filteredSKUs.map((sku) => ({
        id: sku.id,
        code: sku.code,
        name: sku.name,
        barcode: sku.barcode ?? null,
        uom: sku.uom ?? sku.unit ?? null,
        category: sku.category,
      })),
    [filteredSKUs]
  );

  const handleSelectAll = () => {
    if (selectedSKUs.length === filteredSKUs.length) {
      setSelectedSKUs([]);
    } else {
      setSelectedSKUs(filteredSKUs.map(s => s.id));
    }
  };

  const resetForm = () => {
    setFormData(defaultFormData);
    setErrors({});
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.code.trim()) newErrors.code = 'SKU code is required';
    else if (formData.code.length > 20) newErrors.code = 'Code must be less than 20 characters';
    else if (!isEditOpen && skus.some(s => s.code === formData.code)) newErrors.code = 'SKU code already exists';
    
    if (!formData.name.trim()) newErrors.name = 'Product name is required';
    if (!formData.category) newErrors.category = 'Category is required';
    if (!formData.unit) newErrors.unit = 'Unit is required';
    
    setErrors(newErrors);
    
    if (Object.keys(newErrors).length > 0) {
      toast.error('Please fill in all required fields', {
        description: 'Check the Basic Info tab for missing fields marked with *'
      });
    }
    
    return Object.keys(newErrors).length === 0;
  };

  const handleCreate = async () => {
    if (!validateForm()) return;
    
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const newSKU = await addSKU({
      code: formData.code.toUpperCase(),
      name: formData.name.trim(),
      description: formData.description.trim(),
      category: formData.category,
      unit: formData.unit,
      weight: parseFloat(formData.weight) || 0,
      dimensions: {
        length: parseFloat(formData.length) || 0,
        width: parseFloat(formData.width) || 0,
        height: parseFloat(formData.height) || 0,
      },
      hazardous: formData.hazardous,
      fragile: formData.fragile,
      shelfLifeDays: parseInt(formData.shelfLifeDays) || undefined,
      status: formData.status,
      minStock: parseInt(formData.minStock) || 0,
      maxStock: parseInt(formData.maxStock) || 0,
      reorderPoint: parseInt(formData.reorderPoint) || 0,
      batchTracking: formData.batchTracking,
      expiryTracking: formData.expiryTracking,
      serialTracking: formData.serialTracking,
      tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
    });
    
    setIsLoading(false);
    setIsCreateOpen(false);
    resetForm();
    toast.success('SKU created successfully', { description: `${newSKU.code} - ${newSKU.name}` });
  };

  const handleEdit = async () => {
    if (!validateForm() || !selectedSKU) return;
    
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 500));
    
    updateSKU(selectedSKU.id, {
      name: formData.name.trim(),
      description: formData.description.trim(),
      category: formData.category,
      unit: formData.unit,
      weight: parseFloat(formData.weight) || 0,
      dimensions: {
        length: parseFloat(formData.length) || 0,
        width: parseFloat(formData.width) || 0,
        height: parseFloat(formData.height) || 0,
      },
      hazardous: formData.hazardous,
      fragile: formData.fragile,
      shelfLifeDays: parseInt(formData.shelfLifeDays) || undefined,
      status: formData.status,
      minStock: parseInt(formData.minStock) || 0,
      maxStock: parseInt(formData.maxStock) || 0,
      reorderPoint: parseInt(formData.reorderPoint) || 0,
      batchTracking: formData.batchTracking,
      expiryTracking: formData.expiryTracking,
      serialTracking: formData.serialTracking,
      tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
    });
    
    setIsLoading(false);
    setIsEditOpen(false);
    setSelectedSKU(null);
    resetForm();
    toast.success('SKU updated successfully');
  };

  const handleDelete = () => {
    if (!selectedSKU) return;
    deleteSKU(selectedSKU.id);
    setIsDeleteOpen(false);
    setSelectedSKU(null);
    toast.success('SKU deleted', { description: `${selectedSKU.code} has been permanently deleted.` });
  };

  const openEdit = (sku: SKUType) => {
    setSelectedSKU(sku);
    setFormData({
      code: sku.code,
      name: sku.name,
      description: sku.description || '',
      category: sku.category,
      unit: sku.unit,
      weight: sku.weight?.toString() || '',
      length: sku.dimensions?.length?.toString() || '',
      width: sku.dimensions?.width?.toString() || '',
      height: sku.dimensions?.height?.toString() || '',
      hazardous: sku.hazardous || false,
      fragile: sku.fragile || false,
      shelfLifeDays: sku.shelfLifeDays?.toString() || '',
      status: sku.status,
      minStock: sku.minStock?.toString() || '',
      maxStock: sku.maxStock?.toString() || '',
      reorderPoint: sku.reorderPoint?.toString() || '',
      batchTracking: sku.batchTracking || false,
      expiryTracking: sku.expiryTracking || false,
      serialTracking: sku.serialTracking || false,
      tags: sku.tags?.join(', ') || '',
    });
    setIsEditOpen(true);
  };

  const openView = (sku: SKUType) => {
    setSelectedSKU(sku);
    setIsViewOpen(true);
  };

  const openDelete = async (sku: SKUType) => {
    setSelectedSKU(sku);
    setIsCheckingDelete(true);
    
    try {
      const canDeleteResult = await canDeleteSKU(sku.id);
      setCanDelete(canDeleteResult);
    } catch (error) {
      console.error('Error checking delete eligibility:', error);
      setCanDelete(false);
    } finally {
      setIsCheckingDelete(false);
    }
    
    setIsDeleteOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Plan Limit Banner */}
      <div className="wms-card p-4 flex items-center justify-between bg-muted/30">
        <div className="flex items-center gap-3">
          <Package className="h-5 w-5 text-accent" />
          <div>
            <p className="font-medium">SKU Usage</p>
            <p className="text-sm text-muted-foreground">
              {currentSKUCount.toLocaleString('en-IN')} / {maxSKUs.toLocaleString('en-IN')} SKUs used
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-48 h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className={cn(
                "h-full transition-all",
                currentSKUCount / maxSKUs > 0.9 ? 'bg-destructive' : 
                currentSKUCount / maxSKUs > 0.7 ? 'bg-warning' : 'bg-success'
              )}
              style={{ width: `${(currentSKUCount / maxSKUs) * 100}%` }}
            />
          </div>
          <span className="text-sm font-medium">
            {Math.round((currentSKUCount / maxSKUs) * 100)}%
          </span>
        </div>
      </div>

      {/* Actions Bar */}
      <div className="wms-card">
        <div className="p-4 flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
          <div className="flex flex-1 gap-3 w-full lg:w-auto flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by SKU code or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[150px]">
                <Tag className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Categories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="blocked">Blocked</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex gap-2">
            <ImportButton
              config={skuImportExportConfig}
              size="sm"
              disabled={!isAdmin}
              onImportComplete={(result) => {
                refetchSKUs();
                if (result.created > 0) {
                  toast.success(`Successfully imported ${result.created} SKUs`);
                }
                if (result.failed > 0) {
                  toast.error(`Failed to import ${result.failed} SKUs`);
                }
              }}
            />
            <ExportButton
              config={skuImportExportConfig}
              data={filteredSKUs as Record<string, unknown>[]}
              size="sm"
            />
            <LabelPrintButton
              kind="sku"
              skus={labelSkus}
              initialSelectedIds={selectedSKUs}
              scopeHint={categoryFilter === 'All' ? undefined : categoryFilter}
              size="sm"
              disabled={labelSkus.length === 0}
            />
            <Button
              size="sm"
              className="gap-2"
              disabled={!canCreateSKU}
              onClick={() => {
                resetForm();
                setIsCreateOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Create SKU
            </Button>
          </div>
        </div>

        {/* Bulk Actions */}
        {selectedSKUs.length > 0 && (
          <div className="px-4 pb-4">
            <div className="flex items-center gap-3 p-3 bg-accent/5 border border-accent/20 rounded-lg">
              <span className="text-sm font-medium">{selectedSKUs.length} items selected</span>
              <div className="flex gap-2 ml-auto">
                <Button variant="outline" size="sm" disabled={!isAdmin || selectedSKUs.length === 0} onClick={handleBulkEdit}>
  Bulk Edit
</Button>
                <Button variant="outline" size="sm">Export Selected</Button>
                <Button variant="outline" size="sm" className="text-warning hover:text-warning" disabled={!isAdmin}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="wms-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="w-12">
                <Checkbox 
                  checked={selectedSKUs.length === filteredSKUs.length && filteredSKUs.length > 0}
                  onCheckedChange={handleSelectAll}
                />
              </TableHead>
              <TableHead className="cursor-pointer">
                <div className="flex items-center gap-1">
                  SKU Code <ArrowUpDown className="h-3 w-3" />
                </div>
              </TableHead>
              <TableHead>Product Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Stock Levels</TableHead>
              <TableHead>Flags</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSKUs.map((sku) => {
              const status = statusConfig[sku.status];
              const StatusIcon = status.icon;
              return (
                <TableRow key={sku.id} className="wms-table-row">
                  <TableCell>
                    <Checkbox 
                      checked={selectedSKUs.includes(sku.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedSKUs([...selectedSKUs, sku.id]);
                        } else {
                          setSelectedSKUs(selectedSKUs.filter(id => id !== sku.id));
                        }
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <span className="font-mono font-medium text-accent">{sku.code}</span>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{sku.name}</p>
                      {sku.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1">{sku.description}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{sku.category}</Badge>
                  </TableCell>
                  <TableCell className="capitalize">{sku.unit}</TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <p>Min: <span className="font-medium">{sku.minStock}</span></p>
                      <p className="text-muted-foreground">Max: {sku.maxStock}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {sku.batchTracking && (
                        <Badge variant="outline" className="text-xs bg-info/10 text-info border-info/20">Batch</Badge>
                      )}
                      {sku.expiryTracking && (
                        <Badge variant="outline" className="text-xs bg-warning/10 text-warning border-warning/20">Expiry</Badge>
                      )}
                      {sku.hazardous && (
                        <Badge variant="outline" className="text-xs bg-destructive/10 text-destructive border-destructive/20">
                          <Flame className="h-3 w-3 mr-1" />
                          Hazmat
                        </Badge>
                      )}
                      {sku.fragile && (
                        <Badge variant="outline" className="text-xs bg-warning/10 text-warning border-warning/20">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Fragile
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn('gap-1', status.color)}>
                      <StatusIcon className="h-3 w-3" />
                      {status.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openView(sku)}>
                          <Eye className="h-4 w-4 mr-2" />View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEdit(sku)} disabled={!isAdmin}>
                          <Edit className="h-4 w-4 mr-2" />Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          className="text-destructive" 
                          onClick={() => openDelete(sku)}
                          disabled={!isAdmin}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        <div className="p-4 border-t border-border flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {filteredSKUs.length} of {skus.length} SKUs
          </p>
        </div>
      </div>

      {/* Create/Edit SKU Dialog */}
      <Dialog open={isCreateOpen || isEditOpen} onOpenChange={(open) => {
        if (!open) {
          setIsCreateOpen(false);
          setIsEditOpen(false);
          setSelectedSKU(null);
          resetForm();
        }
      }}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEditOpen ? 'Edit SKU' : 'Create New SKU'}</DialogTitle>
            <DialogDescription>
              {isEditOpen ? `Update details for ${selectedSKU?.code}` : 'Add a new product to the inventory master. All fields marked with * are required.'}
            </DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="basic" className="mt-4">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="inventory">Stock Levels</TabsTrigger>
              <TabsTrigger value="attributes">Attributes</TabsTrigger>
              <TabsTrigger value="tracking">Tracking</TabsTrigger>
            </TabsList>
            <TabsContent value="basic" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>SKU Code *</Label>
                  <Input 
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    placeholder="SKU-XXXXX"
                    disabled={isEditOpen}
                    className={errors.code ? 'border-destructive' : ''}
                  />
                  {errors.code && <p className="text-xs text-destructive">{errors.code}</p>}
                  <p className="text-xs text-muted-foreground">Must be unique per tenant</p>
                </div>
                <div className="space-y-2">
                  <Label>Product Name *</Label>
                  <Input 
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Product name"
                    className={errors.name ? 'border-destructive' : ''}
                  />
                  {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea 
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Product description..."
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Category *</Label>
                  <Select 
                    value={formData.category} 
                    onValueChange={(value) => setFormData({ ...formData, category: value })}
                  >
                    <SelectTrigger className={errors.category ? 'border-destructive' : ''}>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.category && <p className="text-xs text-destructive">{errors.category}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Unit of Measure *</Label>
                  <Select 
                    value={formData.unit}
                    onValueChange={(value) => setFormData({ ...formData, unit: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {units.map((unit) => (
                        <SelectItem key={unit} value={unit} className="capitalize">{unit}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select 
                    value={formData.status}
                    onValueChange={(value: SKUType['status']) => setFormData({ ...formData, status: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="blocked">Blocked</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="inventory" className="space-y-4 mt-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Minimum Stock</Label>
                  <Input 
                    type="number" 
                    value={formData.minStock}
                    onChange={(e) => setFormData({ ...formData, minStock: e.target.value })}
                    placeholder="0" 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Maximum Stock</Label>
                  <Input 
                    type="number" 
                    value={formData.maxStock}
                    onChange={(e) => setFormData({ ...formData, maxStock: e.target.value })}
                    placeholder="0" 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Reorder Point</Label>
                  <Input 
                    type="number" 
                    value={formData.reorderPoint}
                    onChange={(e) => setFormData({ ...formData, reorderPoint: e.target.value })}
                    placeholder="0" 
                  />
                </div>
              </div>
            </TabsContent>
            <TabsContent value="attributes" className="space-y-4 mt-4">
              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Weight (kg)</Label>
                  <Input 
                    type="number" 
                    value={formData.weight}
                    onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                    placeholder="0.00" 
                    step="0.01" 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Length (cm)</Label>
                  <Input 
                    type="number" 
                    value={formData.length}
                    onChange={(e) => setFormData({ ...formData, length: e.target.value })}
                    placeholder="0" 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Width (cm)</Label>
                  <Input 
                    type="number" 
                    value={formData.width}
                    onChange={(e) => setFormData({ ...formData, width: e.target.value })}
                    placeholder="0" 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Height (cm)</Label>
                  <Input 
                    type="number" 
                    value={formData.height}
                    onChange={(e) => setFormData({ ...formData, height: e.target.value })}
                    placeholder="0" 
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-2">
                    <Flame className="h-4 w-4 text-destructive" />
                    <div>
                      <p className="font-medium">Hazardous Material</p>
                      <p className="text-sm text-muted-foreground">Requires special handling</p>
                    </div>
                  </div>
                  <Switch 
                    checked={formData.hazardous}
                    onCheckedChange={(checked) => setFormData({ ...formData, hazardous: checked })}
                  />
                </div>
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-warning" />
                    <div>
                      <p className="font-medium">Fragile</p>
                      <p className="text-sm text-muted-foreground">Handle with care</p>
                    </div>
                  </div>
                  <Switch 
                    checked={formData.fragile}
                    onCheckedChange={(checked) => setFormData({ ...formData, fragile: checked })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Shelf Life (days)</Label>
                <Input 
                  type="number" 
                  value={formData.shelfLifeDays}
                  onChange={(e) => setFormData({ ...formData, shelfLifeDays: e.target.value })}
                  placeholder="Leave empty if not perishable" 
                />
              </div>
            </TabsContent>
            <TabsContent value="tracking" className="space-y-4 mt-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">Batch Tracking</p>
                    <p className="text-sm text-muted-foreground">Track items by batch/lot numbers</p>
                  </div>
                  <Switch 
                    checked={formData.batchTracking}
                    onCheckedChange={(checked) => setFormData({ ...formData, batchTracking: checked })}
                  />
                </div>
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">Expiry Tracking</p>
                    <p className="text-sm text-muted-foreground">Track expiration dates for perishable items</p>
                  </div>
                  <Switch
                    checked={formData.expiryTracking}
                    onCheckedChange={(checked) => setFormData({ ...formData, expiryTracking: checked })}
                  />
                </div>
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">Serial Number Tracking</p>
                    <p className="text-sm text-muted-foreground">Track individual units by unique serial number (electronics, machinery, high-value items)</p>
                  </div>
                  <Switch
                    checked={formData.serialTracking}
                    onCheckedChange={(checked) => setFormData({ ...formData, serialTracking: checked })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Tags</Label>
                <Input 
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  placeholder="Enter tags separated by commas" 
                />
                <p className="text-xs text-muted-foreground">e.g., premium, fast-moving, seasonal</p>
              </div>
            </TabsContent>
          </Tabs>
          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => {
              setIsCreateOpen(false);
              setIsEditOpen(false);
              resetForm();
            }} disabled={isLoading}>
              Cancel
            </Button>
            <Button onClick={isEditOpen ? handleEdit : handleCreate} disabled={isLoading}>
              {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEditOpen ? 'Save Changes' : 'Create SKU'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Details Dialog */}
      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>SKU Details</DialogTitle>
          </DialogHeader>
          {selectedSKU && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 bg-muted/30 rounded-lg">
                <div className="h-12 w-12 rounded-lg bg-accent/10 flex items-center justify-center">
                  <Package className="h-6 w-6 text-accent" />
                </div>
                <div>
                  <p className="font-mono font-bold text-lg">{selectedSKU.code}</p>
                  <p className="text-muted-foreground">{selectedSKU.name}</p>
                </div>
                <Badge variant="outline" className={cn('ml-auto', statusConfig[selectedSKU.status].color)}>
                  {statusConfig[selectedSKU.status].label}
                </Badge>
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Category</p>
                  <p className="font-medium">{selectedSKU.category}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Unit</p>
                  <p className="font-medium capitalize">{selectedSKU.unit}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Min Stock</p>
                  <p className="font-medium">{selectedSKU.minStock}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Max Stock</p>
                  <p className="font-medium">{selectedSKU.maxStock}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Weight</p>
                  <p className="font-medium">{selectedSKU.weight} kg</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Dimensions</p>
                  <p className="font-medium">
                    {selectedSKU.dimensions?.length} × {selectedSKU.dimensions?.width} × {selectedSKU.dimensions?.height} cm
                  </p>
                </div>
              </div>

              <div className="flex gap-2 flex-wrap">
                {selectedSKU.batchTracking && (
                  <Badge variant="outline" className="bg-info/10 text-info border-info/20">Batch Tracking</Badge>
                )}
                {selectedSKU.expiryTracking && (
                  <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">Expiry Tracking</Badge>
                )}
                {selectedSKU.serialTracking && (
                  <Badge variant="outline" className="bg-purple-100 text-purple-700 border-purple-200">Serial Tracking</Badge>
                )}
                {selectedSKU.hazardous && (
                  <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">Hazardous</Badge>
                )}
                {selectedSKU.fragile && (
                  <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">Fragile</Badge>
                )}
              </div>

              {selectedSKU.description && (
                <div>
                  <p className="text-muted-foreground text-sm">Description</p>
                  <p>{selectedSKU.description}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewOpen(false)}>Close</Button>
            {isAdmin && (
              <Button onClick={() => {
                setIsViewOpen(false);
                if (selectedSKU) openEdit(selectedSKU);
              }}>
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isCheckingDelete ? 'Checking...' : canDelete ? 'Delete SKU?' : 'Cannot Delete SKU'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isCheckingDelete ? (
                'Checking if this SKU can be safely deleted...'
              ) : canDelete ? (
                `Are you sure you want to delete "${selectedSKU?.code} - ${selectedSKU?.name}"? 
                The SKU will be permanently removed from the system.`
              ) : (
                `Cannot delete "${selectedSKU?.code} - ${selectedSKU?.name}" because it has existing stock levels. 
                You must first remove all stock from all warehouses before deleting this SKU.`
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {!isCheckingDelete && canDelete && (
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete SKU
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Edit Dialog */}
      <Dialog open={isBulkEditOpen} onOpenChange={setIsBulkEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Bulk Edit SKUs</DialogTitle>
            <DialogDescription>
              Update {selectedSKUs.length} selected SKUs. Only fill in the fields you want to change.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="category">Category</Label>
              <select
                id="category"
                className="w-full mt-1 p-2 border rounded"
                value={bulkEditData.category || ''}
                onChange={(e) => setBulkEditData({ ...bulkEditData, category: e.target.value })}
              >
                <option value="">Select category</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                className="w-full mt-1 p-2 border rounded"
                value={bulkEditData.status || ''}
                onChange={(e) => setBulkEditData({ ...bulkEditData, status: e.target.value as any })}
              >
                <option value="">Select status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="blocked">Blocked</option>
              </select>
            </div>
            <div>
              <Label htmlFor="basePrice">Base Price</Label>
              <Input
                id="basePrice"
                type="number"
                step="0.01"
                placeholder="Leave unchanged"
                value={bulkEditData.basePrice || ''}
                onChange={(e) => setBulkEditData({ ...bulkEditData, basePrice: parseFloat(e.target.value) || undefined })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBulkEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleBulkUpdate} disabled={bulkUpdate.isPending}>
              {bulkUpdate.isPending ? 'Updating...' : 'Update SKUs'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
