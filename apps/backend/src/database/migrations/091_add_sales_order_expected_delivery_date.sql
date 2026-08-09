-- Migration: 091_add_sales_order_expected_delivery_date
-- Description: Adds the promised delivery date to sales orders.
--              The Manager Dashboard has always queried
--              sales_orders.expected_delivery_date ("Orders to Ship Today" and
--              the Due Today breakdown), and the create-order form has always
--              sent it, but the column was never created — every
--              GET /api/v1/dashboard/manager-stats failed with 42703 and the
--              dashboard rendered a permanent spinner.
--
--              Existing rows are deliberately left NULL. There is no reliable
--              source to backfill a promised delivery date from, and a wrong
--              date is worse than a missing one: it would silently pull old
--              orders into "due today". Queries treat NULL as "no promise
--              made", i.e. never due.

ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS expected_delivery_date DATE;

COMMENT ON COLUMN sales_orders.expected_delivery_date IS
  'Date the order is promised to the customer. NULL = no delivery date agreed; such orders are never counted as due today.';

-- Supports the dashboard's per-warehouse "due today" filters, which always
-- scope by tenant + warehouse before filtering on the date.
CREATE INDEX IF NOT EXISTS idx_sales_orders_expected_delivery
  ON sales_orders (tenant_id, warehouse_id, expected_delivery_date);
