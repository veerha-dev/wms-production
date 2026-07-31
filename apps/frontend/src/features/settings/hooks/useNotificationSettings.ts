import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/lib/api';
import { useAuth } from '@/shared/contexts/AuthContext';
import { toast } from 'sonner';

export type NotificationRecipients = 'admin' | 'manager' | 'both';

export interface NotificationConfig {
  alertType: string;
  enabled: boolean;
  emailEnabled: boolean;
  recipients: NotificationRecipients;
  config?: Record<string, any> | null;
}

/** The 15 alert types from the spec, in display order. */
export const ALERT_TYPES: { value: string; label: string; description: string }[] = [
  { value: 'low_stock', label: 'Low Stock Alert', description: 'When SKUs fall below reorder point' },
  { value: 'zero_stock', label: 'Zero Stock Alert', description: 'When an SKU hits zero available quantity' },
  { value: 'expiry', label: 'Expiry Alert', description: 'When batches approach their expiry date' },
  { value: 'overstock', label: 'Overstock Alert', description: 'When stock exceeds the maximum level' },
  { value: 'grn_qty_mismatch', label: 'GRN Quantity Mismatch', description: 'Received quantity differs from the PO' },
  { value: 'qc_failure', label: 'QC Failure', description: 'When received stock fails quality check' },
  { value: 'adjustment_approval_pending', label: 'Adjustment Approval Pending', description: 'Stock adjustment awaiting approval' },
  { value: 'transfer_approval_pending', label: 'Transfer Approval Pending', description: 'Inter-warehouse transfer awaiting approval' },
  { value: 'cycle_count_variance', label: 'Cycle Count Variance Found', description: 'Counted quantity differs from system' },
  { value: 'order_due_not_picked', label: 'Order Due Today Not Picked', description: 'Orders due today with no picking started' },
  { value: 'worker_reported_issue', label: 'Worker Reported Issue', description: 'A worker flagged a problem from the mobile app' },
  { value: 'task_exception', label: 'Task Exceptions', description: 'When tasks fail or need attention' },
  { value: 'daily_summary', label: 'Daily Summary', description: 'End-of-day warehouse activity digest' },
  { value: 'user_activity', label: 'User Activity', description: 'Login events and user actions' },
  { value: 'system_updates', label: 'System Updates', description: 'Platform and feature announcements' },
];

/**
 * Returns every alert type in spec order, with server state merged over the
 * canonical list so rows still render before the backend has seeded them.
 */
export function useNotificationsConfig() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ['settings-notifications-config'],
    queryFn: async (): Promise<NotificationConfig[]> => {
      const { data } = await api.get('/api/v1/settings/notifications-config');
      const rows: any[] = Array.isArray(data?.data) ? data.data : [];
      return ALERT_TYPES.map((t) => {
        const row = rows.find((r) => r.alertType === t.value);
        return {
          alertType: t.value,
          enabled: row?.enabled ?? true,
          emailEnabled: row?.emailEnabled ?? false,
          recipients: (row?.recipients ?? 'admin') as NotificationRecipients,
          config: row?.config ?? null,
        };
      });
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateNotificationConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ alertType, ...dto }: Partial<NotificationConfig> & { alertType: string }) =>
      api.patch(`/api/v1/settings/notifications-config/${alertType}`, dto).then((r) => r.data?.data),
    onMutate: async ({ alertType, ...dto }) => {
      await qc.cancelQueries({ queryKey: ['settings-notifications-config'] });
      const previous = qc.getQueryData<NotificationConfig[]>(['settings-notifications-config']);
      qc.setQueryData<NotificationConfig[]>(['settings-notifications-config'], (old) =>
        (old ?? []).map((r) => (r.alertType === alertType ? { ...r, ...dto } : r)),
      );
      return { previous };
    },
    onError: (e: any, _vars, ctx: any) => {
      if (ctx?.previous) qc.setQueryData(['settings-notifications-config'], ctx.previous);
      toast.error(e?.response?.data?.message || 'Failed to update alert settings');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings-notifications-config'] });
    },
  });
}
