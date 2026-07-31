-- Migration: 082_notification_settings_and_approval_rules.sql
-- Description: Per-tenant alert configuration (Settings > Notifications, Tab 5)
--   consumed by the notification workstream, plus the extra approval-rule
--   thresholds from Settings > Masters > Approval Rules (075 only had
--   threshold_amount).
-- Date: 2026-08-01

-- ─── Notification settings ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_notification_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  alert_type VARCHAR(60) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  email_enabled BOOLEAN NOT NULL DEFAULT false,
  recipients VARCHAR(10) NOT NULL DEFAULT 'both'
    CHECK (recipients IN ('admin', 'manager', 'both')),
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_tenant_notification_settings_tenant_alert
  ON tenant_notification_settings (tenant_id, alert_type);
CREATE INDEX IF NOT EXISTS idx_tenant_notification_settings_tenant
  ON tenant_notification_settings (tenant_id);

-- Rows are seeded lazily from the code-side alert-type catalog
-- (settings/notification-alert-types.ts) on first read, so a new alert type
-- never needs a migration.

-- ─── Approval rules — extra thresholds ───────────────────────────────────────
ALTER TABLE approval_rules ADD COLUMN IF NOT EXISTS threshold_units INTEGER;
ALTER TABLE approval_rules ADD COLUMN IF NOT EXISTS transfer_requires_approval BOOLEAN DEFAULT true;
ALTER TABLE approval_rules ADD COLUMN IF NOT EXISTS cycle_count_auto_approve_pct NUMERIC(5,2);

COMMENT ON COLUMN approval_rules.threshold_units IS
  'Unit-count threshold (e.g. stock adjustments above 100 units need approval).';
COMMENT ON COLUMN approval_rules.cycle_count_auto_approve_pct IS
  'Cycle-count variance below this percentage is auto-approved.';
