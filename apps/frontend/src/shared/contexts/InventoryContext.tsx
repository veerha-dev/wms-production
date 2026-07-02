import React, { createContext, useContext, ReactNode, useMemo } from 'react';
import { useAuth } from '@/shared/contexts/AuthContext';
import { useSKUs, useCreateSKU, useUpdateSKU, useDeleteSKU } from '@/features/inventory/hooks/useSKUs';
import { useStockLevels, useCreateStockLevel, useUpdateStockLevel, useDeleteStockLevel } from '@/features/inventory/hooks/useStockLevels';
import { useBatches, useCreateBatch, useUpdateBatch } from '@/features/inventory/hooks/useBatches';
import { useMovements, useCreateMovement } from '@/features/inventory/hooks/useMovements';
import { useDamagedItems, useReportDamagedItem as useCreateDamagedItem, useUpdateDamagedItem } from '@/features/operations/hooks/useDamagedItems';
import { useAdjustments, useCreateAdjustment, useApproveAdjustment, useRejectAdjustment } from '@/features/operations/hooks/useAdjustments';
import { useAlerts, useAcknowledgeAlert } from '@/features/operations/hooks/useAlerts';
import { useWarehouses } from '@/features/warehouse/hooks/useWarehouses';
import { useZones } from '@/features/warehouse/hooks/useZones';
import { useBins } from '@/features/warehouse/hooks/useBins';
import { 
  SKUMaster, 
  StockLevel as LegacyStockLevel, 
  Batch, 
  InventoryMovement, 
  DamagedItem, 
  StockAdjustment,
  InventoryAlert,
} from '@/shared/types/inventory';

// DB types (API response shapes)
type DBBatch = any;
type DBSKU = any;
type DBStockLevel = any;
type DBMovement = any;
type DBDamagedItem = any;
type DBAdjustment = any;
type DBAlert = any;
type DBWarehouse = any;
type DBZone = any;
type DBBin = any;

// Convert DB batch to legacy format
function convertBatchToLegacy(batch: DBBatch, skus: DBSKU[]): Batch {
  const sku = skus.find(s => s.id === batch.skuId);
  return {
    id: batch.id,
    skuId: batch.skuId,
    skuCode: sku?.code || 'Unknown',
    batchNumber: batch.batchNumber,
    manufactureDate: batch.manufactureDate ? new Date(batch.manufactureDate) : new Date(),
    expiryDate: batch.expiryDate ? new Date(batch.expiryDate) : undefined,
    quantity: batch.quantity || 0,
    status: batch.status,
    supplierReference: batch.supplierReference || undefined,
    fifoRank: batch.fifoRank || 1,
    createdAt: new Date(batch.createdAt),
  };
}

// Convert DB SKU to legacy format
function convertSKUToLegacy(sku: DBSKU): SKUMaster {
  const metadata = (sku.metadata as any) || {};
  
  return {
    id: sku.id,
    code: sku.code,
    name: sku.name,
    description: sku.description || '',
    category: sku.category || 'General',
    subcategory: sku.subCategory || sku.subcategory || undefined,
    brand: sku.brand || undefined,
    uom: sku.uom || 'pcs',
    unit: sku.uom || 'pcs',
    weight: sku.weight ? Number(sku.weight) : undefined,
    dimensions: sku.length && sku.width && sku.height ? {
      length: Number(sku.length),
      width: Number(sku.width),
      height: Number(sku.height),
    } : undefined,
    barcode: sku.barcode || undefined,
    hsnCode: sku.hsnCode || undefined,
    gstRate: sku.gstRate ? Number(sku.gstRate) : undefined,
    costPrice: sku.costPrice ? Number(sku.costPrice) : undefined,
    sellingPrice: sku.sellingPrice ? Number(sku.sellingPrice) : undefined,
    reorderPoint: sku.reorderPoint ?? 0,
    reorderQty: sku.reorderQty ?? 0,
    minStock: sku.minStock ?? 0,
    maxStock: sku.maxStock ?? undefined,
    batchTracking: sku.batchTracking ?? false,
    expiryTracking: sku.expiryTracking ?? false,
    serialTracking: sku.serialTracking ?? false,
    shelfLifeDays: sku.shelfLifeDays || undefined,
    storageType: sku.storageType,
    hazardous: sku.hazardous || false,
    fragile: sku.fragile || false,
    tags: sku.tags || [],
    status: sku.status,
    imageUrl: sku.imageUrl || undefined,
    createdAt: new Date(sku.createdAt),
    updatedAt: new Date(sku.updatedAt),
  };
}

// Extended DB stock level with joined tables
type DBStockLevelWithRelations = DBStockLevel & {
  warehouses?: { id: string; name: string; code: string } | null;
  zones?: { id: string; name: string; code: string } | null;
  bins?: { id: string; code: string } | null;
  racks?: { id: string; name: string; code: string } | null;
};

// Convert DB stock level to legacy format
function convertStockLevelToLegacy(stock: DBStockLevel, skus: DBSKU[], warehouses: DBWarehouse[], zones: DBZone[], bins: DBBin[]): LegacyStockLevel {
  const sku = stock.sku || skus.find(s => s.id === stock.skuId);
  const warehouse = stock.warehouse || warehouses.find(w => w.id === stock.warehouseId);
  const zone = zones.find(z => z.id === stock.zoneId);
  const bin = stock.bin || bins.find(b => b.id === stock.binId);
  const qAvail = stock.quantityAvailable ?? 0;
  const qRes = stock.quantityReserved ?? 0;
  const qTransit = stock.quantityInTransit ?? 0;
  const qDmg = stock.quantityDamaged ?? 0;
  
  return {
    id: stock.id,
    skuId: stock.skuId,
    skuCode: sku?.code || 'Unknown',
    skuName: sku?.name || 'Unknown',
    warehouseId: stock.warehouseId,
    warehouseName: warehouse?.name || 'Warehouse',
    zoneId: stock.zoneId || undefined,
    zoneName: zone?.name || (stock.zoneId ? 'Zone' : undefined),
    binId: stock.binId || undefined,
    binCode: bin?.code || (stock.binId ? 'BIN' : undefined),
    batchId: stock.batchId || undefined,
    quantityAvailable: qAvail,
    quantityReserved: qRes,
    quantityInTransit: qTransit,
    quantityDamaged: qDmg,
    totalQuantity: qAvail + qRes + qTransit + qDmg,
    lastUpdated: new Date(stock.updatedAt || new Date()),
    lastCountedAt: stock.lastCountedAt ? new Date(stock.lastCountedAt) : undefined,
  };
}

// Convert DB movement to legacy format (with joined relations)
function convertMovementToLegacy(mov: any, skus: DBSKU[]): InventoryMovement {
  const sku = mov.sku || skus.find(s => s.id === mov.skuId);
  return {
    id: mov.id,
    movementNumber: mov.movementNumber,
    type: (mov.movementType || mov.type) as InventoryMovement['type'],
    skuId: mov.skuId,
    skuCode: sku?.code || 'Unknown',
    skuName: sku?.name || 'Unknown',
    quantity: mov.quantity,
    sourceWarehouse: mov.warehouse?.name || undefined,
    sourceZone: undefined,
    sourceBin: undefined,
    destinationWarehouse: undefined,
    destinationZone: undefined,
    destinationBin: undefined,
    reason: mov.notes || undefined,
    referenceType: mov.referenceType || undefined,
    referenceId: mov.referenceId || undefined,
    triggeredBy: mov.performedBy?.fullName || 'System',
    triggeredByRole: 'admin',
    timestamp: new Date(mov.createdAt || new Date()),
  };
}

// Convert DB damaged item to legacy format
function convertDamagedItemToLegacy(item: any, skus: DBSKU[]): DamagedItem {
  const sku = item.sku || skus.find(s => s.id === item.skuId);
  return {
    id: item.id,
    skuId: item.skuId,
    skuCode: sku?.code || 'Unknown',
    skuName: sku?.name || 'Unknown',
    quantity: item.quantity,
    category: item.damageType as DamagedItem['category'],
    description: item.description,
    photos: item.photos,
    location: item.warehouse?.name || 'Warehouse',
    decision: item.disposition as DamagedItem['decision'],
    decidedBy: item.decidedBy,
    decidedAt: item.decidedAt ? new Date(item.decidedAt) : undefined,
    reportedBy: item.reportedBy,
    reportedByRole: 'operator',
    createdAt: new Date(item.createdAt),
    createdBy: item.createdBy,
  };
}

// Convert DB adjustment to legacy format
function convertAdjustmentToLegacy(adj: DBAdjustment, skus: DBSKU[]): StockAdjustment {
  const firstItem = adj.items?.[0];
  const skuId = firstItem?.skuId;
  const sku = firstItem?.sku || skus.find(s => s.id === skuId);
  return {
    id: adj.id,
    adjustmentNumber: adj.adjustmentNumber,
    skuId,
    skuCode: sku?.code || 'Unknown',
    skuName: sku?.name || 'Unknown',
    location: adj.warehouse?.name || 'Warehouse',
    adjustmentType: adj.reason as StockAdjustment['adjustmentType'],
    previousQty: firstItem?.systemQty ?? 0,
    newQty: firstItem?.physicalQty ?? 0,
    quantityBefore: firstItem?.systemQty ?? 0,
    quantityAfter: firstItem?.physicalQty ?? 0,
    adjustmentQty: adj.totalVariance ?? (firstItem?.variance || 0),
    reason: adj.reason || adj.notes || '',
    status: adj.status,
    requestedBy: adj.createdBy?.fullName || 'User',
    requestedAt: new Date(adj.createdAt || new Date()),
    approvedBy: adj.approvedBy?.fullName || undefined,
    approvedAt: adj.appliedAt ? new Date(adj.appliedAt) : undefined,
  };
}

// Convert DB alert to legacy format
function convertAlertToLegacy(alert: any, skus: DBSKU[]): InventoryAlert {
  const sku = alert.sku || skus.find(s => s.id === alert.skuId);
  return {
    id: alert.id,
    type: alert.type as InventoryAlert['type'],
    skuId: alert.skuId,
    skuCode: sku?.code || 'Unknown',
    skuName: sku?.name || 'Unknown',
    warehouseId: alert.warehouseId,
    warehouseName: alert.warehouse?.name || 'Warehouse',
    message: alert.message,
    threshold: alert.thresholdValue ?? undefined,
    currentValue: alert.currentValue ?? undefined,
    acknowledged: alert.isAcknowledged ?? false,
    createdAt: new Date(alert.createdAt),
  };
}

interface InventoryContextType {
  // Legacy compatible data
  skus: SKUMaster[];
  stockLevels: LegacyStockLevel[];
  batches: Batch[];
  movements: InventoryMovement[];
  damagedItems: DamagedItem[];
  adjustments: StockAdjustment[];
  alerts: InventoryAlert[];
  isLoading: boolean;

  // Legacy compatible functions
  addSKU: (sku: Omit<SKUMaster, 'id' | 'createdAt' | 'updatedAt'>) => Promise<SKUMaster>;
  updateSKU: (id: string, updates: Partial<SKUMaster>) => Promise<void>;
  deleteSKU: (id: string) => Promise<void>;
  canDeleteSKU: (skuId: string) => Promise<boolean>;
  addStockLevel: (stock: Omit<LegacyStockLevel, 'id' | 'lastUpdated'>) => Promise<LegacyStockLevel>;
  updateStockLevel: (id: string, updates: Partial<LegacyStockLevel>) => Promise<void>;
  deleteStockLevel: (id: string) => Promise<void>;
  moveStock: (stockId: string, toWarehouse: string, toBin: string, quantity: number) => Promise<void>;
  lockStock: (stockId: string, quantity: number) => Promise<void>;
  releaseStock: (stockId: string, quantity: number) => Promise<void>;
  addBatch: (batch: Omit<Batch, 'id' | 'createdAt'>) => Promise<Batch>;
  updateBatch: (id: string, updates: Partial<Batch>) => Promise<void>;
  deleteBatch: (id: string) => Promise<void>;
  recordMovement: (movement: Omit<InventoryMovement, 'id' | 'movementNumber' | 'timestamp'>) => Promise<InventoryMovement>;
  reportDamage: (damage: Omit<DamagedItem, 'id' | 'createdAt'>) => Promise<DamagedItem>;
  decideDamage: (id: string, decision: DamagedItem['decision'], decidedBy: string) => Promise<void>;
  createAdjustment: (adjustment: Omit<StockAdjustment, 'id' | 'adjustmentNumber' | 'status' | 'requestedAt'>) => Promise<StockAdjustment>;
  approveAdjustment: (id: string, approvedBy: string) => Promise<void>;
  rejectAdjustment: (id: string, rejectedBy: string) => Promise<void>;
  acknowledgeAlert: (id: string) => Promise<void>;
}

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

function toArr(d: any): any[] {
  if (Array.isArray(d)) return d;
  if (d && Array.isArray(d.data)) return d.data;
  return [];
}

export function InventoryProvider({ children }: { children: ReactNode }) {
  // Queries
  const { data: _dbSKUs, isLoading: skusLoading } = useSKUs();
  const { data: _dbStockLevels, isLoading: stockLoading } = useStockLevels();
  const { data: _dbBatches, isLoading: batchesLoading } = useBatches();
  const { data: _dbMovements, isLoading: movementsLoading } = useMovements();
  const { data: _dbDamagedItems, isLoading: damagedLoading } = useDamagedItems();
  const { data: _dbAdjustments, isLoading: adjustmentsLoading } = useAdjustments();
  const { data: _dbAlerts, isLoading: alertsLoading } = useAlerts();
  const { data: _dbWarehouses, isLoading: warehousesLoading } = useWarehouses();
  const { data: _dbZones, isLoading: zonesLoading } = useZones();
  const { data: _dbBins, isLoading: binsLoading } = useBins();

  const dbSKUs = toArr(_dbSKUs);
  const dbStockLevels = toArr(_dbStockLevels);
  const dbBatches = toArr(_dbBatches);
  const dbMovements = toArr(_dbMovements);
  const dbDamagedItems = toArr(_dbDamagedItems);
  const dbAdjustments = toArr(_dbAdjustments);
  const dbAlerts = toArr(_dbAlerts);
  const dbWarehouses = toArr(_dbWarehouses);
  const dbZones = toArr(_dbZones);
  const dbBins = toArr(_dbBins);

  // Mutations
  const createSKUMutation = useCreateSKU();
  const updateSKUMutation = useUpdateSKU();
  const deleteSKUMutation = useDeleteSKU();
  const createStockLevelMutation = useCreateStockLevel();
  const updateStockLevelMutation = useUpdateStockLevel();
  const deleteStockLevelMutation = useDeleteStockLevel();
  const createBatchMutation = useCreateBatch();
  const updateBatchMutation = useUpdateBatch();
  const createMovementMutation = useCreateMovement();
  const createDamagedMutation = useCreateDamagedItem();
  const updateDamagedMutation = useUpdateDamagedItem();
  const createAdjustmentMutation = useCreateAdjustment();
  const approveAdjustmentMutation = useApproveAdjustment();
  const rejectAdjustmentMutation = useRejectAdjustment();
  const acknowledgeAlertMutation = useAcknowledgeAlert();

  // Convert to legacy formats
  const skus = useMemo(() => dbSKUs.map(convertSKUToLegacy), [dbSKUs]);
  const stockLevels = useMemo(() => {
    if (!dbStockLevels.length || !dbWarehouses.length || !dbZones.length || !dbBins.length) {
      return [];
    }
    return dbStockLevels.map(stock => 
      convertStockLevelToLegacy(stock, dbSKUs, dbWarehouses, dbZones, dbBins)
    );
  }, [dbStockLevels, dbSKUs, dbWarehouses, dbZones, dbBins]);
  const batches = useMemo(() => 
    dbBatches.map(b => convertBatchToLegacy(b, dbSKUs))
      .sort((a, b) => (a.expiryDate?.getTime() || 0) - (b.expiryDate?.getTime() || 0))
      .map((b, i) => ({ ...b, fifoRank: i + 1 })),
    [dbBatches, dbSKUs]
  );
  const movements = useMemo(() => dbMovements.map(m => convertMovementToLegacy(m, dbSKUs)), [dbMovements, dbSKUs]);
  const damagedItems = useMemo(() => dbDamagedItems.map(d => convertDamagedItemToLegacy(d, dbSKUs)), [dbDamagedItems, dbSKUs]);
  const adjustments = useMemo(() => dbAdjustments.map(a => convertAdjustmentToLegacy(a, dbSKUs)), [dbAdjustments, dbSKUs]);
  const alerts = useMemo(() => dbAlerts.map(a => convertAlertToLegacy(a, dbSKUs)), [dbAlerts, dbSKUs]);

  // Only block UI on core data — secondary data loads in background
  const isLoading = skusLoading || stockLoading || warehousesLoading || zonesLoading || binsLoading;

  // Legacy function implementations
  const addSKU = async (sku: Omit<SKUMaster, 'id' | 'createdAt' | 'updatedAt'>): Promise<SKUMaster> => {
    // Map legacy status to DB status
    const statusMap: Record<string, 'active' | 'inactive' | 'discontinued'> = {
      active: 'active',
      inactive: 'inactive',
      blocked: 'inactive',
      discontinued: 'discontinued',
    };
    const dbStatus = statusMap[sku.status] || 'active';
    
    // Create metadata object for additional attributes
    const metadata = {
      hazardous: sku.hazardous || false,
      fragile: sku.fragile || false,
      tags: sku.tags || [],
    };
    
    const result = await createSKUMutation.mutateAsync({
      skuCode: sku.code,
      name: sku.name,
      description: sku.description || null,
      category: sku.category || null,
      subCategory: sku.subcategory || null,
      brand: sku.brand || null,
      unitOfMeasure: sku.unit || sku.uom || 'UNITS',
      weightKg: sku.weight ? Number(sku.weight) : null,
      lengthCm: sku.dimensions?.length ? Number(sku.dimensions.length) : null,
      widthCm: sku.dimensions?.width ? Number(sku.dimensions.width) : null,
      heightCm: sku.dimensions?.height ? Number(sku.dimensions.height) : null,
      barcode: sku.barcode || null,
      hsnCode: sku.hsnCode || null,
      unitCost: sku.costPrice ? Number(sku.costPrice) : null,
      sellingPrice: sku.sellingPrice ? Number(sku.sellingPrice) : null,
      reorderPoint: sku.reorderPoint || 0,
      reorderQty: sku.reorderQty || 0,
      minStock: sku.minStock || 0,
      maxStock: sku.maxStock || null,
      isBatchTracked: sku.batchTracking || false,
      isSerialized: sku.serialTracking || false,
      isExpiryTracked: sku.expiryTracking || false,
      status: dbStatus,
      imageUrl: sku.imageUrl || null,
    });
    return convertSKUToLegacy(result);
  };

  const updateSKU = async (id: string, updates: Partial<SKUMaster>): Promise<void> => {
    // Map legacy status to DB status if provided
    let dbStatus: 'active' | 'inactive' | 'discontinued' | undefined;
    if (updates.status) {
      const statusMap: Record<string, 'active' | 'inactive' | 'discontinued'> = {
        active: 'active',
        inactive: 'inactive',
        blocked: 'inactive',
        discontinued: 'discontinued',
      };
      dbStatus = statusMap[updates.status] || 'active';
    }
    
    // Create metadata object for additional attributes if they exist in updates
    const metadataUpdates: any = {};
    if (updates.hazardous !== undefined) metadataUpdates.hazardous = updates.hazardous;
    if (updates.fragile !== undefined) metadataUpdates.fragile = updates.fragile;
    if (updates.tags !== undefined) metadataUpdates.tags = updates.tags;
    
    const updateData: any = {
      id,
      name: updates.name,
      description: updates.description,
      category: updates.category,
      subcategory: updates.subcategory,
      brand: updates.brand,
      uom: updates.unit || updates.uom,
      weight: updates.weight ? Number(updates.weight) : undefined,
      length: updates.dimensions?.length ? Number(updates.dimensions.length) : undefined,
      width: updates.dimensions?.width ? Number(updates.dimensions.width) : undefined,
      height: updates.dimensions?.height ? Number(updates.dimensions.height) : undefined,
      min_stock: updates.minStock,
      max_stock: updates.maxStock,
      reorder_point: updates.reorderPoint,
      reorder_qty: updates.reorderQty,
      is_batch_tracked: updates.batchTracking,
      is_serial_tracked: updates.serialTracking,
      shelf_life_days: updates.shelfLifeDays,
      status: dbStatus,
    };
    
    // Only include metadata if there are updates to it
    if (Object.keys(metadataUpdates).length > 0) {
      updateData.metadata = metadataUpdates;
    }
    
    await updateSKUMutation.mutateAsync(updateData);
  };

  const deleteSKU = async (id: string): Promise<void> => {
    await deleteSKUMutation.mutateAsync(id);
  };

  const canDeleteSKU = async (_skuId: string): Promise<boolean> => {
    return true;
  };

  const addStockLevel = async (stock: Omit<LegacyStockLevel, 'id' | 'lastUpdated'>): Promise<LegacyStockLevel> => {
    console.log('[InventoryContext] addStockLevel called with:', stock);
    try {
      const result = await createStockLevelMutation.mutateAsync({
        skuId: stock.skuId,
        warehouseId: stock.warehouseId,
        binId: stock.binId || null,
        batchId: stock.batchId || null,
        quantityAvailable: stock.quantityAvailable || 0,
        quantityReserved: stock.quantityReserved || 0,
        quantityInTransit: stock.quantityInTransit || 0,
        quantityDamaged: stock.quantityDamaged || 0,
      });
      console.log('[InventoryContext] addStockLevel success:', result);
      return convertStockLevelToLegacy(result, dbSKUs, [], [], []);
    } catch (error) {
      console.error('[InventoryContext] addStockLevel error:', error);
      throw error;
    }
  };

  const updateStockLevel = async (id: string, updates: Partial<LegacyStockLevel>): Promise<void> => {
    await updateStockLevelMutation.mutateAsync({
      id,
      quantityAvailable: updates.quantityAvailable,
      quantityReserved: updates.quantityReserved,
      quantityInTransit: updates.quantityInTransit,
      quantityDamaged: updates.quantityDamaged,
    });
  };

  const deleteStockLevel = async (id: string): Promise<void> => {
    await deleteStockLevelMutation.mutateAsync(id);
  };

  const moveStock = async (stockId: string, toWarehouse: string, toBin: string, quantity: number): Promise<void> => {
    // Get current stock level
    const currentStock = stockLevels.find(s => s.id === stockId);
    if (!currentStock) throw new Error('Stock not found');
    
    // ONLY create movement record - trigger handles stock updates automatically
    // This prevents double-update issues (manual + trigger)
    await createMovementMutation.mutateAsync({
      type: 'transfer',
      skuId: currentStock.skuId,
      quantity,
      sourceWarehouse: currentStock.warehouseId,
      sourceBin: currentStock.binId || null,
      destinationWarehouse: toWarehouse,
      destinationBin: toBin || null,
      reason: `Transfer from ${currentStock.warehouseName}`,
    });
  };

  const lockStock = async (stockId: string, quantity: number): Promise<void> => {
    const currentStock = stockLevels.find(s => s.id === stockId);
    if (!currentStock) throw new Error('Stock not found');
    
    // Update stock level: move from available to reserved
    await updateStockLevelMutation.mutateAsync({
      id: stockId,
      quantityAvailable: currentStock.quantityAvailable - quantity,
      quantityReserved: currentStock.quantityReserved + quantity,
    });
    
    // Create movement record for audit trail
    await createMovementMutation.mutateAsync({
      type: 'adjustment',
      skuId: currentStock.skuId,
      quantity,
      sourceWarehouse: currentStock.warehouseId,
      destinationWarehouse: currentStock.warehouseId,
      reason: `Stock locked/reserved: ${quantity} units`,
    });
  };

  const releaseStock = async (stockId: string, quantity: number): Promise<void> => {
    const currentStock = stockLevels.find(s => s.id === stockId);
    if (!currentStock) throw new Error('Stock not found');
    
    // Update stock level: move from reserved back to available
    await updateStockLevelMutation.mutateAsync({
      id: stockId,
      quantityAvailable: currentStock.quantityAvailable + quantity,
      quantityReserved: currentStock.quantityReserved - quantity,
    });
    
    // Create movement record for audit trail
    await createMovementMutation.mutateAsync({
      type: 'adjustment',
      skuId: currentStock.skuId,
      quantity,
      sourceWarehouse: currentStock.warehouseId,
      destinationWarehouse: currentStock.warehouseId,
      reason: `Stock released: ${quantity} units`,
    });
  };

  const addBatch = async (batch: Omit<Batch, 'id' | 'createdAt'>): Promise<Batch> => {
    const result = await createBatchMutation.mutateAsync({
      skuId: batch.skuId,
      batchNumber: batch.batchNumber,
      manufactureDate: batch.manufactureDate?.toISOString().split('T')[0],
      expiryDate: batch.expiryDate?.toISOString().split('T')[0],
      quantity: batch.quantity,
      supplierReference: batch.supplierReference,
    });
    return convertBatchToLegacy(result, dbSKUs);
  };

  const updateBatch = async (id: string, updates: Partial<Batch>): Promise<void> => {
    await updateBatchMutation.mutateAsync({
      id,
      status: updates.status,
      quantityRemaining: updates.quantity,
    });
  };

  const deleteBatch = async (id: string): Promise<void> => {
    // Soft delete - sets status to depleted
    await updateBatchMutation.mutateAsync({ id, status: 'depleted' });
  };

  const recordMovement = async (movement: Omit<InventoryMovement, 'id' | 'movementNumber' | 'timestamp'>): Promise<InventoryMovement> => {
    const sku = skus.find(s => s.code === movement.skuCode || s.id === movement.skuId);
    // Map legacy movement types to DB types
    const typeMap: Record<string, string> = {
      'stock-in': 'stock_in',
      'stock-out': 'stock_out',
      'picking': 'pick',
    };
    const dbType = typeMap[movement.type] || movement.type;
    
    // Build notes field combining reason and user-entered reference (reference_id is UUID, not text)
    const notesContent = [
      movement.reason,
      movement.reference ? `Ref: ${movement.reference}` : null,
    ].filter(Boolean).join(' | ') || null;

    const result = await createMovementMutation.mutateAsync({
      type: dbType as any,
      skuId: sku?.id || movement.skuId,
      quantity: Math.abs(movement.quantity),
      reason: movement.reason,
      sourceWarehouse: movement.sourceWarehouse || null,
      destinationWarehouse: movement.destinationWarehouse || null,
      sourceBin: movement.sourceBin || null,
      destinationBin: movement.destinationBin || null,
      referenceType: movement.referenceType || 'manual',
      reference: null,
      notes: notesContent,
    });
    
    return { 
      ...movement, 
      id: result?.id || '', 
      movementNumber: result?.movementNumber || '', 
      timestamp: new Date(result?.createdAt || new Date()) 
    } as InventoryMovement;
  };

  const reportDamage = async (damage: Omit<DamagedItem, 'id' | 'createdAt'>): Promise<DamagedItem> => {
    const sku = skus.find(s => s.code === damage.skuCode);
    
    await createDamagedMutation.mutateAsync({
      skuId: sku?.id || damage.skuId,
      warehouseId: damage.location,
      location: damage.location,
      quantity: damage.quantity,
      damageType: damage.category,
      description: damage.description,
      severity: 'moderate',
    });
    return { ...damage, id: '', createdAt: new Date() } as DamagedItem;
  };

  const decideDamage = async (id: string, decision: DamagedItem['decision'], decidedBy: string): Promise<void> => {
    await updateDamagedMutation.mutateAsync({ id, decision });
  };

  const createAdjustment = async (adjustment: Omit<StockAdjustment, 'id' | 'adjustmentNumber' | 'status' | 'requestedAt'>): Promise<StockAdjustment> => {
    const sku = skus.find(s => s.code === adjustment.skuCode);
    await createAdjustmentMutation.mutateAsync({
      warehouseId: adjustment.location,
      reason: adjustment.reason || adjustment.adjustmentType,
      items: [{
        skuId: sku?.id || adjustment.skuId,
        systemQty: adjustment.previousQty || adjustment.quantityBefore || 0,
        physicalQty: adjustment.newQty || adjustment.quantityAfter || 0,
        variance: (adjustment.newQty || adjustment.quantityAfter || 0) - (adjustment.previousQty || adjustment.quantityBefore || 0),
      }],
    });
    return { ...adjustment, id: '', adjustmentNumber: '', status: 'pending', requestedAt: new Date() } as StockAdjustment;
  };

  const approveAdjustment = async (id: string, approvedBy: string): Promise<void> => {
    await approveAdjustmentMutation.mutateAsync(id);
  };

  const rejectAdjustment = async (id: string, rejectedBy: string): Promise<void> => {
    await rejectAdjustmentMutation.mutateAsync(id);
  };

  const acknowledgeAlert = async (id: string): Promise<void> => {
    await acknowledgeAlertMutation.mutateAsync(id);
  };

  const contextValue = useMemo<InventoryContextType>(() => ({
    skus,
    stockLevels,
    batches,
    movements,
    damagedItems,
    adjustments,
    alerts,
    isLoading,
    addSKU,
    updateSKU,
    deleteSKU,
    canDeleteSKU,
    addStockLevel,
    updateStockLevel,
    deleteStockLevel,
    moveStock,
    lockStock,
    releaseStock,
    addBatch,
    updateBatch,
    deleteBatch,
    recordMovement,
    reportDamage,
    decideDamage,
    createAdjustment,
    approveAdjustment,
    rejectAdjustment,
    acknowledgeAlert,
  }), [skus, stockLevels, batches, movements, damagedItems, adjustments, alerts, isLoading]);

  return (
    <InventoryContext.Provider value={contextValue}>
      {children}
    </InventoryContext.Provider>
  );
}

export function useInventory() {
  const context = useContext(InventoryContext);
  if (context === undefined) {
    throw new Error('useInventory must be used within an InventoryProvider');
  }
  return context;
}
