/**
 * The encoding contract is the one thing in this feature that cannot be fixed
 * after the fact: a wrong value baked into 500 printed labels means peeling and
 * reprinting every one of them. These tests pin both halves of it — what a
 * label encodes, and which symbology draws it.
 */
import { describe, expect, it } from 'vitest';

import {
  binLabelValue,
  ean13CheckDigit,
  isValidEan13,
  selectBarcodeFormat,
  selectBarcodeFormatFor,
  skuFallsBackToCode,
  skuLabelValue,
} from './encoding';
import { buildBinLabelItem, buildSkuLabelItem } from './items';

describe('bin label encoding', () => {
  it('encodes the plain bin code, unchanged', () => {
    expect(binLabelValue({ code: 'A-01-02' })).toBe('A-01-02');
  });

  it('does not normalise case — the scan endpoint compares case-insensitively', () => {
    expect(binLabelValue({ code: 'a-01-02' })).toBe('a-01-02');
  });

  it('adds no prefix, URL or padding of any kind', () => {
    const code = 'ZONE-B/RACK-3.L2P4';
    expect(binLabelValue({ code })).toBe(code);
  });
});

describe('SKU label encoding', () => {
  it('encodes the barcode when the SKU has one', () => {
    expect(skuLabelValue({ code: 'SKU-001', barcode: '8901030865275' })).toBe('8901030865275');
  });

  it('falls back to the SKU code when the barcode is null', () => {
    expect(skuLabelValue({ code: 'SKU-001', barcode: null })).toBe('SKU-001');
  });

  it('falls back to the SKU code when the barcode is undefined', () => {
    expect(skuLabelValue({ code: 'SKU-001' })).toBe('SKU-001');
  });

  it('treats an empty or whitespace-only barcode as absent', () => {
    expect(skuLabelValue({ code: 'SKU-001', barcode: '' })).toBe('SKU-001');
    expect(skuLabelValue({ code: 'SKU-001', barcode: '   ' })).toBe('SKU-001');
  });

  it('flags exactly the SKUs that fall back, so the UI can warn about them', () => {
    expect(skuFallsBackToCode({ code: 'S1', barcode: null })).toBe(true);
    expect(skuFallsBackToCode({ code: 'S1', barcode: '  ' })).toBe(true);
    expect(skuFallsBackToCode({ code: 'S1', barcode: '8901030865275' })).toBe(false);
  });
});

describe('EAN-13 validation', () => {
  it('computes the check digit from the first twelve digits', () => {
    expect(ean13CheckDigit('890103086527')).toBe(5);
    expect(ean13CheckDigit('400638133393')).toBe(1);
  });

  it('accepts a well-formed EAN-13', () => {
    expect(isValidEan13('8901030865275')).toBe(true);
  });

  it('rejects a 13-digit number with a wrong check digit', () => {
    expect(isValidEan13('8901030865278')).toBe(false);
  });

  it('rejects anything that is not exactly thirteen digits', () => {
    expect(isValidEan13('890103086527')).toBe(false);
    expect(isValidEan13('89010308652750')).toBe(false);
    expect(isValidEan13('A901030865278')).toBe(false);
    expect(isValidEan13('')).toBe(false);
  });
});

describe('symbology selection', () => {
  it('uses EAN13 for a valid 13-digit numeric barcode', () => {
    expect(selectBarcodeFormat('8901030865275')).toBe('EAN13');
  });

  it('falls back to CODE128 for non-numeric values, which EAN13 cannot encode', () => {
    expect(selectBarcodeFormat('SKU-001')).toBe('CODE128');
    expect(selectBarcodeFormat('A-01-02')).toBe('CODE128');
  });

  it('falls back to CODE128 for the wrong number of digits', () => {
    expect(selectBarcodeFormat('12345678')).toBe('CODE128');
    expect(selectBarcodeFormat('12345678901234')).toBe('CODE128');
  });

  it('falls back to CODE128 rather than letting JsBarcode throw on a bad check digit', () => {
    expect(isValidEan13('8901030865278')).toBe(false);
    expect(selectBarcodeFormat('8901030865278')).toBe('CODE128');
  });

  it('always uses CODE128 for bin codes, even a 13-digit one', () => {
    expect(selectBarcodeFormatFor('bin', 'A-01-02')).toBe('CODE128');
    expect(selectBarcodeFormatFor('bin', '8901030865275')).toBe('CODE128');
  });

  it('lets SKU labels use EAN13 when the value warrants it', () => {
    expect(selectBarcodeFormatFor('sku', '8901030865275')).toBe('EAN13');
    expect(selectBarcodeFormatFor('sku', 'SKU-001')).toBe('CODE128');
  });
});

describe('label item construction', () => {
  it('carries the bin code into both the encoded value and the caption', () => {
    const item = buildBinLabelItem({ id: 'b1', code: 'A-01-02', zoneName: 'Zone A', rackCode: 'R3' });
    expect(item.value).toBe('A-01-02');
    expect(item.caption).toBe('A-01-02');
    expect(item.context).toBe('Zone A • R3');
  });

  it('omits the context line when a bin has no zone or rack context', () => {
    expect(buildBinLabelItem({ id: 'b1', code: 'A-01-02' }).context).toBeUndefined();
  });

  it('captions a barcoded SKU with the barcode and keeps the code in the context', () => {
    const item = buildSkuLabelItem({
      id: 's1',
      code: 'SKU-001',
      name: 'Basmati Rice 5kg',
      barcode: '8901030865275',
      uom: 'bags',
    });
    expect(item.value).toBe('8901030865275');
    expect(item.caption).toBe('8901030865275');
    expect(item.context).toBe('SKU-001 • Basmati Rice 5kg (bags)');
  });

  it('captions a barcode-less SKU with its own code', () => {
    const item = buildSkuLabelItem({ id: 's1', code: 'SKU-002', name: 'Loose Item', barcode: null });
    expect(item.value).toBe('SKU-002');
    expect(item.caption).toBe('SKU-002');
  });
});
