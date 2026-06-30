import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface POLike {
  poNumber?: string;
  po_number?: string;
  status?: string;
  orderDate?: string;
  order_date?: string;
  expectedDate?: string;
  expected_delivery?: string;
  totalAmount?: number;
  total_amount?: number;
  notes?: string;
  supplierName?: string;
  supplier_name?: string;
  supplier?: { name?: string; code?: string; address?: string };
  warehouseName?: string;
  warehouse_name?: string;
  items?: Array<{
    sku_code?: string;
    skuCode?: string;
    sku_name?: string;
    skuName?: string;
    quantity?: number;
    quantity_ordered?: number;
    unit_price?: number;
    unitPrice?: number;
  }>;
}

const inr = (n: number | undefined) =>
  (n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

export function generatePoPdf(po: POLike, tenantInfo?: {
  companyName?: string;
  gstNumber?: string | null;
  address?: string | null;
  city?: string | null;
}): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const left = 40;
  let y = 40;

  // Header
  doc.setFontSize(20).setFont('helvetica', 'bold');
  doc.text('PURCHASE ORDER', left, y);
  y += 22;
  
  const poNum = po.poNumber || po.po_number || '';
  doc.setFontSize(10).setFont('helvetica', 'normal').setTextColor(110);
  doc.text(poNum, left, y);
  doc.setTextColor(0);
  y += 18;

  // Issuer block (right)
  const issuerLines = [
    tenantInfo?.companyName || 'Your Company',
    tenantInfo?.address || '',
    tenantInfo?.city || '',
    tenantInfo?.gstNumber ? `GSTIN: ${tenantInfo.gstNumber}` : '',
  ].filter(Boolean);
  doc.setFontSize(10);
  issuerLines.forEach((line, i) => {
    doc.text(line, pageWidth - left, 60 + i * 13, { align: 'right' });
  });

  // Supplier Billing Block
  const supplierName = po.supplier?.name || po.supplierName || po.supplier_name || '—';
  doc.setFont('helvetica', 'bold').text('Supplier Details', left, y);
  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.text(supplierName, left, y);
  y += 13;
  if (po.supplier?.code) {
    doc.text(`Code: ${po.supplier.code}`, left, y);
    y += 13;
  }
  if (po.supplier?.address) {
    const wrapped = doc.splitTextToSize(po.supplier.address, 260) as string[];
    doc.text(wrapped, left, y);
    y += wrapped.length * 12;
  }

  // Meta block (right side, same y region)
  const metaStartY = 95;
  const meta: Array<[string, string]> = [
    ['Order Date', fmtDate(po.orderDate || po.order_date)],
    ['Expected Date', fmtDate(po.expectedDate || po.expected_delivery)],
    ['Warehouse', po.warehouseName || po.warehouse_name || '-'],
  ];

  doc.setFontSize(9).setTextColor(80);
  meta.forEach(([k, v], i) => {
    const yy = metaStartY + i * 14;
    doc.text(k, pageWidth - left - 160, yy);
    doc.setFont('helvetica', 'bold');
    doc.text(v, pageWidth - left, yy, { align: 'right' });
    doc.setFont('helvetica', 'normal');
  });
  doc.setTextColor(0);

  // Items table
  const head = [['#', 'SKU Code', 'SKU Name', 'Qty Ordered', 'Unit Price', 'Line Total']];
  const itemsList = po.items || [];
  const body = itemsList.map((it, i) => {
    const qty = it.quantity ?? it.quantity_ordered ?? 0;
    const rate = it.unitPrice ?? it.unit_price ?? 0;
    const total = qty * rate;
    return [
      String(i + 1),
      it.skuCode || it.sku_code || '-',
      it.skuName || it.sku_name || '-',
      String(qty),
      inr(rate),
      inr(total),
    ];
  });

  autoTable(doc, {
    startY: Math.max(y + 8, 200),
    head,
    body,
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 6, lineColor: [220, 220, 220] },
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 24, halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
    },
  });

  // Totals
  const finalY = (doc as any).lastAutoTable?.finalY ?? y + 100;
  let ty = finalY + 16;
  const labelX = pageWidth - left - 160;
  const valX = pageWidth - left;

  const totalAmt = po.totalAmount ?? po.total_amount ?? 0;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold').setFontSize(12);
  doc.text('Total Amount', labelX, ty + 8);
  doc.text(`₹ ${inr(totalAmt)}`, valX, ty + 8, { align: 'right' });
  doc.setFont('helvetica', 'normal').setFontSize(10);
  ty += 22;

  if (po.notes) {
    ty += 8;
    doc.setFontSize(9).setTextColor(80);
    doc.text('Notes', left, ty);
    ty += 12;
    const wrapped = doc.splitTextToSize(po.notes, pageWidth - left * 2) as string[];
    doc.text(wrapped, left, ty);
    doc.setTextColor(0);
  }

  // Footer
  const footerY = doc.internal.pageSize.getHeight() - 28;
  doc.setFontSize(8).setTextColor(140);
  doc.text(`Generated on ${new Date().toLocaleString('en-IN')} · Status: ${(po.status || 'draft').toUpperCase()}`, left, footerY);
  doc.setTextColor(0);

  return doc;
}

export function downloadPoPdf(po: POLike, tenantInfo?: Parameters<typeof generatePoPdf>[1]) {
  const doc = generatePoPdf(po, tenantInfo);
  doc.save(`${po.poNumber || po.po_number || 'purchase_order'}.pdf`);
}
