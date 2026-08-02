/**
 * Types for the label generator.
 *
 * The five fields on {@link LabelSettings} are exactly the tenant preferences
 * stored under `barcode_settings` and edited in Settings → Masters → Barcode &
 * Labels. Until this feature existed nothing read them; every one of them now
 * changes what comes out of the printer (see `lib/labelPdf.ts`).
 */

/** How a location (bin) label encodes its code. */
export type LocationCodeType = 'qr' | 'barcode';

/** Physical label stock. Millimetre dimensions live in `constants.ts`. */
export type LabelSize = 'small' | 'medium' | 'large';

/** A4 sheet of labels vs one-label-per-page thermal roll. */
export type PrintFormat = 'a4' | 'thermal';

/**
 * Where a SKU's barcode comes from. Informational on the frontend — the
 * backend is what assigns barcodes — but it is surfaced in the dialog so the
 * operator understands why some SKUs have no barcode to print.
 */
export type SkuBarcodeSource = 'manufacturer' | 'auto' | 'both';

/** The tenant defaults, as served by `GET /api/v1/labels/settings`. */
export interface LabelSettings {
  locationCodeType: LocationCodeType;
  labelSize: LabelSize;
  printFormat: PrintFormat;
  includeHumanReadable: boolean;
  skuBarcodeSource: SkuBarcodeSource;
}

/** What the two kinds of label sheet are for. */
export type LabelKind = 'bin' | 'sku';

/** A bin as returned by `GET /api/v1/labels/bins`. */
export interface LabelBin {
  id: string;
  /** The value the label encodes, verbatim. */
  code: string;
  zoneName?: string | null;
  rackCode?: string | null;
  aisleCode?: string | null;
  warehouseName?: string | null;
  level?: number | string | null;
  position?: number | string | null;
  /**
   * Foreign keys beyond the documented response shape. They are what lets the
   * dialog scope a selection warehouse → zone → rack from a list it already
   * holds, without a round trip per filter change.
   */
  warehouseId?: string | null;
  zoneId?: string | null;
  rackId?: string | null;
}

/** A SKU as returned by `GET /api/v1/labels/skus`. */
export interface LabelSku {
  id: string;
  code: string;
  name: string;
  /** May be null — such SKUs fall back to encoding `code`. */
  barcode?: string | null;
  uom?: string | null;
  category?: string | null;
}

/** The linear symbologies we emit. */
export type BarcodeFormat = 'CODE128' | 'EAN13';

/** Which symbol a given label draws. */
export type SymbolType = 'qr' | 'barcode';

/**
 * The settings actually used for one print run. The dialog seeds this from the
 * tenant defaults and lets the operator override it *without saving*, because a
 * one-off thermal run must not repoint the whole tenant at thermal stock.
 */
export interface PrintRunOptions {
  symbolType: SymbolType;
  labelSize: LabelSize;
  printFormat: PrintFormat;
  includeHumanReadable: boolean;
}

/** One label's worth of content, already resolved down to strings. */
export interface LabelItem {
  /** The string the symbol encodes. Must match what the scanner endpoint expects. */
  value: string;
  /** Human-readable line printed under the symbol. Usually equals `value`. */
  caption: string;
  /** Small context line (zone/rack for a bin, name/uom for a SKU). */
  context?: string;
}
