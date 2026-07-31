import { useState } from 'react';
import {
  Plug, Unplug, Shield, Save, Loader2, Truck, ShoppingCart, Calculator,
  Receipt, ScanBarcode, Server,
} from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Textarea } from '@/shared/components/ui/textarea';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/shared/components/ui/dialog';
import { cn } from '@/shared/lib/utils';
import { Field, SectionHeader, SettingsSkeleton, ToggleRow } from './settings-primitives';
import { Integration, useUpdateIntegration } from '../hooks/useSettings';

/**
 * Display catalogue for the Integrations tab, in spec order (Tab 7).
 * Names/providers live in the frontend so the copy can be tuned without a
 * backend deploy; `connected` state still comes from GET /settings/integrations.
 */
interface IntegrationDef {
  key: string;
  name: string;
  description: string;
  providers: string[];
  icon: any;
  /** Rendered but not configurable yet (no backend key / credentials flow). */
  comingSoon?: boolean;
}

const INTEGRATION_CATALOG: IntegrationDef[] = [
  {
    key: 'shipping_connected',
    name: 'Shipping Carriers',
    description: 'Push shipments and pull tracking updates from Indian courier partners',
    providers: ['Shiprocket', 'Blue Dart', 'DTDC', 'Delhivery', 'Ecom Express'],
    icon: Truck,
  },
  {
    key: 'ecommerce_connected',
    name: 'E-commerce',
    description: 'Sync orders and inventory with your online sales channels',
    providers: ['Shopify', 'Amazon India', 'Flipkart', 'WooCommerce', 'Meesho'],
    icon: ShoppingCart,
  },
  {
    key: 'accounting_connected',
    name: 'Accounting',
    description: 'Post invoices, GRNs and stock values to your books',
    providers: ['Tally', 'Zoho Books', 'Busy', 'QuickBooks', 'Xero'],
    icon: Calculator,
  },
  {
    key: 'gst_compliance',
    name: 'GST Compliance',
    description: 'E-Invoice (IRN) and E-Way Bill generation through a GSP',
    providers: ['E-Invoice / IRN', 'E-Way Bill', 'GSP credentials'],
    icon: Receipt,
    comingSoon: true,
  },
  {
    key: 'barcode_connected',
    name: 'Barcode / RFID',
    description: 'Scanner and reader hardware integration',
    providers: ['Zebra', 'Honeywell', 'TSC', 'Generic HID scanners'],
    icon: ScanBarcode,
  },
  {
    key: 'erp_connected',
    name: 'ERP System',
    description: 'Two-way master and transaction sync for Enterprise clients',
    providers: ['SAP', 'Oracle', 'Microsoft Dynamics', 'Custom ERP'],
    icon: Server,
  },
];

export function IntegrationsTab({ integrations, isLoading, isAdmin }: {
  integrations: Integration[]; isLoading: boolean; isAdmin: boolean;
}) {
  const updateIntegration = useUpdateIntegration();
  const [modal, setModal] = useState<{ open: boolean; def: IntegrationDef | null }>({ open: false, def: null });
  const [modalForm, setModalForm] = useState({ connected: false, connectionDetails: '' });

  const byKey = new Map(integrations.map((i) => [i.key, i]));

  const openModal = (def: IntegrationDef) => {
    const item = byKey.get(def.key);
    setModal({ open: true, def });
    setModalForm({ connected: !!item?.connected, connectionDetails: item?.connectionDetails || '' });
  };

  const saveIntegration = () => {
    if (!modal.def) return;
    updateIntegration.mutate(
      { key: modal.def.key, connected: modalForm.connected, connectionDetails: modalForm.connectionDetails },
      { onSuccess: () => setModal({ open: false, def: null }) },
    );
  };

  if (isLoading) return <SettingsSkeleton />;

  return (
    <div className="space-y-6">
      <SectionHeader title="Integrations" description="Third-party services connected to your warehouse" />

      <div className="grid grid-cols-1 gap-4">
        {INTEGRATION_CATALOG.map((def) => {
          const item = byKey.get(def.key);
          const connected = !!item?.connected;
          const Icon = def.icon;
          return (
            <div key={def.key} className="wms-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-4 flex-1">
                <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0',
                  connected ? 'bg-success/10' : 'bg-muted')}>
                  <Icon className={cn('h-5 w-5', connected ? 'text-success' : 'text-muted-foreground')} />
                </div>
                <div className="space-y-1.5">
                  <p className="font-medium text-sm">{def.name}</p>
                  <p className="text-xs text-muted-foreground">{def.description}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {def.providers.map((p) => (
                      <Badge key={p} variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">{p}</Badge>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {def.comingSoon ? (
                  <Badge variant="outline" className="text-xs">Coming soon</Badge>
                ) : (
                  <>
                    <Badge variant="outline" className={cn('text-xs gap-1', connected
                      ? 'bg-success/10 text-success border-success/20'
                      : 'bg-muted text-muted-foreground')}>
                      {connected ? <Plug className="h-3 w-3" /> : <Unplug className="h-3 w-3" />}
                      {connected ? 'Connected' : 'Not Configured'}
                    </Badge>
                    <Button variant="outline" size="sm" onClick={() => openModal(def)} disabled={!isAdmin}>
                      {connected ? 'Manage' : 'Configure'}
                    </Button>
                  </>
                )}
                {def.comingSoon && (
                  <Button variant="outline" size="sm" disabled>Configure</Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">Credentials are stored encrypted and never displayed after saving.</p>
      {!isAdmin && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Shield className="h-3.5 w-3.5" />Only administrators can manage integrations.
        </p>
      )}

      <Dialog open={modal.open} onOpenChange={(o) => !o && setModal({ open: false, def: null })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{modal.def?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{modal.def?.description}</p>
            <ToggleRow label="Connected" description="Enable or disable this integration"
              checked={modalForm.connected} onCheckedChange={(v) => setModalForm((f) => ({ ...f, connected: v }))} />
            <Field label="Connection Details (optional)">
              <Textarea
                value={modalForm.connectionDetails}
                onChange={(e) => setModalForm((f) => ({ ...f, connectionDetails: e.target.value }))}
                placeholder="API endpoint, account ID, credential notes…"
                rows={3}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal({ open: false, def: null })}>Cancel</Button>
            <Button onClick={saveIntegration} disabled={updateIntegration.isPending} className="gap-2">
              {updateIntegration.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
