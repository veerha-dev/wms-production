import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { getCurrentTenantId } from '../common/tenant.context';
import {
  UpdateGeneralDto, UpdateNotificationsDto, UpdateAppearanceDto,
  UpdateSecurityPrefsDto, UpdateTenantInfoDto, UpdateApprovalRuleDto,
  UpdateNotificationConfigDto,
} from './dto';
import { NOTIFICATION_ALERT_TYPES, findAlertType } from './notification-alert-types';
import { NotificationsService } from '../notifications/notifications.service';

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

/**
 * Integration cards shown in Settings > Integrations (spec Tab 7), in display
 * order. `providers` drives the card sub-text in the UI.
 */
const INTEGRATION_DEFS = [
  {
    key: 'shipping_connected',
    name: 'Shipping Carriers',
    description: 'Shiprocket, Blue Dart, DTDC, Delhivery, Ecom Express',
    providers: ['Shiprocket', 'Blue Dart', 'DTDC', 'Delhivery', 'Ecom Express'],
  },
  {
    key: 'ecommerce_connected',
    name: 'E-commerce',
    description: 'Shopify, Amazon India, Flipkart, WooCommerce, Meesho',
    providers: ['Shopify', 'Amazon India', 'Flipkart', 'WooCommerce', 'Meesho'],
  },
  {
    key: 'accounting_connected',
    name: 'Accounting',
    description: 'Tally, Zoho Books, QuickBooks',
    providers: ['Tally', 'Zoho Books', 'QuickBooks'],
  },
  {
    // Key intentionally has no `_connected` suffix — this is the contract the
    // Settings UI's GST Compliance card was built against.
    key: 'gst_compliance',
    name: 'GST Compliance',
    description: 'E-Invoice and E-Way Bill via a GSP — credentials stored encrypted',
    providers: ['E-Invoice (IRP)', 'E-Way Bill'],
  },
  {
    key: 'barcode_connected',
    name: 'Barcode / RFID',
    description: 'Scanner and reader hardware integration',
    providers: [],
  },
  {
    key: 'erp_connected',
    name: 'ERP System',
    description: 'SAP, Oracle, or custom ERP integration',
    providers: ['SAP', 'Oracle', 'Custom'],
  },
];

/**
 * The five approval rules of spec Tab 4 §8, one row per `module` in
 * `approval_rules`. Rows are seeded lazily on first read so the UI always gets
 * all five back, created or not.
 *
 * NOTE: purchase-order enforcement (purchase-orders.service) reads the legacy
 * module key `purchase_orders`. `purchase_order` writes are mirrored onto that
 * legacy row by updateApprovalRule so enforcement stays in sync.
 */
const APPROVAL_RULE_MODULES: {
  module: string;
  label: string;
  thresholdAmount: number;
  thresholdUnits: number | null;
}[] = [
  { module: 'stock_adjustment_units', label: 'Stock adjustment (units)', thresholdAmount: 0, thresholdUnits: 100 },
  { module: 'stock_adjustment_value', label: 'Stock adjustment (value ₹)', thresholdAmount: 0, thresholdUnits: null },
  { module: 'inter_warehouse_transfer', label: 'Inter-warehouse transfer', thresholdAmount: 0, thresholdUnits: null },
  { module: 'purchase_order', label: 'Purchase order above amount', thresholdAmount: 0, thresholdUnits: null },
  { module: 'cycle_count_variance', label: 'Cycle count variance', thresholdAmount: 0, thresholdUnits: null },
];

const LEGACY_PO_MODULE = 'purchase_orders';

/** Whitelist for organization fields on `tenants` (Settings > Organization). */
const TENANT_INFO_FIELDS: Record<string, string> = {
  companyName: 'company_name',
  companyType: 'company_type',
  logoUrl: 'logo_url',
  address: 'address',
  city: 'city',
  state: 'state',
  pincode: 'pincode',
  country: 'country',
  phone: 'phone',
  email: 'email',
  gstNumber: 'gst_number',
  panNumber: 'pan_number',
  fyStartMonth: 'fy_start_month',
};

@Injectable()
export class SettingsService {
  constructor(
    private db: DatabaseService,
    private readonly notifications: NotificationsService,
  ) {}

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
      logoUrl: row.logo_url || null,
      address: row.address || null,
      city: row.city || null,
      state: row.state || null,
      pincode: row.pincode || null,
      country: row.country || null,
      phone: row.phone || null,
      email: row.email || row.admin_email || null,
      gstNumber: row.gst_number || null,
      panNumber: row.pan_number || null,
      fyStartMonth: row.fy_start_month ?? 4,
      // Alias the Settings UI reads.
      financialYearStartMonth: row.fy_start_month ?? 4,
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
    const sets: string[] = [];
    const vals: any[] = [];
    let i = 1;

    // The UI sends `financialYearStartMonth`; both spellings hit fy_start_month,
    // so fold them into one key or the UPDATE would assign the column twice.
    const source: Record<string, any> = { ...(dto as Record<string, any>) };
    if (source.financialYearStartMonth !== undefined && source.fyStartMonth === undefined) {
      source.fyStartMonth = source.financialYearStartMonth;
    }

    for (const [key, col] of Object.entries(TENANT_INFO_FIELDS)) {
      const value = source[key];
      if (value === undefined) continue;
      sets.push(`${col} = $${i++}`);
      vals.push(value);
    }

    // `industry` lives in the feature_flags JSONB, not a column of its own.
    if (dto.industry !== undefined) {
      sets.push(
        `feature_flags = jsonb_set(COALESCE(feature_flags, '{}'), '{industry}', to_jsonb($${i++}::text), true)`,
      );
      vals.push(dto.industry);
    }

    if (sets.length > 0) {
      vals.push(tenantId);
      await this.db.query(
        `UPDATE tenants SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${i}`,
        vals,
      );
    }
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
      providers: def.providers,
      connected: flags[def.key] === true || flags[def.key] === 'true',
      connectionDetails: flags[`${def.key}_details`] || null,
    }));
  }

  async updateIntegration(tenantId: string, key: string, connected: boolean, connectionDetails?: string) {
    const validKeys = INTEGRATION_DEFS.map((d) => d.key);
    if (!validKeys.includes(key)) {
      throw new BadRequestException(
        `Invalid integration key "${key}". Expected one of: ${validKeys.join(', ')}`,
      );
    }

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

  /**
   * "Send test notification" has to prove the REAL delivery path works, so it
   * goes through the engine (registry → recipient resolution → insert → socket
   * → email queue) instead of writing a row into the legacy `inventory_alerts`
   * table that no other code path produces any more.
   *
   * `system.test_notification` has recipients 'user', so it lands on exactly
   * the person who clicked the button and on nobody else. Awaited rather than
   * fire-and-forget: the caller is asking "did it work?", and emit() never
   * throws by contract.
   */
  async sendTestNotification(tenantId: string, userId?: string) {
    if (!userId) {
      throw new BadRequestException('A signed-in user is required to send a test notification');
    }
    await this.notifications.emit('system.test_notification', {
      tenantId,
      userId,
      entityType: 'user',
      entityId: userId,
    });
  }

  // ─── Approval Rules ─────────────────────────────────────────────────────────

  /** Creates any of the five catalog rules this tenant is missing. */
  private async seedApprovalRules(tenantId: string): Promise<void> {
    const params: any[] = [tenantId];
    const tuples = APPROVAL_RULE_MODULES.map((r) => {
      const base = params.length + 1;
      params.push(r.module, r.thresholdAmount, r.thresholdUnits);
      return `($1, $${base}, $${base + 1}, $${base + 2})`;
    });
    await this.db.query(
      `INSERT INTO approval_rules (tenant_id, module, threshold_amount, threshold_units)
       VALUES ${tuples.join(', ')}
       ON CONFLICT (tenant_id, module) DO NOTHING`,
      params,
    );
  }

  async getApprovalRules(tenantId: string) {
    await this.seedApprovalRules(tenantId);
    const res = await this.db.query(
      `SELECT * FROM approval_rules WHERE tenant_id = $1`,
      [tenantId],
    );
    const byModule = new Map<string, any>(res.rows.map((r: any) => [r.module, r]));
    // Catalog order and labels; the internal `purchase_orders` row is not exposed.
    return APPROVAL_RULE_MODULES.map((def) => ({
      ...mapApprovalRule(byModule.get(def.module)),
      module: def.module,
      label: def.label,
    }));
  }

  async getApprovalRule(tenantId: string, module: string) {
    const res = await this.db.query(
      `SELECT * FROM approval_rules WHERE tenant_id = $1 AND module = $2`,
      [tenantId, module],
    );
    return res.rows[0] ? mapApprovalRule(res.rows[0]) : null;
  }

  async updateApprovalRule(tenantId: string, module: string, dto: UpdateApprovalRuleDto) {
    // Ensure the row exists, then patch only the supplied fields.
    await this.db.query(
      `INSERT INTO approval_rules (tenant_id, module) VALUES ($1, $2)
       ON CONFLICT (tenant_id, module) DO NOTHING`,
      [tenantId, module],
    );

    const fieldMap: Record<string, string> = {
      thresholdAmount: 'threshold_amount',
      thresholdUnits: 'threshold_units',
      transferRequiresApproval: 'transfer_requires_approval',
      cycleCountAutoApprovePct: 'cycle_count_auto_approve_pct',
      isActive: 'is_active',
    };

    const sets: string[] = [];
    const vals: any[] = [];
    let i = 1;
    for (const [key, col] of Object.entries(fieldMap)) {
      const value = (dto as Record<string, any>)[key];
      if (value === undefined) continue;
      sets.push(`${col} = $${i++}`);
      vals.push(value);
    }

    if (sets.length > 0) {
      vals.push(tenantId, module);
      await this.db.query(
        `UPDATE approval_rules SET ${sets.join(', ')}, updated_at = NOW()
          WHERE tenant_id = $${i} AND module = $${i + 1}`,
        vals,
      );

      // Keep the legacy row purchase-orders.service reads in sync.
      if (module === 'purchase_order') {
        const legacyVals = [...vals];
        legacyVals[legacyVals.length - 1] = LEGACY_PO_MODULE;
        await this.db.query(
          `INSERT INTO approval_rules (tenant_id, module) VALUES ($1, $2)
           ON CONFLICT (tenant_id, module) DO NOTHING`,
          [tenantId, LEGACY_PO_MODULE],
        );
        await this.db.query(
          `UPDATE approval_rules SET ${sets.join(', ')}, updated_at = NOW()
            WHERE tenant_id = $${i} AND module = $${i + 1}`,
          legacyVals,
        );
      }
    }
    return this.getApprovalRule(tenantId, module);
  }

  // ─── Tenant Notification Settings ───────────────────────────────────────────

  /**
   * Inserts any alert types from the code catalog that this tenant does not yet
   * have a row for. Runs on every read, so adding an alert type to
   * NOTIFICATION_ALERT_TYPES needs no migration.
   */
  private async seedNotificationSettings(tenantId: string): Promise<void> {
    const params: any[] = [tenantId];
    const tuples = NOTIFICATION_ALERT_TYPES.map((def) => {
      const base = params.length + 1;
      params.push(
        def.key,
        def.defaultEnabled,
        def.defaultEmailEnabled,
        def.defaultRecipients,
        JSON.stringify(def.defaultConfig ?? {}),
      );
      return `($1, $${base}, $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::jsonb)`;
    });

    await this.db.query(
      `INSERT INTO tenant_notification_settings
         (tenant_id, alert_type, enabled, email_enabled, recipients, config)
       VALUES ${tuples.join(', ')}
       ON CONFLICT (tenant_id, alert_type) DO NOTHING`,
      params,
    );
  }

  async getNotificationSettings(tenantId: string) {
    await this.seedNotificationSettings(tenantId);
    const res = await this.db.query(
      `SELECT * FROM tenant_notification_settings WHERE tenant_id = $1`,
      [tenantId],
    );
    const byKey = new Map<string, any>(res.rows.map((r: any) => [r.alert_type, r]));

    // Ordered and labelled by the code catalog; unknown legacy rows are dropped.
    return NOTIFICATION_ALERT_TYPES.map((def) => {
      const row = byKey.get(def.key);
      return {
        alertType: def.key,
        label: def.label,
        description: def.description,
        group: def.group,
        enabled: row ? row.enabled : def.defaultEnabled,
        emailEnabled: row ? row.email_enabled : def.defaultEmailEnabled,
        recipients: row ? row.recipients : def.defaultRecipients,
        config: row ? row.config : def.defaultConfig,
        updatedAt: row?.updated_at ?? null,
      };
    });
  }

  async updateNotificationSetting(
    tenantId: string,
    alertType: string,
    dto: UpdateNotificationConfigDto,
  ) {
    if (!findAlertType(alertType)) {
      throw new BadRequestException(`Unknown alert type "${alertType}"`);
    }
    await this.seedNotificationSettings(tenantId);

    const fieldMap: Record<string, string> = {
      enabled: 'enabled',
      emailEnabled: 'email_enabled',
      recipients: 'recipients',
    };

    const sets: string[] = [];
    const vals: any[] = [];
    let i = 1;
    for (const [key, col] of Object.entries(fieldMap)) {
      const value = (dto as Record<string, any>)[key];
      if (value === undefined) continue;
      sets.push(`${col} = $${i++}`);
      vals.push(value);
    }
    // `config` is merged, not replaced, so a partial PATCH keeps other keys.
    if (dto.config !== undefined) {
      sets.push(`config = COALESCE(config, '{}'::jsonb) || $${i++}::jsonb`);
      vals.push(JSON.stringify(dto.config));
    }

    if (sets.length > 0) {
      vals.push(tenantId, alertType);
      await this.db.query(
        `UPDATE tenant_notification_settings SET ${sets.join(', ')}, updated_at = NOW()
          WHERE tenant_id = $${i} AND alert_type = $${i + 1}`,
        vals,
      );
    }

    const all = await this.getNotificationSettings(tenantId);
    return all.find((s) => s.alertType === alertType) ?? null;
  }
}

function mapApprovalRule(row: any) {
  if (!row) {
    return {
      id: null,
      tenantId: null,
      module: null,
      thresholdAmount: 0,
      thresholdUnits: null,
      transferRequiresApproval: true,
      cycleCountAutoApprovePct: null,
      isActive: true,
      createdAt: null,
      updatedAt: null,
    };
  }
  return {
    id: row.id,
    tenantId: row.tenant_id,
    module: row.module,
    thresholdAmount: Number(row.threshold_amount || 0),
    thresholdUnits: row.threshold_units === null || row.threshold_units === undefined
      ? null
      : Number(row.threshold_units),
    transferRequiresApproval: row.transfer_requires_approval ?? true,
    cycleCountAutoApprovePct:
      row.cycle_count_auto_approve_pct === null || row.cycle_count_auto_approve_pct === undefined
        ? null
        : Number(row.cycle_count_auto_approve_pct),
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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
