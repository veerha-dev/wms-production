import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class SalesOrdersRepository {
  constructor(private db: DatabaseService) {}

  private mapRow(row: any) {
    if (!row) return null;
    return {
      id: row.id,
      tenantId: row.tenant_id,
      soNumber: row.so_number,
      orderNumber: row.so_number,
      order_number: row.so_number,
      customerId: row.customer_id,
      warehouseId: row.warehouse_id,
      status: row.status,
      shippingAddress: row.shipping_address,
      shippingAddressId: row.shipping_address_id ?? null,
      // Snapshot of the customer as they were when the order was placed —
      // editing the customer later must not rewrite historical documents.
      customerGstin: row.customer_gstin ?? null,
      customerPhone: row.customer_phone ?? null,
      customerEmail: row.customer_email ?? null,
      customerState: row.customer_state ?? null,
      billingAddress: row.billing_address ?? null,
      paymentTerms: row.payment_terms ?? null,
      totalAmount: row.total_amount ? parseFloat(row.total_amount) : 0,
      total_value: row.total_amount ? parseFloat(row.total_amount) : 0,
      notes: row.notes,
      confirmedAt: row.confirmed_at,
      orderDate: row.created_at,
      order_date: row.created_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      // Joined fields
      customerName: row.customer_name,
      customer_name: row.customer_name,
      customerCode: row.customer_code ?? null,
      customer: row.customer_name ? { name: row.customer_name, code: row.customer_code } : null,
      warehouseName: row.warehouse_name,
      itemCount: row.item_count ? parseInt(row.item_count) : 0,
      _count: { items: row.item_count ? parseInt(row.item_count) : 0 },
      calculatedTotal: row.calculated_total ? parseFloat(row.calculated_total) : 0,
    };
  }

  async findAll(tenantId: string, query: any): Promise<{ data: any[]; total: number }> {
    const { page: rawPage = 1, limit = 50, search, status, customer } = query;
    const page = Math.max(1, rawPage || 1);
    const offset = (page - 1) * limit;
    const conditions: string[] = ['so.tenant_id = $1'];
    const params: any[] = [tenantId];
    let idx = 2;
    if (search || customer) {
      const q = search || customer;
      conditions.push(`(COALESCE(so.customer_name, c.name) ILIKE $${idx} OR so.so_number ILIKE $${idx})`);
      params.push(`%${q}%`); idx++;
    }
    if (status) { conditions.push(`so.status = $${idx}`); params.push(status); idx++; }
    const where = conditions.join(' AND ');

    const countRes = await this.db.query(`SELECT COUNT(*) as count FROM sales_orders so LEFT JOIN customers c ON so.customer_id = c.id WHERE ${where}`, params);
    const total = parseInt(countRes.rows[0].count, 10);

    const dataRes = await this.db.query(`
      SELECT so.*,
             COALESCE(so.customer_name, c.name) as customer_name,
             COALESCE(so.customer_code, c.code) as customer_code,
             w.name as warehouse_name,
             (SELECT count(*) FROM sales_order_items WHERE so_id = so.id) as item_count,
             (SELECT COALESCE(sum(quantity_ordered * unit_price), 0) FROM sales_order_items WHERE so_id = so.id) as calculated_total
      FROM sales_orders so
      LEFT JOIN customers c ON so.customer_id = c.id
      LEFT JOIN warehouses w ON so.warehouse_id = w.id
      WHERE ${where}
      ORDER BY so.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: dataRes.rows.map(r => this.mapRow(r)), total };
  }

  async findById(id: string, tenantId: string): Promise<any> {
    const soRes = await this.db.query(`
      SELECT so.*,
             COALESCE(so.customer_name, c.name) as customer_name,
             COALESCE(so.customer_code, c.code) as customer_code,
             w.name as warehouse_name
      FROM sales_orders so
      LEFT JOIN customers c ON so.customer_id = c.id
      LEFT JOIN warehouses w ON so.warehouse_id = w.id
      WHERE so.id = $1 AND so.tenant_id = $2
    `, [id, tenantId]);
    if (!soRes.rows[0]) return null;

    const itemsRes = await this.db.query(`
      SELECT soi.*, sk.code as sku_code, sk.name as sku_name
      FROM sales_order_items soi
      LEFT JOIN skus sk ON soi.sku_id = sk.id
      WHERE soi.so_id = $1
    `, [id]);

    const so: any = this.mapRow(soRes.rows[0]);
    so.items = itemsRes.rows;
    return so;
  }

  async countByTenant(tenantId: string): Promise<number> {
    const res = await this.db.query(`SELECT COUNT(*) as count FROM sales_orders WHERE tenant_id = $1`, [tenantId]);
    return parseInt(res.rows[0].count, 10);
  }

  async create(tenantId: string, dto: any): Promise<any> {
    return this.db.transaction(async (client) => {
      const soNumber = dto.soNumber || dto.so_number;
      const customerId = dto.customerId || dto.customer_id || null;
      const warehouseId = dto.warehouseId || dto.warehouse_id || null;
      const shippingAddress = dto.shippingAddress || dto.shipping_address || dto.customer_address || null;
      const shippingAddressId = dto.shippingAddressId || dto.shipping_address_id || null;
      const notes = dto.notes || null;

      // Denormalized customer snapshot (see 084_create_customer_addresses.sql).
      // Populated by the service from the customers record at order time; NULL
      // for the free-text/walk-in path, where reads fall back to the join.
      const soRes = await client.query(
        `INSERT INTO sales_orders (
           tenant_id, so_number, customer_id, warehouse_id, status, shipping_address,
           shipping_address_id, total_amount, notes,
           customer_name, customer_code, customer_gstin, customer_phone, customer_email,
           customer_state, billing_address, payment_terms
         ) VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         RETURNING *`,
        [
          tenantId, soNumber, customerId, warehouseId, shippingAddress,
          shippingAddressId, 0, notes,
          dto.customerNameSnapshot ?? null,
          dto.customerCodeSnapshot ?? null,
          dto.customerGstin ?? null,
          dto.customerPhone ?? null,
          dto.customerEmail ?? null,
          dto.customerState ?? null,
          dto.billingAddress ?? null,
          dto.paymentTerms ?? null,
        ],
      );
      const so = soRes.rows[0];

      const items = dto.items || [];
      let totalAmount = 0;
      for (const item of items) {
        const skuId = item.skuId || item.sku_id;
        const qty = item.ordered_quantity || item.quantity || 0;
        const price = item.unit_price || item.unitPrice || 0;
        await client.query(
          `INSERT INTO sales_order_items (so_id, sku_id, quantity_ordered, unit_price)
           VALUES ($1, $2, $3, $4)`,
          [so.id, skuId, qty, price],
        );
        totalAmount += qty * price;
      }

      if (totalAmount > 0) {
        await client.query(`UPDATE sales_orders SET total_amount = $1 WHERE id = $2`, [totalAmount, so.id]);
        so.total_amount = totalAmount;
      }

      return this.mapRow(so);
    });
  }

  async update(id: string, tenantId: string, dto: any): Promise<any> {
    const updates: string[] = []; const params: any[] = []; let idx = 1;
    const fieldMap: Record<string, string> = {
      customerId: 'customer_id', customer_id: 'customer_id',
      warehouseId: 'warehouse_id', warehouse_id: 'warehouse_id',
      shippingAddress: 'shipping_address', shipping_address: 'shipping_address',
      shippingAddressId: 'shipping_address_id', shipping_address_id: 'shipping_address_id',
      totalAmount: 'total_amount', total_amount: 'total_amount',
      notes: 'notes',
    };
    for (const [key, col] of Object.entries(fieldMap)) {
      if (dto[key] !== undefined) { updates.push(`${col} = $${idx}`); params.push(dto[key]); idx++; }
    }
    if (updates.length === 0) return this.findById(id, tenantId);
    updates.push('updated_at = NOW()');
    params.push(id, tenantId);
    await this.db.query(`UPDATE sales_orders SET ${updates.join(', ')} WHERE id = $${idx} AND tenant_id = $${idx + 1}`, params);
    return this.findById(id, tenantId);
  }

  async delete(id: string, tenantId: string): Promise<boolean> {
    const res = await this.db.query(`DELETE FROM sales_orders WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    return (res.rowCount ?? 0) > 0;
  }

  async countByStatus(tenantId: string): Promise<any[]> {
    const res = await this.db.query(`SELECT status, COUNT(*) as count FROM sales_orders WHERE tenant_id = $1 GROUP BY status`, [tenantId]);
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
    await this.db.query(`UPDATE sales_orders SET ${sets.join(', ')} WHERE id = $${idx} AND tenant_id = $${idx + 1}`, params);
    return this.findById(id, tenantId);
  }
}
