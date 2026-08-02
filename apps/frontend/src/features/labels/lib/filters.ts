/**
 * Client-side equivalents of the query parameters on
 * `GET /api/v1/labels/bins` and `GET /api/v1/labels/skus`.
 *
 * They exist so scoping a print run stays instant (no round trip per dropdown
 * change) and so the dialog still works when the labels endpoints are not
 * deployed — see hooks/useLabelData.ts. Pure, so the filter semantics can be
 * pinned in tests rather than eyeballed through the UI.
 */
import type { LabelBin, LabelSku } from '../types';

export interface LabelBinQuery {
  warehouseId?: string;
  zoneId?: string;
  rackId?: string;
  binIds?: string[];
}

export interface LabelSkuQuery {
  skuIds?: string[];
  category?: string;
  search?: string;
}

export function filterBins(bins: LabelBin[], query: LabelBinQuery): LabelBin[] {
  // An explicit id list is a selection, not a filter: it wins outright, and the
  // scope dropdowns are irrelevant once the operator has ticked specific bins.
  if (query.binIds && query.binIds.length > 0) {
    const wanted = new Set(query.binIds);
    return bins.filter((bin) => wanted.has(bin.id));
  }

  return bins.filter((bin) => {
    if (query.warehouseId && bin.warehouseId !== query.warehouseId) return false;
    if (query.zoneId && bin.zoneId !== query.zoneId) return false;
    if (query.rackId && bin.rackId !== query.rackId) return false;
    return true;
  });
}

export function filterSkus(skus: LabelSku[], query: LabelSkuQuery): LabelSku[] {
  if (query.skuIds && query.skuIds.length > 0) {
    const wanted = new Set(query.skuIds);
    return skus.filter((sku) => wanted.has(sku.id));
  }

  const search = query.search?.trim().toLowerCase();
  return skus.filter((sku) => {
    if (query.category && query.category !== 'All' && sku.category !== query.category) return false;
    if (!search) return true;
    return (
      sku.code.toLowerCase().includes(search) ||
      sku.name.toLowerCase().includes(search) ||
      (sku.barcode ?? '').toLowerCase().includes(search)
    );
  });
}
