/**
 * Symbol rasterisation: a string in, a PNG data URL out.
 *
 * Both libraries here are browser-only (they want a `<canvas>`), and both are
 * heavy enough that the boot-graph guard in vite.config.ts fails the build if
 * they ever become statically reachable from the entry chunk. Nothing in this
 * file is imported outside the lazily-loaded label dialog.
 */
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';

import { PRINT_DPI } from '../constants';
import { mmToPx } from './layout';
import type { BarcodeFormat, SymbolType } from '../types';

export interface RenderSymbolArgs {
  value: string;
  symbolType: SymbolType;
  /** Only consulted when `symbolType` is `barcode`. */
  format?: BarcodeFormat;
  /** Printed width of the symbol on the label. */
  widthMm: number;
  /** Printed height of the symbol on the label. */
  heightMm: number;
  dpi?: number;
}

export interface RenderedSymbol {
  dataUrl: string;
  widthPx: number;
  heightPx: number;
  /** The symbology actually used — may differ from the request after a fallback. */
  format: BarcodeFormat | 'QR';
}

/**
 * Error correction level M (~15% recoverable).
 *
 * L would make the symbol slightly smaller but a scuffed or partly peeled bin
 * label stops scanning; Q and H bloat the module count enough that on 38 mm
 * stock the modules drop below what a handheld resolves at arm's length. M is
 * the level warehouse labelling settles on.
 */
const QR_ERROR_CORRECTION = 'M' as const;

async function renderQr(args: RenderSymbolArgs): Promise<RenderedSymbol> {
  const dpi = args.dpi ?? PRINT_DPI;
  // A QR is square; the printed box may not be, so the shorter side rules.
  const sizePx = mmToPx(Math.min(args.widthMm, args.heightMm), dpi);

  const dataUrl = await QRCode.toDataURL(args.value, {
    errorCorrectionLevel: QR_ERROR_CORRECTION,
    // Modules, not pixels. 1 keeps the mandatory quiet zone from eating a
    // third of a small label; the PDF leaves white space around it anyway.
    margin: 1,
    width: sizePx,
    color: { dark: '#000000ff', light: '#ffffffff' },
  });

  return { dataUrl, widthPx: sizePx, heightPx: sizePx, format: 'QR' };
}

function drawBarcode(
  canvas: HTMLCanvasElement,
  value: string,
  format: BarcodeFormat,
  moduleWidth: number,
  heightPx: number,
): void {
  JsBarcode(canvas, value, {
    format,
    width: moduleWidth,
    height: heightPx,
    // The human-readable line is drawn by the PDF layer, at a size chosen for
    // the stock — letting JsBarcode bake it into the bitmap would scale the
    // text with the image and produce a different size on every label.
    displayValue: false,
    margin: 0,
    background: '#ffffff',
    lineColor: '#000000',
  });
}

function renderBarcode(args: RenderSymbolArgs): RenderedSymbol {
  const dpi = args.dpi ?? PRINT_DPI;
  const targetWidthPx = mmToPx(args.widthMm, dpi);
  const heightPx = mmToPx(args.heightMm, dpi);
  const requested: BarcodeFormat = args.format ?? 'CODE128';

  const canvas = document.createElement('canvas');

  let format = requested;
  // First pass at a known module width so the symbol's natural width can be
  // measured; the number of modules depends on the value and is not knowable
  // up front. EAN13 throws on a bad check digit — encoding.ts screens for that,
  // but a library-level rejection here must still not kill a 500-label run.
  try {
    drawBarcode(canvas, args.value, format, 2, heightPx);
  } catch {
    format = 'CODE128';
    drawBarcode(canvas, args.value, format, 2, heightPx);
  }

  // Second pass: scale the module width so the bitmap lands at (or just above)
  // the printed size in device pixels, i.e. at least `dpi` dots per inch.
  const naturalWidth = canvas.width || targetWidthPx;
  const moduleWidth = Math.max(1, Math.round((2 * targetWidthPx) / naturalWidth));
  drawBarcode(canvas, args.value, format, moduleWidth, heightPx);

  return {
    dataUrl: canvas.toDataURL('image/png'),
    widthPx: canvas.width,
    heightPx: canvas.height,
    format,
  };
}

/** Rasterise one symbol. Rejects only if the value cannot be encoded at all. */
export async function renderSymbol(args: RenderSymbolArgs): Promise<RenderedSymbol> {
  if (args.symbolType === 'qr') return renderQr(args);
  return renderBarcode(args);
}
