import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class GrnRepository {
  constructor(private db: DatabaseService) {}

  async findAll(tenantId: string, query: any): Promise<{ data: any[]; total: number }> {
    const { page: rawPage = 1, limit = 50, search, status } = query;
    const page = Math.max(1, rawPage || 1);
    const offset = (page - 1) * limit;
    const conditions: string[] = ['g.tenant_id = $1'];
    const params: any[] = [tenantId];
    let idx = 2;
    if (search) { conditions.push(`(g.grn_number ILIKE $${idx} OR po.po_number ILIKE $${idx})`); params.push(`%${search}%`); idx++; }
    if (status) { conditions.push(`g.status = $${idx}`); params.push(status); idx++; }
    const where = conditions.join(' AND ');

    const countRes = await this.db.query(`SELECT COUNT(*) as count FROM grn g LEFT JOIN purchase_orders po ON g.po_id = po.id WHERE ${where}`, params);
    const total = parseInt(countRes.rows[0].count, 10);

    const dataRes = await this.db.query(`
      SELECT g.*, po.po_number, s.name as supplier_name,
             (SELECT count(*) FROM grn_items WHERE grn_id = g.id) as item_count
      FROM grn g
      LEFT JOIN purchase_orders po ON g.po_id = po.id
      LEFT JOIN suppliers s ON po.supplier_id = s.id
      WHERE ${where}
      ORDER BY g.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: dataRes.rows.map(r => this.mapRow(r)), total };
  }

  async findById(id: string, tenantId: string): Promise<any> {
    const grnRes = await this.db.query(`
      SELECT g.*, po.po_number, s.name as supplier_name
      FROM grn g
      LEFT JOIN purchase_orders po ON g.po_id = po.id
      LEFT JOIN suppliers s ON po.supplier_id = s.id
      WHERE g.id = $1 AND g.tenant_id = $2
    `, [id, tenantId]);
    if (!grnRes.rows[0]) return null;

    const itemsRes = await this.db.query(`
      SELECT gi.*, sk.code as sku_code, sk.name as sku_name
      FROM grn_items gi
      LEFT JOIN skus sk ON gi.sku_id = sk.id
      WHERE gi.grn_id = $1
      ORDER BY gi.created_at
    `, [id]);

    const grn: any = this.mapRow(grnRes.rows[0]);
    grn.items = itemsRes.rows.map((r: any) => ({
      id: r.id,
      grnId: r.grn_id,
      skuId: r.sku_id,
      skuCode: r.sku_code,
      skuName: r.sku_name,
      quantityExpected: r.quantity_expected,
      quantityReceived: r.quantity_received,
      batchNumber: r.batch_number,
      expiryDate: r.expiry_date,
      condition: r.condition,
      notes: r.notes,
    }));

    return grn;
  }

  async countByTenant(tenantId: string): Promise<number> {
    const res = await this.db.query(`SELECT COUNT(*) as count FROM grn WHERE tenant_id = $1`, [tenantId]);
    return parseInt(res.rows[0].count, 10);
  }

  async create(tenantId: string, dto: any): Promise<any> {
    const poId = dto.poId || dto.purchase_order_id || dto.po_id || null;
    const warehouseId = dto.warehouseId || dto.warehouse_id || null;
    const grnNumber = dto.grnNumber || dto.grn_number;
    const receivedDate = dto.receivedDate || dto.received_date || new Date().toISOString();
    const notes = dto.notes || null;

    return this.db.transaction(async (client) => {
      // Insert GRN header
      const grnRes = await client.query(
        `INSERT INTO grn (tenant_id, grn_number, po_id, warehouse_id, status, received_date, notes)
         VALUES ($1, $2, $3, $4, 'pending', $5, $6) RETURNING *`,
        [tenantId, grnNumber, poId, warehouseId, receivedDate, notes],
      );
      const grn = grnRes.rows[0];

      // Auto-create GRN items from PO items if PO is linked
      if (poId) {
        const poItems = await client.query(
          `SELECT poi.sku_id, poi.quantity_ordered, poi.unit_price, sk.code as sku_code
           FROM purchase_order_items poi
           LEFT JOIN skus sk ON poi.sku_id = sk.id
           WHERE poi.po_id = $1`,
          [poId],
        );

        for (const item of poItems.rows) {
          await client.query(
            `INSERT INTO grn_items (grn_id, sku_id, quantity_expected, quantity_received, condition)
             VALUES ($1, $2, $3, 0, 'good')`,
            [grn.id, item.sku_id, item.quantity_ordered],
          );
        }
      }

      return this.mapRow(grn);
    });
  }

  async update(id: string, tenantId: string, dto: any): Promise<any> {
    const updates: string[] = []; const params: any[] = []; let idx = 1;
    const fieldMap: Record<string, string> = {
      notes: 'notes', status: 'status',
      receivedDate: 'received_date', received_date: 'received_date',
    };
    for (const [key, col] of Object.entries(fieldMap)) {
      if (dto[key] !== undefined) { updates.push(`${col} = $${idx}`); params.push(dto[key]); idx++; }
    }
    if (updates.length === 0) return this.findById(id, tenantId);
    updates.push('updated_at = NOW()');
    params.push(id, tenantId);
    const res = await this.db.query(`UPDATE grn SET ${updates.join(', ')} WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`, params);
    return this.mapRow(res.rows[0]);
  }

  async delete(id: string, tenantId: string): Promise<boolean> {
    const res = await this.db.query(`DELETE FROM grn WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    return (res.rowCount ?? 0) > 0;
  }

  async countByStatus(tenantId: string): Promise<any[]> {
    const res = await this.db.query(`SELECT status, COUNT(*) as count FROM grn WHERE tenant_id = $1 GROUP BY status`, [tenantId]);
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
    const res = await this.db.query(`UPDATE grn SET ${sets.join(', ')} WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`, params);
    return this.mapRow(res.rows[0]);
  }

  async updateItem(grnId: string, itemId: string, dto: any): Promise<any> {
    const updates: string[] = [];
    const params: any[] = [];
    let idx = 1;

    const fieldMap: Record<string, string> = {
      received_quantity: 'quantity_received',
      receivedQuantity: 'quantity_received',
      quantity_received: 'quantity_received',
      quantityReceived: 'quantity_received',
      
      batch_number: 'batch_number',
      batchNumber: 'batch_number',
      
      expiry_date: 'expiry_date',
      expiryDate: 'expiry_date',
      
      condition: 'condition',
      notes: 'notes',
    };

    for (const [key, col] of Object.entries(fieldMap)) {
      if (dto[key] !== undefined) {
        updates.push(`${col} = $${idx}`);
        params.push(dto[key] === '' ? null : dto[key]);
        idx++;
      }
    }

    if (updates.length === 0) {
      return this.findItemById(itemId);
    }

    params.push(itemId, grnId);
    
    await this.db.query(
      `UPDATE grn_items 
       SET ${updates.join(', ')} 
       WHERE id = $${idx} AND grn_id = $${idx + 1}`,
      params,
    );

    return this.findItemById(itemId);
  }

  async findItemById(itemId: string): Promise<any> {
    const res = await this.db.query(
      `SELECT gi.*, sk.code as sku_code, sk.name as sku_name
       FROM grn_items gi
       LEFT JOIN skus sk ON gi.sku_id = sk.id
       WHERE gi.id = $1`,
      [itemId]
    );
    const r = res.rows[0];
    if (!r) return null;
    return {
      id: r.id,
      grnId: r.grn_id,
      skuId: r.sku_id,
      skuCode: r.sku_code,
      skuName: r.sku_name,
      quantityExpected: r.quantity_expected,
      quantityReceived: r.quantity_received,
      batchNumber: r.batch_number,
      expiryDate: r.expiry_date,
      condition: r.condition,
      notes: r.notes,
    };
  }

  private mapRow(row: any) {
    if (!row) return null;
    return {
      id: row.id,
      tenantId: row.tenant_id,
      grnNumber: row.grn_number,
      grn_number: row.grn_number,
      poId: row.po_id,
      warehouseId: row.warehouse_id,
      status: row.status,
      receivedDate: row.received_date,
      received_date: row.received_date,
      notes: row.notes,
      // Nested objects for frontend compatibility
      purchaseOrder: row.po_number ? { poNumber: row.po_number, supplier: { name: row.supplier_name } } : null,
      purchase_orders: row.po_number ? { po_number: row.po_number, supplier_name: row.supplier_name } : null,
      _count: { items: row.item_count ? parseInt(row.item_count) : 0 },
      // Flat fields (also kept for API consumers)
      poNumber: row.po_number,
      supplierName: row.supplier_name,
      itemCount: row.item_count ? parseInt(row.item_count) : 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
