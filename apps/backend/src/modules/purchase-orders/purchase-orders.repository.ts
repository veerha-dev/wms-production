import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class PurchaseOrdersRepository {
  constructor(private db: DatabaseService) {}

  async findAll(tenantId: string, query: any): Promise<{ data: any[]; total: number }> {
    const { page: rawPage = 1, limit = 50, search, status } = query;
    const page = Math.max(1, rawPage || 1);
    const offset = (page - 1) * limit;
    const conditions: string[] = ['po.tenant_id = $1'];
    const params: any[] = [tenantId];
    let idx = 2;
    if (search) { conditions.push(`(s.name ILIKE $${idx} OR po.po_number ILIKE $${idx})`); params.push(`%${search}%`); idx++; }
    if (status) { conditions.push(`po.status = $${idx}`); params.push(status); idx++; }
    const where = conditions.join(' AND ');

    const countRes = await this.db.query(`SELECT COUNT(*) as count FROM purchase_orders po LEFT JOIN suppliers s ON po.supplier_id = s.id WHERE ${where}`, params);
    const total = parseInt(countRes.rows[0].count, 10);

    const dataRes = await this.db.query(`
      SELECT po.*, s.name as supplier_name, s.code as supplier_code, w.name as warehouse_name,
             (SELECT count(*) FROM purchase_order_items WHERE po_id = po.id) as item_count,
             (SELECT COALESCE(sum(quantity_ordered * unit_price), 0) FROM purchase_order_items WHERE po_id = po.id) as calculated_total
      FROM purchase_orders po
      LEFT JOIN suppliers s ON po.supplier_id = s.id
      LEFT JOIN warehouses w ON po.warehouse_id = w.id
      WHERE ${where}
      ORDER BY po.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: dataRes.rows, total };
  }

  async findById(id: string, tenantId: string): Promise<any> {
    const poRes = await this.db.query(`
      SELECT po.*, s.name as supplier_name, s.code as supplier_code, w.name as warehouse_name
      FROM purchase_orders po
      LEFT JOIN suppliers s ON po.supplier_id = s.id
      LEFT JOIN warehouses w ON po.warehouse_id = w.id
      WHERE po.id = $1 AND po.tenant_id = $2
    `, [id, tenantId]);

    if (!poRes.rows[0]) return null;

    const itemsRes = await this.db.query(`
      SELECT poi.*, sk.code as sku_code, sk.name as sku_name
      FROM purchase_order_items poi
      LEFT JOIN skus sk ON poi.sku_id = sk.id
      WHERE poi.po_id = $1
      ORDER BY poi.created_at
    `, [id]);

    return { ...poRes.rows[0], items: itemsRes.rows };
  }

  async countByTenant(tenantId: string): Promise<number> {
    const res = await this.db.query(`SELECT COUNT(*) as count FROM purchase_orders WHERE tenant_id = $1`, [tenantId]);
    return parseInt(res.rows[0].count, 10);
  }

  async create(tenantId: string, dto: any): Promise<any> {
    return this.db.transaction(async (client) => {
      // Insert PO header
      const poRes = await client.query(
        `INSERT INTO purchase_orders (tenant_id, po_number, supplier_id, warehouse_id, status, expected_date, total_amount, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [tenantId, dto.poNumber, dto.supplierId || dto.supplier_id, dto.warehouseId || dto.warehouse_id,
         'draft', dto.expectedDate || dto.expected_date || null, dto.totalAmount || dto.total_amount || 0, dto.notes || null, dto.createdBy || dto.created_by || null],
      );
      const po = poRes.rows[0];

      // Insert line items if provided
      const items = dto.items || [];
      const insertedItems: any[] = [];
      let totalAmount = 0;

      for (const item of items) {
        const itemRes = await client.query(
          `INSERT INTO purchase_order_items (po_id, sku_id, quantity_ordered, unit_price)
           VALUES ($1, $2, $3, $4) RETURNING *`,
          [po.id, item.skuId || item.sku_id, item.quantity || item.quantityOrdered || 0, item.unitCost || item.unitPrice || item.unit_price || 0],
        );
        insertedItems.push(itemRes.rows[0]);
        totalAmount += (item.quantity || item.quantityOrdered || 0) * (item.unitCost || item.unitPrice || item.unit_price || 0);
      }

      // Update total amount
      if (totalAmount > 0) {
        await client.query(`UPDATE purchase_orders SET total_amount = $1 WHERE id = $2`, [totalAmount, po.id]);
        po.total_amount = totalAmount;
      }

      return { ...po, items: insertedItems };
    });
  }

  async update(id: string, tenantId: string, dto: any): Promise<any> {
    const updates: string[] = []; const params: any[] = []; let idx = 1;
    const fieldMap: Record<string, string> = {
      supplierId: 'supplier_id', supplier_id: 'supplier_id',
      warehouseId: 'warehouse_id', warehouse_id: 'warehouse_id',
      expectedDate: 'expected_date', expected_date: 'expected_date',
      totalAmount: 'total_amount', total_amount: 'total_amount',
      notes: 'notes',
    };
    for (const [key, col] of Object.entries(fieldMap)) {
      if (dto[key] !== undefined) { updates.push(`${col} = $${idx}`); params.push(dto[key]); idx++; }
    }
    if (updates.length === 0) return this.findById(id, tenantId);
    updates.push('updated_at = NOW()');
    params.push(id, tenantId);
    const res = await this.db.query(`UPDATE purchase_orders SET ${updates.join(', ')} WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`, params);
    return res.rows[0] || null;
  }

  async delete(id: string, tenantId: string): Promise<boolean> {
    const res = await this.db.query(`DELETE FROM purchase_orders WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    return (res.rowCount ?? 0) > 0;
  }

  async countByStatus(tenantId: string): Promise<any[]> {
    const res = await this.db.query(`SELECT status, COUNT(*) as count FROM purchase_orders WHERE tenant_id = $1 GROUP BY status`, [tenantId]);
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
    const res = await this.db.query(`UPDATE purchase_orders SET ${sets.join(', ')} WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`, params);
    return res.rows[0] || null;
  }

  async getApprovalRule(tenantId: string, moduleName: string): Promise<any> {
    const res = await this.db.query(
      `SELECT * FROM approval_rules WHERE tenant_id = $1 AND module = $2`,
      [tenantId, moduleName],
    );
    return res.rows[0] || null;
  }
}
