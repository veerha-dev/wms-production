-- Migration: 090_sku_barcode_uniqueness.sql
-- Description: One barcode may identify at most one SKU inside a tenant.
--   Scanning is only unambiguous if this holds: pick-lists resolve a scanned
--   string to a SKU, and two SKUs sharing a barcode make that resolution a
--   coin flip. Enforced with a PARTIAL unique index so the (many) SKUs without
--   a barcode are unaffected — NULL and '' both stay outside the index.
-- Date: 2026-08-02

-- ═══ De-duplicate before indexing ═══════════════════════════════════════════
-- Existing installs allowed duplicates (barcode was free text, set by hand or
-- by Excel import), so CREATE UNIQUE INDEX would fail on live data. Keep the
-- lowest-id row of each duplicate group and clear the barcode on the rest —
-- no SKU row is ever deleted, and the cleared ones can be re-issued an
-- auto-generated EAN-13 via POST /api/v1/skus/barcodes/backfill.
DO $$
DECLARE
  cleared_count INTEGER := 0;
  group_count   INTEGER := 0;
BEGIN
  SELECT COUNT(*) INTO group_count FROM (
    SELECT tenant_id, barcode
      FROM skus
     WHERE barcode IS NOT NULL AND barcode <> ''
     GROUP BY tenant_id, barcode
    HAVING COUNT(*) > 1
  ) d;

  IF group_count > 0 THEN
    WITH ranked AS (
      SELECT id,
             ROW_NUMBER() OVER (PARTITION BY tenant_id, barcode ORDER BY id) AS rn
        FROM skus
       WHERE barcode IS NOT NULL AND barcode <> ''
    )
    UPDATE skus s
       SET barcode = NULL, updated_at = NOW()
      FROM ranked r
     WHERE s.id = r.id AND r.rn > 1;

    GET DIAGNOSTICS cleared_count = ROW_COUNT;
    RAISE NOTICE '090_sku_barcode_uniqueness: cleared % duplicate barcode(s) across % group(s); the lowest-id SKU in each group kept its barcode', cleared_count, group_count;
  ELSE
    RAISE NOTICE '090_sku_barcode_uniqueness: no duplicate SKU barcodes found';
  END IF;
END $$;

-- ═══ The constraint ═════════════════════════════════════════════════════════
CREATE UNIQUE INDEX IF NOT EXISTS uniq_skus_tenant_barcode
  ON skus (tenant_id, barcode)
  WHERE barcode IS NOT NULL AND barcode <> '';

COMMENT ON INDEX uniq_skus_tenant_barcode IS
  'A barcode identifies at most one SKU per tenant. Partial: SKUs with no barcode (NULL or empty) are excluded.';
