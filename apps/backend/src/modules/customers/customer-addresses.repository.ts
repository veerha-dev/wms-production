import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class CustomerAddressesRepository {
  constructor(private db: DatabaseService) {}

  private mapRow(row: any) {
    if (!row) return null;
    return {
      id: row.id,
      tenantId: row.tenant_id,
      customerId: row.customer_id,
      label: row.label ?? null,
      addressType: row.address_type || 'shipping',
      street: row.street ?? null,
      city: row.city ?? null,
      state: row.state ?? null,
      pincode: row.pincode ?? null,
      isDefault: row.is_default === true,
      status: row.status || 'active',
      formatted:
        [row.street, row.city, row.state, row.pincode].filter(Boolean).join(', ') || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async findByCustomer(tenantId: string, customerId: string): Promise<any[]> {
    const res = await this.db.query(
      `SELECT * FROM customer_addresses
        WHERE tenant_id = $1 AND customer_id = $2
        ORDER BY is_default DESC, address_type ASC, label ASC NULLS LAST, created_at ASC`,
      [tenantId, customerId],
    );
    return res.rows.map((r) => this.mapRow(r));
  }

  async findById(tenantId: string, id: string): Promise<any> {
    const res = await this.db.query(
      `SELECT * FROM customer_addresses WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    );
    return this.mapRow(res.rows[0]);
  }

  async create(tenantId: string, customerId: string, data: any): Promise<any> {
    const addressType = data.addressType || data.address_type || 'shipping';
    const isDefault = data.isDefault ?? data.is_default ?? false;

    const res = await this.db.query(
      `INSERT INTO customer_addresses
         (tenant_id, customer_id, label, address_type, street, city, state, pincode, is_default, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        tenantId,
        customerId,
        data.label ?? null,
        addressType,
        data.street ?? data.address ?? null,
        data.city ?? null,
        data.state ?? null,
        data.pincode ?? data.postalCode ?? null,
        isDefault,
        data.status || 'active',
      ],
    );
    const created = this.mapRow(res.rows[0]);
    if (created && isDefault) {
      await this.clearOtherDefaults(tenantId, customerId, addressType, created.id);
    }
    return created;
  }

  async update(tenantId: string, id: string, data: any): Promise<any> {
    const fieldMap: Record<string, string> = {
      label: 'label',
      addressType: 'address_type',
      street: 'street',
      city: 'city',
      state: 'state',
      pincode: 'pincode',
      isDefault: 'is_default',
      status: 'status',
    };

    const normalized: Record<string, any> = {
      label: data.label,
      addressType: data.addressType ?? data.address_type,
      street: data.street ?? data.address,
      city: data.city,
      state: data.state,
      pincode: data.pincode ?? data.postalCode,
      isDefault: data.isDefault ?? data.is_default,
      status: data.status,
    };

    const updates: string[] = [];
    const params: any[] = [];
    let idx = 1;
    for (const [key, col] of Object.entries(fieldMap)) {
      if (normalized[key] !== undefined) {
        updates.push(`${col} = $${idx}`);
        params.push(normalized[key]);
        idx++;
      }
    }
    if (updates.length === 0) return this.findById(tenantId, id);

    updates.push('updated_at = NOW()');
    params.push(id, tenantId);
    const res = await this.db.query(
      `UPDATE customer_addresses SET ${updates.join(', ')}
        WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`,
      params,
    );
    const updated = this.mapRow(res.rows[0]);
    if (updated && normalized.isDefault === true) {
      await this.clearOtherDefaults(tenantId, updated.customerId, updated.addressType, updated.id);
    }
    return updated;
  }

  async delete(tenantId: string, id: string): Promise<boolean> {
    const res = await this.db.query(
      `DELETE FROM customer_addresses WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  /** Sales orders referencing this address — deleting one would break history. */
  async countSalesOrderRefs(tenantId: string, id: string): Promise<number> {
    const res = await this.db.query(
      `SELECT COUNT(*) AS count FROM sales_orders WHERE tenant_id = $1 AND shipping_address_id = $2`,
      [tenantId, id],
    );
    return parseInt(res.rows[0].count, 10);
  }

  private async clearOtherDefaults(
    tenantId: string,
    customerId: string,
    addressType: string,
    keepId: string,
  ): Promise<void> {
    await this.db.query(
      `UPDATE customer_addresses SET is_default = false, updated_at = NOW()
        WHERE tenant_id = $1 AND customer_id = $2 AND address_type = $3 AND id <> $4`,
      [tenantId, customerId, addressType, keepId],
    );
  }
}
