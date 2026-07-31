-- Migration: 083_extend_customers.sql
-- Description: Extend customers with the fields the Customer Module spec
--   requires (B2B/B2C type, contact person, WhatsApp, PAN, payment terms,
--   credit limit, notes). email/phone/address_line1/city/state/postal_code/
--   country/gst_number already exist from 016_create_customers.sql.
-- Date: 2026-08-01

ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_type   VARCHAR(3) DEFAULT 'b2b';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS contact_person  VARCHAR(120);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(20);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS pan_number      VARCHAR(20);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS payment_terms   VARCHAR(20) DEFAULT 'immediate';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_limit    NUMERIC(14,2);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS notes           TEXT;

-- Backfill before the CHECKs land: rows created before this migration have no
-- GSTIN concept, so anything without a GSTIN is classified B2C.
UPDATE customers SET customer_type = 'b2c'
  WHERE customer_type IS DISTINCT FROM 'b2c'
    AND (gst_number IS NULL OR btrim(gst_number) = '');
UPDATE customers SET customer_type = 'b2b' WHERE customer_type IS NULL;
UPDATE customers SET payment_terms = 'immediate'
  WHERE payment_terms IS NULL OR payment_terms NOT IN ('immediate','net_15','net_30','net_45','net_60');

-- CHECK constraints have no IF NOT EXISTS form; guard on pg_constraint so the
-- migration stays re-runnable.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_customer_type_check') THEN
    ALTER TABLE customers
      ADD CONSTRAINT customers_customer_type_check CHECK (customer_type IN ('b2b','b2c'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_payment_terms_check') THEN
    ALTER TABLE customers
      ADD CONSTRAINT customers_payment_terms_check
      CHECK (payment_terms IN ('immediate','net_15','net_30','net_45','net_60'));
  END IF;
END $$;

-- Search / filter support (list page filters by type, state, status; search
-- covers name, code, phone, gst_number).
CREATE INDEX IF NOT EXISTS idx_customers_tenant_type  ON customers(tenant_id, customer_type);
CREATE INDEX IF NOT EXISTS idx_customers_tenant_state ON customers(tenant_id, state);
CREATE INDEX IF NOT EXISTS idx_customers_tenant_phone ON customers(tenant_id, phone);
CREATE INDEX IF NOT EXISTS idx_customers_tenant_gst   ON customers(tenant_id, gst_number);

COMMENT ON COLUMN customers.customer_type IS 'b2b (GSTIN required) or b2c (no GSTIN)';
COMMENT ON COLUMN customers.payment_terms IS 'immediate | net_15 | net_30 | net_45 | net_60 — drives invoice due date';
COMMENT ON COLUMN customers.credit_limit  IS 'Optional INR limit; admin-only field. Warn when unpaid total + new order exceeds it.';

-- Module-level permission rows for the new Customers module (spec §7):
-- admin full, manager view/create/edit, worker none.
INSERT INTO role_permissions (tenant_id, role, module, action, allowed)
SELECT t.id, r.role, 'Customers', a.action,
       CASE
         WHEN r.role = 'admin'   THEN true
         WHEN r.role = 'manager' THEN a.action IN ('view','create','edit')
         ELSE false
       END
FROM tenants t
CROSS JOIN (VALUES ('admin'),('manager'),('worker')) AS r(role)
CROSS JOIN (VALUES ('view'),('create'),('edit'),('delete'),('manage')) AS a(action)
ON CONFLICT DO NOTHING;
