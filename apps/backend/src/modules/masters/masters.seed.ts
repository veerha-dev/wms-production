/**
 * Canonical starter master data, seeded LAZILY per tenant on first read.
 *
 * Migration 080 seeds the same rows, but only for tenants that existed when it
 * ran (`FROM tenants t CROSS JOIN (VALUES ...)`), so every tenant created
 * afterwards started with zero units, zero SKU categories and zero reason
 * codes — leaving the SKU form and the adjustment / return / QC reason
 * dropdowns empty. MastersRepository.findAll now inserts these rows with
 * ON CONFLICT DO NOTHING before reading, mirroring the existing lazy-seed
 * pattern used for barcode_settings and document_numbering.
 *
 * The rows below are copied verbatim from migration 080 so existing and new
 * tenants end up with identical master data. Keep the two in sync; do NOT edit
 * 080, which must keep working for tenants provisioned before this change.
 */

/** 10 system units of measure. */
export const SEED_UNITS_OF_MEASURE: { code: string; name: string }[] = [
  { code: 'PCS', name: 'Pieces' },
  { code: 'KG', name: 'Kilogram' },
  { code: 'GM', name: 'Gram' },
  { code: 'LTR', name: 'Litre' },
  { code: 'ML', name: 'Millilitre' },
  { code: 'BOX', name: 'Box' },
  { code: 'CTN', name: 'Carton' },
  { code: 'DZN', name: 'Dozen' },
  { code: 'MTR', name: 'Metre' },
  { code: 'PR', name: 'Pair' },
];

/** 10 system SKU categories. */
export const SEED_SKU_CATEGORIES: { code: string; name: string }[] = [
  { code: 'ELECTRONICS', name: 'Electronics' },
  { code: 'HARDWARE', name: 'Hardware' },
  { code: 'GENERAL', name: 'General' },
  { code: 'PERISHABLES', name: 'Perishables' },
  { code: 'PHARMACEUTICALS', name: 'Pharmaceuticals' },
  { code: 'CHEMICALS', name: 'Chemicals' },
  { code: 'FRAGILE', name: 'Fragile' },
  { code: 'HEAVY', name: 'Heavy' },
  { code: 'FMCG', name: 'FMCG' },
  { code: 'TEXTILES', name: 'Textiles' },
];

/** 24 starter reason codes across the five reason categories. */
export const SEED_REASON_CODES: { category: string; code: string; reasonText: string }[] = [
  // Adjustment
  { category: 'adjustment', code: 'ADJ_DAMAGE', reasonText: 'Damaged in warehouse' },
  { category: 'adjustment', code: 'ADJ_THEFT', reasonText: 'Theft / shrinkage' },
  { category: 'adjustment', code: 'ADJ_COUNT_ERROR', reasonText: 'Counting error' },
  { category: 'adjustment', code: 'ADJ_EXPIRED', reasonText: 'Expired stock write-off' },
  { category: 'adjustment', code: 'ADJ_SYSTEM_ERROR', reasonText: 'System / data entry error' },
  // Return
  { category: 'return', code: 'RET_DAMAGED', reasonText: 'Item damaged on arrival' },
  { category: 'return', code: 'RET_WRONG_ITEM', reasonText: 'Wrong item shipped' },
  { category: 'return', code: 'RET_NOT_AS_DESCRIBED', reasonText: 'Not as described' },
  { category: 'return', code: 'RET_CUSTOMER_CHANGED', reasonText: 'Customer changed mind' },
  { category: 'return', code: 'RET_LATE_DELIVERY', reasonText: 'Late delivery / refused' },
  // Transfer
  { category: 'transfer', code: 'TRF_REBALANCE', reasonText: 'Stock rebalancing' },
  { category: 'transfer', code: 'TRF_DEMAND', reasonText: 'Demand at destination warehouse' },
  { category: 'transfer', code: 'TRF_CONSOLIDATION', reasonText: 'Stock consolidation' },
  { category: 'transfer', code: 'TRF_SPACE', reasonText: 'Space constraint' },
  // QC failure
  { category: 'qc_failure', code: 'QC_DAMAGED_PKG', reasonText: 'Damaged packaging' },
  { category: 'qc_failure', code: 'QC_SHORT_EXPIRY', reasonText: 'Short / expired shelf life' },
  { category: 'qc_failure', code: 'QC_WRONG_SPEC', reasonText: 'Does not match specification' },
  { category: 'qc_failure', code: 'QC_CONTAMINATION', reasonText: 'Contamination detected' },
  { category: 'qc_failure', code: 'QC_LABEL_MISSING', reasonText: 'Label or batch marking missing' },
  // Pick issue
  { category: 'pick_issue', code: 'PICK_SHORT', reasonText: 'Short pick — insufficient stock' },
  { category: 'pick_issue', code: 'PICK_NOT_FOUND', reasonText: 'Item not found at location' },
  { category: 'pick_issue', code: 'PICK_DAMAGED', reasonText: 'Item damaged at pick face' },
  { category: 'pick_issue', code: 'PICK_WRONG_LOC', reasonText: 'Stock in wrong location' },
  { category: 'pick_issue', code: 'PICK_BLOCKED', reasonText: 'Location blocked / inaccessible' },
];

/**
 * A parameterised idempotent INSERT for one seeded section.
 * `columns` are fixed literals from this file — never user input.
 */
export interface SeedStatement {
  sql: string;
  params: any[];
}

function buildSeed(
  table: string,
  columns: string[],
  rows: any[][],
  tenantId: string,
): SeedStatement {
  const params: any[] = [tenantId];
  const tuples = rows.map((row) => {
    const base = params.length + 1;
    params.push(...row);
    return `($1, ${row.map((_, i) => `$${base + i}`).join(', ')})`;
  });
  return {
    sql: `INSERT INTO ${table} (tenant_id, ${columns.join(', ')})
          VALUES ${tuples.join(', ')}
          ON CONFLICT DO NOTHING`,
    params,
  };
}

/** Sections that carry starter rows, keyed by MasterSection. */
export const SEEDED_SECTIONS = ['units', 'sku-categories', 'reason-codes'] as const;
export type SeededSection = (typeof SEEDED_SECTIONS)[number];

export function isSeededSection(section: string): section is SeededSection {
  return (SEEDED_SECTIONS as readonly string[]).includes(section);
}

/** Builds the idempotent seed statement for one section + tenant. */
export function buildSectionSeed(section: SeededSection, tenantId: string): SeedStatement {
  switch (section) {
    case 'units':
      return buildSeed(
        'units_of_measure',
        ['code', 'name', 'is_system'],
        SEED_UNITS_OF_MEASURE.map((u) => [u.code, u.name, true]),
        tenantId,
      );
    case 'sku-categories':
      return buildSeed(
        'sku_categories',
        ['code', 'name', 'is_system'],
        SEED_SKU_CATEGORIES.map((c) => [c.code, c.name, true]),
        tenantId,
      );
    case 'reason-codes':
      return buildSeed(
        'reason_codes',
        ['category', 'code', 'reason_text'],
        SEED_REASON_CODES.map((r) => [r.category, r.code, r.reasonText]),
        tenantId,
      );
  }
}
