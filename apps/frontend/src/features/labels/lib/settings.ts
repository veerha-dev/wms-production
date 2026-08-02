import { DEFAULT_LABEL_SETTINGS } from '../constants';
import type { LabelSettings } from '../types';

const VALID: { [K in keyof LabelSettings]: readonly unknown[] | 'boolean' } = {
  locationCodeType: ['qr', 'barcode'] as const,
  labelSize: ['small', 'medium', 'large'] as const,
  printFormat: ['a4', 'thermal'] as const,
  includeHumanReadable: 'boolean',
  skuBarcodeSource: ['manufacturer', 'auto', 'both'] as const,
};

/**
 * Merge a settings payload over the defaults, discarding anything that is not
 * one of the literals the `barcode_settings` CHECK constraints allow.
 *
 * Worth the strictness: an unrecognised `labelSize` would index
 * `LABEL_DIMENSIONS_MM` to `undefined` and every label in the run would come
 * out at NaN millimetres. A wrong-but-valid default is recoverable; corrupt
 * page geometry is not.
 */
export function normaliseLabelSettings(payload: unknown): LabelSettings {
  const source = (payload ?? {}) as Record<string, unknown>;
  const result = { ...DEFAULT_LABEL_SETTINGS };

  (Object.keys(VALID) as Array<keyof LabelSettings>).forEach((key) => {
    const rule = VALID[key];
    const value = source[key];
    if (rule === 'boolean') {
      if (typeof value === 'boolean') (result as Record<string, unknown>)[key] = value;
      return;
    }
    if (rule.includes(value)) (result as Record<string, unknown>)[key] = value;
  });

  return result;
}
