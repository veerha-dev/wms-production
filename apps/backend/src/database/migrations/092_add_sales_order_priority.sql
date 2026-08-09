-- Migration: 092_add_sales_order_priority.sql
-- Description: Add the priority column the Sales Order form has always sent.
--
-- The create form has a Priority dropdown, CreateSalesOrderDto accepts
-- `priority`, and the value was then silently discarded because the column
-- only ever existed on `pick_lists` (migration 049), never on `sales_orders`.
-- Same class of defect as the missing expected_delivery_date fixed in 091,
-- except this one failed quietly instead of raising a 500.
-- Date: 2026-08-09

ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS priority VARCHAR(10) NOT NULL DEFAULT 'medium';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_sales_orders_priority'
  ) THEN
    ALTER TABLE sales_orders
      ADD CONSTRAINT chk_sales_orders_priority
      CHECK (priority IN ('low', 'medium', 'high', 'urgent'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sales_orders_priority
  ON sales_orders (tenant_id, warehouse_id, priority);
