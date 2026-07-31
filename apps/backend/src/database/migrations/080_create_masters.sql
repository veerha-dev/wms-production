-- Migration: 080_create_masters.sql
-- Description: Company-wide master data backing Settings > Masters —
--   packaging boxes & materials, carriers, reason codes, units of measure,
--   SKU categories, HSN codes and the per-tenant barcode/label settings row.
--   Shared by ALL warehouses, so scoping is (tenant_id, code) only.
--   GST rates (0/5/12/18/28) are a static list in code, not a table.
-- Date: 2026-08-01

-- ─── Packaging: Boxes ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS packaging_boxes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(40) NOT NULL,
  length_cm NUMERIC(10,2),
  width_cm NUMERIC(10,2),
  height_cm NUMERIC(10,2),
  max_weight_kg NUMERIC(10,2),
  box_type VARCHAR(40),
  cost NUMERIC(12,2),
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_packaging_boxes_tenant_code
  ON packaging_boxes (tenant_id, code);

-- ─── Packaging: Materials ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS packaging_materials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(40) NOT NULL,
  unit VARCHAR(20),
  cost NUMERIC(12,2),
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_packaging_materials_tenant_code
  ON packaging_materials (tenant_id, code);

-- ─── Carriers ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS carriers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(40) NOT NULL,
  carrier_type VARCHAR(40),
  transporter_id VARCHAR(60),
  contact VARCHAR(120),
  api_integrated BOOLEAN NOT NULL DEFAULT false,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_carriers_tenant_code
  ON carriers (tenant_id, code);

-- ─── Reason Codes ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reason_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reason_text VARCHAR(200) NOT NULL,
  category VARCHAR(30) NOT NULL
    CHECK (category IN ('adjustment', 'return', 'transfer', 'qc_failure', 'pick_issue')),
  code VARCHAR(40) NOT NULL,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_reason_codes_tenant_category_code
  ON reason_codes (tenant_id, category, code);
CREATE INDEX IF NOT EXISTS idx_reason_codes_tenant_category
  ON reason_codes (tenant_id, category);

-- ─── Units of Measure ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS units_of_measure (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code VARCHAR(40) NOT NULL,
  name VARCHAR(120) NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT false,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_units_of_measure_tenant_code
  ON units_of_measure (tenant_id, code);

-- ─── SKU Categories ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sku_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(40) NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT false,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_sku_categories_tenant_code
  ON sku_categories (tenant_id, code);

-- ─── HSN Codes ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hsn_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  hsn_code VARCHAR(12) NOT NULL,
  description VARCHAR(200),
  gst_rate NUMERIC(5,2),
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_hsn_codes_tenant_hsn
  ON hsn_codes (tenant_id, hsn_code);

-- ─── Barcode / Label Settings (singleton per tenant) ─────────────────────────
CREATE TABLE IF NOT EXISTS barcode_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  location_code_type VARCHAR(10) NOT NULL DEFAULT 'qr'
    CHECK (location_code_type IN ('qr', 'barcode')),
  label_size VARCHAR(10) NOT NULL DEFAULT 'medium'
    CHECK (label_size IN ('small', 'medium', 'large')),
  print_format VARCHAR(20) NOT NULL DEFAULT 'a4'
    CHECK (print_format IN ('a4', 'thermal')),
  include_human_readable BOOLEAN NOT NULL DEFAULT true,
  sku_barcode_source VARCHAR(20) NOT NULL DEFAULT 'both'
    CHECK (sku_barcode_source IN ('manufacturer', 'auto', 'both')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══ Seeds for every existing tenant ════════════════════════════════════════
-- New tenants are seeded lazily by the masters service / onboarding.

-- 10 system units of measure
INSERT INTO units_of_measure (tenant_id, code, name, is_system)
SELECT t.id, u.code, u.name, true
FROM tenants t
CROSS JOIN (VALUES
  ('PCS', 'Pieces'),
  ('KG',  'Kilogram'),
  ('GM',  'Gram'),
  ('LTR', 'Litre'),
  ('ML',  'Millilitre'),
  ('BOX', 'Box'),
  ('CTN', 'Carton'),
  ('DZN', 'Dozen'),
  ('MTR', 'Metre'),
  ('PR',  'Pair')
) AS u(code, name)
ON CONFLICT DO NOTHING;

-- 10 system SKU categories
INSERT INTO sku_categories (tenant_id, code, name, is_system)
SELECT t.id, c.code, c.name, true
FROM tenants t
CROSS JOIN (VALUES
  ('ELECTRONICS',     'Electronics'),
  ('HARDWARE',        'Hardware'),
  ('GENERAL',         'General'),
  ('PERISHABLES',     'Perishables'),
  ('PHARMACEUTICALS', 'Pharmaceuticals'),
  ('CHEMICALS',       'Chemicals'),
  ('FRAGILE',         'Fragile'),
  ('HEAVY',           'Heavy'),
  ('FMCG',            'FMCG'),
  ('TEXTILES',        'Textiles')
) AS c(code, name)
ON CONFLICT DO NOTHING;

-- Starter reason codes per category
INSERT INTO reason_codes (tenant_id, category, code, reason_text)
SELECT t.id, r.category, r.code, r.reason_text
FROM tenants t
CROSS JOIN (VALUES
  -- Adjustment
  ('adjustment', 'ADJ_DAMAGE',        'Damaged in warehouse'),
  ('adjustment', 'ADJ_THEFT',         'Theft / shrinkage'),
  ('adjustment', 'ADJ_COUNT_ERROR',   'Counting error'),
  ('adjustment', 'ADJ_EXPIRED',       'Expired stock write-off'),
  ('adjustment', 'ADJ_SYSTEM_ERROR',  'System / data entry error'),
  -- Return
  ('return', 'RET_DAMAGED',           'Item damaged on arrival'),
  ('return', 'RET_WRONG_ITEM',        'Wrong item shipped'),
  ('return', 'RET_NOT_AS_DESCRIBED',  'Not as described'),
  ('return', 'RET_CUSTOMER_CHANGED',  'Customer changed mind'),
  ('return', 'RET_LATE_DELIVERY',     'Late delivery / refused'),
  -- Transfer
  ('transfer', 'TRF_REBALANCE',       'Stock rebalancing'),
  ('transfer', 'TRF_DEMAND',          'Demand at destination warehouse'),
  ('transfer', 'TRF_CONSOLIDATION',   'Stock consolidation'),
  ('transfer', 'TRF_SPACE',           'Space constraint'),
  -- QC failure
  ('qc_failure', 'QC_DAMAGED_PKG',    'Damaged packaging'),
  ('qc_failure', 'QC_SHORT_EXPIRY',   'Short / expired shelf life'),
  ('qc_failure', 'QC_WRONG_SPEC',     'Does not match specification'),
  ('qc_failure', 'QC_CONTAMINATION',  'Contamination detected'),
  ('qc_failure', 'QC_LABEL_MISSING',  'Label or batch marking missing'),
  -- Pick issue
  ('pick_issue', 'PICK_SHORT',        'Short pick — insufficient stock'),
  ('pick_issue', 'PICK_NOT_FOUND',    'Item not found at location'),
  ('pick_issue', 'PICK_DAMAGED',      'Item damaged at pick face'),
  ('pick_issue', 'PICK_WRONG_LOC',    'Stock in wrong location'),
  ('pick_issue', 'PICK_BLOCKED',      'Location blocked / inaccessible')
) AS r(category, code, reason_text)
ON CONFLICT DO NOTHING;

-- Barcode settings row per tenant (defaults)
INSERT INTO barcode_settings (tenant_id)
SELECT t.id FROM tenants t
ON CONFLICT DO NOTHING;
