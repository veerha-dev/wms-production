import { useState, useEffect, useRef, useCallback } from 'react';
import { AppLayout } from '@/shared/components/layout/AppLayout';
import { useAuth } from '@/shared/contexts/AuthContext';
import { useTheme } from '@/shared/contexts/ThemeContext';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/lib/api';
import {
  usePreferences, useUpdateGeneral, useUpdateSecurityPrefs,
  useTenantSettings, useIntegrations,
  useUpdateProfile, useChangePassword,
  useSecurityPolicy, useUpdateSecurityPolicy,
  UserPreferences, SecurityPolicy,
} from '@/features/settings/hooks/useSettings';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Switch } from '@/shared/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import { Separator } from '@/shared/components/ui/separator';
import { cn } from '@/shared/lib/utils';
import {
  Settings, Building2, Bell, Shield, Database, Palette, Warehouse, Boxes,
  Save, LogOut, Eye, EyeOff, CheckCircle2, AlertTriangle, Loader2,
  Sun, Moon, Monitor, RefreshCw,
} from 'lucide-react';
import { Field, SaveBar, SectionHeader, SettingsSkeleton, ToggleRow } from '../components/settings-primitives';
import { OperationsTab } from '../components/OperationsTab';
import { MastersTab } from '../components/MastersTab';
import { OrganizationTab } from '../components/OrganizationTab';
import { NotificationsTab } from '../components/NotificationsTab';
import { IntegrationsTab } from '../components/IntegrationsTab';

const TIMEZONES = [
  { value: 'Asia/Kolkata', label: 'India (IST +5:30)' },
  { value: 'UTC', label: 'UTC +0:00' },
  { value: 'America/New_York', label: 'New York (EST -5:00)' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (PST -8:00)' },
  { value: 'America/Chicago', label: 'Chicago (CST -6:00)' },
  { value: 'Europe/London', label: 'London (GMT +0:00)' },
  { value: 'Europe/Paris', label: 'Paris (CET +1:00)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET +1:00)' },
  { value: 'Asia/Dubai', label: 'Dubai (GST +4:00)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT +8:00)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST +9:00)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST +10:00)' },
];

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'हिन्दी (Hindi)' },
  { value: 'es', label: 'Español (Spanish)' },
  { value: 'fr', label: 'Français (French)' },
  { value: 'de', label: 'Deutsch (German)' },
  { value: 'ar', label: 'العربية (Arabic)' },
];

// ─────────────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { user, isAdmin, isManager, signOut } = useAuth();
  const { theme, setTheme, primaryColor, setPrimaryColor } = useTheme();
  const { data: prefs, isLoading: prefsLoading } = usePreferences();
  const { data: tenantData, isLoading: tenantLoading } = useTenantSettings();
  const { data: integrations = [], isLoading: intLoading } = useIntegrations();

  // Alerts summary for notification badge
  const { data: alertSummary } = useQuery({
    queryKey: ['alerts-summary'],
    queryFn: () => api.get('/api/v1/alerts/summary').then((r) => r.data.data),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
  const unreadCount: number = alertSummary?.unacknowledgedAlerts || 0;

  const showOperations = isAdmin || isManager;

  return (
    <AppLayout
      title="Settings"
      breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Settings' }]}
    >
      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 sm:grid-cols-8 h-auto lg:w-auto lg:inline-grid">
          <TabsTrigger value="general" className="gap-2">
            <Settings className="h-4 w-4" /><span className="hidden lg:inline">General</span>
          </TabsTrigger>
          <TabsTrigger value="tenant" className="gap-2">
            <Building2 className="h-4 w-4" /><span className="hidden lg:inline">Organization</span>
          </TabsTrigger>
          <TabsTrigger value="operations" className="gap-2">
            <Warehouse className="h-4 w-4" /><span className="hidden lg:inline">Operations</span>
          </TabsTrigger>
          <TabsTrigger value="masters" className="gap-2">
            <Boxes className="h-4 w-4" /><span className="hidden lg:inline">Masters</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2 relative">
            <Bell className="h-4 w-4" /><span className="hidden lg:inline">Notifications</span>
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-[10px] text-white flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2">
            <Shield className="h-4 w-4" /><span className="hidden lg:inline">Security</span>
          </TabsTrigger>
          <TabsTrigger value="integrations" className="gap-2">
            <Database className="h-4 w-4" /><span className="hidden lg:inline">Integrations</span>
          </TabsTrigger>
          <TabsTrigger value="appearance" className="gap-2">
            <Palette className="h-4 w-4" /><span className="hidden lg:inline">Appearance</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <GeneralTab prefs={prefs} isLoading={prefsLoading} />
        </TabsContent>
        <TabsContent value="tenant">
          <OrganizationTab tenantData={tenantData} isLoading={tenantLoading} isAdmin={isAdmin} />
        </TabsContent>
        <TabsContent value="operations">
          {showOperations ? (
            <OperationsTab />
          ) : (
            <RestrictedNotice message="Only administrators and warehouse managers can view operational setup." />
          )}
        </TabsContent>
        <TabsContent value="masters">
          <MastersTab isAdmin={isAdmin} />
        </TabsContent>
        <TabsContent value="notifications">
          <NotificationsTab prefs={prefs} isLoading={prefsLoading} unreadCount={unreadCount} />
        </TabsContent>
        <TabsContent value="security">
          <SecurityTab prefs={prefs} user={user} signOut={signOut} />
        </TabsContent>
        <TabsContent value="integrations">
          <IntegrationsTab integrations={integrations} isLoading={intLoading} isAdmin={isAdmin} />
        </TabsContent>
        <TabsContent value="appearance">
          <AppearanceTab theme={theme} setTheme={setTheme} primaryColor={primaryColor} setPrimaryColor={setPrimaryColor} />
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}

function RestrictedNotice({ message }: { message: string }) {
  return (
    <div className="wms-card p-8 flex flex-col items-center text-center gap-2">
      <Shield className="h-6 w-6 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

// ─── Tab 1: General ───────────────────────────────────────────────────────────

function GeneralTab({ prefs, isLoading }: { prefs?: UserPreferences; isLoading: boolean }) {
  const update = useUpdateGeneral();
  const [form, setForm] = useState<Partial<UserPreferences>>({});

  useEffect(() => {
    if (prefs) setForm({
      systemName: prefs.systemName,
      language: prefs.language,
      timezone: prefs.timezone,
      dateFormat: prefs.dateFormat,
      autoRefresh: prefs.autoRefresh,
      compactView: prefs.compactView,
      refreshIntervalSeconds: prefs.refreshIntervalSeconds,
    });
  }, [prefs]);

  const set = (k: keyof UserPreferences, v: any) => setForm((f) => ({ ...f, [k]: v }));

  if (isLoading) return <SettingsSkeleton />;

  return (
    <div className="space-y-6">
      <SectionHeader title="General Settings" description="Configure system-wide preferences and display options" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <Field label="System Name">
            <Input value={form.systemName || ''} onChange={(e) => set('systemName', e.target.value)} />
          </Field>
          <Field label="Language">
            <Select value={form.language || 'en'} onValueChange={(v) => set('language', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{LANGUAGES.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Timezone">
            <Select value={form.timezone || 'Asia/Kolkata'} onValueChange={(v) => set('timezone', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TIMEZONES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Date Format">
            <Select value={form.dateFormat || 'dmy'} onValueChange={(v) => set('dateFormat', v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="dmy">DD/MM/YYYY</SelectItem>
                <SelectItem value="mdy">MM/DD/YYYY</SelectItem>
                <SelectItem value="ymd">YYYY-MM-DD</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="space-y-4">
          <ToggleRow
            label="Auto-Refresh Dashboard"
            description="Automatically refresh dashboard data"
            checked={!!form.autoRefresh}
            onCheckedChange={(v) => set('autoRefresh', v)}
          />
          {form.autoRefresh && (
            <Field label="Refresh Interval">
              <Select value={String(form.refreshIntervalSeconds || 60)} onValueChange={(v) => set('refreshIntervalSeconds', Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">Every 15 seconds</SelectItem>
                  <SelectItem value="30">Every 30 seconds</SelectItem>
                  <SelectItem value="60">Every 1 minute</SelectItem>
                  <SelectItem value="120">Every 2 minutes</SelectItem>
                  <SelectItem value="300">Every 5 minutes</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          )}
          <ToggleRow
            label="Compact View"
            description="Reduce spacing for denser information display"
            checked={!!form.compactView}
            onCheckedChange={(v) => set('compactView', v)}
          />
        </div>
      </div>
      <SaveBar onSave={() => update.mutate(form)} isPending={update.isPending} />
    </div>
  );
}

// ─── Tab 6: Security ──────────────────────────────────────────────────────────

function SecurityTab({ prefs, user, signOut }: { prefs?: UserPreferences; user: any; signOut: () => Promise<void> }) {
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();
  const updateSecurity = useUpdateSecurityPrefs();

  const [profileForm, setProfileForm] = useState({ fullName: '', phone: '' });
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [showPw, setShowPw] = useState({ current: false, next: false, confirm: false });
  const [pwError, setPwError] = useState('');

  useEffect(() => {
    if (user) setProfileForm({ fullName: user.fullName || '', phone: user.phone || '' });
  }, [user]);

  const handlePwSubmit = () => {
    setPwError('');
    if (pwForm.next !== pwForm.confirm) { setPwError('New passwords do not match'); return; }
    if (pwForm.next.length < 8) { setPwError('Password must be at least 8 characters'); return; }
    changePassword.mutate(
      { currentPassword: pwForm.current, newPassword: pwForm.next },
      { onSuccess: () => setPwForm({ current: '', next: '', confirm: '' }) },
    );
  };

  return (
    <div className="space-y-6">
      <SectionHeader title="Security" description="Manage your profile, password, and session settings" />

      {/* Profile */}
      <div className="wms-card p-5 space-y-4">
        <h3 className="text-sm font-semibold">Profile Information</h3>
        <Separator />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Full Name">
            <Input value={profileForm.fullName} onChange={(e) => setProfileForm((f) => ({ ...f, fullName: e.target.value }))} />
          </Field>
          <Field label="Phone Number">
            <Input value={profileForm.phone} onChange={(e) => setProfileForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+91 9876543210" />
          </Field>
          <Field label="Email Address">
            <Input value={user?.email || ''} disabled className="bg-muted/50 cursor-not-allowed" />
          </Field>
          <Field label="Role">
            <Input value={user?.role || ''} disabled className="bg-muted/50 capitalize cursor-not-allowed" />
          </Field>
        </div>
        {user?.lastLogin && (
          <p className="text-xs text-muted-foreground">Last login: {new Date(user.lastLogin).toLocaleString('en-IN')}</p>
        )}
        <Button size="sm" onClick={() => updateProfile.mutate(profileForm)} disabled={updateProfile.isPending} className="gap-2">
          {updateProfile.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save Profile
        </Button>
      </div>

      {/* Change Password */}
      <div className="wms-card p-5 space-y-4">
        <h3 className="text-sm font-semibold">Change Password</h3>
        <Separator />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {([
            { key: 'current' as const, label: 'Current Password' },
            { key: 'next' as const, label: 'New Password' },
            { key: 'confirm' as const, label: 'Confirm New Password' },
          ]).map(({ key, label }) => (
            <Field key={key} label={label}>
              <div className="relative">
                <Input
                  type={showPw[key] ? 'text' : 'password'}
                  value={pwForm[key]}
                  onChange={(e) => { setPwForm((f) => ({ ...f, [key]: e.target.value })); setPwError(''); }}
                  className="pr-10"
                />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPw((s) => ({ ...s, [key]: !s[key] }))}>
                  {showPw[key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
          ))}
        </div>
        {pwError && <p className="text-xs text-destructive flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{pwError}</p>}
        <Button size="sm" onClick={handlePwSubmit}
          disabled={changePassword.isPending || !pwForm.current || !pwForm.next || !pwForm.confirm}
          className="gap-2">
          {changePassword.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shield className="h-3.5 w-3.5" />}
          Change Password
        </Button>
      </div>

      {/* Session */}
      <div className="wms-card p-5 space-y-4">
        <h3 className="text-sm font-semibold">Session Settings</h3>
        <Separator />
        <div className="flex items-center gap-4">
          <Label className="text-sm min-w-[140px]">Session Timeout</Label>
          <Select
            value={String(prefs?.sessionTimeoutMinutes || 480)}
            onValueChange={(v) => updateSecurity.mutate({ sessionTimeoutMinutes: Number(v) })}
          >
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="15">15 minutes</SelectItem>
              <SelectItem value="30">30 minutes</SelectItem>
              <SelectItem value="60">1 hour</SelectItem>
              <SelectItem value="480">8 hours (default)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Sign Out */}
      <div className="wms-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Sign Out</h3>
            <p className="text-xs text-muted-foreground mt-0.5">End your current session</p>
          </div>
          <Button variant="destructive" size="sm" onClick={() => signOut()} className="gap-2">
            <LogOut className="h-3.5 w-3.5" />Sign Out
          </Button>
        </div>
      </div>

      {/* Tenant Password Policy (admin only) */}
      {user?.role === 'admin' && <TenantPasswordPolicyCard />}
    </div>
  );
}

// ─── Tenant Password Policy (admin only) ──────────────────────────────────────

function TenantPasswordPolicyCard() {
  const { data: policy, isLoading } = useSecurityPolicy();
  const update = useUpdateSecurityPolicy();
  const [form, setForm] = useState<Partial<SecurityPolicy> | null>(null);

  useEffect(() => {
    if (policy) setForm(policy);
  }, [policy]);

  if (isLoading || !form) {
    return <div className="wms-card p-5 text-sm text-muted-foreground">Loading password policy…</div>;
  }

  const setBool = (k: keyof SecurityPolicy) => (val: boolean) => setForm((f) => ({ ...f!, [k]: val }));
  const setNum = (k: keyof SecurityPolicy) => (e: any) => setForm((f) => ({ ...f!, [k]: parseInt(e.target.value || '0', 10) }));

  return (
    <div className="wms-card p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold">Tenant Password Policy</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Applies to all users in this tenant. Enforced on password change.
          </p>
        </div>
        <Button size="sm" onClick={() => update.mutate(form!)} disabled={update.isPending} className="gap-2">
          {update.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save Policy
        </Button>
      </div>
      <Separator />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Minimum length">
          <Input type="number" min={4} max={64} value={form.passwordMinLength ?? 8} onChange={setNum('passwordMinLength')} />
        </Field>
        <Field label="Password expiry (days, 0 = never)">
          <Input type="number" min={0} value={form.passwordExpiryDays ?? 0} onChange={setNum('passwordExpiryDays')} />
        </Field>
        <Field label="Session timeout (minutes)">
          <Input type="number" min={5} value={form.sessionTimeoutMinutes ?? 30} onChange={setNum('sessionTimeoutMinutes')} />
        </Field>
        <Field label="Lockout after failed attempts">
          <Input type="number" min={1} value={form.failedLoginLockoutCount ?? 5} onChange={setNum('failedLoginLockoutCount')} />
        </Field>
      </div>
      <Separator />
      <div className="space-y-2">
        <PolicyToggle label="Require uppercase letter" checked={!!form.passwordRequireUpper} onChange={setBool('passwordRequireUpper')} />
        <PolicyToggle label="Require lowercase letter" checked={!!form.passwordRequireLower} onChange={setBool('passwordRequireLower')} />
        <PolicyToggle label="Require digit" checked={!!form.passwordRequireDigit} onChange={setBool('passwordRequireDigit')} />
        <PolicyToggle label="Require special character" checked={!!form.passwordRequireSpecial} onChange={setBool('passwordRequireSpecial')} />
        <PolicyToggle label="Require 2FA for admins" checked={!!form.require2faForAdmins} onChange={setBool('require2faForAdmins')} />
        <PolicyToggle label="Require 2FA for all users" checked={!!form.require2faForAll} onChange={setBool('require2faForAll')} />
      </div>
    </div>
  );
}

function PolicyToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded border p-2">
      <span className="text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

// ─── Tab 8: Appearance ────────────────────────────────────────────────────────

function AppearanceTab({ theme, setTheme, primaryColor, setPrimaryColor }: {
  theme: string; setTheme: (t: any) => void;
  primaryColor: string; setPrimaryColor: (c: string) => void;
}) {
  const [colorInput, setColorInput] = useState(primaryColor);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setColorInput(primaryColor); }, [primaryColor]);

  const handleColorChange = useCallback((val: string) => {
    setColorInput(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (/^#[0-9A-Fa-f]{6}$/.test(val)) setPrimaryColor(val);
    }, 500);
  }, [setPrimaryColor]);

  const THEMES = [
    { value: 'light', label: 'Light', icon: Sun, desc: 'Clean light interface' },
    { value: 'dark', label: 'Dark', icon: Moon, desc: 'Easy on the eyes' },
    { value: 'system', label: 'System', icon: Monitor, desc: 'Follows OS preference' },
  ] as const;

  return (
    <div className="space-y-6">
      <SectionHeader title="Appearance" description="Customize the look and feel of your workspace" />

      <div className="wms-card p-5 space-y-4">
        <h3 className="text-sm font-semibold">Theme</h3>
        <Separator />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {THEMES.map(({ value, label, icon: Icon, desc }) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              className={cn(
                'p-4 rounded-xl border-2 text-left transition-all hover:border-primary/40',
                theme === value ? 'border-primary bg-primary/5' : 'border-border bg-card',
              )}
            >
              <Icon className={cn('h-6 w-6 mb-2', theme === value ? 'text-primary' : 'text-muted-foreground')} />
              <p className="font-medium text-sm">{label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              {theme === value && <CheckCircle2 className="h-4 w-4 text-primary mt-2" />}
            </button>
          ))}
        </div>
      </div>

      <div className="wms-card p-5 space-y-4">
        <h3 className="text-sm font-semibold">Brand Color</h3>
        <Separator />
        <p className="text-xs text-muted-foreground">Sets the primary accent color across the interface</p>
        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              type="color"
              value={colorInput}
              onChange={(e) => handleColorChange(e.target.value)}
              className="h-10 w-10 rounded-lg cursor-pointer border border-border p-0.5"
            />
          </div>
          <Input
            value={colorInput}
            onChange={(e) => handleColorChange(e.target.value)}
            placeholder="#2B9E8C"
            className="w-36 font-mono"
            maxLength={7}
          />
          <div className="h-10 w-10 rounded-lg border border-border" style={{ backgroundColor: colorInput }} />
          <Button variant="outline" size="sm" onClick={() => handleColorChange('#2B9E8C')} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />Reset
          </Button>
        </div>
      </div>
    </div>
  );
}
