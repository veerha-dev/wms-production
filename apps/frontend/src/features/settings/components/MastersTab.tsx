import { useEffect, useState } from 'react';
import {
  Boxes, Truck, Ban, Ruler, Percent, FileDigit, Barcode, ClipboardCheck,
  Shield, Info, Save, Loader2,
} from 'lucide-react';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/shared/components/ui/accordion';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/shared/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/shared/components/ui/table';
import { Input } from '@/shared/components/ui/input';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Switch } from '@/shared/components/ui/switch';
import { Separator } from '@/shared/components/ui/separator';
import { MasterListSection, MasterFieldDef, MasterColumn } from './MasterListSection';
import { SectionHeader, Field, SaveBar } from './settings-primitives';
import {
  MASTERS_BASE, useBarcodeSettings, useUpdateBarcodeSettings, BarcodeSettings,
  useDocumentNumbering, useUpdateDocumentNumbering, DOC_TYPES, DocumentNumberingRule,
  useApprovalRules, useUpdateApprovalRule, ApprovalRulePatch,
} from '../hooks/useMasters';

const BOX_TYPES = [
  { value: 'corrugated', label: 'Corrugated Box' },
  { value: 'carton', label: 'Carton' },
  { value: 'crate', label: 'Crate' },
  { value: 'poly_bag', label: 'Poly Bag' },
  { value: 'pallet_box', label: 'Pallet Box' },
  { value: 'insulated', label: 'Insulated Box' },
];

const MATERIAL_UNITS = [
  { value: 'pcs', label: 'PCS' },
  { value: 'roll', label: 'Roll' },
  { value: 'mtr', label: 'Metre' },
  { value: 'kg', label: 'KG' },
  { value: 'box', label: 'Box' },
  { value: 'sheet', label: 'Sheet' },
];

const CARRIER_TYPES = [
  { value: 'courier', label: 'Courier' },
  { value: 'ftl', label: 'FTL (Full Truck Load)' },
  { value: 'ltl', label: 'LTL (Part Load)' },
  { value: 'aggregator', label: 'Aggregator' },
  { value: 'self_delivery', label: 'Self Delivery' },
];

const REASON_CATEGORIES = [
  { value: 'adjustment', label: 'Adjustment Reasons' },
  { value: 'return', label: 'Return Reasons' },
  { value: 'transfer', label: 'Transfer Reasons' },
  { value: 'qc_failure', label: 'QC Failure Reasons' },
  { value: 'pick_issue', label: 'Pick Issue Reasons' },
];

const GST_RATES = [
  { rate: 0, label: '0% — Exempt / Nil rated', example: 'Fresh produce, books, unbranded food grains' },
  { rate: 5, label: '5%', example: 'Packaged food, life-saving drugs, apparel under ₹1,000' },
  { rate: 12, label: '12%', example: 'Processed food, ayurvedic medicine, mobile phones' },
  { rate: 18, label: '18%', example: 'Most electronics, industrial goods, services' },
  { rate: 28, label: '28%', example: 'Luxury items, automobiles, aerated drinks' },
];

// ─── Masters Tab ─────────────────────────────────────────────────────────────

export function MastersTab({ isAdmin }: { isAdmin: boolean }) {
  const canWrite = isAdmin;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Masters"
        description="Company-wide reference data shared by every warehouse."
      />
      {!canWrite && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Shield className="h-3.5 w-3.5" /> Only administrators can edit master data.
        </p>
      )}

      <Accordion type="multiple" defaultValue={['packaging']} className="space-y-3">
        <Section value="packaging" n={1} icon={Boxes} title="Packaging"
          subtitle="Boxes and packing materials used during outbound packing">
          <div className="space-y-6">
            <SubSection label="A. Boxes">
              <MasterListSection
                bare
                title="Boxes"
                endpoint={`${MASTERS_BASE}/boxes`}
                entityName="Box"
                canWrite={canWrite}
                columns={boxColumns}
                fields={boxFields}
              />
            </SubSection>
            <SubSection label="B. Materials">
              <MasterListSection
                bare
                title="Materials"
                endpoint={`${MASTERS_BASE}/materials`}
                entityName="Material"
                canWrite={canWrite}
                columns={materialColumns}
                fields={materialFields}
              />
            </SubSection>
          </div>
        </Section>

        <Section value="carriers" n={2} icon={Truck} title="Carriers"
          subtitle="Shipping partners available on outbound shipments">
          <MasterListSection
            bare
            title="Carriers"
            endpoint={`${MASTERS_BASE}/carriers`}
            entityName="Carrier"
            canWrite={canWrite}
            columns={carrierColumns}
            fields={carrierFields}
          />
        </Section>

        <Section value="reason-codes" n={3} icon={Ban} title="Reason Codes"
          subtitle="Standard reasons selected by workers on adjustments, returns, transfers, QC and picking">
          <ReasonCodesSection canWrite={canWrite} />
        </Section>

        <Section value="units" n={4} icon={Ruler} title="Units & Categories"
          subtitle="Units of measurement and SKU categories used across the catalogue">
          <div className="space-y-6">
            <SubSection label="A. Units of Measurement">
              <MasterListSection
                bare
                title="Units"
                endpoint={`${MASTERS_BASE}/units`}
                entityName="Unit"
                labelKey="code"
                systemKey="isSystem"
                canWrite={canWrite}
                columns={unitColumns}
                fields={unitFields}
              />
            </SubSection>
            <SubSection label="B. SKU Categories">
              <MasterListSection
                bare
                title="SKU Categories"
                endpoint={`${MASTERS_BASE}/sku-categories`}
                entityName="Category"
                systemKey="isSystem"
                canWrite={canWrite}
                columns={skuCategoryColumns}
                fields={skuCategoryFields}
              />
            </SubSection>
          </div>
        </Section>

        <Section value="tax" n={5} icon={Percent} title="Tax & GST"
          subtitle="GST rates, HSN codes and India tax compliance settings">
          <TaxGstSection canWrite={canWrite} />
        </Section>

        <Section value="numbering" n={6} icon={FileDigit} title="Document Numbering"
          subtitle="Prefix and sequence format for every document type">
          <DocumentNumberingSection canWrite={canWrite} />
        </Section>

        <Section value="barcode" n={7} icon={Barcode} title="Barcode & Labels"
          subtitle="How location codes and SKU labels are generated and printed">
          <BarcodeSection canWrite={canWrite} />
        </Section>

        <Section value="approvals" n={8} icon={ClipboardCheck} title="Approval Rules"
          subtitle="Thresholds above which an action needs approval before it is applied">
          <ApprovalRulesSection canWrite={canWrite} />
        </Section>
      </Accordion>
    </div>
  );
}

// ─── 1. Packaging configs ────────────────────────────────────────────────────

const boxFields: MasterFieldDef[] = [
  { key: 'name', label: 'Box Name', type: 'text', required: true, placeholder: 'e.g. Small Corrugated Box' },
  { key: 'code', label: 'Code', type: 'text', required: true, placeholder: 'e.g. BOX-S' },
  { key: 'lengthCm', label: 'Length (cm)', type: 'number', min: 0 },
  { key: 'widthCm', label: 'Width (cm)', type: 'number', min: 0 },
  { key: 'heightCm', label: 'Height (cm)', type: 'number', min: 0 },
  { key: 'maxWeightKg', label: 'Max Weight (kg)', type: 'number', min: 0 },
  { key: 'boxType', label: 'Box Type', type: 'select', options: BOX_TYPES, defaultValue: 'corrugated' },
  { key: 'cost', label: 'Cost (₹)', type: 'number', min: 0 },
];

const boxColumns: MasterColumn[] = [
  { key: 'name', label: 'Box Name' },
  { key: 'code', label: 'Code' },
  {
    key: 'lengthCm', label: 'Dimensions (L×W×H cm)',
    render: (r) => (r.lengthCm || r.widthCm || r.heightCm)
      ? `${r.lengthCm ?? '—'} × ${r.widthCm ?? '—'} × ${r.heightCm ?? '—'}`
      : '—',
  },
  { key: 'maxWeightKg', label: 'Max Weight', render: (r) => (r.maxWeightKg ? `${r.maxWeightKg} kg` : '—') },
  { key: 'boxType', label: 'Type' },
  { key: 'cost', label: 'Cost', render: (r) => (r.cost != null ? `₹${r.cost}` : '—') },
];

const materialFields: MasterFieldDef[] = [
  { key: 'name', label: 'Material Name', type: 'text', required: true, placeholder: 'e.g. Bubble Wrap' },
  { key: 'code', label: 'Code', type: 'text', required: true, placeholder: 'e.g. MAT-BW' },
  { key: 'unit', label: 'Unit', type: 'select', options: MATERIAL_UNITS, defaultValue: 'roll' },
  { key: 'cost', label: 'Cost (₹)', type: 'number', min: 0 },
];

const materialColumns: MasterColumn[] = [
  { key: 'name', label: 'Material Name' },
  { key: 'code', label: 'Code' },
  { key: 'unit', label: 'Unit' },
  { key: 'cost', label: 'Cost', render: (r) => (r.cost != null ? `₹${r.cost}` : '—') },
];

// ─── 2. Carriers ─────────────────────────────────────────────────────────────

const carrierFields: MasterFieldDef[] = [
  { key: 'name', label: 'Carrier Name', type: 'text', required: true, placeholder: 'e.g. Blue Dart' },
  { key: 'code', label: 'Code', type: 'text', required: true, placeholder: 'e.g. BLUEDART' },
  { key: 'carrierType', label: 'Type', type: 'select', options: CARRIER_TYPES, defaultValue: 'courier' },
  { key: 'transporterId', label: 'Transporter ID (GST)', type: 'text', placeholder: 'For E-Way Bill' },
  { key: 'contact', label: 'Contact', type: 'text', placeholder: 'Phone or email' },
  { key: 'apiIntegrated', label: 'API Integrated', type: 'checkbox', placeholder: 'Tracking via carrier API' },
];

const carrierColumns: MasterColumn[] = [
  { key: 'name', label: 'Carrier Name' },
  { key: 'code', label: 'Code' },
  { key: 'carrierType', label: 'Type' },
  { key: 'transporterId', label: 'Transporter ID' },
  { key: 'contact', label: 'Contact' },
  { key: 'apiIntegrated', label: 'API Integrated' },
];

// ─── 3. Reason Codes ─────────────────────────────────────────────────────────

function ReasonCodesSection({ canWrite }: { canWrite: boolean }) {
  const [category, setCategory] = useState(REASON_CATEGORIES[0].value);

  const fields: MasterFieldDef[] = [
    { key: 'reasonText', label: 'Reason Text', type: 'text', required: true, colSpan: 2,
      placeholder: 'e.g. Damaged in storage' },
    { key: 'code', label: 'Code', type: 'text', placeholder: 'e.g. ADJ-DMG' },
    { key: 'category', label: 'Category', type: 'select', required: true,
      options: REASON_CATEGORIES.map((c) => ({ value: c.value, label: c.label })),
      defaultValue: category },
  ];

  const columns: MasterColumn[] = [
    { key: 'reasonText', label: 'Reason' },
    { key: 'code', label: 'Code' },
    {
      key: 'category', label: 'Category',
      render: (r) => (
        <Badge variant="secondary" className="text-[10px]">
          {REASON_CATEGORIES.find((c) => c.value === r.category)?.label ?? r.category}
        </Badge>
      ),
    },
  ];

  return (
    <MasterListSection
      key={`reason-${category}`}
      bare
      title="Reason Codes"
      endpoint={`${MASTERS_BASE}/reason-codes`}
      params={{ category }}
      entityName="Reason Code"
      labelKey="reasonText"
      canWrite={canWrite}
      columns={columns}
      fields={fields}
      emptyMessage="No reason codes in this category yet"
      toolbar={
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-9 w-full sm:w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            {REASON_CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    />
  );
}

// ─── 4. Units & Categories configs ───────────────────────────────────────────

const unitFields: MasterFieldDef[] = [
  { key: 'code', label: 'Unit Code', type: 'text', required: true, placeholder: 'e.g. PCS', immutable: true },
  { key: 'name', label: 'Unit Name', type: 'text', required: true, placeholder: 'e.g. Pieces' },
];

const unitColumns: MasterColumn[] = [
  { key: 'code', label: 'Code' },
  { key: 'name', label: 'Name' },
  {
    key: 'isSystem', label: 'Source',
    render: (r) => r.isSystem
      ? <Badge variant="secondary" className="text-[10px]">System</Badge>
      : <Badge variant="outline" className="text-[10px]">Custom</Badge>,
  },
];

const skuCategoryFields: MasterFieldDef[] = [
  { key: 'name', label: 'Category Name', type: 'text', required: true, placeholder: 'e.g. Electronics' },
  { key: 'code', label: 'Code', type: 'text', required: true, placeholder: 'e.g. ELEC' },
];

const skuCategoryColumns: MasterColumn[] = [
  { key: 'name', label: 'Category' },
  { key: 'code', label: 'Code' },
  {
    key: 'isSystem', label: 'Source',
    render: (r) => r.isSystem
      ? <Badge variant="secondary" className="text-[10px]">System</Badge>
      : <Badge variant="outline" className="text-[10px]">Custom</Badge>,
  },
];

// ─── 5. Tax & GST ────────────────────────────────────────────────────────────

function TaxGstSection({ canWrite }: { canWrite: boolean }) {
  const hsnFields: MasterFieldDef[] = [
    { key: 'hsnCode', label: 'HSN Code', type: 'text', required: true, placeholder: 'e.g. 8471' },
    { key: 'gstRate', label: 'GST Rate (%)', type: 'select', required: true,
      options: GST_RATES.map((g) => ({ value: String(g.rate), label: `${g.rate}%` })), defaultValue: '18' },
    { key: 'description', label: 'Description', type: 'text', colSpan: 2, placeholder: 'e.g. Automatic data processing machines' },
  ];

  const hsnColumns: MasterColumn[] = [
    { key: 'hsnCode', label: 'HSN Code' },
    { key: 'description', label: 'Description' },
    { key: 'gstRate', label: 'GST Rate', render: (r) => (r.gstRate != null ? `${r.gstRate}%` : '—') },
  ];

  return (
    <div className="space-y-6">
      {/* GST rate slabs — static reference list */}
      <SubSection label="GST Rate Slabs">
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Rate</TableHead>
                <TableHead>Slab</TableHead>
                <TableHead>Typical goods</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {GST_RATES.map((g) => (
                <TableRow key={g.rate}>
                  <TableCell>
                    <Badge className="bg-primary/10 text-primary border-primary/20">{g.rate}%</Badge>
                  </TableCell>
                  <TableCell className="font-medium">{g.label}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{g.example}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          These are the statutory GST slabs and cannot be edited. Assign a rate to each SKU via its HSN code.
        </p>
      </SubSection>

      {/* Tax split explainer */}
      <div className="rounded-lg border border-info/30 bg-info/5 p-4 flex gap-3">
        <Info className="h-4 w-4 text-info shrink-0 mt-0.5" />
        <div className="space-y-1 text-sm">
          <p className="font-medium">How the tax split is applied automatically</p>
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">Same state</span> (warehouse state = customer state) →
            {' '}the GST rate is split into <span className="font-medium text-foreground">CGST + SGST</span>, half each.
          </p>
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">Different state</span> →
            {' '}the full rate is charged as <span className="font-medium text-foreground">IGST</span>.
          </p>
          <p className="text-muted-foreground text-xs pt-1">
            This is derived from the State set on the warehouse and on the customer — no configuration needed here.
          </p>
        </div>
      </div>

      {/* HSN codes */}
      <SubSection label="Frequently Used HSN Codes">
        <MasterListSection
          bare
          title="HSN Codes"
          endpoint={`${MASTERS_BASE}/hsn-codes`}
          entityName="HSN Code"
          labelKey="hsnCode"
          canWrite={canWrite}
          columns={hsnColumns}
          fields={hsnFields}
        />
      </SubSection>

      {/* Coming soon toggles */}
      <SubSection label="E-Invoice & E-Way Bill">
        <div className="space-y-2">
          <ComingSoonToggle
            label="Enable E-Invoice (IRN generation)"
            description="Generate IRN and signed QR through a GSP for B2B invoices."
          />
          <ComingSoonToggle
            label="Enable E-Way Bill"
            description="Auto-generate E-Way Bills for consignments above ₹50,000."
          />
          <div className="flex items-center gap-3 opacity-60">
            <span className="text-sm min-w-[180px]">E-Way Bill threshold</span>
            <Input value="50000" disabled className="w-40" />
            <Badge variant="outline" className="text-[10px]">Coming soon</Badge>
          </div>
        </div>
      </SubSection>
    </div>
  );
}

function ComingSoonToggle({ label, description }: { label: string; description: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border p-3 opacity-60">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Badge variant="outline" className="text-[10px]">Coming soon</Badge>
        <Switch checked={false} disabled onCheckedChange={() => {}} />
      </div>
    </div>
  );
}

// ─── 6. Document Numbering ───────────────────────────────────────────────────

function DocumentNumberingSection({ canWrite }: { canWrite: boolean }) {
  const { data: rules = [], isLoading } = useDocumentNumbering();
  const update = useUpdateDocumentNumbering();
  const [rows, setRows] = useState<DocumentNumberingRule[]>([]);
  const [dirty, setDirty] = useState<Record<string, boolean>>({});

  useEffect(() => { if (rules.length) setRows(rules); }, [rules]);

  const setCell = (docType: string, key: keyof DocumentNumberingRule, value: any) => {
    setRows((rs) => rs.map((r) => (r.docType === docType ? { ...r, [key]: value } : r)));
    setDirty((d) => ({ ...d, [docType]: true }));
  };

  const save = (row: DocumentNumberingRule) => {
    update.mutate(
      { ...row, startingNumber: Number(row.startingNumber) || 1, numberLength: Number(row.numberLength) || 3 },
      { onSuccess: () => setDirty((d) => ({ ...d, [row.docType]: false })) },
    );
  };

  const preview = (row: DocumentNumberingRule) => {
    const len = Math.max(1, Math.min(12, Number(row.numberLength) || 3));
    const num = String(Number(row.startingNumber) || 1).padStart(len, '0');
    const yr = row.resetYearly ? `/${new Date().getFullYear()}` : '';
    return `${row.prefix || ''}${yr}-${num}`;
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading numbering rules…</p>;

  return (
    <div className="rounded-lg border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Document Type</TableHead>
            <TableHead className="w-32">Prefix</TableHead>
            <TableHead className="w-32">Starting No.</TableHead>
            <TableHead className="w-32">Number Length</TableHead>
            <TableHead className="w-32">Reset Yearly</TableHead>
            <TableHead>Preview</TableHead>
            {canWrite && <TableHead className="text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.docType}>
              <TableCell className="font-medium">
                {DOC_TYPES.find((t) => t.value === row.docType)?.label ?? row.docType}
              </TableCell>
              <TableCell>
                <Input className="h-8" value={row.prefix ?? ''} disabled={!canWrite}
                  onChange={(e) => setCell(row.docType, 'prefix', e.target.value.toUpperCase())} />
              </TableCell>
              <TableCell>
                <Input className="h-8" type="number" min={1} value={row.startingNumber ?? 1} disabled={!canWrite}
                  onChange={(e) => setCell(row.docType, 'startingNumber', e.target.value)} />
              </TableCell>
              <TableCell>
                <Input className="h-8" type="number" min={1} max={12} value={row.numberLength ?? 3} disabled={!canWrite}
                  onChange={(e) => setCell(row.docType, 'numberLength', e.target.value)} />
              </TableCell>
              <TableCell>
                <Switch checked={!!row.resetYearly} disabled={!canWrite}
                  onCheckedChange={(v) => setCell(row.docType, 'resetYearly', v)} />
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{preview(row)}</TableCell>
              {canWrite && (
                <TableCell className="text-right">
                  <Button size="sm" variant={dirty[row.docType] ? 'default' : 'outline'}
                    className="h-8 gap-1.5" disabled={!dirty[row.docType] || update.isPending}
                    onClick={() => save(row)}>
                    {update.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    Save
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── 7. Barcode & Labels ─────────────────────────────────────────────────────

function BarcodeSection({ canWrite }: { canWrite: boolean }) {
  const { data, isLoading } = useBarcodeSettings();
  const update = useUpdateBarcodeSettings();
  const [form, setForm] = useState<Partial<BarcodeSettings>>({});

  useEffect(() => { if (data) setForm(data); }, [data]);

  const set = (k: keyof BarcodeSettings, v: any) => setForm((f) => ({ ...f, [k]: v }));

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading barcode settings…</p>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Location Code Type" hint="How bin and location labels are encoded">
          <Select value={form.locationCodeType ?? 'qr'} disabled={!canWrite}
            onValueChange={(v) => set('locationCodeType', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="qr">QR Code (default)</SelectItem>
              <SelectItem value="barcode">Barcode (Code 128)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Label Size">
          <Select value={form.labelSize ?? 'medium'} disabled={!canWrite}
            onValueChange={(v) => set('labelSize', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="small">Small (38.1 × 21.2 mm — Avery L7651, 65/sheet)</SelectItem>
              <SelectItem value="medium">Medium (63.5 × 38.1 mm — Avery L7160, 21/sheet)</SelectItem>
              <SelectItem value="large">Large (99.1 × 67.7 mm — Avery L7165, 8/sheet)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Print Format">
          <Select value={form.printFormat ?? 'a4'} disabled={!canWrite}
            onValueChange={(v) => set('printFormat', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {/* Values must match the barcode_settings.print_format CHECK
                  constraint (migration 080) — 'a4_sheet'/'thermal_roll' 400. */}
              <SelectItem value="a4">A4 Sheet</SelectItem>
              <SelectItem value="thermal">Thermal Roll</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="SKU Barcode Source" hint="Where the scannable SKU barcode comes from">
          <Select value={form.skuBarcodeSource ?? 'both'} disabled={!canWrite}
            onValueChange={(v) => set('skuBarcodeSource', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="manufacturer">Manufacturer barcode</SelectItem>
              <SelectItem value="auto">Auto-generate</SelectItem>
              <SelectItem value="both">Both</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Separator />
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">Include human-readable text</p>
          <p className="text-xs text-muted-foreground">Print the code as text underneath the symbol</p>
        </div>
        <Switch checked={form.includeHumanReadable ?? true} disabled={!canWrite}
          onCheckedChange={(v) => set('includeHumanReadable', v)} />
      </div>
      {canWrite && <SaveBar onSave={() => update.mutate(form)} isPending={update.isPending} />}
    </div>
  );
}

// ─── 8. Approval Rules ───────────────────────────────────────────────────────

/**
 * Each of the five spec rules is backed by a DIFFERENT approval_rules column.
 * `field` names the one this row reads and writes; sending `thresholdAmount`
 * for all of them (the previous behaviour) silently dropped four of the five.
 */
type ApprovalNumericField = 'thresholdAmount' | 'thresholdUnits' | 'cycleCountAutoApprovePct';

interface ApprovalRuleDef {
  module: string;
  label: string;
  description: string;
  unit: string;
  /** Rule is a plain Yes/No stored in `transferRequiresApproval`. */
  booleanOnly?: boolean;
  /** Backend field holding this rule's number (absent for booleanOnly rules). */
  field?: ApprovalNumericField;
  /** Value must be a whole number (unit counts). */
  integer?: boolean;
  defaultThreshold: number;
  max?: number;
}

const APPROVAL_RULE_DEFS: ApprovalRuleDef[] = [
  {
    module: 'stock_adjustment_units',
    label: 'Stock adjustment approval threshold',
    description: 'Adjustments above this many units need approval before they are applied',
    unit: 'units', field: 'thresholdUnits', integer: true, defaultThreshold: 100,
  },
  {
    module: 'stock_adjustment_value',
    label: 'Adjustment value threshold',
    description: 'Adjustments worth more than this amount need approval (optional)',
    unit: '₹', field: 'thresholdAmount', defaultThreshold: 0,
  },
  {
    module: 'inter_warehouse_transfer',
    label: 'Inter-warehouse transfer requires admin approval',
    description: 'Every transfer between warehouses must be approved by an administrator',
    unit: '', booleanOnly: true, defaultThreshold: 0,
  },
  {
    module: 'purchase_order',
    label: 'PO approval above amount',
    description: 'Purchase orders above this amount need approval (optional)',
    unit: '₹', field: 'thresholdAmount', defaultThreshold: 0,
  },
  {
    module: 'cycle_count_variance',
    label: 'Cycle count variance auto-approve below',
    description: 'Variances under this percentage are auto-approved without review (optional)',
    unit: '%', field: 'cycleCountAutoApprovePct', defaultThreshold: 0, max: 100,
  },
];

interface ApprovalFormRow {
  /** Numeric rules: the value of this rule's own backend field. */
  value: number | string;
  isActive: boolean;
  /** Boolean rule (inter-warehouse transfer): transferRequiresApproval. */
  booleanValue: boolean;
}

function ApprovalRulesSection({ canWrite }: { canWrite: boolean }) {
  const { data: rules = [], isLoading } = useApprovalRules();
  const update = useUpdateApprovalRule();
  const [form, setForm] = useState<Record<string, ApprovalFormRow>>({});
  const [dirty, setDirty] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const next: Record<string, ApprovalFormRow> = {};
    for (const def of APPROVAL_RULE_DEFS) {
      const row = rules.find((r) => r.module === def.module);
      // Read this rule's OWN column, not thresholdAmount for everything.
      const stored = def.field ? row?.[def.field] : undefined;
      next[def.module] = {
        value: stored === null || stored === undefined ? def.defaultThreshold : stored,
        isActive: row?.isActive ?? false,
        booleanValue: row?.transferRequiresApproval ?? false,
      };
    }
    setForm(next);
  }, [rules]);

  const set = (module: string, patch: Partial<ApprovalFormRow>) => {
    setForm((f) => ({ ...f, [module]: { ...f[module], ...patch } }));
    setDirty((d) => ({ ...d, [module]: true }));
  };

  const save = (module: string) => {
    const def = APPROVAL_RULE_DEFS.find((d) => d.module === module);
    const v = form[module];
    if (!def || !v) return;

    const patch: ApprovalRulePatch = { module, isActive: !!v.isActive };
    if (def.booleanOnly) {
      // Yes/No rule — the single switch IS the value, so it also drives isActive.
      patch.transferRequiresApproval = !!v.booleanValue;
      patch.isActive = !!v.booleanValue;
    } else if (def.field) {
      const n = Number(v.value) || 0;
      patch[def.field] = def.integer ? Math.round(n) : n;
    }

    update.mutate(patch, { onSuccess: () => setDirty((d) => ({ ...d, [module]: false })) });
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading approval rules…</p>;

  return (
    <div className="space-y-3">
      {APPROVAL_RULE_DEFS.map((def) => {
        const v = form[def.module] ?? { value: def.defaultThreshold, isActive: false, booleanValue: false };
        // The Yes/No rule's switch is its value; numeric rules use it to enable.
        const switchOn = def.booleanOnly ? !!v.booleanValue : !!v.isActive;
        return (
          <div key={def.module} className="rounded-lg border p-4 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium">{def.label}</p>
                <p className="text-xs text-muted-foreground">{def.description}</p>
              </div>
              <Switch checked={switchOn} disabled={!canWrite}
                onCheckedChange={(on) => set(def.module, def.booleanOnly ? { booleanValue: on, isActive: on } : { isActive: on })} />
            </div>
            {!def.booleanOnly && (
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground min-w-[70px]">Threshold</span>
                <div className="flex items-center gap-2">
                  {def.unit === '₹' && <span className="text-sm text-muted-foreground">₹</span>}
                  <Input
                    type="number" min={0} max={def.max} step={def.integer ? 1 : 'any'} className="h-8 w-40"
                    value={v.value ?? ''}
                    disabled={!canWrite || !v.isActive}
                    onChange={(e) => set(def.module, { value: e.target.value })}
                  />
                  {def.unit !== '₹' && def.unit && (
                    <span className="text-sm text-muted-foreground">{def.unit}</span>
                  )}
                </div>
                {canWrite && (
                  <Button size="sm" variant={dirty[def.module] ? 'default' : 'outline'}
                    className="h-8 gap-1.5 ml-auto"
                    disabled={!dirty[def.module] || update.isPending}
                    onClick={() => save(def.module)}>
                    {update.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    Save
                  </Button>
                )}
              </div>
            )}
            {def.booleanOnly && canWrite && (
              <div className="flex justify-end">
                <Button size="sm" variant={dirty[def.module] ? 'default' : 'outline'}
                  className="h-8 gap-1.5"
                  disabled={!dirty[def.module] || update.isPending}
                  onClick={() => save(def.module)}>
                  {update.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  Save
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Layout helpers ──────────────────────────────────────────────────────────

function Section({ value, n, icon: Icon, title, subtitle, children }: {
  value: string; n: number; icon: any; title: string; subtitle: string; children: React.ReactNode;
}) {
  return (
    <AccordionItem value={value} className="wms-card border px-5">
      <AccordionTrigger className="hover:no-underline py-4">
        <div className="flex items-center gap-3 text-left">
          <span className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
            {n}
          </span>
          <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
          <div>
            <p className="text-sm font-semibold">{title}</p>
            <p className="text-xs text-muted-foreground font-normal">{subtitle}</p>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="pb-5 pt-1">{children}</AccordionContent>
    </AccordionItem>
  );
}

function SubSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}
