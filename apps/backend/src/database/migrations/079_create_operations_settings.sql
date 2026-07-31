-- Migration: 079_create_operations_settings.sql
-- Description: Warehouse-scoped operational setup tables backing
--   Settings > Operations (shifts, dock doors, packing stations, equipment).
--   Every table is scoped by (tenant_id, warehouse_id) and uses a COMPOSITE
--   unique index on code — never a bare UNIQUE(code) (see the 054-060 fixes).
-- Date: 2026-08-01

-- ─── Shifts ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(40) NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  break_minutes INTEGER NOT NULL DEFAULT 0,
  working_days TEXT[] NOT NULL DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_shifts_tenant_warehouse_code
  ON shifts (tenant_id, warehouse_id, code);
CREATE INDEX IF NOT EXISTS idx_shifts_tenant_warehouse
  ON shifts (tenant_id, warehouse_id);

-- ─── Dock Doors ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dock_doors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(40) NOT NULL,
  door_type VARCHAR(20) NOT NULL DEFAULT 'both'
    CHECK (door_type IN ('inbound', 'outbound', 'both')),
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_dock_doors_tenant_warehouse_code
  ON dock_doors (tenant_id, warehouse_id, code);
CREATE INDEX IF NOT EXISTS idx_dock_doors_tenant_warehouse
  ON dock_doors (tenant_id, warehouse_id);

-- ─── Packing Stations ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS packing_stations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(40) NOT NULL,
  zone_location VARCHAR(120),
  has_label_printer BOOLEAN NOT NULL DEFAULT false,
  has_weighing_scale BOOLEAN NOT NULL DEFAULT false,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_packing_stations_tenant_warehouse_code
  ON packing_stations (tenant_id, warehouse_id, code);
CREATE INDEX IF NOT EXISTS idx_packing_stations_tenant_warehouse
  ON packing_stations (tenant_id, warehouse_id);

-- ─── Equipment ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS equipment (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(40) NOT NULL,
  equipment_type VARCHAR(30),
  capacity_kg NUMERIC(10,2),
  requires_certified_operator BOOLEAN NOT NULL DEFAULT false,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_equipment_tenant_warehouse_code
  ON equipment (tenant_id, warehouse_id, code);
CREATE INDEX IF NOT EXISTS idx_equipment_tenant_warehouse
  ON equipment (tenant_id, warehouse_id);
