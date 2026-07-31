import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/lib/api';
import { useAuth } from '@/shared/contexts/AuthContext';
import { toast } from 'sonner';
import type {
  Customer,
  CustomerAddress,
  CustomerSearchResult,
  CustomerStats,
  CreditCheckResult,
} from '../types';

export interface CustomerListParams {
  search?: string;
  customerType?: string;
  state?: string;
  status?: string;
  page?: number;
  limit?: number;
  [key: string]: any;
}

export interface CustomerListResult {
  data: Customer[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

const errMessage = (e: any) => e?.response?.data?.error?.message || e?.message || 'Something went wrong';

/**
 * GET /api/v1/customers — returns the full envelope ({ data, meta }) so callers
 * can paginate. Legacy callers that expect a bare array still work because they
 * read `result?.data || result`.
 */
export function useCustomers(
  params?: CustomerListParams,
  options?: { enabled?: boolean },
) {
  const { isAuthenticated } = useAuth();
  return useQuery<CustomerListResult>({
    queryKey: ['customers', params],
    queryFn: async () => {
      const { data } = await api.get('/api/v1/customers', { params });
      const rows: Customer[] = data?.data || [];
      const meta = data?.meta || {};
      return {
        data: rows,
        meta: {
          total: meta.total ?? rows.length,
          page: meta.page ?? params?.page ?? 1,
          limit: meta.limit ?? params?.limit ?? rows.length,
          totalPages: meta.totalPages ?? 1,
        },
      };
    },
    // Callers on worker-reachable pages MUST pass enabled — the customers
    // controller is @Roles('admin','manager') at class level, so an ungated
    // call from a shared component is a guaranteed 403.
    enabled: isAuthenticated && (options?.enabled ?? true),
  });
}

export function useCustomerStats() {
  const { isAuthenticated } = useAuth();
  return useQuery<CustomerStats>({
    queryKey: ['customer-stats'],
    queryFn: async () => {
      const { data } = await api.get('/api/v1/customers/stats');
      return (data?.data ?? data) as CustomerStats;
    },
    enabled: isAuthenticated,
  });
}

/**
 * Typeahead used by the Sales Order combobox. Fires only at 2+ characters so
 * we never hammer the endpoint on the first keystroke.
 */
export function useCustomerSearch(query: string, enabled: boolean = true) {
  const { isAuthenticated } = useAuth();
  const q = query.trim();
  return useQuery<CustomerSearchResult[]>({
    queryKey: ['customer-search', q],
    queryFn: async () => {
      const { data } = await api.get('/api/v1/customers/search', { params: { q } });
      return (data?.data ?? data ?? []) as CustomerSearchResult[];
    },
    enabled: isAuthenticated && enabled && q.length >= 2,
    staleTime: 30_000,
  });
}

export function useCustomer(id?: string | null) {
  const { isAuthenticated } = useAuth();
  return useQuery<Customer>({
    queryKey: ['customer', id],
    queryFn: async () => {
      const { data } = await api.get(`/api/v1/customers/${id}`);
      return (data?.data ?? data) as Customer;
    },
    enabled: isAuthenticated && !!id,
  });
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<Customer>) => {
      const { data } = await api.post('/api/v1/customers', payload);
      return (data?.data ?? data) as Customer;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customer-stats'] });
    },
    onError: (e: any) => toast.error(`Failed to create customer: ${errMessage(e)}`),
  });
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Customer> & { id: string }) => {
      const { data } = await api.put(`/api/v1/customers/${id}`, updates);
      return (data?.data ?? data) as Customer;
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customer', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['customer-stats'] });
    },
    onError: (e: any) => toast.error(`Failed to update customer: ${errMessage(e)}`),
  });
}

/** DELETE deactivates the customer (admin only per spec §7). */
export function useDeleteCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/v1/customers/${id}`);
      return id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customer', id] });
      queryClient.invalidateQueries({ queryKey: ['customer-stats'] });
    },
    onError: (e: any) => toast.error(`Failed to deactivate customer: ${errMessage(e)}`),
  });
}

/* ------------------------------------------------------------------ */
/* Addresses                                                           */
/* ------------------------------------------------------------------ */

export function useCustomerAddresses(customerId?: string | null) {
  const { isAuthenticated } = useAuth();
  return useQuery<CustomerAddress[]>({
    queryKey: ['customer-addresses', customerId],
    queryFn: async () => {
      const { data } = await api.get(`/api/v1/customers/${customerId}/addresses`);
      return (data?.data ?? data ?? []) as CustomerAddress[];
    },
    enabled: isAuthenticated && !!customerId,
  });
}

export function useCreateCustomerAddress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ customerId, ...address }: Partial<CustomerAddress> & { customerId: string }) => {
      const { data } = await api.post(`/api/v1/customers/${customerId}/addresses`, address);
      return (data?.data ?? data) as CustomerAddress;
    },
    onSuccess: (_r, variables) => {
      queryClient.invalidateQueries({ queryKey: ['customer-addresses', variables.customerId] });
    },
    onError: (e: any) => toast.error(`Failed to add address: ${errMessage(e)}`),
  });
}

export function useUpdateCustomerAddress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      customerId,
      addressId,
      ...updates
    }: Partial<CustomerAddress> & { customerId: string; addressId: string }) => {
      const { data } = await api.put(`/api/v1/customers/${customerId}/addresses/${addressId}`, updates);
      return (data?.data ?? data) as CustomerAddress;
    },
    onSuccess: (_r, variables) => {
      queryClient.invalidateQueries({ queryKey: ['customer-addresses', variables.customerId] });
    },
    onError: (e: any) => toast.error(`Failed to update address: ${errMessage(e)}`),
  });
}

export function useDeleteCustomerAddress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ customerId, addressId }: { customerId: string; addressId: string }) => {
      await api.delete(`/api/v1/customers/${customerId}/addresses/${addressId}`);
      return addressId;
    },
    onSuccess: (_r, variables) => {
      queryClient.invalidateQueries({ queryKey: ['customer-addresses', variables.customerId] });
    },
    onError: (e: any) => toast.error(`Failed to remove address: ${errMessage(e)}`),
  });
}

/* ------------------------------------------------------------------ */
/* History + credit                                                    */
/* ------------------------------------------------------------------ */

export function useCustomerOrders(customerId?: string | null) {
  const { isAuthenticated } = useAuth();
  return useQuery<{ data: any[]; meta: Record<string, any> }>({
    queryKey: ['customer-orders', customerId],
    queryFn: async () => {
      const { data } = await api.get(`/api/v1/customers/${customerId}/orders`);
      return { data: data?.data ?? [], meta: data?.meta ?? {} };
    },
    enabled: isAuthenticated && !!customerId,
  });
}

export function useCustomerInvoices(customerId?: string | null) {
  const { isAuthenticated } = useAuth();
  return useQuery<{ data: any[]; meta: Record<string, any> }>({
    queryKey: ['customer-invoices', customerId],
    queryFn: async () => {
      const { data } = await api.get(`/api/v1/customers/${customerId}/invoices`);
      return { data: data?.data ?? [], meta: data?.meta ?? {} };
    },
    enabled: isAuthenticated && !!customerId,
  });
}

/**
 * Credit-limit check for the Sales Order form. Non-blocking: a failure here
 * must never stop an order from being created, so errors are swallowed.
 */
export function useCreditCheck(customerId?: string | null, orderValue?: number) {
  const { isAuthenticated } = useAuth();
  return useQuery<CreditCheckResult | null>({
    queryKey: ['customer-credit-check', customerId, orderValue],
    queryFn: async () => {
      try {
        const { data } = await api.get(`/api/v1/customers/${customerId}/credit-check`, {
          params: { orderValue },
        });
        return (data?.data ?? data) as CreditCheckResult;
      } catch {
        return null;
      }
    },
    enabled: isAuthenticated && !!customerId && !!orderValue && orderValue > 0,
    retry: false,
    staleTime: 30_000,
  });
}
