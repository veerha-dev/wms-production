import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class ShipmentsRepository {
  constructor(private db: DatabaseService) {}

  private mapRow(row: any) {
    if (!row) return null;
    return {
      id: row.id,
      tenantId: row.tenant_id,
      shipmentNumber: row.shipment_number,
      shipment_number: row.shipment_number,
      soId: row.so_id,
      warehouseId: row.warehouse_id,
      carrier: row.carrier,
      carrierName: row.carrier,
      carrier_name: row.carrier,
      trackingNumber: row.tracking_number,
      tracking_number: row.tracking_number,
      status: row.status,
      shippingAddress: row.shipping_address,
      weight: row.weight ? parseFloat(row.weight) : null,
      dispatchedAt: row.dispatched_at,
      dispatchDate: row.dispatched_at,
      shipped_date: row.dispatched_at,
      deliveredAt: row.delivered_at,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      // Nested objects for frontend
      salesOrder: row.so_number ? {
        orderNumber: row.so_number,
        soNumber: row.so_number,
        customer: { name: row.customer_name || '-' },
      } : null,
      sales_orders: row.so_number ? {
        order_number: row.so_number,
        customer_name: row.customer_name,
      } : null,
    };
  }

  async findAll(tenantId: string, query: any): Promise<{ data: any[]; total: number }> {
    const { page: rawPage = 1, limit = 50, search, status } = query;
    const page = Math.max(1, rawPage || 1);
    const offset = (page - 1) * limit;
    const conditions: string[] = ['sh.tenant_id = $1'];
    const params: any[] = [tenantId];
    let idx = 2;
    if (search) { conditions.push(`(sh.shipment_number ILIKE $${idx} OR sh.carrier ILIKE $${idx})`); params.push(`%${search}%`); idx++; }
    if (status) { conditions.push(`sh.status = $${idx}`); params.push(status); idx++; }
    const where = conditions.join(' AND ');

    const countRes = await this.db.query(`SELECT COUNT(*) as count FROM shipments sh WHERE ${where}`, params);
    const total = parseInt(countRes.rows[0].count, 10);

    const dataRes = await this.db.query(`
      SELECT sh.*, so.so_number, c.name as customer_name
      FROM shipments sh
      LEFT JOIN sales_orders so ON sh.so_id = so.id
      LEFT JOIN customers c ON so.customer_id = c.id
      WHERE ${where}
      ORDER BY sh.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: dataRes.rows.map(r => this.mapRow(r)), total };
  }

  async findById(id: string, tenantId: string): Promise<any> {
    const res = await this.db.query(`
      SELECT sh.*, so.so_number, c.name as customer_name
      FROM shipments sh
      LEFT JOIN sales_orders so ON sh.so_id = so.id
      LEFT JOIN customers c ON so.customer_id = c.id
      WHERE sh.id = $1 AND sh.tenant_id = $2
    `, [id, tenantId]);
    return this.mapRow(res.rows[0]);
  }

  async countByTenant(tenantId: string): Promise<number> {
    const res = await this.db.query(`SELECT COUNT(*) as count FROM shipments WHERE tenant_id = $1`, [tenantId]);
    return parseInt(res.rows[0].count, 10);
  }

  async create(tenantId: string, dto: any): Promise<any> {
    const shipmentNumber = dto.shipmentNumber || dto.shipment_number;
    const soId = dto.soId || dto.so_id || dto.order_id || null;
    const warehouseId = dto.warehouseId || dto.warehouse_id || null;
    const carrier = dto.carrier || dto.carrier_name || dto.carrierName || null;
    const trackingNumber = dto.trackingNumber || dto.tracking_number || null;
    const weight = dto.weight || dto.total_weight || null;
    const notes = dto.notes || null;

    const res = await this.db.query(
      `INSERT INTO shipments (tenant_id, shipment_number, so_id, warehouse_id, carrier, tracking_number, status, weight, notes)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8) RETURNING *`,
      [tenantId, shipmentNumber, soId, warehouseId, carrier, trackingNumber, weight, notes],
    );
    return this.findById(res.rows[0].id, tenantId);
  }

  /**
   * What packing measured for an order: total weight, box count, and the
   * tracking number the packer recorded. The courier prices on these, so a
   * shipment created after packing inherits them instead of asking a dispatcher
   * to weigh a sealed box a second time.
   */
  async findPackingTotals(tenantId: string, soId: string): Promise<{
    weightKg: number | null;
    packageCount: number;
    carrier: string | null;
    trackingNumber: string | null;
  } | null> {
    const res = await this.db.query(
      `SELECT ps.carrier,
              ps.tracking_number,
              COUNT(pp.id)::int AS package_count,
              COALESCE(SUM(pp.weight_kg), 0) AS weight_kg
         FROM packing_sessions ps
         LEFT JOIN packing_packages pp ON pp.packing_session_id = ps.id
        WHERE ps.tenant_id = $1 AND ps.so_id = $2 AND ps.status <> 'cancelled'
        GROUP BY ps.id, ps.carrier, ps.tracking_number
        LIMIT 1`,
      [tenantId, soId],
    );
    const r = res.rows[0];
    if (!r) return null;
    const weight = Number(r.weight_kg);
    return {
      weightKg: weight > 0 ? weight : null,
      packageCount: r.package_count ?? 0,
      carrier: r.carrier ?? null,
      trackingNumber: r.tracking_number ?? null,
    };
  }

  async update(id: string, tenantId: string, dto: any): Promise<any> {
    const updates: string[] = []; const params: any[] = []; let idx = 1;
    const fieldMap: Record<string, string> = {
      carrier: 'carrier', carrier_name: 'carrier', carrierName: 'carrier',
      trackingNumber: 'tracking_number', tracking_number: 'tracking_number',
      shippingAddress: 'shipping_address', weight: 'weight',
      notes: 'notes', status: 'status',
    };
    for (const [key, col] of Object.entries(fieldMap)) {
      if (dto[key] !== undefined) { updates.push(`${col} = $${idx}`); params.push(dto[key]); idx++; }
    }
    if (updates.length === 0) return this.findById(id, tenantId);
    updates.push('updated_at = NOW()');
    params.push(id, tenantId);
    await this.db.query(`UPDATE shipments SET ${updates.join(', ')} WHERE id = $${idx} AND tenant_id = $${idx + 1}`, params);
    return this.findById(id, tenantId);
  }

  async delete(id: string, tenantId: string): Promise<boolean> {
    const res = await this.db.query(`DELETE FROM shipments WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    return (res.rowCount ?? 0) > 0;
  }

  async countByStatus(tenantId: string): Promise<any[]> {
    const res = await this.db.query(`SELECT status, COUNT(*) as count FROM shipments WHERE tenant_id = $1 GROUP BY status`, [tenantId]);
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
    await this.db.query(`UPDATE shipments SET ${sets.join(', ')} WHERE id = $${idx} AND tenant_id = $${idx + 1}`, params);
    return this.findById(id, tenantId);
  }
}
