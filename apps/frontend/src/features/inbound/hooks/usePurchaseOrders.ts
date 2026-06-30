import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/lib/api';
import { useAuth } from '@/shared/contexts/AuthContext';
import { toast } from 'sonner';

export function usePurchaseOrders(params?: Record<string, any>) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ['purchase-orders', params],
    queryFn: async () => { 
      const { data } = await api.get('/api/v1/purchase-orders', { params }); 
      // data is { success, data: [...], meta: {...} }
      return { data: data.data || [], meta: data.meta || {} }; 
    },
    enabled: isAuthenticated,
  });
}

export function usePurchaseOrder(id: string | null) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ['purchase-order', id],
    queryFn: async () => { const { data } = await api.get(`/api/v1/purchase-orders/${id}`); return data.data; },
    enabled: isAuthenticated && !!id,
  });
}

export function useCreatePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (po: any) => { const { data } = await api.post('/api/v1/purchase-orders', po); return data.data; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['purchase-orders'] }); toast.success('Purchase order created'); },
    onError: (e: any) => toast.error(`Failed: ${e.response?.data?.error?.message || e.message}`),
  });
}

export function useUpdatePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: any) => { const { data } = await api.put(`/api/v1/purchase-orders/${id}`, updates); return data.data; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['purchase-orders'] }); toast.success('Purchase order updated'); },
    onError: (e: any) => toast.error(`Failed: ${e.response?.data?.error?.message || e.message}`),
  });
}

export function useSubmitPurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => { const { data } = await api.post(`/api/v1/purchase-orders/${id}/submit`); return data.data; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['purchase-orders'] }); toast.success('Purchase order submitted'); },
    onError: (e: any) => toast.error(`Failed: ${e.response?.data?.error?.message || e.message}`),
  });
}

export function useApprovePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => { const { data } = await api.post(`/api/v1/purchase-orders/${id}/approve`); return data.data; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['purchase-orders'] }); toast.success('Purchase order approved'); },
    onError: (e: any) => toast.error(`Failed: ${e.response?.data?.error?.message || e.message}`),
  });
}

export function useCancelPurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => { const { data } = await api.post(`/api/v1/purchase-orders/${id}/cancel`); return data.data; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['purchase-orders'] }); toast.success('Purchase order cancelled'); },
    onError: (e: any) => toast.error(`Failed: ${e.response?.data?.error?.message || e.message}`),
  });
}

export function usePOStats(params?: Record<string, any>) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ['po-stats', params],
    queryFn: async () => { try { const { data } = await api.get('/api/v1/purchase-orders/stats', { params }); return data.data; } catch { return {}; } },
    enabled: isAuthenticated,
  });
}

export const useCreatePO = useCreatePurchaseOrder;
export const useApprovePO = useApprovePurchaseOrder;
export const useCancelPO = useCancelPurchaseOrder;

export function useRejectPurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => { 
      const { data } = await api.post(`/api/v1/purchase-orders/${id}/reject`, { reason }); 
      return data.data; 
    },
    onSuccess: () => { 
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] }); 
      toast.success('Purchase order rejected'); 
    },
    onError: (e: any) => toast.error(`Failed: ${e.response?.data?.error?.message || e.message}`),
  });
}

export function useRecallPurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => { 
      const { data } = await api.post(`/api/v1/purchase-orders/${id}/recall`); 
      return data.data; 
    },
    onSuccess: () => { 
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] }); 
      toast.success('Purchase order recalled to draft'); 
    },
    onError: (e: any) => toast.error(`Failed: ${e.response?.data?.error?.message || e.message}`),
  });
}

export const useRejectPO = useRejectPurchaseOrder;
export const useRecallPO = useRecallPurchaseOrder;
