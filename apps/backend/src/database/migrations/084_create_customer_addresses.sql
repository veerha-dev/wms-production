-- Migration: 084_create_customer_addresses.sql
-- Description: Named multi-address book per customer ("Chennai Main Shop",
--   "Madurai Branch") + the sales-order columns that link to it and snapshot
--   the customer's details at order time.
-- Date: 2026-08-01

CREATE TABLE IF NOT EXISTS customer_addresses (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id  UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label        VARCHAR(120),
  address_type VARCHAR(10) DEFAULT 'shipping' CHECK (address_type IN ('billing','shipping')),
  street       TEXT,
  city         VARCHAR(120),
  state        VARCHAR(120),
  pincode      VARCHAR(12),
  is_default   BOOLEAN DEFAULT false,
  status       VARCHAR(20) DEFAULT 'active',
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_addresses_tenant_customer
  ON customer_addresses(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_default
  ON customer_addresses(tenant_id, customer_id, address_type, is_default);

-- Sales order → saved address. NULL means a one-off address typed straight
-- into the order, which stays in the existing sales_orders.shipping_address
-- text column.
ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS shipping_address_id UUID REFERENCES customer_addresses(id);
CREATE INDEX IF NOT EXISTS idx_so_shipping_address_id ON sales_orders(shipping_address_id);

-- Denormalized snapshot of the customer as they were when the order was
-- placed. Historical documents must not mutate when the customer record is
-- later edited (renamed, GSTIN corrected, terms renegotiated). Reads fall
-- back to the live customers join via COALESCE for pre-existing orders.
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS customer_name    TEXT;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS customer_code    TEXT;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS customer_gstin   TEXT;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS customer_phone   TEXT;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS customer_email   TEXT;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS customer_state   TEXT;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS billing_address  TEXT;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS payment_terms    VARCHAR(20);

COMMENT ON COLUMN sales_orders.shipping_address_id IS 'Saved customer_addresses row; NULL = one-off address in shipping_address text';
COMMENT ON COLUMN sales_orders.customer_gstin IS 'Snapshot at order time — invoices/e-invoice must not change if the customer is edited later';
COMMENT ON COLUMN sales_orders.customer_state IS 'Snapshot of customer state — drives CGST+SGST vs IGST split on the invoice';
