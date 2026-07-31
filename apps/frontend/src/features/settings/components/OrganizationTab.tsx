import { useEffect, useRef, useState } from 'react';
import { Shield, Upload, Trash2, Building2, Info } from 'lucide-react';
import { Input } from '@/shared/components/ui/input';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Textarea } from '@/shared/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/shared/components/ui/select';
import { cn } from '@/shared/lib/utils';
import { toast } from 'sonner';
import { Field, SaveBar, SectionHeader, SettingsSkeleton } from './settings-primitives';
import { TenantSettings, useUpdateTenantInfo } from '../hooks/useSettings';

const MAX_LOGO_BYTES = 2 * 1024 * 1024; // ~2MB

const COMPANY_TYPES = [
  { value: 'manufacturer', label: 'Manufacturer' },
  { value: 'distributor', label: 'Distributor' },
  { value: 'retailer', label: 'Retailer' },
  { value: '3pl', label: '3PL' },
  { value: 'cold_storage', label: 'Cold Storage' },
  { value: 'ecommerce', label: 'E-commerce' },
];

const FY_MONTHS = [
  { value: '1', label: 'January' }, { value: '2', label: 'February' },
  { value: '3', label: 'March' }, { value: '4', label: 'April (India default)' },
  { value: '5', label: 'May' }, { value: '6', label: 'June' },
  { value: '7', label: 'July' }, { value: '8', label: 'August' },
  { value: '9', label: 'September' }, { value: '10', label: 'October' },
  { value: '11', label: 'November' }, { value: '12', label: 'December' },
];

const INDIAN_STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar',
  'Chandigarh', 'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa',
  'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka',
  'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
];

type OrgForm = Partial<TenantSettings> & {
  gstNumber?: string; industry?: string; companyType?: string;
  panNumber?: string; phone?: string; email?: string;
  state?: string; pincode?: string;
  financialYearStartMonth?: number;
  logoUrl?: string;
};

/**
 * Form state keeps '' so every input stays controlled, but the fields the API
 * format-validates must go out as null when blank: class-validator's
 * @IsOptional() skips null/undefined and NOT '', so an empty PAN, Email or
 * Logo would fail @Matches/@IsEmail and 400 the entire Organization save.
 */
const NULL_WHEN_BLANK = ['panNumber', 'email', 'logoUrl'] as const;

function toPayload(form: OrgForm): Record<string, any> {
  const out: Record<string, any> = { ...form };
  for (const key of NULL_WHEN_BLANK) {
    if (out[key] === '' || out[key] === undefined) out[key] = null;
  }
  return out;
}

export function OrganizationTab({ tenantData, isLoading, isAdmin }: {
  tenantData?: TenantSettings & Record<string, any>; isLoading: boolean; isAdmin: boolean;
}) {
  const update = useUpdateTenantInfo();
  const [form, setForm] = useState<OrgForm>({});
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!tenantData) return;
    const t = tenantData as any;
    setForm({
      companyName: t.companyName,
      companyType: t.companyType || '',
      industry: t.industry || '',
      panNumber: t.panNumber || '',
      phone: t.phone || '',
      email: t.email || '',
      address: t.address || '',
      city: t.city || '',
      state: t.state || '',
      pincode: t.pincode || '',
      country: t.country || 'India',
      gstNumber: t.gstNumber || '',
      financialYearStartMonth: Number(t.financialYearStartMonth ?? 4),
      logoUrl: t.logoUrl || '',
    });
  }, [tenantData]);

  const set = (k: keyof OrgForm, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const handleLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Logo must be an image file (PNG, JPG or SVG)');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error('Logo must be under 2MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => set('logoUrl', String(reader.result));
    reader.onerror = () => toast.error('Could not read that file');
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  if (isLoading) return <SettingsSkeleton />;

  const usagePct = (used: number, max: number) => (max > 0 ? Math.round((used / max) * 100) : 0);
  const usageColor = (pct: number) => (pct > 90 ? 'bg-destructive' : pct > 70 ? 'bg-warning' : 'bg-success');

  return (
    <div className="space-y-6">
      <SectionHeader title="Organization" description="Your company profile and subscription plan. Shared by every warehouse." />

      {/* Plan Info */}
      <div className="wms-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Current Plan</h3>
          <Badge className="bg-primary/10 text-primary border-primary/20 capitalize">
            {tenantData?.planName || 'Starter'}
          </Badge>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: 'Users', used: tenantData?.userCount || 0, max: tenantData?.maxUsers || 10 },
            { label: 'Warehouses', used: tenantData?.warehouseCount || 0, max: tenantData?.maxWarehouses || 3 },
            { label: 'SKUs', used: tenantData?.skuCount || 0, max: tenantData?.maxSkus || 100 },
          ].map(({ label, used, max }) => {
            const pct = usagePct(used, max);
            return (
              <div key={label}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium">{used} / {max}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className={cn('h-full rounded-full transition-all', usageColor(pct))}
                    style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Logo */}
      <div className="wms-card p-5 space-y-3">
        <h3 className="text-sm font-semibold">Company Logo</h3>
        <div className="flex items-center gap-4">
          <div className="h-20 w-20 rounded-xl border bg-muted/40 flex items-center justify-center overflow-hidden shrink-0">
            {form.logoUrl
              ? <img src={form.logoUrl} alt="Company logo" className="h-full w-full object-contain" />
              : <Building2 className="h-7 w-7 text-muted-foreground" />}
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogo} />
              <Button variant="outline" size="sm" className="gap-1.5" disabled={!isAdmin}
                onClick={() => fileRef.current?.click()}>
                <Upload className="h-3.5 w-3.5" />{form.logoUrl ? 'Replace' : 'Upload'} Logo
              </Button>
              {form.logoUrl && (
                <Button variant="ghost" size="sm" className="gap-1.5 text-destructive" disabled={!isAdmin}
                  onClick={() => set('logoUrl', '')}>
                  <Trash2 className="h-3.5 w-3.5" />Remove
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">PNG, JPG or SVG. Max 2MB. Shown on printed documents and labels.</p>
          </div>
        </div>
      </div>

      {/* Company details */}
      <div className="wms-card p-5 space-y-4">
        <h3 className="text-sm font-semibold">Company Details</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Field label="Organization Name">
            <Input value={form.companyName || ''} onChange={(e) => set('companyName', e.target.value)} disabled={!isAdmin} />
          </Field>
          <Field label="Company Type">
            <Select value={form.companyType || ''} onValueChange={(v) => set('companyType', v)} disabled={!isAdmin}>
              <SelectTrigger><SelectValue placeholder="Select company type" /></SelectTrigger>
              <SelectContent>
                {COMPANY_TYPES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Industry">
            <Select value={form.industry || ''} onValueChange={(v) => set('industry', v)} disabled={!isAdmin}>
              <SelectTrigger><SelectValue placeholder="Select industry" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="logistics">Logistics & Distribution</SelectItem>
                <SelectItem value="manufacturing">Manufacturing</SelectItem>
                <SelectItem value="retail">Retail & E-commerce</SelectItem>
                <SelectItem value="healthcare">Healthcare & Pharma</SelectItem>
                <SelectItem value="fmcg">FMCG</SelectItem>
                <SelectItem value="automotive">Automotive</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="PAN Number">
            <Input value={form.panNumber || ''} maxLength={10} placeholder="e.g. AAAPA1234A" disabled={!isAdmin}
              onChange={(e) => set('panNumber', e.target.value.toUpperCase())} />
          </Field>
          <Field label="Phone">
            <Input value={form.phone || ''} placeholder="+91 98765 43210" disabled={!isAdmin}
              onChange={(e) => set('phone', e.target.value)} />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email || ''} placeholder="accounts@company.com" disabled={!isAdmin}
              onChange={(e) => set('email', e.target.value)} />
          </Field>
          <Field label="GST / Tax Number" hint="Head office GSTIN. Each warehouse has its own GSTIN in the Warehouses module.">
            <Input value={form.gstNumber || ''} maxLength={15} disabled={!isAdmin}
              onChange={(e) => set('gstNumber', e.target.value.toUpperCase())} />
          </Field>
          <Field label="Financial Year Start Month">
            <Select value={String(form.financialYearStartMonth ?? 4)} disabled={!isAdmin}
              onValueChange={(v) => set('financialYearStartMonth', Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FY_MONTHS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </div>

      {/* Registered address */}
      <div className="wms-card p-5 space-y-4">
        <h3 className="text-sm font-semibold">Registered Address</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="lg:col-span-2">
            <Field label="Business Address">
              <Textarea value={form.address || ''} rows={2} disabled={!isAdmin}
                onChange={(e) => set('address', e.target.value)} />
            </Field>
          </div>
          <Field label="City">
            <Input value={form.city || ''} onChange={(e) => set('city', e.target.value)} disabled={!isAdmin} />
          </Field>
          <Field label="State">
            <Select value={form.state || ''} onValueChange={(v) => set('state', v)} disabled={!isAdmin}>
              <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {INDIAN_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Pincode">
            <Input value={form.pincode || ''} maxLength={6} placeholder="e.g. 500032" disabled={!isAdmin}
              onChange={(e) => set('pincode', e.target.value.replace(/\D/g, ''))} />
          </Field>
          <Field label="Country">
            <Input value={form.country || ''} onChange={(e) => set('country', e.target.value)} disabled={!isAdmin} />
          </Field>
        </div>
        <div className="rounded-lg border border-info/30 bg-info/5 p-3 flex gap-2.5">
          <Info className="h-4 w-4 text-info shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">State matters for tax.</span> When the shipping warehouse state
            matches the customer state, GST is split as CGST + SGST. Different states are charged IGST.
            Each warehouse's own address, GSTIN and operating hours are set in the Warehouses module.
          </p>
        </div>
      </div>

      {!isAdmin && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Shield className="h-3.5 w-3.5" /> Only administrators can edit organization settings.
        </p>
      )}
      {isAdmin && <SaveBar onSave={() => update.mutate(toPayload(form) as any)} isPending={update.isPending} />}
    </div>
  );
}
