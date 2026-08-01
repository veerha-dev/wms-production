-- Migration: 089_backfill_remaining_doc_numbering.sql
-- Description: Brings the last five count-based generators (GRN, shipment,
--   return, task, putaway) onto document_numbering. Migration 078 created the
--   table and backfilled six doc types; the remaining five kept the
--   `PREFIX-{rowCount + 1}` pattern precisely because they had no backfill —
--   switching them without one starts the counter at 1 on an install that
--   already holds GRN-001..GRN-042 and every create fails on the tenant-scoped
--   unique index (23505) until the counter walks past the maximum.
--
--   This migration is the missing half: it guarantees a row per (tenant,
--   doc_type) and lifts next_number past the highest number already issued.
-- Date: 2026-08-01

-- ── 1. Prefix reconciliation: putaway is PA-, not PUT- ──────────────────────
--
-- 078 seeded `putaway` with 'PUT-' but PutawayService has always generated
-- `PA-001`, so every putaway_tasks row in the wild carries PA-. Honouring the
-- seed would fork live document numbers across two prefixes and make the
-- backfill below meaningless (the max of PA-xxx would be applied to a PUT-
-- counter). Existing numbers win: the catalog moves to PA-.
--
-- Guarded on the current value so a tenant that deliberately customised its
-- putaway prefix in Settings > Masters keeps their choice.
UPDATE document_numbering
   SET prefix = 'PA-', updated_at = NOW()
 WHERE doc_type = 'putaway'
   AND prefix = 'PUT-';

-- ── 2. Guarantee a numbering row for every tenant × these five doc types ────
--
-- 078's seed covers tenants that existed when it ran; tenants created since
-- then are seeded lazily by DocumentNumberingService.ensureRow on first use,
-- which may not have happened yet. The backfill in step 3 is an UPDATE, so a
-- missing row would silently skip that tenant and leave it starting at 1.
INSERT INTO document_numbering (tenant_id, doc_type, prefix, number_length)
SELECT t.id, d.doc_type, d.prefix, 3
FROM tenants t
CROSS JOIN (VALUES
  ('grn',      'GRN-'),
  ('shipment', 'SHP-'),
  ('return',   'RET-'),
  ('task',     'TSK-'),
  ('putaway',  'PA-')
) AS d(doc_type, prefix)
ON CONFLICT (tenant_id, doc_type) DO NOTHING;

-- ── 3. Backfill each counter past the documents that already exist ─────────
--
-- Same shape as 078's backfill: per-tenant MAX of the trailing digit run, +1,
-- applied only when it is ahead of the counter (never rewinds a counter that a
-- tenant already advanced). to_regclass / information_schema guards keep the
-- migration runnable against a schema version where a table or column is
-- absent. Fresh installs have no rows, so every counter stays at 1.
DO $$
DECLARE
  m RECORD;
BEGIN
  FOR m IN
    SELECT * FROM (VALUES
      ('grn',      'grn',            'grn_number'),
      ('shipment', 'shipments',      'shipment_number'),
      ('return',   'returns',        'return_number'),
      ('task',     'tasks',          'task_number'),
      ('putaway',  'putaway_tasks',  'putaway_number')
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
