import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

/** Whitelisted sort columns — the query string never reaches SQL directly. */
const SORT_COLUMNS: Record<string, string> = {
  name: 'c.name',
  code: 'c.code',
  city: 'c.city',
  state: 'c.state',
  status: 'c.status',
  customerType: 'c.customer_type',
  customer_type: 'c.customer_type',
  createdAt: 'c.created_at',
  created_at: 'c.created_at',
  updatedAt: 'c.updated_at',
};

const toNumber = (v: any): number | null =>
  v === null || v === undefined ? null : parseFloat(v);

@Injectable()
export class CustomersRepository {
  constructor(private db: DatabaseService) {}

  /** snake_case row → camelCase shape matching the shared `Customer` type. */
  private mapRow(row: any) {
    if (!row) return null;
    const address =
      [row.address_line1, row.address_line2, row.city, row.state, row.postal_code]
        .filter(Boolean)
        .join(', ') || null;

    return {
      id: row.id,
      tenantId: row.tenant_id,
      code: row.code,
      name: row.name,
      customerType: row.customer_type || 'b2b',
      contactPerson: row.contact_person ?? null,
      email: row.email ?? null,
      phone: row.phone ?? null,
      whatsappNumber: row.whatsapp_number ?? null,
      gstNumber: row.gst_number ?? null,
      panNumber: row.pan_number ?? null,
      address,
      addressLine1: row.address_line1 ?? null,
      addressLine2: row.address_line2 ?? null,
      city: row.city ?? null,
      state: row.state ?? null,
      pincode: row.postal_code ?? null,
      postalCode: row.postal_code ?? null,
      country: row.country ?? null,
      paymentTerms: row.payment_terms || 'immediate',
      creditLimit: toNumber(row.credit_limit),
      notes: row.notes ?? null,
      status: row.status || 'active',
      isActive: (row.status || 'active') === 'active',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      // Aggregates, present only on queries that join them in.
      totalOrders: row.total_orders !== undefined ? parseInt(row.total_orders, 10) : undefined,
      totalBusinessValue:
        row.total_business_value !== undefined ? toNumber(row.total_business_value) ?? 0 : undefined,
      lastOrderDate: row.last_order_date ?? undefined,
    };
  }

  private buildFilters(tenantId: string, query: any) {
    const conditions: string[] = ['c.tenant_id = $1'];
    const params: any[] = [tenantId];
    let idx = 2;

    const search = query.search?.trim();
    if (search) {
      conditions.push(
        `(c.name ILIKE $${idx} OR c.code ILIKE $${idx} OR c.phone ILIKE $${idx} OR c.gst_number ILIKE $${idx})`,
      );
      params.push(`%${search}%`);
      idx++;
    }

    const customerType = query.customerType || query.customer_type || query.type;
    if (customerType) {
      conditions.push(`c.customer_type = $${idx}`);
      params.push(customerType);
      idx++;
    }
    if (query.state) {
      conditions.push(`c.state = $${idx}`);
      params.push(query.state);
      idx++;
    }
    if (query.city) {
      conditions.push(`c.city = $${idx}`);
      params.push(query.city);
      idx++;
    }
    if (query.status) {
      conditions.push(`c.status = $${idx}`);
      params.push(query.status);
      idx++;
    }

    return { where: conditions.join(' AND '), params, idx };
  }

  async findAll(tenantId: string, query: any): Promise<{ data: any[]; total: number }> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(500, Math.max(1, Number(query.limit) || 20));
    const offset = (page - 1) * limit;

    const { where, params, idx } = this.buildFilters(tenantId, query);

    const sortKey = query.sortBy || query.sort_by || 'createdAt';
    const sortCol = SORT_COLUMNS[sortKey] || 'c.created_at';
    const sortDir =
      String(query.sortOrder || query.sort_order || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const countRes = await this.db.query(
      `SELECT COUNT(*) AS count FROM customers c WHERE ${where}`,
      params,
    );
    const total = parseInt(countRes.rows[0].count, 10);

    const dataRes = await this.db.query(
      `SELECT c.*,
              (SELECT COUNT(*) FROM sales_orders so WHERE so.customer_id = c.id) AS total_orders,
              (SELECT COALESCE(SUM(so.total_amount), 0) FROM sales_orders so WHERE so.customer_id = c.id) AS total_business_value,
              (SELECT MAX(so.created_at) FROM sales_orders so WHERE so.customer_id = c.id) AS last_order_date
         FROM customers c
        WHERE ${where}
        ORDER BY ${sortCol} ${sortDir}
        LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset],
    );

    return { data: dataRes.rows.map((r) => this.mapRow(r)), total };
  }

  /** Flat, unpaginated list for the Excel export. */
  async findAllForExport(tenantId: string, query: any = {}): Promise<any[]> {
    const { where, params } = this.buildFilters(tenantId, query);
    const res = await this.db.query(
      `SELECT c.*,
              (SELECT COUNT(*) FROM sales_orders so WHERE so.customer_id = c.id) AS total_orders,
              (SELECT COALESCE(SUM(so.total_amount), 0) FROM sales_orders so WHERE so.customer_id = c.id) AS total_business_value
         FROM customers c
        WHERE ${where}
        ORDER BY c.code ASC`,
      params,
    );
    return res.rows.map((r) => this.mapRow(r));
  }

  async findById(tenantId: string, id: string): Promise<any> {
    const res = await this.db.query(
      `SELECT c.*,
              (SELECT COUNT(*) FROM sales_orders so WHERE so.customer_id = c.id) AS total_orders,
              (SELECT COALESCE(SUM(so.total_amount), 0) FROM sales_orders so WHERE so.customer_id = c.id) AS total_business_value,
              (SELECT MAX(so.created_at) FROM sales_orders so WHERE so.customer_id = c.id) AS last_order_date
         FROM customers c
        WHERE c.id = $1 AND c.tenant_id = $2`,
      [id, tenantId],
    );
    return this.mapRow(res.rows[0]);
  }

  async findByCode(tenantId: string, code: string): Promise<any> {
    const res = await this.db.query(
      `SELECT * FROM customers WHERE tenant_id = $1 AND code = $2 LIMIT 1`,
      [tenantId, code],
    );
    return this.mapRow(res.rows[0]);
  }

  async findByGstNumber(tenantId: string, gstNumber: string): Promise<any> {
    const res = await this.db.query(
      `SELECT * FROM customers WHERE tenant_id = $1 AND UPPER(gst_number) = UPPER($2) LIMIT 1`,
      [tenantId, gstNumber],
    );
    return this.mapRow(res.rows[0]);
  }

  async findByPhone(tenantId: string, phone: string): Promise<any> {
    const res = await this.db.query(
      `SELECT * FROM customers WHERE tenant_id = $1 AND phone = $2 LIMIT 1`,
      [tenantId, phone],
    );
    return this.mapRow(res.rows[0]);
  }

  /** Typeahead for the Sales Order combobox. */
  async search(tenantId: string, term: string, limit = 10): Promise<any[]> {
    const res = await this.db.query(
      `SELECT id, tenant_id, code, name, phone, gst_number, payment_terms, customer_type,
              city, state, address_line1, address_line2, postal_code, country,
              contact_person, email, credit_limit, status
         FROM customers
        WHERE tenant_id = $1
          AND status = 'active'
          AND (name ILIKE $2 OR code ILIKE $2 OR phone ILIKE $2 OR gst_number ILIKE $2)
        ORDER BY name ASC
        LIMIT $3`,
      [tenantId, `%${term}%`, limit],
    );
    return res.rows.map((r) => this.mapRow(r));
  }

  async create(tenantId: string, data: any): Promise<any> {
    const res = await this.db.query(
      `INSERT INTO customers (
         tenant_id, code, name, customer_type, contact_person, phone, whatsapp_number, email,
         gst_number, pan_number, address_line1, address_line2, city, state, postal_code, country,
         payment_terms, credit_limit, notes, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       RETURNING *`,
      [
        tenantId,
        data.code,
        data.name,
        data.customerType || 'b2b',
        data.contactPerson ?? null,
        data.phone ?? null,
        data.whatsappNumber ?? null,
        data.email ?? null,
        data.gstNumber ?? null,
        data.panNumber ?? null,
        data.addressLine1 ?? null,
        data.addressLine2 ?? null,
        data.city ?? null,
        data.state ?? null,
        data.postalCode ?? null,
        data.country ?? 'India',
        data.paymentTerms || 'immediate',
        data.creditLimit ?? null,
        data.notes ?? null,
        data.status || 'active',
      ],
    );
    return this.mapRow(res.rows[0]);
  }

  async update(tenantId: string, id: string, data: any): Promise<any> {
    // Explicit whitelist: only these keys can ever reach the SET clause.
    const fieldMap: Record<string, string> = {
      code: 'code',
      name: 'name',
      customerType: 'customer_type',
      contactPerson: 'contact_person',
      phone: 'phone',
      whatsappNumber: 'whatsapp_number',
      email: 'email',
      gstNumber: 'gst_number',
      panNumber: 'pan_number',
      addressLine1: 'address_line1',
      addressLine2: 'address_line2',
      city: 'city',
      state: 'state',
      postalCode: 'postal_code',
      country: 'country',
      paymentTerms: 'payment_terms',
      creditLimit: 'credit_limit',
      notes: 'notes',
      status: 'status',
    };

    const updates: string[] = [];
    const params: any[] = [];
    let idx = 1;
    for (const [key, col] of Object.entries(fieldMap)) {
      if (data[key] !== undefined) {
        updates.push(`${col} = $${idx}`);
        params.push(data[key]);
        idx++;
      }
    }
    if (updates.length === 0) return this.findById(tenantId, id);

    updates.push('updated_at = NOW()');
    params.push(id, tenantId);
    const res = await this.db.query(
      `UPDATE customers SET ${updates.join(', ')}
        WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`,
      params,
    );
    return this.mapRow(res.rows[0]);
  }

  async updateStatus(tenantId: string, id: string, status: string): Promise<any> {
    const res = await this.db.query(
      `UPDATE customers SET status = $1, updated_at = NOW()
        WHERE id = $2 AND tenant_id = $3 RETURNING *`,
      [status, id, tenantId],
    );
    return this.mapRow(res.rows[0]);
  }

  async delete(tenantId: string, id: string): Promise<boolean> {
    const res = await this.db.query(`DELETE FROM customers WHERE id = $1 AND tenant_id = $2`, [
      id,
      tenantId,
    ]);
    return (res.rowCount ?? 0) > 0;
  }

  /**
   * Rows in other tables that point at this customer. A hard DELETE with any
   * of these present raises a raw Postgres FK error (a 500 to the client), so
   * the service deactivates instead.
   */
  async countDependents(
    tenantId: string,
    id: string,
  ): Promise<{
    salesOrders: number;
    invoices: number;
    returns: number;
    serialNumbers: number;
    total: number;
  }> {
    const res = await this.db.query(
      `SELECT
         (SELECT COUNT(*) FROM sales_orders   WHERE customer_id = $1 AND tenant_id = $2) AS sales_orders,
         (SELECT COUNT(*) FROM invoices       WHERE customer_id = $1 AND tenant_id = $2) AS invoices,
         (SELECT COUNT(*) FROM returns        WHERE customer_id = $1 AND tenant_id = $2) AS returns,
         (SELECT COUNT(*) FROM serial_numbers WHERE customer_id = $1 AND tenant_id = $2) AS serial_numbers`,
      [id, tenantId],
    );
    const r = res.rows[0];
    const salesOrders = parseInt(r.sales_orders, 10);
    const invoices = parseInt(r.invoices, 10);
    const returns = parseInt(r.returns, 10);
    const serialNumbers = parseInt(r.serial_numbers, 10);
    return {
      salesOrders,
      invoices,
      returns,
      serialNumbers,
      total: salesOrders + invoices + returns + serialNumbers,
    };
  }

  async getStats(tenantId: string): Promise<any> {
    const res = await this.db.query(
      `SELECT COUNT(*)                                                         AS total,
              COUNT(*) FILTER (WHERE status = 'active')                        AS active,
              COUNT(*) FILTER (WHERE status = 'inactive')                      AS inactive,
              COUNT(*) FILTER (WHERE customer_type = 'b2b')                    AS b2b,
              COUNT(*) FILTER (WHERE customer_type = 'b2c')                    AS b2c,
              COUNT(*) FILTER (WHERE created_at >= date_trunc('month', NOW())) AS new_this_month
         FROM customers WHERE tenant_id = $1`,
      [tenantId],
    );
    const r = res.rows[0];

    const pendingRes = await this.db.query(
      `SELECT COUNT(DISTINCT customer_id) AS pending
         FROM invoices
        WHERE tenant_id = $1
          AND customer_id IS NOT NULL
          AND status NOT IN ('paid', 'cancelled')
          AND (COALESCE(total_amount, 0) - COALESCE(paid_amount, 0)) > 0`,
      [tenantId],
    );

    return {
      total: parseInt(r.total, 10),
      active: parseInt(r.active, 10),
      inactive: parseInt(r.inactive, 10),
      b2b: parseInt(r.b2b, 10),
      b2c: parseInt(r.b2c, 10),
      newThisMonth: parseInt(r.new_this_month, 10),
      pendingPayments: parseInt(pendingRes.rows[0].pending, 10),
    };
  }

  /** Sales orders placed by this customer (detail page → Orders tab). */
  async findOrders(tenantId: string, customerId: string, limit = 100, offset = 0): Promise<any[]> {
    const res = await this.db.query(
      `SELECT so.id, so.so_number, so.status, so.total_amount, so.shipping_address,
              so.created_at, so.confirmed_at, w.name AS warehouse_name,
              (SELECT COUNT(*) FROM sales_order_items soi WHERE soi.so_id = so.id) AS item_count
         FROM sales_orders so
         LEFT JOIN warehouses w ON w.id = so.warehouse_id
        WHERE so.tenant_id = $1 AND so.customer_id = $2
        ORDER BY so.created_at DESC
        LIMIT $3 OFFSET $4`,
      [tenantId, customerId, limit, offset],
    );
    return res.rows.map((row) => ({
      id: row.id,
      soNumber: row.so_number,
      orderNumber: row.so_number,
      status: row.status,
      totalAmount: toNumber(row.total_amount) ?? 0,
      shippingAddress: row.shipping_address,
      warehouseName: row.warehouse_name,
      itemCount: parseInt(row.item_count, 10),
      orderDate: row.created_at,
      createdAt: row.created_at,
      confirmedAt: row.confirmed_at,
    }));
  }

  async countOrders(tenantId: string, customerId: string): Promise<number> {
    const res = await this.db.query(
      `SELECT COUNT(*) AS count FROM sales_orders WHERE tenant_id = $1 AND customer_id = $2`,
      [tenantId, customerId],
    );
    return parseInt(res.rows[0].count, 10);
  }

  /** Invoices raised against this customer (detail page → Invoices tab). */
  async findInvoices(tenantId: string, customerId: string, limit = 100, offset = 0): Promise<any[]> {
    const res = await this.db.query(
      `SELECT i.id, i.invoice_number, i.type, i.status, i.subtotal, i.tax_amount,
              i.total_amount, i.paid_amount, i.invoice_date, i.due_date, i.created_at,
              so.so_number,
              CASE WHEN i.due_date < CURRENT_DATE AND i.status NOT IN ('paid','cancelled')
                   THEN true ELSE false END AS is_overdue
         FROM invoices i
         LEFT JOIN sales_orders so ON so.id = i.so_id
        WHERE i.tenant_id = $1 AND i.customer_id = $2
        ORDER BY i.created_at DESC
        LIMIT $3 OFFSET $4`,
      [tenantId, customerId, limit, offset],
    );
    return res.rows.map((row) => {
      const total = toNumber(row.total_amount) ?? 0;
      const paid = toNumber(row.paid_amount) ?? 0;
      return {
        id: row.id,
        invoiceNumber: row.invoice_number,
        type: row.type,
        status: row.status,
        soNumber: row.so_number,
        subtotal: toNumber(row.subtotal) ?? 0,
        taxAmount: toNumber(row.tax_amount) ?? 0,
        totalAmount: total,
        paidAmount: paid,
        balanceAmount: total - paid,
        invoiceDate: row.invoice_date,
        dueDate: row.due_date,
        isOverdue: row.is_overdue,
        createdAt: row.created_at,
      };
    });
  }

  async countInvoices(tenantId: string, customerId: string): Promise<number> {
    const res = await this.db.query(
      `SELECT COUNT(*) AS count FROM invoices WHERE tenant_id = $1 AND customer_id = $2`,
      [tenantId, customerId],
    );
    return parseInt(res.rows[0].count, 10);
  }

  /** Unpaid balance across all non-cancelled invoices — drives the credit check. */
  async getOutstanding(tenantId: string, customerId: string): Promise<number> {
    const res = await this.db.query(
      `SELECT COALESCE(SUM(COALESCE(total_amount, 0) - COALESCE(paid_amount, 0)), 0) AS outstanding
         FROM invoices
        WHERE tenant_id = $1 AND customer_id = $2 AND status NOT IN ('paid', 'cancelled')`,
      [tenantId, customerId],
    );
    return toNumber(res.rows[0].outstanding) ?? 0;
  }
}
