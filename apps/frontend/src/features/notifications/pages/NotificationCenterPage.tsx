/**
 * Notification Center — full history + approval inbox (spec Part 4).
 *
 * Tabs: All | Unread | Approvals | Inventory | Orders | System
 * The Approvals tab renders inline Approve / Reject so an admin can clear the
 * queue without opening each record.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Search, X } from 'lucide-react';
import { AppLayout } from '@/shared/components/layout/AppLayout';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { DataState } from '@/shared/components/ui/data-state';
import { PaginationControls } from '@/shared/components/ui/pagination-controls';
import { NotificationRow } from '@/features/notifications/components/NotificationRow';
import {
  useNotifications,
  useUnreadCount,
  useMarkRead,
  useMarkAllRead,
  useNotificationAction,
} from '@/hooks/useNotifications';
import {
  CATEGORY_LABELS,
  type Notification,
  type NotificationCategory,
  type NotificationFilters,
} from '@/features/notifications/types';

type TabKey = 'all' | 'unread' | 'approvals' | 'inventory' | 'orders' | 'system';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'approvals', label: 'Approvals' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'orders', label: 'Orders' },
  { key: 'system', label: 'System' },
];

// "Orders" covers the outbound category.
const TAB_FILTERS: Record<TabKey, Partial<NotificationFilters>> = {
  all: {},
  unread: { unread: true },
  approvals: { requiresAction: true },
  inventory: { category: 'inventory' },
  orders: { category: 'outbound' },
  system: { category: 'system' },
};

const MODULES: NotificationCategory[] = [
  'inbound',
  'inventory',
  'outbound',
  'worker',
  'system',
];

export default function NotificationCenterPage() {
  const navigate = useNavigate();

  const [tab, setTab] = useState<TabKey>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [module, setModule] = useState<'all' | NotificationCategory>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [rejectTarget, setRejectTarget] = useState<Notification | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Debounce the search box so we don't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const tabFilters = TAB_FILTERS[tab];
  const tabPinsCategory = 'category' in tabFilters;

  const filters: NotificationFilters = useMemo(
    () => ({
      ...tabFilters,
      ...(!tabPinsCategory && module !== 'all' ? { category: module } : {}),
      ...(search ? { search } : {}),
      ...(dateFrom ? { dateFrom } : {}),
      ...(dateTo ? { dateTo } : {}),
      page,
      limit,
    }),
    [tabFilters, tabPinsCategory, module, search, dateFrom, dateTo, page, limit]
  );

  const { data, isLoading, error, refetch } = useNotifications(filters);
  const { data: unreadCount = 0 } = useUnreadCount();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();
  const action = useNotificationAction();

  const notifications = data?.data ?? [];
  const meta = data?.meta;
  const isApprovals = tab === 'approvals';
  const hasFilters = !!(search || dateFrom || dateTo || module !== 'all');

  const changeTab = (next: TabKey) => {
    setTab(next);
    setPage(1);
  };

  const handleRowClick = (n: Notification) => {
    if (!n.isRead) markRead.mutate(n.id);
    if (n.linkPath) navigate(n.linkPath);
  };

  const handleApprove = (n: Notification) => {
    action.mutate({ id: n.id, action: 'approve' });
  };

  const openReject = (n: Notification) => {
    setRejectReason('');
    setRejectTarget(n);
  };

  const confirmReject = () => {
    if (!rejectTarget) return;
    action.mutate({
      id: rejectTarget.id,
      action: 'reject',
      reason: rejectReason.trim() || undefined,
    });
    setRejectTarget(null);
    setRejectReason('');
  };

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setModule('all');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  return (
    <AppLayout
      title="Notifications"
      breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Notifications' }]}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold">Notification Center</h1>
            <p className="text-muted-foreground">
              Your full alert history{unreadCount > 0 ? ` — ${unreadCount} unread` : ''}. Notifications
              older than 90 days are removed automatically.
            </p>
          </div>
          <Button
            variant="outline"
            disabled={markAllRead.isPending || unreadCount === 0}
            onClick={() => markAllRead.mutate()}
          >
            <CheckCheck className="h-4 w-4 mr-2" />
            Mark all as read
          </Button>
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={(v) => changeTab(v as TabKey)}>
          <TabsList className="flex-wrap h-auto">
            {TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key}>
                {t.label}
                {t.key === 'unread' && unreadCount > 0 && (
                  <span className="ml-1.5 text-[10px] font-bold text-destructive">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search notifications..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9 w-[260px]"
            />
          </div>

          <Select
            value={module}
            disabled={tabPinsCategory}
            onValueChange={(v) => {
              setModule(v as 'all' | NotificationCategory);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="All Modules" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Modules</SelectItem>
              {MODULES.map((c) => (
                <SelectItem key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              className="w-[150px]"
              aria-label="From date"
            />
            <span className="text-muted-foreground text-sm">to</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              className="w-[150px]"
              aria-label="To date"
            />
          </div>

          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}
        </div>

        {isApprovals && (
          <p className="text-sm text-muted-foreground -mt-2">
            Approve or reject directly from this list — no need to open each record.
          </p>
        )}

        {/* List */}
        <DataState
          isLoading={isLoading}
          error={error as Error | null}
          isEmpty={notifications.length === 0}
          emptyIcon={<Bell className="h-8 w-8 text-muted-foreground mb-3" />}
          emptyMessage={
            isApprovals
              ? 'No pending approvals — your inbox is clear'
              : hasFilters
                ? 'No notifications match these filters'
                : "You're all caught up"
          }
          onRetry={() => refetch()}
        >
          <div className="wms-card p-2 space-y-2">
            {notifications.map((n) => (
              <NotificationRow
                key={n.id}
                notification={n}
                onClick={handleRowClick}
                showActions={isApprovals}
                onApprove={handleApprove}
                onReject={openReject}
                actionPending={action.isPending && action.variables?.id === n.id}
              />
            ))}
          </div>

          {meta && meta.total > 0 && (
            <PaginationControls
              currentPage={page - 1}
              totalPages={meta.totalPages || 1}
              pageSize={limit}
              totalCount={meta.total}
              onPageChange={(p) => setPage(p + 1)}
              onPageSizeChange={(size) => {
                setLimit(size);
                setPage(1);
              }}
            />
          )}
        </DataState>
      </div>

      {/* Reject reason */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject request</DialogTitle>
            <DialogDescription>{rejectTarget?.title}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">Reason (optional)</Label>
            <Textarea
              id="reject-reason"
              placeholder="Why is this being rejected?"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmReject} disabled={action.isPending}>
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
