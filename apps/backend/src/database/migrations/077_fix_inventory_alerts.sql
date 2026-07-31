-- Migration: 077_fix_inventory_alerts.sql
-- Description: Align inventory_alerts schema with application code.
--   1. The alerts repository and settings test-notification INSERT/SELECT a
--      `title` column that 014_create_alerts.sql never created.
--   2. The repository inserts `message` as NULL when not provided
--      (data.message || null), but the column was created NOT NULL.
-- Date: 2026-08-01

ALTER TABLE inventory_alerts ADD COLUMN IF NOT EXISTS title VARCHAR(255);

ALTER TABLE inventory_alerts ALTER COLUMN message DROP NOT NULL;
