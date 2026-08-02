import type { LabelKind } from '../types';

/** `Zone A / Racks` → `zone-a-racks`, so it is safe in a filename on any OS. */
export function slugifyScope(scope: string): string {
  return scope
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

/**
 * e.g. `bin-labels-zone-a-2026-08-02.pdf`.
 *
 * The scope and the date are both in the name because label PDFs get
 * regenerated — a reprint of one zone must not overwrite last week's whole-
 * warehouse run in the operator's downloads folder.
 */
export function labelPdfFilename(
  kind: LabelKind,
  scope: string | undefined,
  date: Date = new Date(),
): string {
  const slug = scope ? slugifyScope(scope) : '';
  const stamp = date.toISOString().slice(0, 10);
  return `${[`${kind}-labels`, slug, stamp].filter(Boolean).join('-')}.pdf`;
}
