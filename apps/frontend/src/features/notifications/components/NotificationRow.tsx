/**
 * One notification row — the single implementation shared by the header bell
 * panel (`compact`) and the full Notification Center page.
 */
import {
  AlertCircle,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  Info,
  PackageCheck,
  Settings2,
  Truck,
  UserCircle2,
  X,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/lib/utils';
import type { Notification, NotificationCategory } from '@/features/notifications/types';

const CATEGORY_ICONS: Record<NotificationCategory, typeof Info> = {
  inbound: PackageCheck,
  inventory: Boxes,
  outbound: Truck,
  worker: UserCircle2,
  system: Settings2,
};

function resolveIcon(n: Notification) {
  if (n.requiresAction && (n.actionState === 'pending' || n.actionState == null)) {
    return { Icon: ClipboardCheck, tone: 'text-blue-600 bg-blue-50 dark:bg-blue-950/40' };
  }
  if (n.severity === 'critical') {
    return { Icon: AlertCircle, tone: 'text-red-600 bg-red-50 dark:bg-red-950/40' };
  }
  if (n.severity === 'warning') {
    return { Icon: AlertTriangle, tone: 'text-orange-600 bg-orange-50 dark:bg-orange-950/40' };
  }
  const Icon = CATEGORY_ICONS[n.category] ?? Info;
  return { Icon, tone: 'text-blue-600 bg-blue-50 dark:bg-blue-950/40' };
}

function timeAgo(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return formatDistanceToNow(d, { addSuffix: true });
}

const ACTION_BADGE: Record<string, string> = {
  approved: 'bg-green-100 text-green-700 border-green-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
};

export interface NotificationRowProps {
  notification: Notification;
  /** Dense layout for the header dropdown panel. */
  compact?: boolean;
  onClick?: (n: Notification) => void;
  /** Approvals inbox: render inline Approve / Reject controls. */
  showActions?: boolean;
  onApprove?: (n: Notification) => void;
  onReject?: (n: Notification) => void;
  /** Disable this row's action buttons while its mutation is in flight. */
  actionPending?: boolean;
}

export function NotificationRow({
  notification,
  compact = false,
  onClick,
  showActions = false,
  onApprove,
  onReject,
  actionPending = false,
}: NotificationRowProps) {
  const { Icon, tone } = resolveIcon(notification);
  const unread = !notification.isRead;
  const grouped = (notification.groupCount ?? 1) > 1;
  const actioned =
    notification.actionState === 'approved' || notification.actionState === 'rejected';
  const canAct = showActions && notification.requiresAction && !actioned;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick?.(notification)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.(notification);
        }
      }}
      className={cn(
        'w-full text-left flex items-start gap-3 transition-colors cursor-pointer',
        compact ? 'px-3 py-2.5' : 'px-4 py-3.5 rounded-lg border border-border',
        unread
          ? 'bg-accent/10 hover:bg-accent/20'
          : 'bg-transparent hover:bg-muted/50'
      )}
    >
      <span
        className={cn(
          'flex-shrink-0 rounded-full flex items-center justify-center',
          tone,
          compact ? 'h-7 w-7' : 'h-9 w-9'
        )}
      >
        <Icon className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p
            className={cn(
              'text-sm truncate',
              unread ? 'font-semibold text-foreground' : 'font-medium text-foreground/80'
            )}
          >
            {notification.title}
          </p>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {grouped && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-semibold">
                {notification.groupCount}
              </Badge>
            )}
            {unread && (
              <span className="h-2 w-2 rounded-full bg-destructive" aria-label="Unread" />
            )}
          </div>
        </div>

        {notification.body && (
          <p
            className={cn(
              'text-xs text-muted-foreground mt-0.5',
              compact ? 'line-clamp-2' : 'line-clamp-3'
            )}
          >
            {notification.body}
          </p>
        )}

        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className="text-[11px] text-muted-foreground">
            {timeAgo(notification.createdAt)}
          </span>

          {actioned && (
            <Badge
              variant="outline"
              className={cn('text-[10px] px-1.5 py-0 capitalize', ACTION_BADGE[notification.actionState!])}
            >
              {notification.actionState}
            </Badge>
          )}

          {!compact && notification.requiresAction && !actioned && !showActions && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-200 text-blue-700">
              Action needed
            </Badge>
          )}
        </div>

        {canAct && (
          <div className="flex items-center gap-2 mt-2.5" onClick={(e) => e.stopPropagation()}>
            <Button
              size="sm"
              className="h-7 px-3 text-xs"
              disabled={actionPending}
              onClick={(e) => {
                e.stopPropagation();
                onApprove?.(notification);
              }}
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-3 text-xs text-destructive border-destructive/40 hover:bg-destructive/10"
              disabled={actionPending}
              onClick={(e) => {
                e.stopPropagation();
                onReject?.(notification);
              }}
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Reject
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
