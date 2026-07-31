-- Migration: 078_create_document_numbering.sql
-- Description: Per-tenant document number sequences (Settings > Masters >
--   Document Numbering). Replaces the count-based code generators used by
--   customers/suppliers/etc., which collide after a delete and race under
--   concurrency.
-- Date: 2026-08-01

CREATE TABLE IF NOT EXISTS document_numbering (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  doc_type VARCHAR(40) NOT NULL,
  prefix VARCHAR(20) NOT NULL,
  next_number INTEGER NOT NULL DEFAULT 1,
  number_length INTEGER NOT NULL DEFAULT 3,
  reset_yearly BOOLEAN NOT NULL DEFAULT false,
  last_reset_year INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_document_numbering_tenant_doc_type
  ON document_numbering (tenant_id, doc_type);

-- Seed defaults for every existing tenant. New tenants are seeded lazily by
-- DocumentNumberingService on first use.
INSERT INTO document_numbering (tenant_id, doc_type, prefix, number_length)
SELECT t.id, d.doc_type, d.prefix, 3
FROM tenants t
CROSS JOIN (VALUES
  ('customer',    'CUST-'),
  ('supplier',    'SUP-'),
  ('purchase_order', 'PO-'),
  ('sales_order', 'SO-'),
  ('grn',         'GRN-'),
  ('pick_list',   'PL-'),
  ('shipment',    'SHP-'),
  ('invoice',     'INV-'),
  ('transfer',    'TRF-'),
  ('cycle_count', 'CC-'),
  ('putaway',     'PUT-'),
  ('return',      'RET-'),
  ('task',        'TSK-')
) AS d(doc_type, prefix)
ON CONFLICT DO NOTHING;

-- Backfill the counter past any documents that already exist.
--
-- Seeding next_number = 1 on a tenant that already has CUST-001..CUST-050 makes
-- the very first create after this migration fail with a duplicate key on
-- idx_customers_tenant_code (23505) and keep failing until the counter walks
-- past the existing maximum. Existing installs must therefore start from
-- max(trailing digits) + 1. Fresh installs have no rows and stay at 1.
DO $$
DECLARE
  m RECORD;
BEGIN
  FOR m IN
    SELECT * FROM (VALUES
      ('customer',       'customers',       'code'),
      ('supplier',       'suppliers',       'code'),
      ('purchase_order', 'purchase_orders', 'po_number'),
      ('sales_order',    'sales_orders',    'so_number'),
      ('invoice',        'invoices',        'invoice_number'),
      ('pick_list',      'pick_lists',      'pick_list_number')
    ) AS v(doc_type, tbl, col)
  LOOP
    -- Skip doc types whose table/column is absent in this schema version.
    CONTINUE WHEN to_regclass('public.' || m.tbl) IS NULL;
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = m.tbl AND column_name = m.col
    );

    EXECUTE format($f$
      UPDATE document_numbering dn
         SET next_number = src.max_seq + 1,
             updated_at  = NOW()
        FROM (
          SELECT tenant_id,
                 MAX(COALESCE(NULLIF(substring(%I from '([0-9]+)$'), '')::bigint, 0)) AS max_seq
            FROM %I
           GROUP BY tenant_id
        ) AS src
       WHERE dn.tenant_id = src.tenant_id
         AND dn.doc_type  = %L
         AND src.max_seq >= dn.next_number
    $f$, m.col, m.tbl, m.doc_type);
  END LOOP;
END $$;
