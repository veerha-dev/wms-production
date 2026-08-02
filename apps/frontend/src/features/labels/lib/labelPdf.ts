/**
 * PDF output for label runs.
 *
 * Two very different documents come out of here, decided by `printFormat`:
 *
 *   - `a4`     — a grid of labels on a 210 × 297 sheet, tiled to match the
 *                Avery stock each size is copied from, paginated.
 *   - `thermal`— one label per page with the page size set to the label size
 *                and no margin, which is what a Zebra/TSC roll printer expects.
 *
 * jsPDF is one of the libraries the boot-graph guard in vite.config.ts keeps
 * out of the entry chunk, so this module must only ever be reached through the
 * lazily-loaded print dialog.
 */
import jsPDF from 'jspdf';

import { computeGrid, computeLabelBoxes, countPages, slotPosition } from './layout';
import { selectBarcodeFormatFor } from './encoding';
import { renderSymbol } from './symbols';
import type { LabelItem, LabelKind, PrintRunOptions } from '../types';

export interface GenerateLabelPdfArgs {
  kind: LabelKind;
  items: LabelItem[];
  options: PrintRunOptions;
  /** Called after each label is drawn, for a progress bar on long runs. */
  onProgress?: (done: number, total: number) => void;
}

/**
 * Shorten `text` until it fits `maxWidthMm` at the current font size, adding an
 * ellipsis. Product names are routinely longer than a 63 mm label.
 */
function fitText(doc: jsPDF, text: string, maxWidthMm: number): string {
  if (!text) return '';
  if (doc.getTextWidth(text) <= maxWidthMm) return text;

  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (doc.getTextWidth(`${text.slice(0, mid)}…`) <= maxWidthMm) low = mid;
    else high = mid - 1;
  }
  return low > 0 ? `${text.slice(0, low)}…` : '';
}

function createDoc(options: PrintRunOptions, widthMm: number, heightMm: number): jsPDF {
  if (options.printFormat === 'thermal') {
    return new jsPDF({
      unit: 'mm',
      // The page IS the label. jsPDF reorders a `format` pair to match the
      // orientation, so the orientation has to agree with which side is longer
      // or a 99 × 67.7 label silently becomes 67.7 × 99.
      format: [widthMm, heightMm],
      orientation: widthMm >= heightMm ? 'landscape' : 'portrait',
      compress: true,
    });
  }
  return new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
}

/**
 * Draw one label at (x, y) on the current page.
 *
 * `includeHumanReadable` and `labelSize` reach this function through
 * `computeLabelBoxes`, which is what actually decides whether the code line
 * exists and how much height is left for the symbol.
 */
async function drawLabel(
  doc: jsPDF,
  item: LabelItem,
  xMm: number,
  yMm: number,
  kind: LabelKind,
  options: PrintRunOptions,
): Promise<void> {
  const boxes = computeLabelBoxes(options.labelSize, {
    includeHumanReadable: options.includeHumanReadable,
    hasContext: Boolean(item.context),
    symbolType: options.symbolType,
  });

  const symbol = await renderSymbol({
    value: item.value,
    symbolType: options.symbolType,
    format: selectBarcodeFormatFor(kind, item.value),
    widthMm: boxes.symbol.widthMm,
    heightMm: boxes.symbol.heightMm,
  });

  doc.addImage(
    symbol.dataUrl,
    'PNG',
    xMm + boxes.symbol.xMm,
    yMm + boxes.symbol.yMm,
    boxes.symbol.widthMm,
    boxes.symbol.heightMm,
  );

  const centreX = xMm + boxes.symbol.xMm + boxes.symbol.widthMm / 2;
  const textWidth = boxes.symbol.widthMm;

  if (boxes.codeBaselineMm !== null) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(boxes.codePt);
    doc.setTextColor(0, 0, 0);
    doc.text(fitText(doc, item.caption, textWidth), centreX, yMm + boxes.codeBaselineMm, {
      align: 'center',
    });
  }

  if (boxes.contextBaselineMm !== null && item.context) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(boxes.contextPt);
    doc.setTextColor(70, 70, 70);
    doc.text(fitText(doc, item.context, textWidth), centreX, yMm + boxes.contextBaselineMm, {
      align: 'center',
    });
  }
}

export async function generateLabelPdf({
  kind,
  items,
  options,
  onProgress,
}: GenerateLabelPdfArgs): Promise<jsPDF> {
  if (items.length === 0) {
    throw new Error('Nothing selected — pick at least one label to print.');
  }

  const grid = computeGrid(options.labelSize, options.printFormat);
  const doc = createDoc(options, grid.pageWidthMm, grid.pageHeightMm);
  const pages = countPages(items.length, grid.perPage);

  for (let index = 0; index < items.length; index += 1) {
    const { page, xMm, yMm } = slotPosition(index, grid);
    if (page > 0 && index % grid.perPage === 0) {
      doc.addPage(
        options.printFormat === 'thermal' ? [grid.pageWidthMm, grid.pageHeightMm] : 'a4',
        options.printFormat === 'thermal'
          ? grid.pageWidthMm >= grid.pageHeightMm
            ? 'landscape'
            : 'portrait'
          : 'portrait',
      );
    }

    // On an A4 sheet, a hairline shows where the die cut is. Printed on plain
    // paper — which is how most tenants will do their first run — it is the
    // only thing telling someone with scissors where a label ends. Thermal
    // output has no such line: the media edge is the boundary.
    if (options.printFormat === 'a4') {
      doc.setDrawColor(210, 210, 210);
      doc.setLineWidth(0.1);
      doc.rect(xMm, yMm, grid.labelWidthMm, grid.labelHeightMm);
    }

    // Sequential on purpose: the barcode renderer rasterises onto a shared
    // canvas, so concurrent draws would interleave.
    await drawLabel(doc, items[index], xMm, yMm, kind, options);
    onProgress?.(index + 1, items.length);
  }

  // Sanity net: the page count the dialog promised the user has to be the page
  // count they get, or the "128 labels, 6 pages" estimate is a lie.
  if (doc.getNumberOfPages() !== pages) {
    throw new Error(
      `Label pagination mismatch: expected ${pages} pages, produced ${doc.getNumberOfPages()}.`,
    );
  }

  return doc;
}
