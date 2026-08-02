import { useState, useMemo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '@/shared/components/layout/AppLayout';
import { useWMS } from '@/shared/contexts/WMSContext';
import { 
  Eye, 
  Edit3, 
  Package,
  Plus,
  Loader2,
  Maximize2,
  Minimize2,
  X,
} from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import { Switch } from '@/shared/components/ui/switch';
import { Label } from '@/shared/components/ui/label';
import { toast } from 'sonner';

import { WarehouseSelector } from '@/features/warehouse/components/WarehouseSelector';
import { MappingStats } from '@/features/warehouse/components/MappingStats';
import { StructureTree } from '@/features/warehouse/components/StructureTree';
import { LayoutCanvas } from '@/features/warehouse/components/LayoutCanvas';
import { PropertiesPanel } from '@/features/warehouse/components/PropertiesPanel';
import { AuditLogPanel } from '@/features/warehouse/components/AuditLogPanel';
import { CreateZoneDialog, ZoneFormData } from '@/features/warehouse/components/CreateZoneDialog';
import { CreateZoneWizard } from '@/features/warehouse/components/CreateZoneWizard';
import { EditZoneDialog, EditZoneFormData } from '@/features/warehouse/components/EditZoneDialog';
import { DeleteZoneDialog } from '@/features/warehouse/components/DeleteZoneDialog';
import { BulkRackDialog } from '@/features/warehouse/components/BulkRackDialog';
import { ConfigureRackDialog, RackUpdateData } from '@/features/warehouse/components/ConfigureRackDialog';

import { useZonesByWarehouse, useCreateZone, useUpdateZone, useDeleteZone, useBulkCreateZone } from '@/features/warehouse/hooks/useZones';
import { useRacksByWarehouse } from '@/features/warehouse/hooks/useRacksByWarehouse';
import { useBinsByWarehouse } from '@/features/warehouse/hooks/useBinsByWarehouse';
import { useCreateRack, useUpdateRack, useDeleteRack } from '@/features/warehouse/hooks/useRacks';
import { useCreateBin, useDeleteBin, useLockBin, useUnlockBin } from '@/features/warehouse/hooks/useBins';
import { useAislesByWarehouse } from '@/features/warehouse/hooks/useAisles';
import { useRealtimeMapping } from '@/features/warehouse/hooks/useRealtimeMapping';
import { useMappingAuditLogs } from '@/features/warehouse/hooks/useMappingAuditLogs';
import { useBinInventory } from '@/features/warehouse/hooks/useBinInventory';
import { useMappingCompleteness } from '@/features/warehouse/hooks/useMappingCompleteness';
import { ZoneConfig, RackConfig, BinConfig, AisleConfig, BulkRackGeneration, ZONE_COLORS, WarehouseMappingStats, BinStatus } from '@/shared/types/mapping';
import { dbZoneTypeToUi, uiZoneTypeToDb } from '@/shared/lib/zoneTypeMapping';
import { LabelPrintButton, type LabelBin } from '@/features/labels';

export default function MappingPage() {
  const { currentUser, selectedWarehouse } = useWMS();
  const queryClient = useQueryClient();
  const isAdmin = currentUser?.role === 'admin';

  // State
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [selectedRackId, setSelectedRackId] = useState<string | null>(null);
  const [selectedBinId, setSelectedBinId] = useState<string | null>(null);
  const [showInventoryOverlay, setShowInventoryOverlay] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showPanelsInFullscreen, setShowPanelsInFullscreen] = useState(true);
  const [showCreateZone, setShowCreateZone] = useState(false);
  const [showEditZone, setShowEditZone] = useState(false);
  const [showDeleteZone, setShowDeleteZone] = useState(false);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [deletingZoneId, setDeletingZoneId] = useState<string | null>(null);
  const [showBulkRack, setShowBulkRack] = useState(false);
  const [bulkRackZoneId, setBulkRackZoneId] = useState<string>('');
  const [showConfigureRack, setShowConfigureRack] = useState(false);
  const [configuringRackId, setConfiguringRackId] = useState<string | null>(null);

  // Enable realtime sync
  useRealtimeMapping();

  // Handle ESC key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isFullscreen) {
        handleToggleFullscreen();
      }
    };

    if (isFullscreen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isFullscreen]);

  // Real data from database
  const { data: dbZones = [], isLoading: zonesLoading } = useZonesByWarehouse(selectedWarehouse?.id || null);
  const { data: dbAisles = [] } = useAislesByWarehouse(selectedWarehouse?.id || null);
  const { data: dbRacks = [], isLoading: racksLoading } = useRacksByWarehouse(selectedWarehouse?.id || null);
  const { data: dbBins = [], isLoading: binsLoading } = useBinsByWarehouse(selectedWarehouse?.id || null);
  
  // Debug logging
  useEffect(() => {
    if (selectedWarehouse?.id) {
      console.log('🏭 Selected Warehouse:', selectedWarehouse.id);
      console.log('📦 DB Zones:', dbZones.length, dbZones);
      console.log('📚 DB Racks:', dbRacks.length, dbRacks);
      console.log('🗃️ DB Bins:', dbBins.length, dbBins);
    }
  }, [selectedWarehouse?.id, dbZones, dbRacks, dbBins]);
  
  // Audit logs and inventory overlay
  const { data: auditLogs = [] } = useMappingAuditLogs(selectedWarehouse?.id || null);
  const { data: binInventory = [] } = useBinInventory(selectedWarehouse?.id || null);
  const { data: mappingCompletenessData } = useMappingCompleteness(selectedWarehouse?.id || null);
  const mappingCompleteness = typeof mappingCompletenessData === 'object' && mappingCompletenessData !== null 
    ? (mappingCompletenessData as any).completeness || 0 
    : 0;

  const createZoneMutation = useCreateZone();
  const bulkCreateZoneMutation = useBulkCreateZone();
  const updateZoneMutation = useUpdateZone();
  const deleteZoneMutation = useDeleteZone();
  const createRackMutation = useCreateRack();
  const updateRackMutation = useUpdateRack();
  const deleteRackMutation = useDeleteRack();
  const createBinMutation = useCreateBin();
  const deleteBinMutation = useDeleteBin();
  const lockBinMutation = useLockBin();
  const unlockBinMutation = useUnlockBin();

  // Convert DB zones to mapping format
  const zones: ZoneConfig[] = useMemo(() => {
    return dbZones.map((z: any) => {
      const zoneRacks = dbRacks.filter((r: any) => (r.zoneId || r.zone_id) === z.id);
      const zoneBins = dbBins.filter((b: any) => zoneRacks.some((r: any) => r.id === (b.rackId || b.rack_id)));
      const occupiedBins = zoneBins.filter((b: any) => b.isOccupied || b.is_occupied).length;
      
      return {
        id: z.id,
        warehouseId: z.warehouseId || z.warehouse_id,
        code: z.code,
        name: z.name,
        type: dbZoneTypeToUi(z.zoneType || z.type),
        color: z.color || ZONE_COLORS[dbZoneTypeToUi(z.zoneType || z.type)] || 'hsl(var(--primary))',
        position: { x: z.positionX ?? z.position_x ?? 0, y: z.positionY ?? z.position_y ?? 0 },
        dimensions: { width: z.width || 100, height: z.height || 60 },
        capacityWeight: Number(z.maxWeightKg || z.max_weight_kg) || 50000,
        capacityVolume: Number(z.maxVolumeCm3 || z.max_volume_cm3) || 5000000,
        currentWeight: 0,
        currentVolume: 0,
        allowedCategories: (() => { try { return JSON.parse(z.allowedCategories || z.allowed_categories || '[]'); } catch { return []; } })(),
        handlingRules: (() => { try { return JSON.parse(z.handlingRules || z.handling_rules || '[]'); } catch { return []; } })(),
        utilization: zoneBins.length > 0 ? Math.round((occupiedBins / zoneBins.length) * 100) : 0,
        aisleCount: z.aisleCount || z.aisle_count || 0,
        rackCount: zoneRacks.length,
        binCount: zoneBins.length,
        occupiedBins,
        isActive: z.isActive ?? z.is_active,
        isLocked: false,
        createdAt: new Date(z.createdAt || z.created_at),
        updatedAt: new Date(z.updatedAt || z.updated_at),
      };
    });
  }, [dbZones, dbRacks, dbBins]);

  // Convert DB aisles to mapping format
  const aisleConfigs: AisleConfig[] = useMemo(() => {
    return dbAisles.map((a: any) => ({
      id: a.id,
      code: a.code,
      name: a.name,
      zoneId: a.zoneId || a.zone_id,
      sortOrder: a.sortOrder ?? a.sort_order ?? 0,
      rackCount: a.rackCount ?? a.rack_count ?? 0,
      isActive: a.isActive ?? a.is_active ?? true,
      createdAt: new Date(a.createdAt || a.created_at),
      updatedAt: new Date(a.updatedAt || a.updated_at),
    }));
  }, [dbAisles]);

  // Convert DB racks to mapping format
  const racks: RackConfig[] = useMemo(() => {
    return dbRacks.map((r: any) => {
      const rackBins = dbBins.filter((b: any) => (b.rackId || b.rack_id) === r.id);
      const occupiedBins = rackBins.filter((b: any) => b.isOccupied || b.is_occupied).length;
      
      return {
        id: r.id,
        code: r.code,
        name: r.name || `Rack ${r.code}`,
        zoneId: r.zoneId || r.zone_id,
        aisleId: r.aisleId || r.aisle_id || null,
        orientation: 'horizontal' as const,
        position: { x: r.positionX || r.position_x || 0, y: r.positionY || r.position_y || 0, row: 0, column: 0 },
        levels: r.levels || 1,
        binsPerLevel: rackBins.length > 0 ? Math.round(rackBins.length / (r.levels || 1)) : 0,
        maxWeight: Number(r.maxWeightPerLevel || r.max_weight_per_level) || 1000,
        currentWeight: 0,
        isPickFace: false,
        isReserve: false,
        utilization: rackBins.length > 0 ? Math.round((occupiedBins / rackBins.length) * 100) : 0,
        isActive: r.isActive !== undefined ? r.isActive : (r.is_active !== undefined ? r.is_active : true),
        isLocked: false,
        createdAt: new Date(r.createdAt || r.created_at),
        updatedAt: new Date(r.updatedAt || r.updated_at),
      };
    });
  }, [dbRacks, dbBins]);

  // Convert DB bins to mapping format with inventory overlay
  const bins: BinConfig[] = useMemo(() => {
    return dbBins.map((b: any) => {
      const rack = dbRacks.find((r: any) => r.id === (b.rackId || b.rack_id));
      const zone = rack ? dbZones.find((z: any) => z.id === (rack.zoneId || rack.zone_id)) : null;
      
      // Get inventory data for this bin
      const inventory = binInventory.find(inv => inv.binId === b.id);
      const totalQty = inventory 
        ? inventory.quantityAvailable + inventory.quantityReserved + inventory.quantityDamaged 
        : 0;
      
      // DERIVED bin status based on actual data
      let status: BinStatus = 'empty';
      const isLocked = b.isLocked !== undefined ? b.isLocked : b.is_locked;
      if (isLocked) {
        status = 'locked';
      } else if (inventory && inventory.quantityDamaged > 0) {
        status = 'damaged';
      } else if (inventory && inventory.quantityReserved > 0) {
        status = 'reserved';
      } else if (totalQty > 0) {
        // Check capacity: full if at or over 90% capacity
        const maxWeight = Number(b.maxWeight || b.max_weight) || 100;
        const currentWeight = Number(b.currentWeight || b.current_weight) || 0;
        const capacityRatio = maxWeight > 0 ? currentWeight / maxWeight : 0;
        status = capacityRatio >= 0.9 ? 'full' : 'partial';
      }
      
      const levelMatch = b.code.match(/L(\d+)P(\d+)$/);
      return {
        id: b.id,
        code: b.code,
        rackId: b.rackId || b.rack_id,
        zoneId: zone?.id || '',
        warehouseId: (zone as any)?.warehouseId || (zone as any)?.warehouse_id || '',
        level: levelMatch ? parseInt(levelMatch[1]) : (b.level || 1),
        position: levelMatch ? parseInt(levelMatch[2]) : (b.position || 1),
        dimensions: { width: 50, height: 40, depth: 60 },
        maxWeight: Number(b.maxWeightKg || b.max_weight_kg) || 100,
        maxVolume: Number(b.maxVolumeL || b.max_volume_l) || 100,
        currentWeight: 0,
        currentVolume: 0,
        palletCompatible: false,
        status,
        isLocked: b.isLocked ?? b.is_locked,
        lockReason: b.lockReason || b.lock_reason || undefined,
        // Inventory overlay data
        skuId: inventory?.skuId,
        skuCode: inventory?.skuCode,
        skuName: inventory?.skuName,
        quantity: inventory?.quantityAvailable,
        batchNumber: inventory?.batchNumber || undefined,
        expiryDate: inventory?.expiryDate ? new Date(inventory.expiryDate) : undefined,
        lastMovementAt: undefined,
        createdAt: new Date(b.createdAt || b.created_at),
        updatedAt: new Date(b.updatedAt || b.updated_at),
      };
    });
  }, [dbBins, dbRacks, dbZones, binInventory]);

  /**
   * Bins flattened for the label printer.
   *
   * This page has already loaded every zone, rack, aisle and bin in the
   * warehouse to draw the canvas, so the print dialog is handed that list
   * rather than refetching it — and it is what the dialog scopes over when the
   * `/api/v1/labels/bins` endpoint is not deployed.
   *
   * `code` is passed through untouched: it is what the label encodes and what
   * the scan endpoint matches against.
   */
  const labelBins: LabelBin[] = useMemo(() => {
    const zoneById = new Map(zones.map((z) => [z.id, z]));
    const rackById = new Map(racks.map((r) => [r.id, r]));
    const aisleById = new Map(aisleConfigs.map((a) => [a.id, a]));

    return bins.map((bin) => {
      const rack = rackById.get(bin.rackId);
      const zone = zoneById.get(bin.zoneId);
      const aisle = rack?.aisleId ? aisleById.get(rack.aisleId) : undefined;
      return {
        id: bin.id,
        code: bin.code,
        zoneName: zone?.name ?? null,
        rackCode: rack?.code ?? null,
        aisleCode: aisle?.code ?? null,
        warehouseName: selectedWarehouse?.name ?? null,
        level: bin.level,
        position: bin.position,
        warehouseId: bin.warehouseId || selectedWarehouse?.id || null,
        zoneId: bin.zoneId || null,
        rackId: bin.rackId || null,
      };
    });
  }, [bins, zones, racks, aisleConfigs, selectedWarehouse]);

  // Calculate stats from real data with proper completeness
  const stats: WarehouseMappingStats = useMemo(() => ({
    totalZones: zones.length,
    totalRacks: racks.length,
    totalBins: bins.length,
    occupiedBins: bins.filter(b => b.status !== 'empty' && b.status !== 'locked').length,
    emptyBins: bins.filter(b => b.status === 'empty').length,
    lockedBins: bins.filter(b => b.isLocked).length,
    damagedBins: bins.filter(b => b.status === 'damaged').length,
    overallUtilization: bins.length > 0 
      ? Math.round((bins.filter(b => b.status !== 'empty' && b.status !== 'locked').length / bins.length) * 100)
      : 0,
    mappingCompleteness, // Now uses the proper calculation
    zoneBreakdown: zones.map(z => ({
      type: z.type,
      count: 1,
      utilization: z.utilization,
    })),
  }), [zones, racks, bins, mappingCompleteness]);

  // Selections
  const selectedZone = zones.find(z => z.id === selectedZoneId) || null;
  const selectedRack = racks.find(r => r.id === selectedRackId) || null;
  const selectedBin = bins.find(b => b.id === selectedBinId) || null;

  // Handlers
  const handleSelectZone = (zoneId: string) => {
    setSelectedZoneId(zoneId);
    setSelectedRackId(null);
    setSelectedBinId(null);
  };

  const handleSelectRack = (rackId: string) => {
    const rack = racks.find(r => r.id === rackId);
    if (rack) {
      setSelectedZoneId(rack.zoneId);
      setSelectedRackId(rackId);
      setSelectedBinId(null);
    }
  };

  const handleSelectBin = (binId: string) => {
    const bin = bins.find(b => b.id === binId);
    if (bin) {
      setSelectedZoneId(bin.zoneId);
      setSelectedRackId(bin.rackId);
      setSelectedBinId(binId);
    }
  };

  const handleClosePanel = () => {
    setSelectedZoneId(null);
    setSelectedRackId(null);
    setSelectedBinId(null);
  };

  const handleAddZone = () => setShowCreateZone(true);

  const handleAddRack = (zoneId: string) => {
    setBulkRackZoneId(zoneId);
    setShowBulkRack(true);
  };

  const handleBulkCreateZone = async (data: any) => {
    if (!selectedWarehouse?.id) {
      toast.error('Please select a warehouse first');
      return;
    }
    try {
      await bulkCreateZoneMutation.mutateAsync(data);
    } catch (error) {
      // Error handled by mutation's onError
    }
  };

  const handleCreateZone = async (data: ZoneFormData) => {
    if (!selectedWarehouse?.id) {
      toast.error('Please select a warehouse first');
      return;
    }

    try {
      const dbType = uiZoneTypeToDb(data.type);
      await createZoneMutation.mutateAsync({
        warehouseId: selectedWarehouse.id,
        code: data.code,
        name: data.name,
        zoneType: dbType as any,
        storageType: 'ambient',
        capacity: Math.floor(data.capacityVolume / 1000),
        maxWeightKg: data.capacityWeight || null,
        maxVolumeCm3: data.capacityVolume || null,
        allowedCategories: data.allowedCategories.length > 0 ? data.allowedCategories : null,
        handlingRules: data.handlingRules.length > 0 ? data.handlingRules : null,
        isActive: true,
      });
    } catch (error) {
      // Error is handled by the mutation's onError
    }
  };

  const handleBulkRackGenerate = async (data: BulkRackGeneration) => {
    const zone = zones.find(z => z.id === bulkRackZoneId);
    if (!zone) return;

    const totalRacksToCreate = data.rows * data.columns;
    toast.loading(`Creating ${totalRacksToCreate} racks...`, { id: 'bulk-rack-creation' });

    try {
      // Get existing racks in this zone to determine starting number
      const existingRacks = racks.filter(r => r.zoneId === bulkRackZoneId);
      const existingCodes = new Set(existingRacks.map(r => r.code));
      let rackNumber = data.startingNumber || (existingRacks.length + 1);
      
      let racksCreated = 0;
      let binsCreated = 0;
      
      // Create racks in a loop with delay to avoid rate limiting
      for (let row = 0; row < data.rows; row++) {
        for (let col = 0; col < data.columns; col++) {
          const rackCode = `${data.rackPrefix}${String(rackNumber).padStart(3, '0')}`;
          
          // Skip if rack code already exists
          if (existingCodes.has(rackCode)) {
            console.log(`Skipping rack ${rackCode} - already exists`);
            rackNumber++;
            continue;
          }
          
          try {
            const rack = await createRackMutation.mutateAsync({
              zoneId: bulkRackZoneId,
              code: rackCode,
              name: `Rack ${rackCode}`,
              rackType: 'selective',
              levels: data.levelsPerRack,
              capacity: data.levelsPerRack * data.binsPerLevel,
              isActive: true,
            });
            
            racksCreated++;
            toast.loading(`Creating rack ${racksCreated}/${totalRacksToCreate}...`, { id: 'bulk-rack-creation' });

            // Create bins for each rack
            for (let level = 1; level <= data.levelsPerRack; level++) {
              for (let pos = 1; pos <= data.binsPerLevel; pos++) {
                await createBinMutation.mutateAsync({
                  rackId: rack.id,
                  code: `${rackCode}-L${level}P${pos}`,
                  isActive: true,
                });
                binsCreated++;
              }
            }
            
            // Small delay to avoid rate limiting (100ms between racks)
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (error: any) {
            console.error(`Failed to create rack ${rackCode}:`, error);
            // Continue with next rack even if one fails
          }
          
          rackNumber++; // Increment for next rack
        }
      }

      // Force refetch of racks and bins
      await queryClient.invalidateQueries({ queryKey: ['racks'] });
      await queryClient.invalidateQueries({ queryKey: ['bins'] });
      await queryClient.refetchQueries({ queryKey: ['racks'] });
      await queryClient.refetchQueries({ queryKey: ['bins'] });
      
      toast.dismiss('bulk-rack-creation');
      
      if (racksCreated > 0) {
        toast.success(`${racksCreated} racks with ${binsCreated} bins created successfully`);
      } else {
        toast.info('All racks already exist in this zone');
      }
      setShowBulkRack(false);
    } catch (error: any) {
      toast.dismiss('bulk-rack-creation');
      console.error('Bulk rack generation error:', error);
      toast.error(`Failed to create racks: ${error.response?.data?.error?.message || error.message}`);
    }
  };

  const handleLockBin = async (binId: string) => {
    try {
      await lockBinMutation.mutateAsync({ id: binId, reason: 'Locked for cycle count' });
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleUnlockBin = async (binId: string) => {
    try {
      await unlockBinMutation.mutateAsync(binId);
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleMoveBin = (binId: string) => {
    toast.info('Navigate to Inventory > Movements to create a stock transfer');
  };

  const handleConfigureRack = (rackId: string) => {
    setConfiguringRackId(rackId);
    setShowConfigureRack(true);
  };

  const handleRackUpdateSubmit = async (rackId: string, data: RackUpdateData) => {
    try {
      await updateRackMutation.mutateAsync({
        id: rackId,
        name: data.name,
        levels: data.levels,
        capacity: data.levels * data.binsPerLevel,
        rackType: data.rackType,
      });
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleDeleteBin = async (binId: string) => {
    const bin = bins.find(b => b.id === binId);
    if (!bin) return;
    
    const hasInventory = bin.status !== 'empty';
    const confirmMsg = hasInventory 
      ? `Bin ${bin.code} contains inventory. Are you sure you want to delete it? This action cannot be undone.`
      : `Are you sure you want to delete bin ${bin.code}?`;
    
    if (window.confirm(confirmMsg)) {
      try {
        await deleteBinMutation.mutateAsync(binId);
        setSelectedBinId(null);
      } catch (error) {
        // Error handled by mutation
      }
    }
  };

  const handleDeleteRack = async (rackId: string) => {
    const rack = racks.find(r => r.id === rackId);
    if (!rack) return;
    
    if (window.confirm(`Are you sure you want to delete rack ${rack.code}? This will also delete all bins in this rack.`)) {
      try {
        await deleteRackMutation.mutateAsync(rackId);
        setSelectedRackId(null);
        // Force immediate refetch
        await queryClient.refetchQueries({ 
          predicate: (query) => query.queryKey[0] === 'racks' || query.queryKey[0] === 'bins'
        });
      } catch (error) {
        // Error handled by mutation
      }
    }
  };

  const handleLockAllBinsInRack = async (rackId: string) => {
    try {
      const rackBins = bins.filter(b => b.rackId === rackId);
      const unlockedBins = rackBins.filter(b => !b.isLocked);
      
      if (unlockedBins.length === 0) {
        toast.info('All bins in this rack are already locked');
        return;
      }

      // Lock all bins in the rack
      await Promise.all(
        unlockedBins.map(bin => 
          lockBinMutation.mutateAsync({ id: bin.id, reason: 'Bulk rack lock' })
        )
      );
      
      toast.success(`${unlockedBins.length} bins locked successfully`);
    } catch (error) {
      toast.error('Failed to lock bins');
    }
  };

  const handleUnlockAllBinsInRack = async (rackId: string) => {
    try {
      const rackBins = bins.filter(b => b.rackId === rackId);
      const lockedBins = rackBins.filter(b => b.isLocked);
      
      if (lockedBins.length === 0) {
        toast.info('All bins in this rack are already unlocked');
        return;
      }

      // Unlock all bins in the rack
      await Promise.all(
        lockedBins.map(bin => 
          unlockBinMutation.mutateAsync(bin.id)
        )
      );
      
      toast.success(`${lockedBins.length} bins unlocked successfully`);
    } catch (error) {
      toast.error('Failed to unlock bins');
    }
  };

  const handleToggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
    if (!isFullscreen) {
      toast.info('Entered fullscreen mode. Press ESC to exit.');
    }
  };

  // Handle zone position update (drag-and-drop)
  const handleUpdateZonePosition = async (zoneId: string, position: { x: number; y: number }) => {
    try {
      await updateZoneMutation.mutateAsync({
        id: zoneId,
        positionX: position.x,
        positionY: position.y,
      });
      toast.success('Zone position updated');
    } catch (error) {
      // Error handled by mutation
    }
  };

  // Edit zone handlers
  const handleEditZone = (zoneId: string) => {
    setEditingZoneId(zoneId);
    setShowEditZone(true);
  };

  const editingZone = zones.find(z => z.id === editingZoneId);

  const handleUpdateZone = async (data: EditZoneFormData) => {
    if (!editingZoneId) return;
    
    try {
      const dbType = uiZoneTypeToDb(data.type as ZoneConfig['type']);
      await updateZoneMutation.mutateAsync({
        id: editingZoneId,
        code: data.code,
        name: data.name,
        zoneType: dbType as any,
        capacity: Math.floor(data.capacityVolume / 1000),
      });
      setShowEditZone(false);
      setEditingZoneId(null);
    } catch (error) {
      // Error handled by mutation
    }
  };

  // Delete zone handlers
  const handleDeleteZone = (zoneId: string) => {
    setDeletingZoneId(zoneId);
    setShowDeleteZone(true);
  };

  const deletingZone = zones.find(z => z.id === deletingZoneId);
  const deletingZoneRacks = racks.filter(r => r.zoneId === deletingZoneId);

  const handleConfirmDeleteZone = async () => {
    if (!deletingZoneId) return;
    
    try {
      await deleteZoneMutation.mutateAsync(deletingZoneId);
      setShowDeleteZone(false);
      setDeletingZoneId(null);
      if (selectedZoneId === deletingZoneId) {
        setSelectedZoneId(null);
      }
    } catch (error) {
      // Error handled by mutation
    }
  };

  const bulkRackZone = zones.find(z => z.id === bulkRackZoneId);
  const isLoading = zonesLoading || racksLoading || binsLoading;

  // Fullscreen Layout Canvas
  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-background">
        {/* Fullscreen Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-background/95 backdrop-blur-sm h-20 flex-shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold">Visual Layout - Fullscreen</h2>
            <div className="text-sm text-muted-foreground">
              {selectedWarehouse?.name} • {zones.length} Zones • {racks.length} Racks • {bins.length} Bins
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={showInventoryOverlay}
              onCheckedChange={setShowInventoryOverlay}
              className="mr-4"
            />
            <Label className="text-sm">Inventory Overlay</Label>
            <Button
              variant="outline"
              size="sm"
              onClick={handleToggleFullscreen}
              className="gap-2 ml-4"
            >
              <Minimize2 className="h-4 w-4" />
              Exit Fullscreen
              <kbd className="px-2 py-1 text-xs bg-muted rounded">ESC</kbd>
            </Button>
          </div>
        </div>
        
        {/* Fullscreen Canvas */}
        <div className="flex-1 p-4 h-[calc(100vh-80px)]">
          {/* Main Canvas Only */}
          <div className="w-full h-full rounded-lg overflow-hidden border bg-background shadow-sm">
            <LayoutCanvas
              zones={zones}
              racks={racks}
              bins={bins}
              selectedZoneId={selectedZoneId}
              selectedRackId={selectedRackId}
              onSelectZone={handleSelectZone}
              onSelectRack={handleSelectRack}
              onSelectBin={handleSelectBin}
              showInventoryOverlay={showInventoryOverlay}
              isEditMode={isEditMode}
              isAdmin={isAdmin}
              isFullscreen={isFullscreen}
              onToggleFullscreen={handleToggleFullscreen}
              onUpdateZonePosition={handleUpdateZonePosition}
              binInventory={binInventory}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <AppLayout
      title="Layout"
      breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Layout' }]}
    >
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <WarehouseSelector />
        
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            <Label htmlFor="overlay" className="text-sm">Inventory Overlay</Label>
            <Switch id="overlay" checked={showInventoryOverlay} onCheckedChange={setShowInventoryOverlay} />
          </div>
          
          {isAdmin && (
            <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
              <Edit3 className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="edit" className="text-sm">Edit Mode</Label>
              <Switch id="edit" checked={isEditMode} onCheckedChange={setIsEditMode} />
            </div>
          )}

          <LabelPrintButton
            kind="bin"
            bins={labelBins}
            initialSelectedIds={selectedBinId ? [selectedBinId] : []}
            scopeHint={selectedWarehouse?.name}
            disabled={labelBins.length === 0}
          />

          <Button onClick={handleAddZone} disabled={!selectedWarehouse || createZoneMutation.isPending}>
            {createZoneMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            Add Zone
          </Button>
        </div>
      </div>

      {/* Stats */}
      <MappingStats stats={stats} />

      {/* Main Content */}
      <Tabs defaultValue="visual" className="mt-6">
        <TabsList className="relative">
          <TabsTrigger value="visual" className="gap-2">
            <Eye className="h-4 w-4" />
            Visual Layout
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-2">
            <Edit3 className="h-4 w-4" />
            Audit Log
          </TabsTrigger>
          {isAdmin && (
            <div className="absolute right-0 top-1/2 -translate-y-1/2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleToggleFullscreen}
                className="gap-2"
              >
                {isFullscreen ? (
                  <>
                    <Minimize2 className="h-4 w-4" />
                    Exit Fullscreen
                  </>
                ) : (
                  <>
                    <Maximize2 className="h-4 w-4" />
                    Fullscreen
                  </>
                )}
              </Button>
            </div>
          )}
        </TabsList>

        <TabsContent value="visual" className="mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-[600px] border rounded-lg">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex gap-4 relative">
              {/* Floating Fullscreen Button */}
              {isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleToggleFullscreen}
                  className="fixed bottom-6 right-6 z-40 shadow-lg gap-2 bg-background"
                >
                  <Maximize2 className="h-4 w-4" />
                  Fullscreen
                </Button>
              )}
              {/* Tree Panel */}
              <div className="w-80 flex-shrink-0 h-[600px] rounded-lg overflow-hidden border bg-card shadow-sm">
                <StructureTree
                  zones={zones}
                  racks={racks}
                  bins={bins}
                  aisles={aisleConfigs}
                  selectedZoneId={selectedZoneId}
                  selectedRackId={selectedRackId}
                  selectedBinId={selectedBinId}
                  onSelectZone={handleSelectZone}
                  onSelectRack={handleSelectRack}
                  onSelectBin={handleSelectBin}
                  onAddZone={handleAddZone}
                  onAddRack={handleAddRack}
                  onEditZone={handleEditZone}
                  onDeleteZone={handleDeleteZone}
                  onLockBin={handleLockBin}
                  onUnlockBin={handleUnlockBin}
                  isAdmin={isAdmin}
                />
              </div>

              {/* Canvas */}
              <div className="flex-1 h-[600px] rounded-lg overflow-hidden border">
                <LayoutCanvas
                  zones={zones}
                  racks={racks}
                  bins={bins}
                  selectedZoneId={selectedZoneId}
                  selectedRackId={selectedRackId}
                  onSelectZone={handleSelectZone}
                  onSelectRack={handleSelectRack}
                  onSelectBin={handleSelectBin}
                  showInventoryOverlay={showInventoryOverlay}
                  isEditMode={isEditMode}
                  isAdmin={isAdmin}
                  isFullscreen={isFullscreen}
                  onToggleFullscreen={handleToggleFullscreen}
                  onUpdateZonePosition={handleUpdateZonePosition}
                  binInventory={binInventory}
                />
              </div>

              {/* Properties Panel */}
              {(selectedZone || selectedRack || selectedBin) && (
                <div className="w-96 h-[600px] rounded-lg overflow-hidden border bg-card shadow-sm">
                  <PropertiesPanel
                    selectedZone={selectedZone}
                    selectedRack={selectedRack}
                    selectedBin={selectedBin}
                    bins={bins}
                    racks={racks}
                    binInventory={binInventory}
                    onClose={handleClosePanel}
                    onLockBin={handleLockBin}
                    onUnlockBin={handleUnlockBin}
                    onMoveBin={handleMoveBin}
                    onConfigureZone={handleEditZone}
                    onDeleteZone={handleDeleteZone}
                    onAddRack={handleAddRack}
                    onConfigureRack={handleConfigureRack}
                    onDeleteRack={handleDeleteRack}
                    onDeleteBin={handleDeleteBin}
                    onLockAllBinsInRack={handleLockAllBinsInRack}
                    onUnlockAllBinsInRack={handleUnlockAllBinsInRack}
                    isAdmin={isAdmin}
                  />
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <AuditLogPanel logs={auditLogs} />
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <CreateZoneWizard
        open={showCreateZone}
        onOpenChange={setShowCreateZone}
        onSubmit={handleBulkCreateZone}
        warehouseId={selectedWarehouse?.id || ''}
        isLoading={bulkCreateZoneMutation.isPending}
      />

      <EditZoneDialog
        open={showEditZone}
        onOpenChange={(open) => {
          setShowEditZone(open);
          if (!open) setEditingZoneId(null);
        }}
        onSubmit={handleUpdateZone}
        warehouseId={selectedWarehouse?.id || ''}
        zone={editingZone ? {
          id: editingZone.id,
          code: editingZone.code,
          name: editingZone.name,
          type: editingZone.type,
          capacityVolume: editingZone.capacityVolume,
        } : null}
      />

      <DeleteZoneDialog
        open={showDeleteZone}
        onOpenChange={(open) => {
          setShowDeleteZone(open);
          if (!open) setDeletingZoneId(null);
        }}
        onConfirm={handleConfirmDeleteZone}
        zoneName={deletingZone?.name || ''}
        zoneCode={deletingZone?.code || ''}
        hasRacks={deletingZoneRacks.length > 0}
        rackCount={deletingZoneRacks.length}
      />

      {bulkRackZone && (
        <BulkRackDialog
          open={showBulkRack}
          onOpenChange={setShowBulkRack}
          onSubmit={handleBulkRackGenerate}
          zoneId={bulkRackZoneId}
          zoneName={bulkRackZone.name}
          maxRacks={50}
          currentRacks={racks.filter(r => r.zoneId === bulkRackZoneId).length}
        />
      )}

      <ConfigureRackDialog
        open={showConfigureRack}
        onOpenChange={(open) => {
          setShowConfigureRack(open);
          if (!open) setConfiguringRackId(null);
        }}
        rack={configuringRackId ? (racks.find(r => r.id === configuringRackId) || null) : null}
        onSubmit={handleRackUpdateSubmit}
      />
    </AppLayout>
  );
}
