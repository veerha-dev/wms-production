/**
 * Header bell + dropdown notification panel (spec Part 3).
 *
 * Mounted once, inside <Header />. Owns the socket subscription for the whole app.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, BellOff, CheckCheck, Loader2 } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Separator } from '@/shared/components/ui/separator';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/shared/components/ui/popover';
import { NotificationRow } from '@/features/notifications/components/NotificationRow';
import {
  usePanelNotifications,
  useUnreadCount,
  useMarkRead,
  useMarkAllRead,
  useNotificationSocket,
} from '@/hooks/useNotifications';
import type { Notification } from '@/features/notifications/types';

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  // Live channel: socket → React Query cache → badge. Mounted once, here.
  useNotificationSocket();

  const { data: unreadCount = 0 } = useUnreadCount();
  const { data, isLoading, isError } = usePanelNotifications();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();

  const notifications = data?.data ?? [];
  const badgeLabel = unreadCount > 9 ? '9+' : String(unreadCount);

  const handleRowClick = (n: Notification) => {
    if (!n.isRead) markRead.mutate(n.id);
    setOpen(false);
    if (n.linkPath) navigate(n.linkPath);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center leading-none">
              {badgeLabel}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[380px] p-0 bg-popover">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">Notifications</span>
            {unreadCount > 0 && (
              <span className="text-[11px] text-muted-foreground">{unreadCount} unread</span>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-accent"
              disabled={markAllRead.isPending}
              onClick={() => markAllRead.mutate()}
            >
              <CheckCheck className="h-3.5 w-3.5 mr-1" />
              Mark all as read
            </Button>
          )}
        </div>
        <Separator />

        {/* Body */}
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div className="py-10 text-center px-6">
            <BellOff className="h-7 w-7 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Couldn't load notifications</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-10 text-center px-6">
            <BellOff className="h-7 w-7 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm font-medium">You're all caught up</p>
            <p className="text-xs text-muted-foreground mt-1">
              New alerts will show up here in real time.
            </p>
          </div>
        ) : (
          <div className="max-h-[400px] overflow-y-auto divide-y divide-border">
            {notifications.map((n) => (
              <NotificationRow key={n.id} notification={n} compact onClick={handleRowClick} />
            ))}
          </div>
        )}

        <Separator />
        {/* Footer */}
        <button
          type="button"
          className="w-full py-2.5 text-sm text-accent font-medium hover:bg-muted/50 transition-colors"
          onClick={() => {
            setOpen(false);
            navigate('/notifications');
          }}
        >
          View All Notifications
        </button>
      </PopoverContent>
    </Popover>
  );
}
