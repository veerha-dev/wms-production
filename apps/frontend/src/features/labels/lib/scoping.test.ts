/**
 * Scoping, filenames and settings normalisation.
 *
 * The filters here are the client-side twin of the `GET /api/v1/labels/bins`
 * and `/skus` query parameters — they are what the dialog scopes over while
 * those endpoints are undeployed, so their semantics need pinning rather than
 * assuming.
 */
import { describe, expect, it } from 'vitest';

import { filterBins, filterSkus } from './filters';
import { labelPdfFilename, slugifyScope } from './filename';
import { normaliseLabelSettings } from './settings';
import { DEFAULT_LABEL_SETTINGS } from '../constants';
import type { LabelBin, LabelSku } from '../types';

const BINS: LabelBin[] = [
  { id: 'b1', code: 'A-01-01', warehouseId: 'w1', zoneId: 'z1', rackId: 'r1', zoneName: 'Zone A' },
  { id: 'b2', code: 'A-01-02', warehouseId: 'w1', zoneId: 'z1', rackId: 'r2', zoneName: 'Zone A' },
  { id: 'b3', code: 'B-01-01', warehouseId: 'w1', zoneId: 'z2', rackId: 'r3', zoneName: 'Zone B' },
  { id: 'b4', code: 'C-01-01', warehouseId: 'w2', zoneId: 'z3', rackId: 'r4', zoneName: 'Zone C' },
];

const SKUS: LabelSku[] = [
  { id: 's1', code: 'SKU-001', name: 'Basmati Rice', barcode: '8901030865275', category: 'Food' },
  { id: 's2', code: 'SKU-002', name: 'LED Bulb', barcode: null, category: 'Electronics' },
  { id: 's3', code: 'SKU-003', name: 'Steel Pan', barcode: '', category: 'Kitchenware' },
];

describe('bin scoping', () => {
  it('narrows warehouse → zone → rack', () => {
    expect(filterBins(BINS, { warehouseId: 'w1' }).map((b) => b.id)).toEqual(['b1', 'b2', 'b3']);
    expect(filterBins(BINS, { warehouseId: 'w1', zoneId: 'z1' }).map((b) => b.id)).toEqual([
      'b1',
      'b2',
    ]);
    expect(filterBins(BINS, { warehouseId: 'w1', zoneId: 'z1', rackId: 'r2' }).map((b) => b.id)).toEqual(
      ['b2'],
    );
  });

  it('returns everything when nothing is scoped', () => {
    expect(filterBins(BINS, {})).toHaveLength(4);
  });

  it('lets an explicit selection beat the scope dropdowns', () => {
    // Ticking b4 while the zone dropdown still says "Zone A" must print b4,
    // not nothing.
    expect(filterBins(BINS, { zoneId: 'z1', binIds: ['b4'] }).map((b) => b.id)).toEqual(['b4']);
  });
});

describe('SKU scoping', () => {
  it('filters by category', () => {
    expect(filterSkus(SKUS, { category: 'Food' }).map((s) => s.id)).toEqual(['s1']);
  });

  it('treats the All sentinel as no category filter', () => {
    expect(filterSkus(SKUS, { category: 'All' })).toHaveLength(3);
  });

  it('searches code, name and barcode, case-insensitively', () => {
    expect(filterSkus(SKUS, { search: 'sku-002' }).map((s) => s.id)).toEqual(['s2']);
    expect(filterSkus(SKUS, { search: 'bulb' }).map((s) => s.id)).toEqual(['s2']);
    expect(filterSkus(SKUS, { search: '8901030865275' }).map((s) => s.id)).toEqual(['s1']);
  });

  it('lets an explicit selection beat the filters', () => {
    expect(filterSkus(SKUS, { category: 'Food', skuIds: ['s2', 's3'] }).map((s) => s.id)).toEqual([
      's2',
      's3',
    ]);
  });
});

describe('filenames', () => {
  it('slugifies a scope into something filesystem-safe', () => {
    expect(slugifyScope('Zone A')).toBe('zone-a');
    expect(slugifyScope('Zone A / Rack 3')).toBe('zone-a-rack-3');
    expect(slugifyScope('  Food & Grocery  ')).toBe('food-grocery');
  });

  it('names a bin run after its scope and date', () => {
    expect(labelPdfFilename('bin', 'Zone A', new Date('2026-08-02T09:00:00Z'))).toBe(
      'bin-labels-zone-a-2026-08-02.pdf',
    );
  });

  it('omits the scope segment when there is no scope', () => {
    expect(labelPdfFilename('sku', undefined, new Date('2026-08-02T09:00:00Z'))).toBe(
      'sku-labels-2026-08-02.pdf',
    );
  });
});

describe('settings normalisation', () => {
  it('takes every valid field from the payload', () => {
    expect(
      normaliseLabelSettings({
        locationCodeType: 'barcode',
        labelSize: 'large',
        printFormat: 'thermal',
        includeHumanReadable: false,
        skuBarcodeSource: 'manufacturer',
      }),
    ).toEqual({
      locationCodeType: 'barcode',
      labelSize: 'large',
      printFormat: 'thermal',
      includeHumanReadable: false,
      skuBarcodeSource: 'manufacturer',
    });
  });

  it('discards values outside the allowed literals rather than propagating them', () => {
    // A bogus labelSize would index the dimensions table to undefined and make
    // every page NaN millimetres wide.
    const settings = normaliseLabelSettings({ labelSize: 'enormous', printFormat: 'plotter' });
    expect(settings.labelSize).toBe(DEFAULT_LABEL_SETTINGS.labelSize);
    expect(settings.printFormat).toBe(DEFAULT_LABEL_SETTINGS.printFormat);
  });

  it('ignores a non-boolean includeHumanReadable', () => {
    expect(normaliseLabelSettings({ includeHumanReadable: 'yes' }).includeHumanReadable).toBe(
      DEFAULT_LABEL_SETTINGS.includeHumanReadable,
    );
  });

  it('falls back entirely on junk', () => {
    expect(normaliseLabelSettings(null)).toEqual(DEFAULT_LABEL_SETTINGS);
    expect(normaliseLabelSettings([])).toEqual(DEFAULT_LABEL_SETTINGS);
    expect(normaliseLabelSettings('nope')).toEqual(DEFAULT_LABEL_SETTINGS);
  });
});
