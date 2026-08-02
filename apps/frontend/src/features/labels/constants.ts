import type { LabelSettings, LabelSize } from './types';

/**
 * Tenant defaults, mirroring `BARCODE_DEFAULTS` in
 * features/settings/hooks/useMasters.ts and the CHECK constraints on the
 * `barcode_settings` table (migration 080).
 *
 * Deliberately a local copy rather than an import: the labels slice must keep
 * rendering something sane when the settings endpoint is unreachable, and it
 * has no other reason to depend on the settings feature.
 */
export const DEFAULT_LABEL_SETTINGS: LabelSettings = {
  locationCodeType: 'qr',
  labelSize: 'medium',
  printFormat: 'a4',
  includeHumanReadable: true,
  skuBarcodeSource: 'both',
};

/** A4, in millimetres. jsPDF is driven in `mm` throughout this feature. */
export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;

/**
 * Outer margin on an A4 sheet.
 *
 * 5 mm is not arbitrary: it is the largest margin at which all three label
 * sizes below still tile to the same grid as the Avery stock they are copied
 * from (65-up, 21-up and 8-up respectively). At 8 mm the large label drops from
 * two columns to one and a sheet of Avery L7165 would be printed over its own
 * gutter.
 */
export const A4_MARGIN_MM = 5;

/**
 * Physical label sizes.
 *
 * These match off-the-shelf A4 label stock so a tenant can buy paper rather
 * than commission a die: L7651 (38.1 × 21.2, 65/sheet), L7160 (63.5 × 38.1,
 * 21/sheet) and L7165 (99.1 × 67.7, 8/sheet). The same three sizes are used for
 * thermal output, where the page *is* the label, so a 100 mm roll takes the
 * `large` setting and a 38 mm roll the `small` one.
 */
export const LABEL_DIMENSIONS_MM: Record<LabelSize, { width: number; height: number }> = {
  small: { width: 38.1, height: 21.2 },
  medium: { width: 63.5, height: 38.1 },
  large: { width: 99.1, height: 67.7 },
};

/**
 * Resolution the symbol bitmaps are rasterised at before being placed in the
 * PDF. Below ~200 DPI a Code 128 module lands between printer dots and the
 * narrow bars blur into each other; 300 is the floor for a barcode a handheld
 * scanner will read first time.
 */
export const PRINT_DPI = 300;

/** 1 inch = 25.4 mm. */
export const MM_PER_INCH = 25.4;

/** 1 pt = 1/72 inch. */
export const PT_PER_INCH = 72;

/**
 * Typography per label size, in points.
 *
 * A warehouse label is read at arm's length in bad light, so the code line is
 * sized as large as the stock allows rather than as small as it will fit. The
 * `small` stock has 21.2 mm of height in total, which leaves no room for a
 * context line once a scannable symbol and a legible code are on it — so it
 * gets none (`contextPt: 0`) instead of an illegible one.
 */
export const LABEL_TYPOGRAPHY: Record<LabelSize, { codePt: number; contextPt: number; paddingMm: number }> = {
  small: { codePt: 9, contextPt: 0, paddingMm: 1.2 },
  medium: { codePt: 12, contextPt: 8, paddingMm: 2 },
  large: { codePt: 18, contextPt: 11, paddingMm: 3 },
};
