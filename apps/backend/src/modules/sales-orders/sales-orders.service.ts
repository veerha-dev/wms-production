import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { SalesOrdersRepository } from './sales-orders.repository';
import { DatabaseService } from '../../database/database.service';
import { getCurrentTenantId } from '../common/tenant.context';
import { DocumentNumberingService } from '../document-numbering/document-numbering.service';

interface AuthUser { id: string; role: string; warehouseId?: string | null }

@Injectable()
export class SalesOrdersService {
  constructor(
    private repository: SalesOrdersRepository,
    private db: DatabaseService,
    private numbering: DocumentNumberingService,
  ) {}

  async findAll(query: any, user?: AuthUser) {
    const { page = 1, limit = 50 } = query;
    const scopedQuery = user?.role === 'manager' && user.warehouseId
      ? { ...query, warehouseId: user.warehouseId }
      : query;
    const { data, total } = await this.repository.findAll(getCurrentTenantId(), scopedQuery);
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const item = await this.repository.findById(id, getCurrentTenantId());
    if (!item) throw new NotFoundException(`SalesOrder ${id} not found`);
    return item;
  }

  async findById(id: string) { return this.findOne(id); }

  async create(dto: any) {
    const tenantId = getCurrentTenantId();
    const soNumber = dto.soNumber || await this.generateCode();

    // If customer_name provided but no customer_id, look up or create customer.
    // The free-text / B2C walk-in path stays alive on purpose.
    let customerId = dto.customerId || dto.customer_id || null;
    const customerName = dto.customer_name || dto.customerName;
    if (!customerId && customerName) {
      const existing = await this.db.query(
        `SELECT id FROM customers WHERE name = $1 AND tenant_id = $2 LIMIT 1`,
        [customerName, tenantId],
      );
      if (existing.rows[0]) {
        customerId = existing.rows[0].id;
      } else {
        // Auto-create a walk-in customer. No GSTIN was collected, so it is
        // B2C by definition. The number comes from the shared sequence — the
        // old count-based code collided after any delete.
        const code = await this.numbering.nextNumber(tenantId, 'customer');
        const newCust = await this.db.query(
          `INSERT INTO customers (tenant_id, code, name, phone, customer_type, status)
           VALUES ($1, $2, $3, $4, 'b2c', 'active') RETURNING id`,
          [tenantId, code, customerName, dto.customer_contact || null],
        );
        customerId = newCust.rows[0].id;
      }
    }

    // Snapshot the customer as they are right now. Invoices and delivery notes
    // generated from this order must keep showing the name, GSTIN, billing
    // address and payment terms that applied when the order was placed, even
    // if the customer record is edited afterwards.
    const snapshot = await this.buildCustomerSnapshot(tenantId, customerId, dto);

    const { code, customer_name, customerName: cn, customer_code, customer_contact, ...rest } = dto;
    return this.repository.create(tenantId, {
      ...rest,
      soNumber,
      customerId,
      shippingAddress: snapshot.shippingAddress,
      shippingAddressId: snapshot.shippingAddressId,
      customerNameSnapshot: snapshot.customerName,
      customerCodeSnapshot: snapshot.customerCode,
      customerGstin: snapshot.customerGstin,
      customerPhone: snapshot.customerPhone,
      customerEmail: snapshot.customerEmail,
      customerState: snapshot.customerState,
      billingAddress: snapshot.billingAddress,
      paymentTerms: snapshot.paymentTerms,
    });
  }

  /**
   * Reads the customer (and, when given, the saved shipping address) and
   * returns the denormalized values to store on the order. Everything is
   * optional — a free-text order simply gets a name snapshot and nulls.
   */
  private async buildCustomerSnapshot(tenantId: string, customerId: string | null, dto: any) {
    // Shipping first, billing only as a last resort. `customer_address` is the
    // BILLING address the form auto-fills from the customer record, so reading
    // it first silently overwrote any one-off delivery address the operator
    // typed — the order then shipped to the billing address.
    const typedAddress =
      dto.shipping_address || dto.shippingAddress || dto.customer_address || null;
    const shippingAddressId = dto.shippingAddressId || dto.shipping_address_id || null;

    const snapshot: any = {
      customerName: dto.customer_name || dto.customerName || null,
      customerCode: dto.customer_code || dto.customerCode || null,
      customerGstin: dto.customer_gstin || dto.customerGstin || null,
      customerPhone: dto.customer_contact || dto.customerPhone || null,
      customerEmail: dto.customerEmail || null,
      customerState: null,
      billingAddress: null,
      paymentTerms: dto.paymentTerms || dto.payment_terms || null,
      shippingAddress: typedAddress,
      shippingAddressId: null,
    };

    if (!customerId) return snapshot;

    const res = await this.db.query(
      `SELECT code, name, gst_number, phone, email, state, payment_terms,
              address_line1, address_line2, city, postal_code
         FROM customers WHERE id = $1 AND tenant_id = $2`,
      [customerId, tenantId],
    );
    const c = res.rows[0];
    if (!c) return snapshot;

    snapshot.customerName = c.name;
    snapshot.customerCode = c.code;
    snapshot.customerGstin = c.gst_number ?? null;
    snapshot.customerPhone = c.phone ?? snapshot.customerPhone;
    snapshot.customerEmail = c.email ?? snapshot.customerEmail;
    snapshot.customerState = c.state ?? null;
    snapshot.paymentTerms = snapshot.paymentTerms || c.payment_terms || null;
    snapshot.billingAddress =
      [c.address_line1, c.address_line2, c.city, c.state, c.postal_code]
        .filter(Boolean)
        .join(', ') || null;

    // A saved address wins over typed text; the typed text is kept when the
    // operator chose "Enter different address".
    if (shippingAddressId) {
      const addr = await this.db.query(
        `SELECT street, city, state, pincode FROM customer_addresses
          WHERE id = $1 AND tenant_id = $2 AND customer_id = $3`,
        [shippingAddressId, tenantId, customerId],
      );
      const a = addr.rows[0];
      if (!a) {
        throw new BadRequestException('shippingAddressId does not belong to this customer');
      }
      snapshot.shippingAddressId = shippingAddressId;
      snapshot.shippingAddress =
        [a.street, a.city, a.state, a.pincode].filter(Boolean).join(', ') || typedAddress;
    } else if (!typedAddress) {
      snapshot.shippingAddress = snapshot.billingAddress;
    }

    return snapshot;
  }

  async update(id: string, dto: any) {
    await this.findOne(id);
    return this.repository.update(id, getCurrentTenantId(), dto);
  }

  async remove(id: string) {
    const deleted = await this.repository.delete(id, getCurrentTenantId());
    if (!deleted) throw new NotFoundException(`SalesOrder ${id} not found`);
  }

  async delete(id: string) { return this.remove(id); }

  async getStats() {
    const rows = await this.repository.countByStatus(getCurrentTenantId());
    const stats: Record<string, number> = {};
    rows.forEach((r: any) => stats[r.status] = parseInt(r.count, 10));
    return stats;
  }

  async updateStatus(id: string, status: string, extraFields?: Record<string, any>) {
    await this.findOne(id);
    return this.repository.updateStatus(id, getCurrentTenantId(), status, extraFields);
  }

  async submit(id: string) { return this.updateStatus(id, 'submitted'); }
  async approve(id: string, approvedBy?: string) { return this.updateStatus(id, 'approved', { approvedBy, approvedAt: new Date() }); }
  async cancel(id: string) { return this.updateStatus(id, 'cancelled'); }

  /**
   * Issued by the tenant's configurable sequence (Settings > Document
   * Numbering), not by row count — the old `SO-${count + 1}` ignored the
   * configured prefix/length entirely and collided after any delete.
   * Migration 078 backfills the counter past existing orders, so switching
   * over cannot produce a duplicate so_number on an existing install.
   */
  private async generateCode(): Promise<string> {
    return this.numbering.nextNumber(getCurrentTenantId(), 'sales_order');
  }
}
