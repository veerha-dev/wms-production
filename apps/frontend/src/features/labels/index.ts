/**
 * Public surface of the labels slice.
 *
 * Only the button and the plain types are re-exported. The PDF generator and
 * the symbol renderers are deliberately absent: re-exporting them here would
 * put jspdf/qrcode/jsbarcode into the import graph of every page that wants a
 * print button, which is exactly what the boot-graph guard in vite.config.ts
 * exists to prevent.
 */
export { LabelPrintButton } from './components/LabelPrintButton';
export type { LabelBin, LabelSku, LabelSettings, LabelKind } from './types';
