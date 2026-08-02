/**
 * Turning warehouse records into label content.
 *
 * The `value` field produced here is the only thing a scanner ever sees, so
 * these builders defer to encoding.ts for it and never assemble it inline.
 * Everything else on a label — the caption, the context line — is for the human
 * holding the handheld when the symbol will not read.
 */
import { binLabelValue, skuLabelValue } from './encoding';
import type { LabelBin, LabelItem, LabelSku } from '../types';

/**
 * Context line for a bin: where in the building it is.
 *
 * Zone and rack are what someone walking the aisle actually needs; the bin code
 * itself is already the caption, so repeating its components would waste the
 * one line the stock has room for.
 */
export function binContext(bin: LabelBin): string {
  const parts = [bin.zoneName, bin.aisleCode, bin.rackCode].filter(
    (part): part is string => Boolean(part && String(part).trim()),
  );
  return parts.join(' • ');
}

export function buildBinLabelItem(bin: LabelBin): LabelItem {
  const value = binLabelValue(bin);
  return { value, caption: value, context: binContext(bin) || undefined };
}

export function buildBinLabelItems(bins: LabelBin[]): LabelItem[] {
  return bins.map(buildBinLabelItem);
}

/**
 * Context line for a SKU: its code, product name and unit of measure.
 *
 * The SKU code is here rather than on the caption line because the caption is
 * reserved for a readable rendition of whatever the symbol encodes — and for a
 * SKU with a manufacturer barcode that is thirteen digits, not the code. Both
 * end up on the label; only their prominence differs.
 *
 * Truncation is left to the PDF layer, which is the only place that knows the
 * font metrics and how wide the stock is.
 */
export function skuContext(sku: LabelSku): string {
  const uom = sku.uom?.trim();
  const name = uom ? `${sku.name} (${uom})` : sku.name;
  return `${sku.code} • ${name}`;
}

export function buildSkuLabelItem(sku: LabelSku): LabelItem {
  const value = skuLabelValue(sku);
  return { value, caption: value, context: skuContext(sku) };
}

export function buildSkuLabelItems(skus: LabelSku[]): LabelItem[] {
  return skus.map(buildSkuLabelItem);
}
