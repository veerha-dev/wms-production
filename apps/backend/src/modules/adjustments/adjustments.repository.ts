import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { QueryAdjustmentDto } from './dto';

@Injectable()
export class AdjustmentsRepository {
  constructor(private db: DatabaseService) {}

  async findAll(tenantId: string, query: QueryAdjustmentDto) {
    const { page = 1, limit = 50, search, status, type, sortBy = 'created_at', sortOrder = 'DESC' } = query;
    const offset = (page - 1) * limit;
    const params: any[] = [tenantId];
    const conditions: string[] = ['a.tenant_id = $1'];
    let paramIndex = 2;

    if (search) {
      conditions.push(`(a.adjustment_number ILIKE $${paramIndex} OR a.reason ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }
    if (status) {
      conditions.push(`a.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }
    if (type) {
      conditions.push(`a.adjustment_type = $${paramIndex}`);
      params.push(type);
      paramIndex++;
    }

    // API field name → real column (013_create_adjustments.sql).
    const sortColumns: Record<string, string> = {
      adjustment_number: 'adjustment_number',
      type: 'adjustment_type',
      adjustment_type: 'adjustment_type',
      status: 'status',
      quantity: 'adjustment_qty',
      adjustment_qty: 'adjustment_qty',
      created_at: 'created_at',
      requested_at: 'requested_at',
    };
    const safeSort = sortColumns[sortBy] ?? 'created_at';
    const safeOrder = sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const where = conditions.join(' AND ');

    const countResult = await this.db.query(`SELECT COUNT(*) FROM stock_adjustments a WHERE ${where}`, params);
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await this.db.query(
      `SELECT a.* FROM stock_adjustments a WHERE ${where} ORDER BY a.${safeSort} ${safeOrder} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset],
    );

    return { data: dataResult.rows.map(this.mapRow), total };
  }

  async findById(tenantId: string, id: string) {
    const result = await this.db.query('SELECT * FROM stock_adjustments WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async getNextCode(tenantId: string): Promise<string> {
    const result = await this.db.query(
      `SELECT adjustment_number FROM stock_adjustments WHERE tenant_id = $1 AND adjustment_number LIKE 'ADJ-%' ORDER BY adjustment_number DESC LIMIT 1`,
      [tenantId],
    );
    if (result.rows.length === 0) return 'ADJ-001';
    const lastNum = parseInt(result.rows[0].adjustment_number.replace('ADJ-', ''), 10);
    return `ADJ-${String(lastNum + 1).padStart(3, '0')}`;
  }

  async create(tenantId: string, data: any) {
    const result = await this.db.query(
      `INSERT INTO stock_adjustments (tenant_id, adjustment_number, adjustment_type, sku_id, sku_code, sku_name, warehouse_id, location_id, location, adjustment_qty, reason, reason_category, status, requested_by, requested_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
       RETURNING *`,
      [
        tenantId,
        data.adjustmentNumber,
        data.type || 'manual',
        data.skuId,
        data.skuCode || '',
        data.skuName || '',
        data.warehouseId || null,
        data.binId || null,
        data.location || 'Warehouse',
        data.quantity,
        data.reason || 'Stock adjustment',
        data.reasonCategory || null,
        'pending',
        data.requestedBy || null,
      ],
    );
    return this.mapRow(result.rows[0]);
  }

  async update(tenantId: string, id: string, data: any) {
    const fields: string[] = [];
    const params: any[] = [id, tenantId];
    let idx = 3;

    // DTO field → real column. `stock_adjustments` has no `type`, `quantity`,
    // `bin_id` or `notes` column: the bin FK is `location_id`, and the type and
    // quantity are `adjustment_type` / `adjustment_qty`. `notes` has no column
    // at all, so it is not persisted (the free-text field is `reason`).
    const mappings: Record<string, string> = {
      type: 'adjustment_type',
      skuId: 'sku_id',
      warehouseId: 'warehouse_id',
      binId: 'location_id',
      quantity: 'adjustment_qty',
      reason: 'reason',
    };

    for (const [key, col] of Object.entries(mappings)) {
      if (data[key] !== undefined) {
        fields.push(`${col} = $${idx}`);
        params.push(data[key]);
        idx++;
      }
    }

    if (fields.length === 0) return this.findById(tenantId, id);

    fields.push('updated_at = NOW()');
    const result = await this.db.query(
      `UPDATE stock_adjustments SET ${fields.join(', ')} WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      params,
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async delete(tenantId: string, id: string) {
    const result = await this.db.query('DELETE FROM stock_adjustments WHERE id = $1 AND tenant_id = $2 RETURNING id', [id, tenantId]);
    return (result.rowCount ?? 0) > 0;
  }

  async approve(tenantId: string, id: string, approvedBy?: string) {
    const result = await this.db.query(
      `UPDATE stock_adjustments SET status = 'approved', approved_by = $3, approved_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId, approvedBy || null],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async reject(tenantId: string, id: string, approvedBy?: string) {
    const result = await this.db.query(
      `UPDATE stock_adjustments SET status = 'rejected', approved_by = $3, approved_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId, approvedBy || null],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Column names follow 013_create_adjustments.sql. `quantity` in particular is
   * stored as `adjustment_qty`; reading the non-existent `row.quantity` made
   * every mapped adjustment report `quantity: undefined`, which silently
   * disarmed the manager approval threshold in AdjustmentsService.approve()
   * (`Number(existing.quantity ?? 0)` collapsed to 0, and `0 > 100` is false,
   * so a manager could approve any adjustment however large).
   */
  private mapRow(row: any) {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      adjustmentNumber: row.adjustment_number,
      type: row.adjustment_type,
      skuId: row.sku_id,
      skuCode: row.sku_code,
      skuName: row.sku_name,
      warehouseId: row.warehouse_id,
      binId: row.location_id,
      location: row.location,
      quantity: row.adjustment_qty,
      quantityBefore: row.quantity_before,
      quantityAfter: row.quantity_after,
      reason: row.reason,
      reasonCategory: row.reason_category,
      status: row.status,
      requestedBy: row.requested_by,
      approvedBy: row.approved_by,
      requestedAt: row.requested_at,
      approvedAt: row.approved_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
