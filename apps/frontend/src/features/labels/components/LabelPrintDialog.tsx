import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Download, Loader2, Printer } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Progress } from '@/shared/components/ui/progress';
import { ScrollArea } from '@/shared/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { Switch } from '@/shared/components/ui/switch';

import { LABEL_DIMENSIONS_MM } from '../constants';
import { useLabelSettings } from '../hooks/useLabelSettings';
import { useLabelBins, useLabelSkus } from '../hooks/useLabelData';
import { skuFallsBackToCode } from '../lib/encoding';
import { labelPdfFilename } from '../lib/filename';
import { buildBinLabelItems, buildSkuLabelItems } from '../lib/items';
import { estimateRun } from '../lib/layout';
import { LabelPreview } from './LabelPreview';
import type {
  LabelBin,
  LabelKind,
  LabelSize,
  LabelSku,
  PrintFormat,
  PrintRunOptions,
  SymbolType,
} from '../types';

export interface LabelPrintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: LabelKind;
  /** Bins the calling page already holds. Used for scoping and as the fallback list. */
  bins?: LabelBin[];
  /** SKUs the calling page already holds. */
  skus?: LabelSku[];
  /** Ids the operator had ticked on the calling page, if any. */
  initialSelectedIds?: string[];
  /** Goes into the filename, e.g. the warehouse or category being printed. */
  scopeHint?: string;
}

const ANY = '__any__';

// Shared frozen empties: a fresh `[]` for the inactive kind would change
// identity every render and re-derive the whole label list with it.
const NO_BINS: LabelBin[] = [];
const NO_SKUS: LabelSku[] = [];

function uniqueOptions<T>(
  rows: T[],
  id: (row: T) => string | null | undefined,
  label: (row: T) => string | null | undefined,
): Array<{ id: string; label: string }> {
  const seen = new Map<string, string>();
  rows.forEach((row) => {
    const key = id(row);
    if (!key || seen.has(key)) return;
    seen.set(key, label(row) || key);
  });
  return [...seen.entries()]
    .map(([value, text]) => ({ id: value, label: text }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * The print dialog for bin and SKU labels.
 *
 * Two things this deliberately does:
 *
 *  - it seeds every control from the tenant's saved Barcode & Labels settings
 *    but writes none of them back. A picker doing a one-off thermal run for a
 *    single aisle must not flip the whole tenant onto thermal stock.
 *  - it shows a to-scale preview of a real label from the actual selection
 *    before the Download/Print buttons do anything. Two hundred wrong labels
 *    costs a roll of stock and an afternoon of relabelling.
 */
export function LabelPrintDialog({
  open,
  onOpenChange,
  kind,
  bins = [],
  skus = [],
  initialSelectedIds = [],
  scopeHint,
}: LabelPrintDialogProps) {
  const { data: settings } = useLabelSettings();

  const hasPreselection = initialSelectedIds.length > 0;
  const [useSelection, setUseSelection] = useState(hasPreselection);

  // Bin scope
  const [warehouseId, setWarehouseId] = useState<string>(ANY);
  const [zoneId, setZoneId] = useState<string>(ANY);
  const [rackId, setRackId] = useState<string>(ANY);

  // SKU scope
  const [category, setCategory] = useState<string>(ANY);
  const [search, setSearch] = useState('');

  // Per-run overrides of the tenant defaults.
  const [options, setOptions] = useState<PrintRunOptions | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  // Re-seed from the tenant settings each time the dialog opens, so last run's
  // overrides never silently carry into the next one.
  useEffect(() => {
    if (!open || !settings) return;
    setOptions({
      // `locationCodeType` governs bin labels. A SKU label defaults to a linear
      // barcode: that is the symbology retail/manufacturer barcodes come in,
      // and the setting says nothing about SKUs.
      symbolType: kind === 'bin' ? settings.locationCodeType : 'barcode',
      labelSize: settings.labelSize,
      printFormat: settings.printFormat,
      includeHumanReadable: settings.includeHumanReadable,
    });
    setUseSelection(initialSelectedIds.length > 0);
    setProgress(0);
    // Depend on the length, not the array: `initialSelectedIds` is a fresh
    // identity on every parent render and would loop.
  }, [open, settings, kind, initialSelectedIds.length]);

  const binQuery = useMemo(
    () =>
      useSelection && hasPreselection
        ? { binIds: initialSelectedIds }
        : {
            warehouseId: warehouseId === ANY ? undefined : warehouseId,
            zoneId: zoneId === ANY ? undefined : zoneId,
            rackId: rackId === ANY ? undefined : rackId,
          },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [useSelection, hasPreselection, initialSelectedIds.join(','), warehouseId, zoneId, rackId],
  );

  const skuQuery = useMemo(
    () =>
      useSelection && hasPreselection
        ? { skuIds: initialSelectedIds }
        : { category: category === ANY ? undefined : category, search: search.trim() || undefined },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [useSelection, hasPreselection, initialSelectedIds.join(','), category, search],
  );

  const binResult = useLabelBins(binQuery, bins, open && kind === 'bin');
  const skuResult = useLabelSkus(skuQuery, skus, open && kind === 'sku');

  const binItems = binResult.data.items;
  const skuItems = skuResult.data.items;
  const selectedBins = useMemo(() => (kind === 'bin' ? binItems : NO_BINS), [kind, binItems]);
  const selectedSkus = useMemo(() => (kind === 'sku' ? skuItems : NO_SKUS), [kind, skuItems]);

  const items = useMemo(
    () => (kind === 'bin' ? buildBinLabelItems(selectedBins) : buildSkuLabelItems(selectedSkus)),
    [kind, selectedBins, selectedSkus],
  );

  const warehouseOptions = useMemo(
    () => uniqueOptions(bins, (b) => b.warehouseId, (b) => b.warehouseName),
    [bins],
  );
  const zoneOptions = useMemo(
    () =>
      uniqueOptions(
        bins.filter((b) => warehouseId === ANY || b.warehouseId === warehouseId),
        (b) => b.zoneId,
        (b) => b.zoneName,
      ),
    [bins, warehouseId],
  );
  const rackOptions = useMemo(
    () =>
      uniqueOptions(
        bins.filter((b) => zoneId === ANY || b.zoneId === zoneId),
        (b) => b.rackId,
        (b) => b.rackCode,
      ),
    [bins, zoneId],
  );
  const categoryOptions = useMemo(
    () => uniqueOptions(skus, (s) => s.category, (s) => s.category),
    [skus],
  );

  const estimate = options ? estimateRun(items.length, options) : null;
  const missingBarcodes = kind === 'sku' ? selectedSkus.filter(skuFallsBackToCode).length : 0;

  const scopeLabel = useMemo(() => {
    if (kind === 'bin') {
      if (rackId !== ANY) return rackOptions.find((r) => r.id === rackId)?.label;
      if (zoneId !== ANY) return zoneOptions.find((z) => z.id === zoneId)?.label;
      if (warehouseId !== ANY) return warehouseOptions.find((w) => w.id === warehouseId)?.label;
    } else if (category !== ANY) {
      return category;
    }
    return scopeHint;
  }, [
    kind,
    rackId,
    zoneId,
    warehouseId,
    category,
    rackOptions,
    zoneOptions,
    warehouseOptions,
    scopeHint,
  ]);

  const patch = (next: Partial<PrintRunOptions>) =>
    setOptions((prev) => (prev ? { ...prev, ...next } : prev));

  async function generate(action: 'download' | 'print') {
    if (!options || items.length === 0) return;

    setBusy(true);
    setProgress(0);
    try {
      // Dynamic: keeps jspdf out of the dialog's own chunk, so opening the
      // dialog does not pay for the PDF engine until a button is pressed.
      const { generateLabelPdf } = await import('../lib/labelPdf');
      const doc = await generateLabelPdf({
        kind,
        items,
        options,
        onProgress: (done, total) => setProgress(Math.round((done / total) * 100)),
      });

      const filename = labelPdfFilename(kind, scopeLabel);

      if (action === 'download') {
        doc.save(filename);
        toast.success(`${items.length} labels ready`, { description: filename });
      } else {
        const url = doc.output('bloburl') as unknown as string;
        const win = window.open(url, '_blank');
        if (!win) {
          toast.error('Your browser blocked the print window', {
            description: 'Allow pop-ups for this site, or use Download PDF instead.',
          });
        }
      }
    } catch (error) {
      toast.error('Could not generate labels', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setBusy(false);
    }
  }

  const previewItem = items[0] ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Print {kind === 'bin' ? 'location' : 'SKU'} labels</DialogTitle>
          <DialogDescription>
            Defaults come from Settings → Masters → Barcode &amp; Labels. Changes here apply to this
            print run only and are not saved.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-[1fr_280px]">
          {/* ── Scope ─────────────────────────────────────────────────── */}
          <div className="space-y-4">
            {hasPreselection && (
              <div className="flex items-center justify-between rounded-md border bg-muted/30 p-3">
                <div>
                  <Label htmlFor="use-selection" className="text-sm font-medium">
                    Selected only
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {initialSelectedIds.length} {kind === 'bin' ? 'bins' : 'SKUs'} ticked on the page
                    behind
                  </p>
                </div>
                <Switch id="use-selection" checked={useSelection} onCheckedChange={setUseSelection} />
              </div>
            )}

            {kind === 'bin' && !(useSelection && hasPreselection) && (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Warehouse</Label>
                  <Select
                    value={warehouseId}
                    onValueChange={(v) => {
                      setWarehouseId(v);
                      setZoneId(ANY);
                      setRackId(ANY);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ANY}>All warehouses</SelectItem>
                      {warehouseOptions.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Zone</Label>
                  <Select
                    value={zoneId}
                    onValueChange={(v) => {
                      setZoneId(v);
                      setRackId(ANY);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ANY}>All zones</SelectItem>
                      {zoneOptions.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Rack</Label>
                  <Select value={rackId} onValueChange={setRackId}>
                    <SelectTrigger>
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ANY}>All racks</SelectItem>
                      {rackOptions.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {kind === 'sku' && !(useSelection && hasPreselection) && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Category</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ANY}>All categories</SelectItem>
                      {categoryOptions.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Search</Label>
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Code, name or barcode"
                  />
                </div>
              </div>
            )}

            {/* ── Run summary ─────────────────────────────────────────── */}
            <div className="rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium" data-testid="label-run-summary">
                  {estimate
                    ? `${estimate.labels} label${estimate.labels === 1 ? '' : 's'}, ${estimate.pages} page${estimate.pages === 1 ? '' : 's'}`
                    : 'Loading settings…'}
                </span>
                {estimate && options?.printFormat === 'a4' && (
                  <Badge variant="secondary">
                    {estimate.columns} × {estimate.rows} per A4 sheet
                  </Badge>
                )}
                {estimate && options?.printFormat === 'thermal' && (
                  <Badge variant="secondary">one per page (roll)</Badge>
                )}
              </div>

              {missingBarcodes > 0 && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-warning">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {missingBarcodes} of {selectedSkus.length} SKUs have no barcode — their labels will
                  encode the SKU code instead.
                </p>
              )}
            </div>

            <ScrollArea className="h-40 rounded-md border">
              <ul className="divide-y text-sm">
                {items.slice(0, 200).map((item, index) => (
                  <li key={`${item.value}-${index}`} className="flex items-baseline gap-2 px-3 py-1.5">
                    <span className="font-mono">{item.caption}</span>
                    {item.context && (
                      <span className="truncate text-xs text-muted-foreground">{item.context}</span>
                    )}
                  </li>
                ))}
                {items.length === 0 && (
                  <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                    Nothing matches this scope
                  </li>
                )}
                {items.length > 200 && (
                  <li className="px-3 py-1.5 text-xs text-muted-foreground">
                    …and {items.length - 200} more
                  </li>
                )}
              </ul>
            </ScrollArea>
          </div>

          {/* ── Preview + per-run overrides ───────────────────────────── */}
          <div className="space-y-4">
            {options && <LabelPreview item={previewItem} kind={kind} options={options} />}

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Symbol</Label>
                <Select
                  value={options?.symbolType ?? 'qr'}
                  onValueChange={(v) => patch({ symbolType: v as SymbolType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="qr">QR code</SelectItem>
                    <SelectItem value="barcode">Barcode</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Label size</Label>
                <Select
                  value={options?.labelSize ?? 'medium'}
                  onValueChange={(v) => patch({ labelSize: v as LabelSize })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(['small', 'medium', 'large'] as LabelSize[]).map((size) => (
                      <SelectItem key={size} value={size}>
                        {size[0].toUpperCase() + size.slice(1)} — {LABEL_DIMENSIONS_MM[size].width} ×{' '}
                        {LABEL_DIMENSIONS_MM[size].height} mm
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Output</Label>
                <Select
                  value={options?.printFormat ?? 'a4'}
                  onValueChange={(v) => patch({ printFormat: v as PrintFormat })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="a4">A4 sheet</SelectItem>
                    <SelectItem value="thermal">Thermal roll</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between rounded-md border p-3">
                <Label htmlFor="human-readable" className="text-xs">
                  Human-readable code
                </Label>
                <Switch
                  id="human-readable"
                  checked={options?.includeHumanReadable ?? true}
                  onCheckedChange={(checked) => patch({ includeHumanReadable: checked })}
                />
              </div>
            </div>
          </div>
        </div>

        {busy && <Progress value={progress} className="h-1.5" />}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => generate('print')}
            disabled={busy || items.length === 0}
            className="gap-2"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            Print
          </Button>
          <Button
            onClick={() => generate('download')}
            disabled={busy || items.length === 0}
            className="gap-2"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default LabelPrintDialog;
