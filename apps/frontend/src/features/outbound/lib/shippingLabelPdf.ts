/**
 * Launch-phase shipping label.
 *
 * This is deliberately a *provisional* label. The real one comes from the
 * courier once a shipment is booked through their API — their PDF carries the
 * AWB barcode their own scanners read at every hop, and nothing we draw can
 * substitute for it. Until that integration exists, a packer still has to put
 * something on the box to get it out of the door, so this renders the tracking
 * number they were given along with the address.
 *
 * When courier booking lands, `labelUrl` on the packing session holds the
 * courier's PDF and this file stops being reached for those shipments.
 *
 * jspdf and jsbarcode are lazy-only (see the boot-graph guard in
 * vite.config.ts), so both are imported dynamically inside the function.
 */

export interface ShippingLabelArgs {
  orderNumber: string;
  customerName: string | null;
  shippingAddress: string | null;
  customerPhone?: string | null;
  carrier?: string | null;
  trackingNumber?: string | null;
  warehouseName?: string | null;
  packageNumber: number;
  packageCount: number;
  weightKg: number | null;
  dimensions?: { lengthCm: number | null; widthCm: number | null; heightCm: number | null };
  /** 'thermal' = one 100×150mm label per page (Zebra/TSC). 'a4' = same label on a sheet. */
  format?: 'thermal' | 'a4';
}

const LABEL_W = 100;
const LABEL_H = 150;

async function renderTrackingBarcode(value: string): Promise<string | null> {
  try {
    const JsBarcode = (await import('jsbarcode')).default;
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, value, {
      format: 'CODE128',
      width: 2,
      height: 90,
      displayValue: false,
      margin: 0,
      background: '#ffffff',
      lineColor: '#000000',
    });
    return canvas.toDataURL('image/png');
  } catch {
    // An unencodable tracking number must not stop the packer printing an
    // address label — the human-readable number below it is still correct.
    return null;
  }
}

/** Wrap text to a width, returning the lines actually drawn. */
function drawWrapped(
  doc: any,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  const lines: string[] = doc.splitTextToSize(text, maxWidth);
  lines.forEach((line, i) => doc.text(line, x, y + i * lineHeight));
  return y + lines.length * lineHeight;
}

export async function buildShippingLabelPdf(args: ShippingLabelArgs): Promise<Blob> {
  const { default: jsPDF } = await import('jspdf');
  const format = args.format ?? 'thermal';

  const doc =
    format === 'thermal'
      ? new jsPDF({ unit: 'mm', format: [LABEL_W, LABEL_H], orientation: 'portrait', compress: true })
      : new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });

  // On A4 the label is drawn in the top-left corner at its true size, so the
  // packer cuts along the border and tapes it on.
  const ox = format === 'thermal' ? 0 : 12;
  const oy = format === 'thermal' ? 0 : 12;
  const pad = 6;
  const innerW = LABEL_W - pad * 2;

  doc.setDrawColor(0);
  doc.setLineWidth(0.4);
  doc.rect(ox + 1, oy + 1, LABEL_W - 2, LABEL_H - 2);

  let y = oy + pad + 4;

  // Carrier band
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text((args.carrier || 'COURIER').toUpperCase(), ox + pad, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(
    `Package ${args.packageNumber} of ${args.packageCount}`,
    ox + LABEL_W - pad,
    y,
    { align: 'right' },
  );

  y += 3;
  doc.setLineWidth(0.3);
  doc.line(ox + pad, y, ox + LABEL_W - pad, y);
  y += 7;

  // Ship to
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('SHIP TO', ox + pad, y);
  y += 5;

  doc.setFontSize(12);
  doc.text(args.customerName || 'Customer', ox + pad, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  if (args.shippingAddress) {
    y = drawWrapped(doc, args.shippingAddress, ox + pad, y, innerW, 4.5);
  }
  if (args.customerPhone) {
    y += 1;
    doc.text(`Phone: ${args.customerPhone}`, ox + pad, y);
    y += 5;
  }

  y += 3;
  doc.setLineWidth(0.3);
  doc.line(ox + pad, y, ox + LABEL_W - pad, y);
  y += 6;

  // Order + weight block
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('ORDER', ox + pad, y);
  doc.text('WEIGHT', ox + pad + 45, y);
  y += 4.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(args.orderNumber, ox + pad, y);
  doc.text(args.weightKg ? `${args.weightKg} kg` : '—', ox + pad + 45, y);
  y += 6;

  const dims = args.dimensions;
  if (dims?.lengthCm && dims?.widthCm && dims?.heightCm) {
    doc.setFontSize(8);
    doc.text(`Dimensions: ${dims.lengthCm} × ${dims.widthCm} × ${dims.heightCm} cm`, ox + pad, y);
    y += 5;
  }
  if (args.warehouseName) {
    doc.setFontSize(8);
    doc.text(`From: ${args.warehouseName}`, ox + pad, y);
    y += 5;
  }

  // Tracking block, anchored to the bottom so every label has it in the same place
  const trackingTop = oy + LABEL_H - 52;
  doc.setLineWidth(0.3);
  doc.line(ox + pad, trackingTop - 4, ox + LABEL_W - pad, trackingTop - 4);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('TRACKING / AWB', ox + pad, trackingTop);

  if (args.trackingNumber) {
    const barcode = await renderTrackingBarcode(args.trackingNumber);
    if (barcode) {
      doc.addImage(barcode, 'PNG', ox + pad, trackingTop + 3, innerW, 20);
    }
    doc.setFont('courier', 'bold');
    doc.setFontSize(12);
    doc.text(args.trackingNumber, ox + LABEL_W / 2, trackingTop + (barcode ? 29 : 12), {
      align: 'center',
    });
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Not yet booked with the courier', ox + pad, trackingTop + 8);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text(
    'Provisional label — replace with the courier label once the shipment is booked.',
    ox + LABEL_W / 2,
    oy + LABEL_H - 6,
    { align: 'center' },
  );

  return doc.output('blob');
}

/**
 * Opens the label in a new tab and triggers the print dialog. A popup blocker
 * leaves the packer with nothing, so the blob URL is handed back for a download
 * fallback in that case.
 */
export async function printShippingLabel(args: ShippingLabelArgs): Promise<{ printed: boolean; url: string }> {
  const blob = await buildShippingLabelPdf(args);
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');

  if (win) {
    win.addEventListener('load', () => {
      try {
        win.focus();
        win.print();
      } catch {
        // Some browsers block programmatic print on a cross-origin blob view;
        // the PDF is open either way and the packer can print from the viewer.
      }
    });
  }

  // Not revoked immediately: the new tab still needs to read it.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return { printed: Boolean(win), url };
}
