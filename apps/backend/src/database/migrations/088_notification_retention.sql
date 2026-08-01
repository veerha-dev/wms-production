-- Migration: 088_notification_retention.sql
-- Description: Per-tenant notification retention window. Spec Part 4:
--   "Notifications older than 90 days auto-delete (configurable by Super Admin)".
--   The daily purge job in notification-jobs.service reads this column.
-- Date: 2026-08-01

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS notification_retention_days INTEGER DEFAULT 90;

UPDATE tenants SET notification_retention_days = 90 WHERE notification_retention_days IS NULL;

COMMENT ON COLUMN tenants.notification_retention_days IS
  'Notifications older than this many days are purged by the daily retention job. Default 90, configurable by Super Admin.';
