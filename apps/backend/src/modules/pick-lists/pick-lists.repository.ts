import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class PickListsRepository {
  constructor(private db: DatabaseService) {}

  async findAll(tenantId: string, query: any): Promise<{ data: any[]; total: number }> {
    const { page = 1, limit = 50, search, status, strategy, warehouseId } = query;
    const offset = (page - 1) * limit;
    const conditions: string[] = ['pl.tenant_id = $1'];
    const params: any[] = [tenantId];
    let idx = 2;

    if (search) { conditions.push(`(pl.pick_list_number ILIKE $${idx} OR pl.notes ILIKE $${idx})`); params.push(`%${search}%`); idx++; }
    if (status) { conditions.push(`pl.status = $${idx}`); params.push(status); idx++; }
    if (strategy) { conditions.push(`pl.strategy = $${idx}`); params.push(strategy); idx++; }
    if (warehouseId) { conditions.push(`pl.warehouse_id = $${idx}`); params.push(warehouseId); idx++; }

    const where = conditions.join(' AND ');
    const countRes = await this.db.query(`SELECT COUNT(*) FROM pick_lists pl WHERE ${where}`, params);
    const total = parseInt(countRes.rows[0].count, 10);

    const dataRes = await this.db.query(
      `SELECT pl.*, w.name as warehouse_name, u.full_name as assignee_name,
              so.so_number,
              (SELECT COUNT(*) FROM pick_list_items WHERE pick_list_id = pl.id) as item_count,
              (SELECT COALESCE(SUM(quantity_picked),0) FROM pick_list_items WHERE pick_list_id = pl.id) as total_picked,
              (SELECT COALESCE(SUM(quantity_required),0) FROM pick_list_items WHERE pick_list_id = pl.id) as total_required
       FROM pick_lists pl
       LEFT JOIN warehouses w ON pl.warehouse_id = w.id
       LEFT JOIN users u ON pl.assigned_to = u.id
       LEFT JOIN sales_orders so ON pl.so_id = so.id
       WHERE ${where} ORDER BY pl.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset],
    );

    return { data: dataRes.rows.map(this.mapRow), total };
  }

  async findById(id: string, tenantId: string): Promise<any> {
    const res = await this.db.query(
      `SELECT pl.*, w.name as warehouse_name, u.full_name as assignee_name, so.so_number
       FROM pick_lists pl
       LEFT JOIN warehouses w ON pl.warehouse_id = w.id
       LEFT JOIN users u ON pl.assigned_to = u.id
       LEFT JOIN sales_orders so ON pl.so_id = so.id
       WHERE pl.id = $1 AND pl.tenant_id = $2`,
      [id, tenantId],
    );
    if (!res.rows[0]) return null;
    const pl = this.mapRow(res.rows[0]);

    // Fetch items with bin/SKU details
    const items = await this.db.query(
      `SELECT pli.*, s.code as sku_code, s.name as sku_name, b.code as bin_code, so2.so_number as item_so_number
       FROM pick_list_items pli
       LEFT JOIN skus s ON pli.sku_id = s.id
       LEFT JOIN bins b ON pli.bin_id = b.id
       LEFT JOIN sales_orders so2 ON pli.so_id = so2.id
       WHERE pli.pick_list_id = $1
       ORDER BY b.code, s.code`,
      [id],
    );
    pl.items = items.rows.map((r: any) => ({
      id: r.id, pickListId: r.pick_list_id,
      skuId: r.sku_id, skuCode: r.sku_code, skuName: r.sku_name,
      binId: r.bin_id, binCode: r.bin_code,
      soId: r.so_id, soNumber: r.item_so_number,
      toteCode: r.tote_code,
      quantityRequired: parseInt(r.quantity_required, 10),
      quantityPicked: parseInt(r.quantity_picked, 10),
      status: r.status,
    }));
    return pl;
  }

  async countByTenant(tenantId: string): Promise<number> {
    const res = await this.db.query(`SELECT COUNT(*) FROM pick_lists WHERE tenant_id = $1`, [tenantId]);
    return parseInt(res.rows[0].count, 10);
  }

  async create(tenantId: string, dto: any): Promise<any> {
    const res = await this.db.query(
      `INSERT INTO pick_lists (tenant_id, pick_list_number, so_id, warehouse_id, strategy, priority, batch_size, wave_id, assigned_to, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        tenantId, dto.pickListNumber, dto.soId || null, dto.warehouseId || null,
        dto.strategy || 'single', dto.priority || 'medium', dto.batchSize || null,
        dto.waveId || null, dto.assignedTo || null, dto.notes || null,
        dto.status || 'pending',
      ],
    );
    return this.mapRow(res.rows[0]);
  }

  async createItems(pickListId: string, items: any[]) {
    if (items.length === 0) return;
    const values: string[] = [];
    const params: any[] = [];
    let idx = 1;
    for (const item of items) {
      values.push(`($${idx},$${idx+1},$${idx+2},$${idx+3},$${idx+4},$${idx+5})`);
      params.push(
        pickListId,
        item.skuId,
        item.binId || null,
        item.quantityRequired,
        item.soId || null,
        item.toteCode || null,
      );
      idx += 6;
    }
    await this.db.query(
      `INSERT INTO pick_list_items (pick_list_id, sku_id, bin_id, quantity_required, so_id, tote_code)
       VALUES ${values.join(',')}`,
      params,
    );
  }

  async findSalesOrderItems(tenantId: string, orderIds: string[]) {
    if (orderIds.length === 0) return [];
    const placeholders = orderIds.map((_, i) => `$${i + 2}`).join(',');
    const res = await this.db.query(
      `SELECT soi.*, s.code as sku_code, s.name as sku_name, so.so_number, so.warehouse_id
       FROM sales_order_items soi
       JOIN sales_orders so ON soi.so_id = so.id
       JOIN skus s ON soi.sku_id = s.id
       WHERE so.tenant_id = $1 AND soi.so_id IN (${placeholders})
       ORDER BY s.code`,
      [tenantId, ...orderIds],
    );
    return res.rows.map((r: any) => ({
      id: r.id, soId: r.so_id, soNumber: r.so_number,
      skuId: r.sku_id, skuCode: r.sku_code, skuName: r.sku_name,
      quantityOrdered: parseInt(r.quantity_ordered, 10),
      quantityPicked: parseInt(r.quantity_picked || 0, 10),
      warehouseId: r.warehouse_id,
    }));
  }

  async findAvailableStock(tenantId: string, skuId: string, warehouseId: string) {
    const res = await this.db.query(
      `SELECT sl.bin_id, b.code as bin_code, sl.quantity_available,
              b.zone_id, b.level, b.position
       FROM stock_levels sl
       JOIN bins b ON sl.bin_id = b.id
       WHERE sl.tenant_id = $1 AND sl.sku_id = $2 AND sl.warehouse_id = $3
             AND sl.quantity_available > 0
       ORDER BY b.zone_id, b.level, b.position`,
      [tenantId, skuId, warehouseId],
    );
    return res.rows.map((r: any) => ({
      binId: r.bin_id, binCode: r.bin_code,
      available: parseInt(r.quantity_available, 10),
    }));
  }

  async update(id: string, tenantId: string, dto: any): Promise<any> {
    const updates: string[] = []; const params: any[] = []; let idx = 1;
    for (const [key, val] of Object.entries(dto)) {
      if (val !== undefined) {
        const col = key.replace(/[A-Z]/g, l => '_' + l.toLowerCase());
        updates.push(`${col} = $${idx}`); params.push(val); idx++;
      }
    }
    if (updates.length === 0) return this.findById(id, tenantId);
    updates.push('updated_at = NOW()');
    params.push(id, tenantId);
    const res = await this.db.query(`UPDATE pick_lists SET ${updates.join(', ')} WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`, params);
    return res.rows[0] ? this.mapRow(res.rows[0]) : null;
  }

  async delete(id: string, tenantId: string): Promise<boolean> {
    const res = await this.db.query(`DELETE FROM pick_lists WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    return (res.rowCount ?? 0) > 0;
  }

  async countByStatus(tenantId: string): Promise<any[]> {
    const res = await this.db.query(`SELECT status, COUNT(*) as count FROM pick_lists WHERE tenant_id = $1 GROUP BY status`, [tenantId]);
    return res.rows;
  }

  async updateStatus(id: string, tenantId: string, status: string, extraFields?: Record<string, any>): Promise<any> {
    const sets = ['status = $1', 'updated_at = NOW()'];
    const params: any[] = [status];
    let idx = 2;
    if (extraFields) {
      for (const [k, v] of Object.entries(extraFields)) {
        const col = k.replace(/[A-Z]/g, l => '_' + l.toLowerCase());
        sets.push(`${col} = $${idx}`); params.push(v); idx++;
      }
    }
    params.push(id, tenantId);
    const res = await this.db.query(`UPDATE pick_lists SET ${sets.join(', ')} WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`, params);
    return res.rows[0] ? this.mapRow(res.rows[0]) : null;
  }

  private mapRow(row: any) {
    return {
      id: row.id, tenantId: row.tenant_id,
      pickListNumber: row.pick_list_number,
      soId: row.so_id, soNumber: row.so_number || null,
      warehouseId: row.warehouse_id, warehouseName: row.warehouse_name || null,
      strategy: row.strategy || 'single',
      priority: row.priority || 'medium',
      batchSize: row.batch_size,
      waveId: row.wave_id,
      status: row.status,
      assignedTo: row.assigned_to, assigneeName: row.assignee_name || null,
      notes: row.notes,
      startedAt: row.started_at, completedAt: row.completed_at,
      itemCount: parseInt(row.item_count || 0, 10),
      totalPicked: parseInt(row.total_picked || 0, 10),
      totalRequired: parseInt(row.total_required || 0, 10),
      createdAt: row.created_at, updatedAt: row.updated_at,
      items: [] as any[],
    };
  }
}
