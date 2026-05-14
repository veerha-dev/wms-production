-- Migration: 071_create_pack_consolidation_tasks
-- Description: Per PDF §3.3 Zone Picking — when a pick list is split into per-zone sub-pick-lists,
--              all sub-picks must converge at a consolidation point before packing can begin.
--              This table tracks that consolidation step.

CREATE TABLE IF NOT EXISTS pack_consolidation_tasks (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  consolidation_number TEXT NOT NULL,
  pick_list_id    UUID REFERENCES pick_lists(id) ON DELETE CASCADE,
  so_id           UUID REFERENCES sales_orders(id) ON DELETE SET NULL,
  warehouse_id    UUID REFERENCES warehouses(id) ON DELETE SET NULL,

  total_sub_picks INTEGER NOT NULL DEFAULT 0,
  completed_sub_picks INTEGER NOT NULL DEFAULT 0,

  status          TEXT NOT NULL DEFAULT 'pending', -- pending, ready, acknowledged, packed
  ready_at        TIMESTAMP,
  acknowledged_at TIMESTAMP,
  acknowledged_by UUID REFERENCES users(id) ON DELETE SET NULL,

  notes           TEXT,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW(),

  UNIQUE(tenant_id, consolidation_number)
);

CREATE INDEX IF NOT EXISTS idx_pct_tenant ON pack_consolidation_tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pct_status ON pack_consolidation_tasks(status);
CREATE INDEX IF NOT EXISTS idx_pct_pick_list ON pack_consolidation_tasks(pick_list_id);
CREATE INDEX IF NOT EXISTS idx_pct_so ON pack_consolidation_tasks(so_id);

COMMENT ON TABLE pack_consolidation_tasks IS
  'Zone-pick consolidation point. Created when zone strategy is used; cleared when all sub-picks arrive and packer acknowledges.';
