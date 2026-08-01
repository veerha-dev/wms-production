import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class QcRepository {
  constructor(private db: DatabaseService) {}

  private mapRow(row: any) {
    if (!row) return null;
    return {
      id: row.id,
      tenantId: row.tenant_id,
      // Frontend expects inspectionNumber, we store qc_number
      inspectionNumber: row.qc_number,
      inspection_number: row.qc_number,
      qcNumber: row.qc_number,
      grnId: row.grn_id,
      skuId: row.sku_id,
      batchNumber: row.batch_number,
      status: row.status,
      result: row.result,
      inspectorId: row.inspector,
      inspector_id: row.inspector,
      quantityInspected: row.quantity_inspected,
      quantity_inspected: row.quantity_inspected,
      passedQuantity: row.quantity_passed,
      passed_quantity: row.quantity_passed,
      failedQuantity: row.quantity_failed,
      failed_quantity: row.quantity_failed,
      inspectedQuantity: row.quantity_inspected,
      inspected_quantity: row.quantity_inspected,
      defectCount: row.defect_count,
      notes: row.notes,
      resultNotes: row.notes,
      result_notes: row.notes,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      // Nested objects for frontend compatibility
      grn: row.grn_number ? { grnNumber: row.grn_number, grn_number: row.grn_number } : null,
      goods_receipt_notes: row.grn_number ? { grn_number: row.grn_number } : null,
      sku: row.sku_code ? { skuCode: row.sku_code, sku_code: row.sku_code, name: row.sku_name } : null,
      skus: row.sku_code ? { sku_code: row.sku_code, name: row.sku_name } : null,
    };
  }

  async findAll(tenantId: string, query: any): Promise<{ data: any[]; total: number }> {
    const { page: rawPage = 1, limit = 50, search, status } = query;
    const page = Math.max(1, rawPage || 1);
    const offset = (page - 1) * limit;
    const conditions: string[] = ['q.tenant_id = $1'];
    const params: any[] = [tenantId];
    let idx = 2;
    if (search) { conditions.push(`(q.qc_number ILIKE $${idx} OR sk.code ILIKE $${idx})`); params.push(`%${search}%`); idx++; }
    if (status) { conditions.push(`q.status = $${idx}`); params.push(status); idx++; }
    const where = conditions.join(' AND ');

    const countRes = await this.db.query(`SELECT COUNT(*) as count FROM qc_inspections q LEFT JOIN skus sk ON q.sku_id = sk.id WHERE ${where}`, params);
    const total = parseInt(countRes.rows[0].count, 10);

    const dataRes = await this.db.query(`
      SELECT q.*, g.grn_number, sk.code as sku_code, sk.name as sku_name
      FROM qc_inspections q
      LEFT JOIN grn g ON q.grn_id = g.id
      LEFT JOIN skus sk ON q.sku_id = sk.id
      WHERE ${where}
      ORDER BY q.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: dataRes.rows.map(r => this.mapRow(r)), total };
  }

  async findById(id: string, tenantId: string): Promise<any> {
    const res = await this.db.query(`
      SELECT q.*, g.grn_number, sk.code as sku_code, sk.name as sku_name
      FROM qc_inspections q
      LEFT JOIN grn g ON q.grn_id = g.id
      LEFT JOIN skus sk ON q.sku_id = sk.id
      WHERE q.id = $1 AND q.tenant_id = $2
    `, [id, tenantId]);
    return this.mapRow(res.rows[0]);
  }

  async countByTenant(tenantId: string): Promise<number> {
    const res = await this.db.query(`SELECT COUNT(*) as count FROM qc_inspections WHERE tenant_id = $1`, [tenantId]);
    return parseInt(res.rows[0].count, 10);
  }

  /**
   * Inspections carry no warehouse of their own — they inherit it from the GRN
   * they were raised against. Notifications need it, because a warehouse
   * manager must only ever see their own warehouse's QC failures.
   */
  async findNotifyContext(id: string, tenantId: string): Promise<{
    inspectionId: string;
    qcNumber: string | null;
    grnId: string | null;
    grnNumber: string | null;
    warehouseId: string | null;
    warehouseName: string | null;
    skuName: string | null;
    skuCode: string | null;
  } | null> {
    const res = await this.db.query(`
      SELECT q.id, q.qc_number, q.grn_id,
             g.grn_number, g.warehouse_id,
             w.name AS warehouse_name,
             sk.name AS sku_name, sk.code AS sku_code
      FROM qc_inspections q
      LEFT JOIN grn g ON q.grn_id = g.id
      LEFT JOIN warehouses w ON g.warehouse_id = w.id
      LEFT JOIN skus sk ON q.sku_id = sk.id
      WHERE q.id = $1 AND q.tenant_id = $2
    `, [id, tenantId]);
    const r = res.rows[0];
    if (!r) return null;
    return {
      inspectionId: r.id,
      qcNumber: r.qc_number,
      grnId: r.grn_id,
      grnNumber: r.grn_number,
      warehouseId: r.warehouse_id,
      warehouseName: r.warehouse_name,
      skuName: r.sku_name,
      skuCode: r.sku_code,
    };
  }

  async create(tenantId: string, dto: any): Promise<any> {
    const res = await this.db.query(
      `INSERT INTO qc_inspections (tenant_id, qc_number, grn_id, sku_id, batch_number, status, notes)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6) RETURNING *`,
      [tenantId, dto.qcNumber, dto.grnId || dto.grn_id || null, dto.skuId || dto.sku_id || null,
       dto.batchNumber || dto.batch_number || null, dto.notes || null],
    );
    return this.mapRow(res.rows[0]);
  }

  async update(id: string, tenantId: string, dto: any): Promise<any> {
    const updates: string[] = []; const params: any[] = []; let idx = 1;
    const fieldMap: Record<string, string> = {
      status: 'status', result: 'result', notes: 'notes',
      quantityInspected: 'quantity_inspected', quantity_inspected: 'quantity_inspected',
      quantityPassed: 'quantity_passed', quantity_passed: 'quantity_passed',
      quantityFailed: 'quantity_failed', quantity_failed: 'quantity_failed',
      defectCount: 'defect_count', defect_count: 'defect_count',
      startedAt: 'started_at', completedAt: 'completed_at',
    };
    for (const [key, col] of Object.entries(fieldMap)) {
      if (dto[key] !== undefined) { updates.push(`${col} = $${idx}`); params.push(dto[key]); idx++; }
    }
    if (updates.length === 0) return this.findById(id, tenantId);
    updates.push('updated_at = NOW()');
    params.push(id, tenantId);
    const res = await this.db.query(`UPDATE qc_inspections SET ${updates.join(', ')} WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`, params);
    // Re-fetch with JOINs
    return this.findById(id, tenantId);
  }

  async delete(id: string, tenantId: string): Promise<boolean> {
    const res = await this.db.query(`DELETE FROM qc_inspections WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    return (res.rowCount ?? 0) > 0;
  }

  async countByStatus(tenantId: string): Promise<any[]> {
    const res = await this.db.query(`SELECT status, COUNT(*) as count FROM qc_inspections WHERE tenant_id = $1 GROUP BY status`, [tenantId]);
    return res.rows;
  }

  async updateStatus(id: string, tenantId: string, status: string, extraFields?: Record<string, any>): Promise<any> {
    const sets = ['status = $1', 'updated_at = NOW()'];
    const params: any[] = [status];
    let idx = 2;
    if (extraFields) {
      for (const [k, v] of Object.entries(extraFields)) {
        const col = k.replace(/[A-Z]/g, (l: string) => '_' + l.toLowerCase());
        sets.push(`${col} = $${idx}`); params.push(v); idx++;
      }
    }
    params.push(id, tenantId);
    await this.db.query(`UPDATE qc_inspections SET ${sets.join(', ')} WHERE id = $${idx} AND tenant_id = $${idx + 1}`, params);
    return this.findById(id, tenantId);
  }
}
