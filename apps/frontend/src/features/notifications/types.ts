/**
 * Notification System — shared types (Workstream C).
 * Mirrors the backend contract in dev/NOTIFICATION-SYSTEM.md.
 */

export type NotificationCategory =
  | 'inbound'
  | 'inventory'
  | 'outbound'
  | 'worker'
  | 'system';

export type NotificationSeverity = 'info' | 'warning' | 'critical';

export type NotificationActionState = 'pending' | 'approved' | 'rejected' | null;

export interface Notification {
  id: string;
  eventType: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  title: string;
  body: string | null;
  linkPath: string | null;
  entityType: string | null;
  entityId: string | null;
  requiresAction: boolean;
  actionState: NotificationActionState;
  groupCount: number;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationFilters {
  category?: NotificationCategory;
  unread?: boolean;
  requiresAction?: boolean;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface NotificationListMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface NotificationListResult {
  data: Notification[];
  meta: NotificationListMeta;
}

export const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  inbound: 'Inbound',
  inventory: 'Inventory',
  outbound: 'Orders',
  worker: 'Worker',
  system: 'System',
};

/**
 * Does a live (socket-delivered) notification belong in a cached, filtered list?
 * Used to decide whether to splice it into an existing React Query page.
 */
export function matchesNotificationFilters(
  n: Notification,
  filters: NotificationFilters
): boolean {
  if (filters.unread && n.isRead) return false;
  if (filters.requiresAction && !n.requiresAction) return false;
  if (filters.category && n.category !== filters.category) return false;
  if (filters.search) {
    const q = filters.search.toLowerCase();
    const haystack = `${n.title} ${n.body ?? ''} ${n.eventType}`.toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  const created = new Date(n.createdAt).getTime();
  if (filters.dateFrom && created < new Date(filters.dateFrom).getTime()) return false;
  if (filters.dateTo) {
    // dateTo is an inclusive day boundary
    const to = new Date(filters.dateTo);
    to.setHours(23, 59, 59, 999);
    if (created > to.getTime()) return false;
  }
  return true;
}
