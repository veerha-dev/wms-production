/**
 * Table registry for Settings > Masters.
 *
 * Every SQL identifier used by MastersRepository comes from THIS file. The
 * section key that arrives on the URL is validated against `MASTER_SECTIONS`
 * before it is ever used as a lookup key, so no user-supplied string is
 * concatenated into a query — only whitelisted literals from these configs.
 */

export type MasterSection =
  | 'boxes'
  | 'materials'
  | 'carriers'
  | 'reason-codes'
  | 'units'
  | 'sku-categories'
  | 'hsn-codes';

export interface MasterConfig {
  /** Physical table name — fixed literal. */
  table: string;
  /** Human label used in error messages. */
  label: string;
  /** Whitelist: DTO key (camelCase) -> column. Used for BOTH insert and update. */
  columns: Record<string, string>;
  /** Columns returned as numbers instead of pg's string form. */
  numeric: string[];
  /** Columns matched by `?search=`. */
  searchColumns: string[];
  /** Allowed `?key=` filters -> column. */
  filters: Record<string, string>;
  orderBy: string;
  /** Column holding the business code (used for duplicate detection). */
  codeColumn: string;
  /** DTO key a code is derived from when the client does not send one. */
  codeSourceKey: string;
  /** Extra columns (besides tenant_id) that scope the unique code. */
  scopeColumns: string[];
  /** Fallback prefix when a code cannot be derived from the source field. */
  codePrefix: string;
}

export const MASTERS_REGISTRY: Record<MasterSection, MasterConfig> = {
  boxes: {
    table: 'packaging_boxes',
    label: 'Packaging box',
    columns: {
      name: 'name',
      code: 'code',
      lengthCm: 'length_cm',
      widthCm: 'width_cm',
      heightCm: 'height_cm',
      maxWeightKg: 'max_weight_kg',
      boxType: 'box_type',
      cost: 'cost',
      status: 'status',
    },
    numeric: ['length_cm', 'width_cm', 'height_cm', 'max_weight_kg', 'cost'],
    searchColumns: ['name', 'code', 'box_type'],
    filters: { status: 'status', boxType: 'box_type' },
    orderBy: 'name ASC',
    codeColumn: 'code',
    codeSourceKey: 'name',
    scopeColumns: [],
    codePrefix: 'BOX',
  },
  materials: {
    table: 'packaging_materials',
    label: 'Packaging material',
    columns: {
      name: 'name',
      code: 'code',
      unit: 'unit',
      cost: 'cost',
      status: 'status',
    },
    numeric: ['cost'],
    searchColumns: ['name', 'code'],
    filters: { status: 'status' },
    orderBy: 'name ASC',
    codeColumn: 'code',
    codeSourceKey: 'name',
    scopeColumns: [],
    codePrefix: 'MAT',
  },
  carriers: {
    table: 'carriers',
    label: 'Carrier',
    columns: {
      name: 'name',
      code: 'code',
      carrierType: 'carrier_type',
      transporterId: 'transporter_id',
      contact: 'contact',
      apiIntegrated: 'api_integrated',
      status: 'status',
    },
    numeric: [],
    searchColumns: ['name', 'code', 'carrier_type', 'transporter_id'],
    filters: { status: 'status', carrierType: 'carrier_type' },
    orderBy: 'name ASC',
    codeColumn: 'code',
    codeSourceKey: 'name',
    scopeColumns: [],
    codePrefix: 'CARR',
  },
  'reason-codes': {
    table: 'reason_codes',
    label: 'Reason code',
    columns: {
      reasonText: 'reason_text',
      category: 'category',
      code: 'code',
      status: 'status',
    },
    numeric: [],
    searchColumns: ['reason_text', 'code'],
    filters: { status: 'status', category: 'category' },
    orderBy: 'category ASC, reason_text ASC',
    codeColumn: 'code',
    codeSourceKey: 'reasonText',
    scopeColumns: ['category'],
    codePrefix: 'RSN',
  },
  units: {
    table: 'units_of_measure',
    label: 'Unit of measure',
    columns: {
      code: 'code',
      name: 'name',
      status: 'status',
    },
    numeric: [],
    searchColumns: ['code', 'name'],
    filters: { status: 'status' },
    orderBy: 'is_system DESC, code ASC',
    codeColumn: 'code',
    codeSourceKey: 'name',
    scopeColumns: [],
    codePrefix: 'UOM',
  },
  'sku-categories': {
    table: 'sku_categories',
    label: 'SKU category',
    columns: {
      name: 'name',
      code: 'code',
      status: 'status',
    },
    numeric: [],
    searchColumns: ['name', 'code'],
    filters: { status: 'status' },
    orderBy: 'is_system DESC, name ASC',
    codeColumn: 'code',
    codeSourceKey: 'name',
    scopeColumns: [],
    codePrefix: 'CAT',
  },
  'hsn-codes': {
    table: 'hsn_codes',
    label: 'HSN code',
    columns: {
      hsnCode: 'hsn_code',
      description: 'description',
      gstRate: 'gst_rate',
      status: 'status',
    },
    numeric: ['gst_rate'],
    searchColumns: ['hsn_code', 'description'],
    filters: { status: 'status' },
    orderBy: 'hsn_code ASC',
    codeColumn: 'hsn_code',
    codeSourceKey: 'hsnCode',
    scopeColumns: [],
    codePrefix: 'HSN',
  },
};

export const MASTER_SECTIONS = Object.keys(MASTERS_REGISTRY) as MasterSection[];

/** Static GST slabs — a fixed list in code, deliberately not a table. */
export const GST_RATES = [0, 5, 12, 18, 28] as const;

/**
 * Document-numbering rows surfaced by Settings > Masters > Document Numbering.
 * The table (migration 078) is seeded for existing tenants; this catalog also
 * lets the API lazily seed rows for tenants created later. Prefixes mirror
 * DocumentNumberingService's defaults.
 */
export const DOCUMENT_TYPES: { docType: string; label: string; defaultPrefix: string }[] = [
  { docType: 'purchase_order', label: 'Purchase Order', defaultPrefix: 'PO-' },
  { docType: 'sales_order', label: 'Sales Order', defaultPrefix: 'SO-' },
  { docType: 'grn', label: 'GRN', defaultPrefix: 'GRN-' },
  { docType: 'pick_list', label: 'Pick List', defaultPrefix: 'PL-' },
  { docType: 'shipment', label: 'Shipment', defaultPrefix: 'SHP-' },
  { docType: 'invoice', label: 'Invoice', defaultPrefix: 'INV-' },
  { docType: 'transfer', label: 'Transfer', defaultPrefix: 'TRF-' },
  { docType: 'cycle_count', label: 'Cycle Count', defaultPrefix: 'CC-' },
  { docType: 'putaway', label: 'Putaway', defaultPrefix: 'PUT-' },
  { docType: 'return', label: 'Return', defaultPrefix: 'RET-' },
  { docType: 'task', label: 'Task', defaultPrefix: 'TSK-' },
  { docType: 'customer', label: 'Customer', defaultPrefix: 'CUST-' },
  { docType: 'supplier', label: 'Supplier', defaultPrefix: 'SUP-' },
];

export const DOCUMENT_TYPE_KEYS = DOCUMENT_TYPES.map((d) => d.docType);

export const REASON_CATEGORIES = [
  'adjustment',
  'return',
  'transfer',
  'qc_failure',
  'pick_issue',
] as const;
