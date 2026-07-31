import { useEffect, useState } from 'react';
import { Bell, Monitor, Mail, Send, Loader2 } from 'lucide-react';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Switch } from '@/shared/components/ui/switch';
import { Separator } from '@/shared/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/shared/components/ui/select';
import { DataState } from '@/shared/components/ui/data-state';
import { cn } from '@/shared/lib/utils';
import { SectionHeader, SettingsSkeleton, ToggleRow, SaveBar } from './settings-primitives';
import {
  UserPreferences, useUpdateNotifications, useSendTestNotification,
} from '../hooks/useSettings';
import {
  ALERT_TYPES, NotificationRecipients,
  useNotificationsConfig, useUpdateNotificationConfig,
} from '../hooks/useNotificationSettings';

const RECIPIENTS: { value: NotificationRecipients; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'both', label: 'Both' },
];

/** Alert types that carry extra numeric config in the `config` JSON blob. */
const EXPIRY_ALERT = 'expiry';

export function NotificationsTab({ prefs, isLoading, unreadCount }: {
  prefs?: UserPreferences; isLoading: boolean; unreadCount: number;
}) {
  const update = useUpdateNotifications();
  const testNotif = useSendTestNotification();
  const [form, setForm] = useState<Partial<UserPreferences>>({});

  useEffect(() => {
    if (prefs) setForm({
      notifInappRealtime: prefs.notifInappRealtime,
      notifInappSound: prefs.notifInappSound,
    });
  }, [prefs]);

  const set = (k: keyof UserPreferences, v: any) => setForm((f) => ({ ...f, [k]: v }));

  if (isLoading) return <SettingsSkeleton />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SectionHeader title="Notifications" description="Control how and when your team is alerted" />
        {unreadCount > 0 && (
          <Badge variant="destructive" className="gap-1.5">
            <Bell className="h-3 w-3" />{unreadCount} unread
          </Badge>
        )}
      </div>

      <EmailAlertMatrix />

      <div className="wms-card p-5 space-y-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Monitor className="h-4 w-4 text-muted-foreground" /> In-App Notifications
        </h3>
        <Separator />
        <ToggleRow label="Real-time Alerts" description="Show live alerts as they happen in the dashboard"
          checked={!!form.notifInappRealtime} onCheckedChange={(v) => set('notifInappRealtime', v)} />
        <ToggleRow label="Sound Alerts" description="Play notification sound for critical alerts"
          checked={!!form.notifInappSound} onCheckedChange={(v) => set('notifInappSound', v)} />
      </div>

      <div className="flex items-center gap-3">
        <SaveBar onSave={() => update.mutate(form)} isPending={update.isPending} />
        <Button variant="outline" size="sm" onClick={() => testNotif.mutate()}
          disabled={testNotif.isPending} className="gap-2">
          {testNotif.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Send Test Notification
        </Button>
      </div>
    </div>
  );
}

// ─── Email alert matrix (driven by /settings/notifications-config) ───────────

function EmailAlertMatrix() {
  const { data: configs = [], isLoading, error, refetch } = useNotificationsConfig();
  const update = useUpdateNotificationConfig();
  const [expiryDays, setExpiryDays] = useState<string>('');

  const serverExpiryDays = configs.find((c) => c.alertType === EXPIRY_ALERT)?.config?.daysBefore ?? 30;
  useEffect(() => { setExpiryDays(String(serverExpiryDays)); }, [serverExpiryDays]);

  return (
    <div className="wms-card p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Mail className="h-4 w-4 text-muted-foreground" /> Email Alerts
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Turn each alert on or off, decide whether it also goes out by email, and choose who receives it.
          Changes save immediately.
        </p>
      </div>
      <Separator />

      <DataState
        isLoading={isLoading}
        error={error as Error | null}
        isEmpty={!isLoading && configs.length === 0}
        emptyMessage="No alert types configured"
        onRetry={() => refetch()}
      >
        <div className="space-y-1">
          <div className="hidden md:grid grid-cols-[1fr_80px_80px_150px] gap-3 px-3 pb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <span>Alert</span>
            <span className="text-center">Enabled</span>
            <span className="text-center">Email</span>
            <span>Recipients</span>
          </div>
          {configs.map((c) => {
            const meta = ALERT_TYPES.find((t) => t.value === c.alertType);
            return (
              <div key={c.alertType}
                className={cn(
                  'rounded-lg border p-3 md:grid md:grid-cols-[1fr_80px_80px_150px] md:items-center gap-3 space-y-3 md:space-y-0',
                  !c.enabled && 'opacity-70',
                )}>
                <div>
                  <p className="text-sm font-medium">{meta?.label ?? c.alertType}</p>
                  <p className="text-xs text-muted-foreground">{meta?.description}</p>
                  {c.alertType === EXPIRY_ALERT && (
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs text-muted-foreground">Notify</span>
                      <Input
                        type="number" min={1} max={365} className="h-7 w-20"
                        value={expiryDays}
                        onChange={(e) => setExpiryDays(e.target.value)}
                        onBlur={() => {
                          const days = Number(expiryDays);
                          if (!days || days === (c.config?.daysBefore ?? 30)) return;
                          update.mutate({
                            alertType: c.alertType,
                            config: { ...(c.config ?? {}), daysBefore: days },
                          });
                        }}
                      />
                      <span className="text-xs text-muted-foreground">days before expiry</span>
                    </div>
                  )}
                </div>
                <div className="flex md:justify-center items-center gap-2">
                  <span className="text-xs text-muted-foreground md:hidden">Enabled</span>
                  <Switch checked={c.enabled}
                    onCheckedChange={(v) => update.mutate({ alertType: c.alertType, enabled: v })} />
                </div>
                <div className="flex md:justify-center items-center gap-2">
                  <span className="text-xs text-muted-foreground md:hidden">Email</span>
                  <Switch checked={c.emailEnabled} disabled={!c.enabled}
                    onCheckedChange={(v) => update.mutate({ alertType: c.alertType, emailEnabled: v })} />
                </div>
                <div>
                  <Select value={c.recipients} disabled={!c.enabled}
                    onValueChange={(v) => update.mutate({ alertType: c.alertType, recipients: v as NotificationRecipients })}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RECIPIENTS.map((r) => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            );
          })}
        </div>
      </DataState>
    </div>
  );
}
