-- Migration: 087_create_notifications.sql
-- Description: Core notification engine tables (Workstream C).
--   `notifications` stores ONE ROW PER RECIPIENT — role/warehouse routing is
--   resolved at creation time (spec Part 7), never at read time, so a manager
--   can physically never read another warehouse's alert.
--   `notification_email_queue` backs the immediate-vs-batched email rule
--   (spec Part 5).
-- Date: 2026-08-01

-- ─── Notifications (per-recipient) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  event_type VARCHAR(60) NOT NULL,
  category VARCHAR(20) NOT NULL
    CHECK (category IN ('inbound', 'inventory', 'outbound', 'worker', 'system')),
  severity VARCHAR(10) NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'warning', 'critical')),

  title VARCHAR(200) NOT NULL,
  body TEXT,
  link_path VARCHAR(300),

  entity_type VARCHAR(40),
  entity_id VARCHAR(60),
  warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,

  requires_action BOOLEAN DEFAULT false,
  action_state VARCHAR(12)
    CHECK (action_state IS NULL OR action_state IN ('pending', 'approved', 'rejected')),

  group_key VARCHAR(120),
  group_count INTEGER DEFAULT 1,

  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bell badge / unread list.
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_user_unread
  ON notifications (tenant_id, user_id, is_read);
-- Panel + notification centre ordering.
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_user_created
  ON notifications (tenant_id, user_id, created_at DESC);
-- Grouping lookup (spec Part 3) only ever considers unread rows.
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_group_unread
  ON notifications (tenant_id, group_key) WHERE is_read = false;
-- Approvals tab (spec Part 4).
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_user_action
  ON notifications (tenant_id, user_id, requires_action) WHERE requires_action = true;

COMMENT ON COLUMN notifications.user_id IS
  'Resolved recipient. Routing (admin / warehouse-scoped manager / specific worker) is applied at creation time — one row per recipient.';
COMMENT ON COLUMN notifications.link_path IS
  'Frontend route incl. filter query params. Every notification must be clickable to the exact actionable page (spec Part 1).';
COMMENT ON COLUMN notifications.group_key IS
  'Collapse key, e.g. low_stock:{warehouseId}. Repeat events within the grouping window bump group_count instead of inserting a new row.';

-- ─── Email queue ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_email_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  to_email VARCHAR(200) NOT NULL,
  event_type VARCHAR(60) NOT NULL,
  subject VARCHAR(300) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',

  priority VARCHAR(10) NOT NULL DEFAULT 'batched'
    CHECK (priority IN ('immediate', 'batched')),
  status VARCHAR(10) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed')),

  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,

  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The flush job's only access path.
CREATE INDEX IF NOT EXISTS idx_notification_email_queue_status_scheduled
  ON notification_email_queue (status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_notification_email_queue_tenant
  ON notification_email_queue (tenant_id);
