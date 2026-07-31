import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/lib/api';
import { useAuth } from '@/shared/contexts/AuthContext';
import { OPERATIONS_BASE } from './useMasters';

export type OperationsSection = 'shifts' | 'dock-doors' | 'packing-stations' | 'equipment';

/** Full endpoint path for a warehouse-scoped operations section. */
export function operationsEndpoint(warehouseId: string, section: OperationsSection) {
  return `${OPERATIONS_BASE}/${warehouseId}/${section}`;
}

export interface WarehouseOption {
  id: string;
  code: string;
  name: string;
  city?: string | null;
  status?: string;
}

/** Warehouse list used by the Operations tab selector. */
export function useWarehouseOptions() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ['settings-warehouse-options'],
    queryFn: async (): Promise<WarehouseOption[]> => {
      const { data } = await api.get('/api/v1/warehouses', { params: { limit: 100 } });
      const payload = data?.data ?? data;
      const rows = Array.isArray(payload) ? payload : (payload?.items ?? []);
      return rows.map((w: any) => ({
        id: w.id,
        code: w.code,
        name: w.name,
        city: w.city ?? null,
        status: w.status,
      }));
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });
}

export const WORKING_DAYS = [
  { value: 'mon', label: 'Mon' },
  { value: 'tue', label: 'Tue' },
  { value: 'wed', label: 'Wed' },
  { value: 'thu', label: 'Thu' },
  { value: 'fri', label: 'Fri' },
  { value: 'sat', label: 'Sat' },
  { value: 'sun', label: 'Sun' },
];

export const DOOR_TYPES = [
  { value: 'inbound', label: 'Inbound' },
  { value: 'outbound', label: 'Outbound' },
  { value: 'both', label: 'Both' },
];

export const EQUIPMENT_TYPES = [
  { value: 'trolley', label: 'Trolley' },
  { value: 'pallet_jack', label: 'Pallet Jack' },
  { value: 'forklift', label: 'Forklift' },
  { value: 'hand_cart', label: 'Hand Cart' },
  { value: 'cage_trolley', label: 'Cage Trolley' },
];
