import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class AuthRepository {
  constructor(private db: DatabaseService) {}

  async findUserByEmail(email: string) {
    const result = await this.db.query(
      `SELECT id, email, full_name, role, tenant_id, is_active, password_hash,
              must_change_password, warehouse_id, phone, token_version
       FROM users
       WHERE email = $1`,
      [email]
    );
    return result.rows[0] || null;
  }

  async createUser(email: string, fullName: string, passwordHash: string, role: string = 'operator', tenantId: string) {
    const result = await this.db.query(
      `INSERT INTO users (email, full_name, password_hash, role, tenant_id, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING id, email, full_name, role, tenant_id, is_active, created_at`,
      [email, fullName, passwordHash, role, tenantId]
    );
    return result.rows[0];
  }

  /**
   * Provisions a brand new tenant and its first admin user in one transaction.
   *
   * Self-signup must never place the new admin into an existing tenant — doing
   * so would give a stranger full access to another company's data. Mirrors the
   * super-admin tenant-creation path (plan limits + role_permissions seed).
   */
  async createTenantWithAdmin(data: {
    companyName: string;
    email: string;
    fullName: string;
    passwordHash: string;
    planCode?: string;
  }) {
    return this.db.transaction(async (client) => {
      const planResult = await client.query(
        'SELECT * FROM plans WHERE code = $1 AND is_active = true',
        [data.planCode || 'starter'],
      );
      const plan = planResult.rows[0] || null;

      const slug = await this.reserveSlug(client, data.companyName);

      const tenantResult = await client.query(
        `INSERT INTO tenants (
           name, slug, company_name, admin_email, status, plan_id, billing_cycle,
           max_warehouses, max_skus, max_users, max_managers, max_workers,
           max_daily_movements, max_batches, report_retention_days, enabled_modules
         ) VALUES (
           $1, $2, $1, $3, 'active', $4, 'monthly',
           $5, $6, $7, $8, $9,
           $10, $11, $12, $13
         ) RETURNING *`,
        [
          data.companyName,
          slug,
          data.email,
          plan?.id || null,
          plan?.max_warehouses || 1,
          plan?.max_skus || 100,
          plan?.max_users || 5,
          plan?.max_managers || 1,
          plan?.max_workers || 5,
          plan?.max_daily_movements || 100,
          plan?.max_batches || 50,
          plan?.report_retention_days || 30,
          plan?.enabled_modules || [],
        ],
      );
      const tenant = tenantResult.rows[0];

      const userResult = await client.query(
        `INSERT INTO users (tenant_id, email, full_name, password_hash, role, is_active, is_super_admin)
         VALUES ($1, $2, $3, $4, 'admin', true, false)
         RETURNING id, email, full_name, role, tenant_id, is_active, warehouse_id,
                   phone, token_version, must_change_password, created_at`,
        [tenant.id, data.email, data.fullName, data.passwordHash],
      );

      await client.query(
        `INSERT INTO role_permissions (tenant_id, role, module, action, allowed)
         SELECT $1, role, module, action, allowed
         FROM role_permissions
         WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
         ON CONFLICT DO NOTHING`,
        [tenant.id],
      );

      return { tenant, user: userResult.rows[0] };
    });
  }

  /** Builds a URL-safe slug from the company name, suffixing until it is free. */
  private async reserveSlug(client: any, companyName: string): Promise<string> {
    const base =
      companyName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'tenant';

    for (let attempt = 0; attempt < 50; attempt++) {
      const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const taken = await client.query('SELECT 1 FROM tenants WHERE slug = $1', [candidate]);
      if (taken.rowCount === 0) {
        return candidate;
      }
    }

    return `${base}-${Date.now().toString(36)}`;
  }

  async findUserById(id: string) {
    const result = await this.db.query(
      `SELECT id, email, full_name, role, tenant_id, is_active, last_login,
              must_change_password, warehouse_id, phone, token_version, created_at, updated_at
       FROM users
       WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  async bumpTokenVersion(userId: string) {
    await this.db.query(
      `UPDATE users SET token_version = COALESCE(token_version, 0) + 1, updated_at = NOW() WHERE id = $1`,
      [userId]
    );
  }

  async updateLastLogin(userId: string) {
    await this.db.query(
      `UPDATE users SET last_login = NOW() WHERE id = $1`,
      [userId]
    );
  }

  async findUserWithHashById(id: string) {
    const result = await this.db.query(
      `SELECT id, email, full_name, role, tenant_id, is_active, password_hash
       FROM users WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  async updatePasswordHash(userId: string, hash: string) {
    await this.db.query(
      `UPDATE users SET password_hash = $1, must_change_password = false, updated_at = NOW() WHERE id = $2`,
      [hash, userId]
    );
  }
}
