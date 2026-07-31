import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { DOCUMENT_TYPES, MASTERS_REGISTRY, MasterConfig, MasterSection } from './masters.registry';
import { buildSectionSeed, isSeededSection } from './masters.seed';

const toCamel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/** Whitelist for the singleton barcode_settings row. */
const BARCODE_COLUMNS: Record<string, string> = {
  locationCodeType: 'location_code_type',
  labelSize: 'label_size',
  printFormat: 'print_format',
  includeHumanReadable: 'include_human_readable',
  skuBarcodeSource: 'sku_barcode_source',
};

/**
 * One repository for all seven list-shaped master tables. Everything that
 * becomes a SQL identifier is read out of MASTERS_REGISTRY; values are always
 * bound as parameters.
 */
@Injectable()
export class MastersRepository {
  constructor(private db: DatabaseService) {}

  private config(section: MasterSection): MasterConfig {
    const cfg = MASTERS_REGISTRY[section];
    if (!cfg) throw new Error(`Unknown master section: ${section}`);
    return cfg;
  }

  private mapRow(section: MasterSection, row: any) {
    if (!row) return null;
    const cfg = this.config(section);
    const out: Record<string, any> = {};
    for (const [col, value] of Object.entries(row)) {
      out[toCamel(col)] =
        cfg.numeric.includes(col) && value !== null && value !== undefined
          ? Number(value)
          : value;
    }
    out.isActive = row.status === 'active';
    return out;
  }

  /**
   * Creates the canonical starter rows for units / SKU categories / reason
   * codes if this tenant has none of them yet.
   *
   * Migration 080 only seeded tenants that existed when it ran, so every
   * tenant signed up afterwards had empty dropdowns. Same lazy pattern as
   * seedDocumentNumbering / getBarcodeSettings below: idempotent via
   * ON CONFLICT DO NOTHING, so re-running is free and a row the tenant has
   * since renamed or deactivated is never resurrected or overwritten.
   */
  private async seedSection(tenantId: string, section: MasterSection): Promise<void> {
    if (!isSeededSection(section)) return;
    const { sql, params } = buildSectionSeed(section, tenantId);
    await this.db.query(sql, params);
  }

  async findAll(
    tenantId: string,
    section: MasterSection,
    query: Record<string, any> = {},
  ): Promise<any[]> {
    await this.seedSection(tenantId, section);

    const cfg = this.config(section);
    const conditions = ['tenant_id = $1'];
    const params: any[] = [tenantId];
    let idx = 2;

    if (query.search) {
      const ors = cfg.searchColumns.map((c) => `${c} ILIKE $${idx}`);
      conditions.push(`(${ors.join(' OR ')})`);
      params.push(`%${query.search}%`);
      idx++;
    }
    for (const [key, col] of Object.entries(cfg.filters)) {
      if (query[key] === undefined || query[key] === null || query[key] === '') continue;
      conditions.push(`${col} = $${idx}`);
      params.push(query[key]);
      idx++;
    }

    const res = await this.db.query(
      `SELECT * FROM ${cfg.table} WHERE ${conditions.join(' AND ')} ORDER BY ${cfg.orderBy}`,
      params,
    );
    return res.rows.map((r) => this.mapRow(section, r));
  }

  async findById(tenantId: string, section: MasterSection, id: string): Promise<any> {
    const cfg = this.config(section);
    const res = await this.db.query(
      `SELECT * FROM ${cfg.table} WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    return this.mapRow(section, res.rows[0]);
  }

  /**
   * Duplicate lookup honouring each table's unique scope —
   * (tenant_id, code) everywhere except reason_codes, which is
   * (tenant_id, category, code), and hsn_codes, keyed on hsn_code.
   */
  async findByCode(
    tenantId: string,
    section: MasterSection,
    code: string,
    scope: Record<string, any> = {},
  ): Promise<any> {
    const cfg = this.config(section);
    const conditions = ['tenant_id = $1', `${cfg.codeColumn} = $2`];
    const params: any[] = [tenantId, code];
    let idx = 3;
    for (const scopeKey of cfg.scopeColumns) {
      const col = cfg.columns[scopeKey] ?? scopeKey;
      conditions.push(`${col} = $${idx}`);
      params.push(scope[scopeKey] ?? null);
      idx++;
    }
    const res = await this.db.query(
      `SELECT * FROM ${cfg.table} WHERE ${conditions.join(' AND ')}`,
      params,
    );
    return this.mapRow(section, res.rows[0]);
  }

  async create(
    tenantId: string,
    section: MasterSection,
    dto: Record<string, any>,
  ): Promise<any> {
    const cfg = this.config(section);
    const cols = ['tenant_id'];
    const params: any[] = [tenantId];

    for (const [key, col] of Object.entries(cfg.columns)) {
      if (dto[key] === undefined) continue;
      cols.push(col);
      params.push(dto[key]);
    }

    const placeholders = params.map((_, i) => `$${i + 1}`).join(', ');
    const res = await this.db.query(
      `INSERT INTO ${cfg.table} (${cols.join(', ')}) VALUES (${placeholders}) RETURNING *`,
      params,
    );
    return this.mapRow(section, res.rows[0]);
  }

  async update(
    tenantId: string,
    section: MasterSection,
    id: string,
    dto: Record<string, any>,
  ): Promise<any> {
    const cfg = this.config(section);
    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;

    for (const [key, col] of Object.entries(cfg.columns)) {
      if (dto[key] === undefined) continue;
      sets.push(`${col} = $${idx}`);
      params.push(dto[key]);
      idx++;
    }
    if (sets.length === 0) return this.findById(tenantId, section, id);

    sets.push('updated_at = NOW()');
    params.push(id, tenantId);
    const res = await this.db.query(
      `UPDATE ${cfg.table} SET ${sets.join(', ')}
        WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`,
      params,
    );
    return this.mapRow(section, res.rows[0]);
  }

  /** Soft delete — masters are referenced by historical documents. */
  async deactivate(tenantId: string, section: MasterSection, id: string): Promise<any> {
    const cfg = this.config(section);
    const res = await this.db.query(
      `UPDATE ${cfg.table} SET status = 'inactive', updated_at = NOW()
        WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId],
    );
    return this.mapRow(section, res.rows[0]);
  }

  // ─── Document numbering ─────────────────────────────────────────────────────

  private mapDocNumbering(row: any) {
    if (!row) return null;
    const def = DOCUMENT_TYPES.find((d) => d.docType === row.doc_type);
    return {
      id: row.id,
      tenantId: row.tenant_id,
      docType: row.doc_type,
      label: def?.label ?? row.doc_type,
      prefix: row.prefix,
      /** The value that will be issued by the NEXT call to nextNumber(). */
      nextNumber: Number(row.next_number),
      numberLength: Number(row.number_length),
      resetYearly: row.reset_yearly,
      lastResetYear: row.last_reset_year,
      updatedAt: row.updated_at,
    };
  }

  /** Seeds any doc types this tenant is missing (migration 078 covers tenants that already existed). */
  private async seedDocumentNumbering(tenantId: string): Promise<void> {
    const params: any[] = [tenantId];
    const tuples = DOCUMENT_TYPES.map((d) => {
      const base = params.length + 1;
      params.push(d.docType, d.defaultPrefix);
      return `($1, $${base}, $${base + 1}, 3)`;
    });
    await this.db.query(
      `INSERT INTO document_numbering (tenant_id, doc_type, prefix, number_length)
       VALUES ${tuples.join(', ')}
       ON CONFLICT (tenant_id, doc_type) DO NOTHING`,
      params,
    );
  }

  async listDocumentNumbering(tenantId: string): Promise<any[]> {
    await this.seedDocumentNumbering(tenantId);
    const res = await this.db.query(
      `SELECT * FROM document_numbering WHERE tenant_id = $1`,
      [tenantId],
    );
    const byType = new Map<string, any>(res.rows.map((r: any) => [r.doc_type, r]));
    // Catalog order — the UI renders one row per document type.
    return DOCUMENT_TYPES.map((d) => this.mapDocNumbering(byType.get(d.docType))).filter(Boolean);
  }

  async findDocumentNumbering(tenantId: string, docType: string): Promise<any> {
    const res = await this.db.query(
      `SELECT * FROM document_numbering WHERE tenant_id = $1 AND doc_type = $2`,
      [tenantId, docType],
    );
    return this.mapDocNumbering(res.rows[0]);
  }

  async updateDocumentNumbering(
    tenantId: string,
    docType: string,
    dto: Record<string, any>,
  ): Promise<any> {
    await this.seedDocumentNumbering(tenantId);

    const fieldMap: Record<string, string> = {
      prefix: 'prefix',
      nextNumber: 'next_number',
      numberLength: 'number_length',
      resetYearly: 'reset_yearly',
    };
    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;
    for (const [key, col] of Object.entries(fieldMap)) {
      if (dto[key] === undefined) continue;
      sets.push(`${col} = $${idx}`);
      params.push(dto[key]);
      idx++;
    }
    if (sets.length === 0) return this.findDocumentNumbering(tenantId, docType);

    sets.push('updated_at = NOW()');
    params.push(tenantId, docType);
    const res = await this.db.query(
      `UPDATE document_numbering SET ${sets.join(', ')}
        WHERE tenant_id = $${idx} AND doc_type = $${idx + 1} RETURNING *`,
      params,
    );
    return this.mapDocNumbering(res.rows[0]);
  }

  // ─── Barcode settings (singleton per tenant) ─────────────────────────────────

  private mapBarcode(row: any) {
    if (!row) return null;
    return {
      id: row.id,
      tenantId: row.tenant_id,
      locationCodeType: row.location_code_type,
      labelSize: row.label_size,
      printFormat: row.print_format,
      includeHumanReadable: row.include_human_readable,
      skuBarcodeSource: row.sku_barcode_source,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /** Lazily creates the defaults row on first read. */
  async getBarcodeSettings(tenantId: string): Promise<any> {
    await this.db.query(
      `INSERT INTO barcode_settings (tenant_id) VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING`,
      [tenantId],
    );
    const res = await this.db.query(
      `SELECT * FROM barcode_settings WHERE tenant_id = $1`,
      [tenantId],
    );
    return this.mapBarcode(res.rows[0]);
  }

  async updateBarcodeSettings(tenantId: string, dto: Record<string, any>): Promise<any> {
    await this.getBarcodeSettings(tenantId);

    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;
    for (const [key, col] of Object.entries(BARCODE_COLUMNS)) {
      if (dto[key] === undefined) continue;
      sets.push(`${col} = $${idx}`);
      params.push(dto[key]);
      idx++;
    }
    if (sets.length === 0) return this.getBarcodeSettings(tenantId);

    sets.push('updated_at = NOW()');
    params.push(tenantId);
    const res = await this.db.query(
      `UPDATE barcode_settings SET ${sets.join(', ')} WHERE tenant_id = $${idx} RETURNING *`,
      params,
    );
    return this.mapBarcode(res.rows[0]);
  }
}
