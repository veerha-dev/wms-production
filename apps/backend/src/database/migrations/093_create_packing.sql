-- Migration: 093_create_packing
-- Description: Packing module — the step between a completed pick and a booked shipment.
--
--              A packing session is opened per sales order. Its items are seeded from the
--              order's COMPLETED pick list items (the real picked quantities), which is the
--              link the packing screen was missing: it read sales_order_items.quantity_picked,
--              a column nothing ever writes, so every row rendered as "— 0 / 0".
--
--              Packages are the physical boxes. Dimensions are copied from the chosen
--              packaging_boxes row at assignment time rather than joined at read time, because
--              a courier booking must keep the dimensions that were actually used even if the
--              box master is edited afterwards.

CREATE TABLE IF NOT EXISTS packing_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  so_id UUID REFERENCES sales_orders(id) ON DELETE CASCADE,
  warehouse_id UUID REFERENCES warehouses(id),
  -- packing -> packed -> ready_for_dispatch, or cancelled
  status TEXT NOT NULL DEFAULT 'packing',
  packed_by UUID REFERENCES users(id),
  started_at TIMESTAMP DEFAULT NOW(),
  packed_at TIMESTAMP,
  completed_at TIMESTAMP,
  -- Launch-phase label fields. When a courier API is wired in, label_url holds the
  -- courier's own PDF and label_source flips to 'courier'; nothing else here changes.
  carrier TEXT,
  tracking_number TEXT,
  label_source TEXT,
  label_url TEXT,
  label_printed_at TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- One live session per order. A cancelled session is history and must not block a re-pack.
CREATE UNIQUE INDEX IF NOT EXISTS idx_packing_sessions_live_so
  ON packing_sessions(so_id) WHERE status <> 'cancelled';
CREATE INDEX IF NOT EXISTS idx_packing_sessions_tenant ON packing_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_packing_sessions_warehouse ON packing_sessions(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_packing_sessions_status ON packing_sessions(status);

CREATE TABLE IF NOT EXISTS packing_packages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  packing_session_id UUID REFERENCES packing_sessions(id) ON DELETE CASCADE,
  -- 1-based, per session. Displayed as "Package 1", "Package 2", ...
  package_number INTEGER NOT NULL DEFAULT 1,
  box_id UUID REFERENCES packaging_boxes(id) ON DELETE SET NULL,
  box_name TEXT,
  length_cm NUMERIC(10,2),
  width_cm NUMERIC(10,2),
  height_cm NUMERIC(10,2),
  weight_kg NUMERIC(10,3),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_packing_packages_session_number
  ON packing_packages(packing_session_id, package_number);
CREATE INDEX IF NOT EXISTS idx_packing_packages_session ON packing_packages(packing_session_id);

CREATE TABLE IF NOT EXISTS packing_session_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  packing_session_id UUID REFERENCES packing_sessions(id) ON DELETE CASCADE,
  sku_id UUID REFERENCES skus(id),
  -- Snapshot of what picking actually delivered, summed across every completed
  -- pick list line for this order (one SKU can be picked from several bins).
  picked_quantity INTEGER NOT NULL DEFAULT 0,
  packed_quantity INTEGER NOT NULL DEFAULT 0,
  package_id UUID REFERENCES packing_packages(id) ON DELETE SET NULL,
  -- pending -> packed
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_packing_items_session_sku
  ON packing_session_items(packing_session_id, sku_id);
CREATE INDEX IF NOT EXISTS idx_packing_items_session ON packing_session_items(packing_session_id);
CREATE INDEX IF NOT EXISTS idx_packing_items_package ON packing_session_items(package_id);

-- Backfill: until now nothing ever wrote `picked` onto a sales order, so every
-- order whose picking finished before this migration is still sitting at
-- `confirmed` and would never appear on the packing queue. Move exactly those —
-- an order with at least one completed pick list and nothing still open — to
-- `picked`. Orders already further along are untouched.
UPDATE sales_orders so
   SET status = 'picked', updated_at = NOW()
 WHERE so.status IN ('confirmed', 'approved')
   AND EXISTS (
     SELECT 1 FROM pick_lists pl
      WHERE pl.status = 'completed'
        AND (pl.so_id = so.id OR EXISTS (
              SELECT 1 FROM pick_list_items pli
               WHERE pli.pick_list_id = pl.id AND pli.so_id = so.id))
   )
   AND NOT EXISTS (
     SELECT 1 FROM pick_lists pl2
      WHERE pl2.status NOT IN ('completed', 'cancelled')
        AND (pl2.so_id = so.id OR EXISTS (
              SELECT 1 FROM pick_list_items pli2
               WHERE pli2.pick_list_id = pl2.id AND pli2.so_id = so.id))
   );

COMMENT ON TABLE packing_sessions IS
  'One packing job per sales order. Drives the Picked -> Packing -> Packed -> Ready for Dispatch flow.';
COMMENT ON COLUMN packing_session_items.picked_quantity IS
  'Summed from completed pick_list_items for this order — the fix for the blank packing screen.';
COMMENT ON COLUMN packing_packages.length_cm IS
  'Copied from packaging_boxes at selection time; couriers price on these, so they must not drift.';
