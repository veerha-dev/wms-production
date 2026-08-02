/**
 * THE ENCODING CONTRACT.
 *
 * Everything in this file exists to keep printed labels scannable. The scan
 * endpoints compare what the handheld read against a column in the database; if
 * the label encodes anything else, the scan fails and someone has to relabel a
 * whole aisle. So:
 *
 *   - a LOCATION (bin) label encodes the plain bin `code`, e.g. `A-01-02`.
 *     The scan endpoint compares case-insensitively against `bins.code`, so no
 *     prefix, no URL, no JSON payload — the bare code and nothing else.
 *   - a SKU label encodes the SKU's `barcode` when it has one, and falls back
 *     to the SKU `code` when it does not.
 *
 * These two functions are the single place either rule is expressed. Pure, no
 * imports, and covered by encoding.test.ts.
 */
import type { BarcodeFormat, LabelBin, LabelKind, LabelSku } from '../types';

/** What a bin label encodes: the bare bin code. */
export function binLabelValue(bin: Pick<LabelBin, 'code'>): string {
  return bin.code;
}

/**
 * What a SKU label encodes: the barcode if present, otherwise the SKU code.
 *
 * Whitespace-only and empty barcodes count as absent — the `barcode` column is
 * nullable and a blank string round-trips through CSV import as `''`, which
 * would otherwise produce a label encoding nothing at all.
 */
export function skuLabelValue(sku: Pick<LabelSku, 'code' | 'barcode'>): string {
  const barcode = sku.barcode?.trim();
  return barcode ? barcode : sku.code;
}

/** True when the SKU will be labelled with its own code because it has no barcode. */
export function skuFallsBackToCode(sku: Pick<LabelSku, 'code' | 'barcode'>): boolean {
  return !sku.barcode?.trim();
}

/**
 * EAN-13 check digit: weight the first 12 digits 1,3,1,3… sum them, and the
 * check digit is whatever takes the total to the next multiple of ten.
 */
export function ean13CheckDigit(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    const digit = first12.charCodeAt(i) - 48;
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  return (10 - (sum % 10)) % 10;
}

/** True for a 13-digit string whose final digit is a correct EAN-13 check digit. */
export function isValidEan13(value: string): boolean {
  if (!/^\d{13}$/.test(value)) return false;
  return ean13CheckDigit(value.slice(0, 12)) === value.charCodeAt(12) - 48;
}

/**
 * Pick the linear symbology for a value.
 *
 * EAN-13 only when the value really is a valid EAN-13 — thirteen digits *and* a
 * correct check digit. JsBarcode does not quietly degrade on a bad input: it
 * throws `InvalidInputException`, which would take down a 500-label run over
 * one mistyped digit. Checking here means the odd malformed barcode prints as
 * Code 128 (still scannable, still unique) instead of failing the batch.
 *
 * Everything else is Code 128, which is the only one of the two that can encode
 * the letters and hyphens in a bin code like `A-01-02` at all.
 */
export function selectBarcodeFormat(value: string): BarcodeFormat {
  return isValidEan13(value) ? 'EAN13' : 'CODE128';
}

/**
 * Symbology for a label of a given kind.
 *
 * Bin codes are always Code 128 — they are alphanumeric by construction, and a
 * bin code that happened to be 13 digits would otherwise print as a retail
 * barcode complete with the EAN quiet-zone digits hanging outside the symbol.
 */
export function selectBarcodeFormatFor(kind: LabelKind, value: string): BarcodeFormat {
  return kind === 'bin' ? 'CODE128' : selectBarcodeFormat(value);
}
