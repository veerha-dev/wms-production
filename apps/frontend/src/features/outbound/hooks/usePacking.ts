import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/lib/api';
import { useAuth } from '@/shared/contexts/AuthContext';
import { toast } from 'sonner';

export interface PackingItem {
  id: string | null;
  skuId: string;
  skuCode: string;
  skuName: string;
  skuBarcode?: string | null;
  pickedQuantity: number;
  packedQuantity: number;
  packageId: string | null;
  packageNumber: number | null;
  status: 'pending' | 'packed';
}

export interface PackingPackage {
  id: string;
  packageNumber: number;
  boxId: string | null;
  boxName: string | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  weightKg: number | null;
  volumetricWeightKg?: number | null;
  itemCount?: number;
}

export interface PackingBox {
  id: string;
  code: string;
  name: string;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  maxWeightKg: number | null;
  boxType?: string | null;
}

export interface PackingSession {
  id: string;
  status: 'packing' | 'packed' | 'ready_for_dispatch' | 'cancelled';
  carrier: string | null;
  trackingNumber: string | null;
  labelSource: string | null;
  labelUrl: string | null;
  labelPrintedAt: string | null;
}

export interface PackingOrderView {
  order: {
    id: string;
    soNumber: string;
    status: string;
    customerName: string | null;
    customerPhone?: string | null;
    shippingAddress: string | null;
    warehouseId: string | null;
    warehouseName: string | null;
  };
  session: PackingSession | null;
  items: PackingItem[];
  packages: PackingPackage[];
  boxes: PackingBox[];
  summary: {
    totalItems: number;
    itemsPacked: number;
    totalPickedUnits: number;
    totalPackedUnits: number;
    packageCount: number;
    totalWeightKg: number;
    allItemsPacked: boolean;
  };
}

const errorText = (e: any) =>
  e?.response?.data?.error?.message || e?.response?.data?.message || e?.message || 'Something went wrong';

/** Screen 1 — the packing queue. */
export function usePackableOrders(params?: { search?: string; warehouseId?: string }) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ['packing-orders', params],
    queryFn: async () => {
      const { data } = await api.get('/api/v1/packing/orders', { params });
      return { data: data.data || [], meta: data.meta || {} };
    },
    enabled: isAuthenticated,
  });
}

/** Screen 2 — one order's packing state. */
export function usePackingOrder(soId: string | null) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ['packing-order', soId],
    queryFn: async () => {
      const { data } = await api.get(`/api/v1/packing/orders/${soId}`);
      return data.data as PackingOrderView;
    },
    enabled: isAuthenticated && !!soId,
  });
}

/** Opens (or resumes) a packing session and seeds it from the completed pick list. */
export function useStartPacking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (soId: string) => {
      const { data } = await api.post(`/api/v1/packing/orders/${soId}/start`);
      return data.data as PackingOrderView;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['packing-order', data.order.id] });
      queryClient.invalidateQueries({ queryKey: ['packing-orders'] });
    },
    onError: (e: any) => toast.error(errorText(e)),
  });
}

/**
 * A scan is the verification step, so its failure is loud on purpose — a wrong
 * beep at the bench is the last chance to stop the wrong item reaching a customer.
 */
export function usePackScan(soId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { barcode: string; quantity?: number }) => {
      const { data } = await api.post(`/api/v1/packing/orders/${soId}/scan`, payload);
      return data.data;
    },
    onSuccess: (data: any) => {
      toast.success(`${data.skuCode} · ${data.packedQuantity}/${data.pickedQuantity} packed`);
      queryClient.invalidateQueries({ queryKey: ['packing-order', soId] });
    },
    onError: (e: any) => toast.error(errorText(e)),
  });
}

export function useSetPackedQuantity(soId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, quantity }: { itemId: string; quantity: number }) => {
      const { data } = await api.patch(`/api/v1/packing/orders/${soId}/items/${itemId}/quantity`, { quantity });
      return data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['packing-order', soId] }),
    onError: (e: any) => toast.error(errorText(e)),
  });
}

export function useAssignItemPackage(soId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, packageId }: { itemId: string; packageId: string | null }) => {
      const { data } = await api.patch(`/api/v1/packing/orders/${soId}/items/${itemId}/package`, { packageId });
      return data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['packing-order', soId] }),
    onError: (e: any) => toast.error(errorText(e)),
  });
}

export function useAddPackage(soId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload?: { boxId?: string }) => {
      const { data } = await api.post(`/api/v1/packing/orders/${soId}/packages`, payload || {});
      return data.data as PackingPackage;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['packing-order', soId] }),
    onError: (e: any) => toast.error(errorText(e)),
  });
}

export function useUpdatePackage(soId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ packageId, ...payload }: { packageId: string } & Record<string, any>) => {
      const { data } = await api.put(`/api/v1/packing/orders/${soId}/packages/${packageId}`, payload);
      return data.data as PackingPackage;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['packing-order', soId] }),
    onError: (e: any) => toast.error(errorText(e)),
  });
}

export function useRemovePackage(soId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (packageId: string) => {
      const { data } = await api.delete(`/api/v1/packing/orders/${soId}/packages/${packageId}`);
      return data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['packing-order', soId] }),
    onError: (e: any) => toast.error(errorText(e)),
  });
}

export function useSetShippingLabel(soId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { carrier?: string; trackingNumber?: string }) => {
      const { data } = await api.post(`/api/v1/packing/orders/${soId}/label`, payload);
      return data.data as PackingSession;
    },
    onSuccess: () => {
      toast.success('Shipping details saved');
      queryClient.invalidateQueries({ queryKey: ['packing-order', soId] });
    },
    onError: (e: any) => toast.error(errorText(e)),
  });
}

export function useMarkLabelPrinted(soId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/api/v1/packing/orders/${soId}/label/printed`);
      return data.data as PackingSession;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['packing-order', soId] }),
    // Printing already happened in the browser; a failed bookkeeping call must
    // not look like a failed print.
    onError: () => undefined,
  });
}

export function useCompletePacking(soId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/api/v1/packing/orders/${soId}/complete`);
      return data.data;
    },
    onSuccess: (data: any) => {
      toast.success(`Packed · ${data.packageCount} package(s), ${data.totalWeightKg} kg — ready for dispatch`);
      queryClient.invalidateQueries({ queryKey: ['packing-orders'] });
      queryClient.invalidateQueries({ queryKey: ['packing-order', soId] });
      queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
    },
    onError: (e: any) => toast.error(errorText(e)),
  });
}
