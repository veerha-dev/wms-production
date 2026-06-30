import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { getCurrentTenantId } from '../common/tenant.context';
import { UpdateGeneralDto, UpdateNotificationsDto, UpdateAppearanceDto, UpdateSecurityPrefsDto, UpdateTenantInfoDto } from './dto';

const toSnake = (s: string) => s.replace(/([A-Z])/g, '_$1').toLowerCase();

function buildUpsertFields(dto: Record<string, any>): { cols: string[]; vals: any[]; sets: string[] } {
  const cols: string[] = [];
  const vals: any[] = [];
  const sets: string[] = [];
  Object.entries(dto).forEach(([k, v]) => {
    if (v !== undefined) {
      const col = toSnake(k);
      cols.push(col);
      vals.push(v);
      sets.push(`${col} = EXCLUDED.${col}`);
    }
  });
  return { cols, vals, sets };
}

const INTEGRATION_DEFS = [
  { key: 'erp_connected',       name: 'ERP System',       description: 'SAP, Oracle, or custom ERP integration' },
  { key: 'shipping_connected',  name: 'Shipping Carriers', description: 'FedEx, UPS, DHL courier integration' },
  { key: 'ecommerce_connected', name: 'E-commerce',        description: 'Shopify, WooCommerce, Magento' },
  { key: 'barcode_connected',   name: 'Barcode / RFID',    description: 'Scanner and reader hardware integration' },
  { key: 'accounting_connected',name: 'Accounting',        description: 'QuickBooks, Xero, Tally integration' },
];

@Injectable()
export class SettingsService {
  constructor(private db: DatabaseService) {}

  // ─── User Preferences ───────────────────────────────────────────────────────

  async getPreferences(userId: string, tenantId: string) {
    const existing = await this.db.query(
      'SELECT * FROM user_preferences WHERE user_id = $1',
      [userId],
    );
    if (existing.rows[0]) return this.mapPrefs(existing.rows[0]);

    // Auto-create with defaults
    const created = await this.db.query(
      `INSERT INTO user_preferences (user_id, tenant_id) VALUES ($1, $2) RETURNING *`,
      [userId, tenantId],
    );
    return this.mapPrefs(created.rows[0]);
  }

  async updatePreferences(userId: string, tenantId: string, dto: Record<string, any>) {
    const { cols, vals, sets } = buildUpsertFields(dto);
    if (cols.length === 0) return this.getPreferences(userId, tenantId);

    const paramOffset = 3;
    const colList = ['user_id', 'tenant_id', ...cols].join(', ');
    const valPlaceholders = ['$1', '$2', ...cols.map((_, i) => `$${i + paramOffset}`)].join(', ');
    const setList = sets.join(', ');

    const result = await this.db.query(
      `INSERT INTO user_preferences (${colList})
       VALUES (${valPlaceholders})
       ON CONFLICT (user_id) DO UPDATE SET ${setList}, updated_at = NOW()
       RETURNING *`,
      [userId, tenantId, ...vals],
    );
    return this.mapPrefs(result.rows[0]);
  }

  private mapPrefs(row: any) {
    return {
      systemName: row.system_name,
      language: row.language,
      timezone: row.timezone,
      dateFormat: row.date_format,
      autoRefresh: row.auto_refresh,
      compactView: row.compact_view,
      refreshIntervalSeconds: row.refresh_interval_seconds,
      notifEmailLowStock: row.notif_email_low_stock,
      notifEmailTaskException: row.notif_email_task_exception,
      notifEmailDailySummary: row.notif_email_daily_summary,
      notifEmailUserActivity: row.notif_email_user_activity,
      notifEmailSystemUpdates: row.notif_email_system_updates,
      notifInappRealtime: row.notif_inapp_realtime,
      notifInappSound: row.notif_inapp_sound,
      sessionTimeoutMinutes: row.session_timeout_minutes,
      theme: row.theme,
      primaryColor: row.primary_color,
    };
  }

  // ─── Tenant Info ─────────────────────────────────────────────────────────────

  async getTenantInfo(tenantId: string) {
    const result = await this.db.query(
      `SELECT t.*,
              p.name AS plan_name,
              p.code AS plan_code,
              t.feature_flags->>'industry' AS industry,
              (SELECT COUNT(*)::int FROM users u WHERE u.tenant_id = t.id) AS user_count,
              (SELECT COUNT(*)::int FROM warehouses w WHERE w.tenant_id = t.id AND w.status != 'inactive') AS warehouse_count,
              (SELECT COUNT(*)::int FROM skus s WHERE s.tenant_id = t.id) AS sku_count
       FROM tenants t
       LEFT JOIN plans p ON p.id = t.plan_id
       WHERE t.id = $1`,
      [tenantId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      companyName: row.company_name || row.name,
      companyType: row.company_type || null,
      name: row.name,
      industry: row.industry || null,
      address: row.address || null,
      city: row.city || null,
      country: row.country || null,
      gstNumber: row.gst_number || null,
      planName: row.plan_name || 'Starter',
      planCode: row.plan_code || 'starter',
      maxWarehouses: row.max_warehouses || 3,
      maxUsers: row.max_users || 10,
      maxSkus: row.max_skus || 100,
      maxDailyMovements: row.max_daily_movements || 500,
      maxBatches: row.max_batches || 200,
      userCount: row.user_count || 0,
      warehouseCount: row.warehouse_count || 0,
      skuCount: row.sku_count || 0,
    };
  }

  // ─── Tenant Security Policy ─────────────────────────────────────────────────

  async getSecurityPolicy(tenantId: string) {
    // Lazy-create defaults if missing
    await this.db.query(
      `INSERT INTO tenant_security_settings (tenant_id) VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING`,
      [tenantId],
    );
    const res = await this.db.query(
      `SELECT * FROM tenant_security_settings WHERE tenant_id = $1`,
      [tenantId],
    );
    return mapPolicy(res.rows[0]);
  }

  async updateSecurityPolicy(tenantId: string, dto: Record<string, any>) {
    const allowed: Record<string, string> = {
      passwordMinLength: 'password_min_length',
      passwordRequireUpper: 'password_require_upper',
      passwordRequireLower: 'password_require_lower',
      passwordRequireDigit: 'password_require_digit',
      passwordRequireSpecial: 'password_require_special',
      passwordExpiryDays: 'password_expiry_days',
      sessionTimeoutMinutes: 'session_timeout_minutes',
      failedLoginLockoutCount: 'failed_login_lockout_count',
      failedLoginLockoutMinutes: 'failed_login_lockout_minutes',
      require2faForAdmins: 'require_2fa_for_admins',
      require2faForAll: 'require_2fa_for_all',
    };
    const sets: string[] = [];
    const vals: any[] = [];
    let i = 1;
    for (const [k, v] of Object.entries(dto)) {
      const col = allowed[k];
      if (!col || v === undefined) continue;
      sets.push(`${col} = $${i++}`);
      vals.push(v);
    }
    if (sets.length === 0) return this.getSecurityPolicy(tenantId);

    // Ensure row exists
    await this.db.query(
      `INSERT INTO tenant_security_settings (tenant_id) VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING`,
      [tenantId],
    );

    vals.push(tenantId);
    await this.db.query(
      `UPDATE tenant_security_settings SET ${sets.join(', ')}, updated_at = NOW() WHERE tenant_id = $${i}`,
      vals,
    );
    return this.getSecurityPolicy(tenantId);
  }

  /**
   * Validate a candidate password against the tenant policy.
   * Throws an Error (caller decides which Nest exception to throw) listing every failed rule.
   */
  async validatePasswordAgainstPolicy(tenantId: string, password: string): Promise<{ ok: boolean; problems: string[] }> {
    const policy = await this.getSecurityPolicy(tenantId);
    const problems: string[] = [];
    if (password.length < policy.passwordMinLength) {
      problems.push(`At least ${policy.passwordMinLength} characters`);
    }
    if (policy.passwordRequireUpper && !/[A-Z]/.test(password)) problems.push('At least one uppercase letter');
    if (policy.passwordRequireLower && !/[a-z]/.test(password)) problems.push('At least one lowercase letter');
    if (policy.passwordRequireDigit && !/\d/.test(password)) problems.push('At least one digit');
    if (policy.passwordRequireSpecial && !/[^A-Za-z0-9]/.test(password)) problems.push('At least one special character');
    return { ok: problems.length === 0, problems };
  }

  async updateTenantInfo(tenantId: string, dto: UpdateTenantInfoDto) {
    const featureFlagsUpdate = dto.industry
      ? `feature_flags = jsonb_set(COALESCE(feature_flags, '{}'), '{industry}', to_jsonb($8::text)),`
      : '';

    await this.db.query(
      `UPDATE tenants SET
        company_name = COALESCE($2, company_name),
        company_type = COALESCE($3, company_type),
        address      = COALESCE($4, address),
        city         = COALESCE($5, city),
        country      = COALESCE($6, country),
        gst_number   = COALESCE($7, gst_number),
        ${featureFlagsUpdate}
        updated_at   = NOW()
       WHERE id = $1`,
      [
        tenantId,
        dto.companyName || null,
        dto.companyType || null,
        dto.address || null,
        dto.city || null,
        dto.country || null,
        dto.gstNumber || null,
        dto.industry || null,
      ],
    );
    return this.getTenantInfo(tenantId);
  }

  // ─── Integrations ─────────────────────────────────────────────────────────────

  async getIntegrations(tenantId: string) {
    const result = await this.db.query(
      'SELECT feature_flags FROM tenants WHERE id = $1',
      [tenantId],
    );
    const flags: Record<string, any> = result.rows[0]?.feature_flags || {};
    return INTEGRATION_DEFS.map((def) => ({
      key: def.key,
      name: def.name,
      description: def.description,
      connected: flags[def.key] === true || flags[def.key] === 'true',
      connectionDetails: flags[`${def.key}_details`] || null,
    }));
  }

  async updateIntegration(tenantId: string, key: string, connected: boolean, connectionDetails?: string) {
    const validKeys = INTEGRATION_DEFS.map((d) => d.key);
    if (!validKeys.includes(key)) throw new Error(`Invalid integration key: ${key}`);

    let query = `UPDATE tenants SET
      feature_flags = jsonb_set(COALESCE(feature_flags, '{}'), '{${key}}', $2::text::jsonb, true),
      updated_at = NOW()
    WHERE id = $1`;
    const params: any[] = [tenantId, String(connected)];

    if (connectionDetails !== undefined) {
      query = `UPDATE tenants SET
        feature_flags = jsonb_set(
          jsonb_set(COALESCE(feature_flags, '{}'), '{${key}}', $2::text::jsonb, true),
          '{${key}_details}', to_jsonb($3::text), true
        ),
        updated_at = NOW()
      WHERE id = $1`;
      params.push(connectionDetails);
    }
    await this.db.query(query, params);
  }

  // ─── Test Notification ──────────────────────────────────────────────────────

  async sendTestNotification(tenantId: string) {
    await this.db.query(
      `INSERT INTO inventory_alerts (tenant_id, type, severity, title, message, is_acknowledged)
       VALUES ($1, 'system', 'info', 'Test Notification', 'This is a test notification from Settings. Your alerts are working correctly.', false)`,
      [tenantId],
    );
  }

  // ─── Approval Rules ─────────────────────────────────────────────────────────

  async getApprovalRules(tenantId: string) {
    const res = await this.db.query(
      `SELECT * FROM approval_rules WHERE tenant_id = $1`,
      [tenantId],
    );
    return res.rows.map(row => ({
      id: row.id,
      tenantId: row.tenant_id,
      module: row.module,
      thresholdAmount: Number(row.threshold_amount || 0),
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async getApprovalRule(tenantId: string, module: string) {
    const res = await this.db.query(
      `SELECT * FROM approval_rules WHERE tenant_id = $1 AND module = $2`,
      [tenantId, module],
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      tenantId: row.tenant_id,
      module: row.module,
      thresholdAmount: Number(row.threshold_amount || 0),
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async updateApprovalRule(tenantId: string, module: string, thresholdAmount: number, isActive: boolean) {
    const res = await this.db.query(
      `INSERT INTO approval_rules (tenant_id, module, threshold_amount, is_active)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, module) 
       DO UPDATE SET threshold_amount = $3, is_active = $4, updated_at = NOW()
       RETURNING *`,
      [tenantId, module, thresholdAmount, isActive],
    );
    const row = res.rows[0];
    return {
      id: row.id,
      tenantId: row.tenant_id,
      module: row.module,
      thresholdAmount: Number(row.threshold_amount || 0),
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

function mapPolicy(row: any) {
  if (!row) {
    return {
      passwordMinLength: 8,
      passwordRequireUpper: true,
      passwordRequireLower: true,
      passwordRequireDigit: true,
      passwordRequireSpecial: true,
      passwordExpiryDays: 0,
      sessionTimeoutMinutes: 30,
      failedLoginLockoutCount: 5,
      failedLoginLockoutMinutes: 30,
      require2faForAdmins: false,
      require2faForAll: false,
    };
  }
  return {
    passwordMinLength: row.password_min_length,
    passwordRequireUpper: row.password_require_upper,
    passwordRequireLower: row.password_require_lower,
    passwordRequireDigit: row.password_require_digit,
    passwordRequireSpecial: row.password_require_special,
    passwordExpiryDays: row.password_expiry_days,
    sessionTimeoutMinutes: row.session_timeout_minutes,
    failedLoginLockoutCount: row.failed_login_lockout_count,
    failedLoginLockoutMinutes: row.failed_login_lockout_minutes,
    require2faForAdmins: row.require_2fa_for_admins,
    require2faForAll: row.require_2fa_for_all,
    updatedAt: row.updated_at,
  };
}
