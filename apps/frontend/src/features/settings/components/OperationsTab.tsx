import { useEffect, useMemo, useState } from 'react';
import { Warehouse, Shield, Clock, DoorOpen, PackageCheck, Forklift } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/shared/components/ui/select';
import { Badge } from '@/shared/components/ui/badge';
import { useAuth } from '@/shared/contexts/AuthContext';
import { MasterListSection, MasterFieldDef, MasterColumn } from './MasterListSection';
import { SectionHeader, SettingsSkeleton } from './settings-primitives';
import {
  useWarehouseOptions, operationsEndpoint,
  WORKING_DAYS, DOOR_TYPES, EQUIPMENT_TYPES,
} from '../hooks/useOperationsSettings';

const STORAGE_KEY = 'wms_settings_operations_warehouse';

export function OperationsTab() {
  const { user, isAdmin } = useAuth();
  const { data: warehouses = [], isLoading } = useWarehouseOptions();
  const [warehouseId, setWarehouseId] = useState<string>(
    () => localStorage.getItem(STORAGE_KEY) || '',
  );

  const isManager = user?.role === 'manager';
  const canAccess = isAdmin || isManager;

  // Managers are pinned to their own warehouse.
  const selectable = useMemo(() => {
    if (isManager && user?.warehouseId) return warehouses.filter((w) => w.id === user.warehouseId);
    return warehouses;
  }, [warehouses, isManager, user?.warehouseId]);

  useEffect(() => {
    if (!selectable.length) return;
    const stillValid = selectable.some((w) => w.id === warehouseId);
    if (!stillValid) {
      const next = (isManager && user?.warehouseId) || selectable[0].id;
      setWarehouseId(next);
    }
  }, [selectable, warehouseId, isManager, user?.warehouseId]);

  useEffect(() => {
    if (warehouseId) localStorage.setItem(STORAGE_KEY, warehouseId);
  }, [warehouseId]);

  // Admins write anywhere; managers only in their own warehouse.
  const canWrite = isAdmin || (isManager && !!user?.warehouseId && warehouseId === user.warehouseId);

  if (isLoading) return <SettingsSkeleton />;

  const ready = !!warehouseId;

  const shiftFields: MasterFieldDef[] = [
    { key: 'name', label: 'Shift Name', type: 'text', required: true, placeholder: 'e.g. Morning Shift' },
    { key: 'code', label: 'Shift Code', type: 'text', required: true, placeholder: 'e.g. SH-A' },
    { key: 'startTime', label: 'Start Time', type: 'time', required: true },
    { key: 'endTime', label: 'End Time', type: 'time', required: true },
    { key: 'breakMinutes', label: 'Break Duration (minutes)', type: 'number', min: 0, defaultValue: 30 },
    { key: 'workingDays', label: 'Working Days', type: 'multiselect', options: WORKING_DAYS,
      defaultValue: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'] },
  ];
  const shiftColumns: MasterColumn[] = [
    { key: 'name', label: 'Shift Name' },
    { key: 'code', label: 'Code' },
    { key: 'startTime', label: 'Start' },
    { key: 'endTime', label: 'End' },
    { key: 'breakMinutes', label: 'Break', render: (r) => (r.breakMinutes ? `${r.breakMinutes} min` : '—') },
    { key: 'workingDays', label: 'Working Days' },
  ];

  const doorFields: MasterFieldDef[] = [
    { key: 'name', label: 'Door Name', type: 'text', required: true, placeholder: 'e.g. Dock 1' },
    { key: 'code', label: 'Door Code', type: 'text', required: true, placeholder: 'e.g. DD-01' },
    { key: 'doorType', label: 'Door Type', type: 'select', required: true, options: DOOR_TYPES, defaultValue: 'both' },
  ];
  const doorColumns: MasterColumn[] = [
    { key: 'name', label: 'Door Name' },
    { key: 'code', label: 'Code' },
    { key: 'doorType', label: 'Type' },
  ];

  const stationFields: MasterFieldDef[] = [
    { key: 'name', label: 'Station Name', type: 'text', required: true, placeholder: 'e.g. Pack Station 1' },
    { key: 'code', label: 'Station Code', type: 'text', required: true, placeholder: 'e.g. PS-01' },
    { key: 'zoneLocation', label: 'Zone / Location', type: 'text', placeholder: 'e.g. Outbound Zone A' },
    { key: 'hasLabelPrinter', label: 'Has Label Printer', type: 'checkbox', placeholder: 'Label printer attached' },
    { key: 'hasWeighingScale', label: 'Has Weighing Scale', type: 'checkbox', placeholder: 'Weighing scale attached' },
  ];
  const stationColumns: MasterColumn[] = [
    { key: 'name', label: 'Station Name' },
    { key: 'code', label: 'Code' },
    { key: 'zoneLocation', label: 'Zone / Location' },
    { key: 'hasLabelPrinter', label: 'Label Printer' },
    { key: 'hasWeighingScale', label: 'Weighing Scale' },
  ];

  const equipmentFields: MasterFieldDef[] = [
    { key: 'name', label: 'Equipment Name', type: 'text', required: true, placeholder: 'e.g. Forklift 1' },
    { key: 'code', label: 'Code', type: 'text', required: true, placeholder: 'e.g. EQ-01' },
    { key: 'equipmentType', label: 'Type', type: 'select', required: true, options: EQUIPMENT_TYPES, defaultValue: 'trolley' },
    { key: 'capacityKg', label: 'Capacity (kg)', type: 'number', min: 0 },
    { key: 'requiresCertifiedOperator', label: 'Requires Certified Operator', type: 'checkbox',
      placeholder: 'Only certified operators', colSpan: 2 },
  ];
  const equipmentColumns: MasterColumn[] = [
    { key: 'name', label: 'Equipment Name' },
    { key: 'code', label: 'Code' },
    { key: 'equipmentType', label: 'Type' },
    { key: 'capacityKg', label: 'Capacity', render: (r) => (r.capacityKg ? `${r.capacityKg} kg` : '—') },
    { key: 'requiresCertifiedOperator', label: 'Certified Operator' },
  ];

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Operations"
        description="Warehouse-specific operational setup. Everything below applies to the selected warehouse only."
      />

      {/* Warehouse selector */}
      <div className="wms-card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Warehouse className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">Select Warehouse</p>
            <p className="text-xs text-muted-foreground">Shifts, dock doors, packing stations and equipment are per warehouse.</p>
          </div>
          <Select value={warehouseId} onValueChange={setWarehouseId} disabled={selectable.length <= 1}>
            <SelectTrigger className="w-full sm:w-72">
              <SelectValue placeholder={selectable.length ? 'Select a warehouse' : 'No warehouses available'} />
            </SelectTrigger>
            <SelectContent>
              {selectable.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}{w.city ? ` — ${w.city}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {isManager && (
          <Badge variant="outline" className="mt-3 text-xs gap-1.5">
            <Shield className="h-3 w-3" /> Managers can only configure their assigned warehouse
          </Badge>
        )}
      </div>

      {!canAccess && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Shield className="h-3.5 w-3.5" /> Only administrators and managers can change operational setup.
        </p>
      )}

      {!ready ? (
        <div className="wms-card p-8 text-center text-sm text-muted-foreground">
          Create a warehouse first to configure shifts, dock doors, packing stations and equipment.
        </div>
      ) : (
        <div className="space-y-6">
          <SubHeader icon={Clock} n={1} label="Shifts" />
          <MasterListSection
            key={`shifts-${warehouseId}`}
            title="Shifts"
            description="Working shifts for this warehouse"
            endpoint={operationsEndpoint(warehouseId, 'shifts')}
            columns={shiftColumns}
            fields={shiftFields}
            entityName="Shift"
            canWrite={canWrite && canAccess}
          />

          <SubHeader icon={DoorOpen} n={2} label="Dock Doors" />
          <MasterListSection
            key={`doors-${warehouseId}`}
            title="Dock Doors"
            description="Inbound and outbound dock doors"
            endpoint={operationsEndpoint(warehouseId, 'dock-doors')}
            columns={doorColumns}
            fields={doorFields}
            entityName="Dock Door"
            canWrite={canWrite && canAccess}
          />

          <SubHeader icon={PackageCheck} n={3} label="Packing Stations" />
          <MasterListSection
            key={`stations-${warehouseId}`}
            title="Packing Stations"
            description="Stations used during outbound packing"
            endpoint={operationsEndpoint(warehouseId, 'packing-stations')}
            columns={stationColumns}
            fields={stationFields}
            entityName="Packing Station"
            canWrite={canWrite && canAccess}
          />

          <SubHeader icon={Forklift} n={4} label="Equipment" />
          <MasterListSection
            key={`equipment-${warehouseId}`}
            title="Equipment"
            description="Material handling equipment available in this warehouse"
            endpoint={operationsEndpoint(warehouseId, 'equipment')}
            columns={equipmentColumns}
            fields={equipmentFields}
            entityName="Equipment"
            canWrite={canWrite && canAccess}
          />
        </div>
      )}
    </div>
  );
}

function SubHeader({ icon: Icon, n, label }: { icon: any; n: number; label: string }) {
  return (
    <div className="flex items-center gap-2 pt-2">
      <span className="h-6 w-6 rounded-md bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground">
        {n}
      </span>
      <Icon className="h-4 w-4 text-muted-foreground" />
      <h3 className="text-sm font-semibold">{label}</h3>
    </div>
  );
}
