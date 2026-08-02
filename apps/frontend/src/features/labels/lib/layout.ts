/**
 * Label geometry: millimetres in, millimetres and device pixels out.
 *
 * Kept free of jsPDF, qrcode and jsbarcode on purpose — this is the arithmetic
 * that decides whether a label is scannable and how many sheets a run costs, so
 * it is pure and directly unit-tested (layout.test.ts) rather than inferred
 * from a rendered PDF.
 */
import {
  A4_HEIGHT_MM,
  A4_MARGIN_MM,
  A4_WIDTH_MM,
  LABEL_DIMENSIONS_MM,
  LABEL_TYPOGRAPHY,
  MM_PER_INCH,
  PRINT_DPI,
  PT_PER_INCH,
} from '../constants';
import type { LabelSize, PrintFormat, PrintRunOptions } from '../types';

/**
 * Millimetres to device pixels at a given resolution.
 *
 * This is why symbol bitmaps are not hardcoded to "300 px wide": a 38 mm label
 * and a 99 mm label need very different pixel counts to reach the same physical
 * dot density, and a barcode rasterised too coarsely for its printed size is
 * exactly the failure that makes a scanner beep-and-reject.
 */
export function mmToPx(mm: number, dpi: number = PRINT_DPI): number {
  // Ceil, not round: rounding down puts the result fractionally *below* the
  // requested density (99.1 mm at 300 DPI rounds to 1170 px, i.e. 299.9 DPI),
  // and `dpi` here is a floor to clear, not a target to approximate.
  return Math.max(1, Math.ceil((mm / MM_PER_INCH) * dpi));
}

/** Device pixels back to millimetres — the inverse of {@link mmToPx}. */
export function pxToMm(px: number, dpi: number = PRINT_DPI): number {
  return (px / dpi) * MM_PER_INCH;
}

/** Points to millimetres. Used to reserve vertical space for text lines. */
export function ptToMm(pt: number): number {
  return (pt / PT_PER_INCH) * MM_PER_INCH;
}

export interface GridLayout {
  /** Labels across the page. */
  columns: number;
  /** Labels down the page. */
  rows: number;
  /** columns × rows. */
  perPage: number;
  labelWidthMm: number;
  labelHeightMm: number;
  pageWidthMm: number;
  pageHeightMm: number;
  /** Millimetres from the left page edge to the first column. */
  offsetXMm: number;
  /** Millimetres from the top page edge to the first row. */
  offsetYMm: number;
}

/**
 * How many labels of a given size tile onto one A4 sheet, and where the block
 * sits.
 *
 * The grid is centred rather than pinned to the top-left margin: the leftover
 * few millimetres are split evenly so a slightly misfed sheet is wrong by half
 * as much at either edge.
 */
export function computeA4Grid(size: LabelSize): GridLayout {
  const { width, height } = LABEL_DIMENSIONS_MM[size];
  const usableWidth = A4_WIDTH_MM - A4_MARGIN_MM * 2;
  const usableHeight = A4_HEIGHT_MM - A4_MARGIN_MM * 2;

  const columns = Math.max(1, Math.floor(usableWidth / width));
  const rows = Math.max(1, Math.floor(usableHeight / height));

  return {
    columns,
    rows,
    perPage: columns * rows,
    labelWidthMm: width,
    labelHeightMm: height,
    pageWidthMm: A4_WIDTH_MM,
    pageHeightMm: A4_HEIGHT_MM,
    offsetXMm: (A4_WIDTH_MM - columns * width) / 2,
    offsetYMm: (A4_HEIGHT_MM - rows * height) / 2,
  };
}

/**
 * Thermal roll: the page *is* the label. One per page, no margins — a Zebra or
 * TSC driver scales the page to the media, so any margin here comes straight
 * off the printable area of every label.
 */
export function computeThermalGrid(size: LabelSize): GridLayout {
  const { width, height } = LABEL_DIMENSIONS_MM[size];
  return {
    columns: 1,
    rows: 1,
    perPage: 1,
    labelWidthMm: width,
    labelHeightMm: height,
    pageWidthMm: width,
    pageHeightMm: height,
    offsetXMm: 0,
    offsetYMm: 0,
  };
}

export function computeGrid(size: LabelSize, format: PrintFormat): GridLayout {
  return format === 'thermal' ? computeThermalGrid(size) : computeA4Grid(size);
}

/** Pages needed for `count` labels at `perPage` per page. Zero labels is zero pages. */
export function countPages(count: number, perPage: number): number {
  if (count <= 0 || perPage <= 0) return 0;
  return Math.ceil(count / perPage);
}

/**
 * Top-left corner of the nth label in a run, in page millimetres.
 * Fills left-to-right then top-to-bottom, which is the order a human peels them.
 */
export function slotPosition(index: number, grid: GridLayout): { xMm: number; yMm: number; page: number } {
  const page = Math.floor(index / grid.perPage);
  const slot = index % grid.perPage;
  const column = slot % grid.columns;
  const row = Math.floor(slot / grid.columns);
  return {
    page,
    xMm: grid.offsetXMm + column * grid.labelWidthMm,
    yMm: grid.offsetYMm + row * grid.labelHeightMm,
  };
}

export interface LabelBoxes {
  /** Where the symbol bitmap is drawn, relative to the label's top-left corner. */
  symbol: { xMm: number; yMm: number; widthMm: number; heightMm: number };
  /** Baseline for the human-readable code, or null when it is switched off. */
  codeBaselineMm: number | null;
  /** Baseline for the context line, or null when the stock has no room for one. */
  contextBaselineMm: number | null;
  codePt: number;
  contextPt: number;
}

/**
 * Divide one label between symbol, code line and context line.
 *
 * Text is laid out first and the symbol gets what is left, never the other way
 * round: shrinking a scannable symbol by 2 mm costs nothing, whereas clipping
 * the code line off the bottom of the stock makes the label unusable to a human
 * when the scanner cannot read it.
 */
export function computeLabelBoxes(
  size: LabelSize,
  options: { includeHumanReadable: boolean; hasContext: boolean; symbolType: 'qr' | 'barcode' },
): LabelBoxes {
  const { width, height } = LABEL_DIMENSIONS_MM[size];
  const { codePt, contextPt, paddingMm } = LABEL_TYPOGRAPHY[size];

  const showCode = options.includeHumanReadable;
  // contextPt of 0 means the stock is too small for a second line at all.
  const showContext = options.hasContext && contextPt > 0;

  // 1.25 leading — tight enough to buy symbol height, loose enough that
  // descenders do not touch the line below.
  const codeLineMm = showCode ? ptToMm(codePt) * 1.25 : 0;
  const contextLineMm = showContext ? ptToMm(contextPt) * 1.25 : 0;

  const availableWidth = width - paddingMm * 2;
  const availableHeight = height - paddingMm * 2 - codeLineMm - contextLineMm;

  // A QR symbol is square, so it is bounded by the shorter of the two axes.
  const symbolHeight = Math.max(1, availableHeight);
  const symbolWidth =
    options.symbolType === 'qr' ? Math.min(symbolHeight, availableWidth) : availableWidth;

  const symbolX = (width - symbolWidth) / 2;
  const symbolY = paddingMm;

  const codeBaseline = showCode ? symbolY + symbolHeight + ptToMm(codePt) : null;
  const contextBaseline = showContext
    ? symbolY + symbolHeight + codeLineMm + ptToMm(contextPt)
    : null;

  return {
    symbol: { xMm: symbolX, yMm: symbolY, widthMm: symbolWidth, heightMm: symbolHeight },
    codeBaselineMm: codeBaseline,
    contextBaselineMm: contextBaseline,
    codePt,
    contextPt,
  };
}

/** Summary shown in the dialog before anyone spends a sheet of labels. */
export interface RunEstimate {
  labels: number;
  pages: number;
  perPage: number;
  columns: number;
  rows: number;
  labelWidthMm: number;
  labelHeightMm: number;
}

export function estimateRun(count: number, options: PrintRunOptions): RunEstimate {
  const grid = computeGrid(options.labelSize, options.printFormat);
  return {
    labels: count,
    pages: countPages(count, grid.perPage),
    perPage: grid.perPage,
    columns: grid.columns,
    rows: grid.rows,
    labelWidthMm: grid.labelWidthMm,
    labelHeightMm: grid.labelHeightMm,
  };
}
