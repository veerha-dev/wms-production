-- Migration: 081_extend_tenants_organization.sql
-- Description: Company profile fields for Settings > Organization (Tab 2).
--   phone/address/city/country/gst_number/company_name arrived in 032 and
--   company_type in 066; `email` was never added (only `admin_email`), so it is
--   created here. The logo is stored as a base64 data URL in TEXT for launch —
--   move to object storage later if size becomes a problem.
-- Date: 2026-08-01

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS company_type VARCHAR(40);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS pan_number VARCHAR(20);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS state VARCHAR(60);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS pincode VARCHAR(12);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS fy_start_month SMALLINT DEFAULT 4;

COMMENT ON COLUMN tenants.logo_url IS
  'Company logo — base64 data URL (data:image/...) at launch, or an external URL.';
COMMENT ON COLUMN tenants.state IS
  'Head-office state. Drives the CGST+SGST vs IGST tax split on invoices.';
COMMENT ON COLUMN tenants.fy_start_month IS
  'Financial year start month, 1-12. India defaults to 4 (April).';
