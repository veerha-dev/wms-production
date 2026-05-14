-- Migration: 070_add_tote_code_to_pick_list_items
-- Description: Per PDF §3.3 Batch Picking — when batch picking is used, each Sales Order in the
--              batch gets its own tote so the picker drops items into the right slot in one walk.
--              Tote codes are assigned alphabetically per SO inside the batch (Tote A, Tote B, ...).

ALTER TABLE pick_list_items
  ADD COLUMN IF NOT EXISTS tote_code TEXT;

CREATE INDEX IF NOT EXISTS idx_pli_tote_code ON pick_list_items(tote_code);

COMMENT ON COLUMN pick_list_items.tote_code IS
  'Per-SO tote within a batch pick. NULL for single/wave/zone strategies that do not consolidate by SO.';
