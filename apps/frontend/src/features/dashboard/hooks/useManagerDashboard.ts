import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/lib/api';
import { useAuth } from '@/shared/contexts/AuthContext';

export function useManagerDashboard(warehouseId: string | undefined | null) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ['manager-dashboard', warehouseId],
    queryFn: async () => {
      // The server falls back to the warehouse on the caller's JWT, so an
      // absent id is fine — send no param at all rather than `warehouseId=`,
      // which would arrive as an empty string.
      const { data } = await api.get('/api/v1/dashboard/manager-stats', {
        params: warehouseId ? { warehouseId } : undefined,
      });
      return data.data;
    },
    enabled: isAuthenticated,
    refetchInterval: 30000,
  });
}
