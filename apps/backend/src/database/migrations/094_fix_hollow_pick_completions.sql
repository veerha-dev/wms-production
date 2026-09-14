-- Migration: 094_fix_hollow_pick_completions.sql
-- Description: The `POST /pick-lists/:id/pick/:itemId` endpoint was a stub that
--              echoed success without writing quantity_picked, and complete()
--              had no guard requiring lines to actually be picked. Together they
--              let a pick list reach `completed` with every item still at 0,
--              which then (via advanceOrdersToPicked and migration 093's own
--              backfill, neither of which checked quantity_picked either) handed
--              empty orders to the packing queue. Both code paths are now fixed;
--              this repairs the data that was already corrupted by them.
-- Date: 2026-09-14

-- 1. Reopen pick lists marked completed while a line is still short, so a
--    picker can actually run them for real.
UPDATE pick_lists pl
   SET status = 'assigned', completed_at = NULL, updated_at = NOW()
 WHERE pl.status = 'completed'
   AND EXISTS (
     SELECT 1 FROM pick_list_items pli
      WHERE pli.pick_list_id = pl.id
        AND pli.quantity_picked < pli.quantity_required
   );

-- 2. Revert orders that were promoted to picking/picked purely off the back of
--    those hollow completions and have no genuinely picked quantity anywhere.
UPDATE sales_orders so
   SET status = 'confirmed', updated_at = NOW()
 WHERE so.status IN ('picked', 'picking')
   AND NOT EXISTS (
     SELECT 1 FROM pick_list_items pli
      JOIN pick_lists pl ON pli.pick_list_id = pl.id
     WHERE pl.status = 'completed'
       AND pli.quantity_picked > 0
       AND (pli.so_id = so.id OR (pli.so_id IS NULL AND pl.so_id = so.id))
   );

-- 3. Nothing legitimate could have been packed against zero picked quantity —
--    drop any packing sessions left behind on orders this just reverted.
DELETE FROM packing_session_items WHERE packing_session_id IN (
  SELECT ps.id FROM packing_sessions ps
    JOIN sales_orders so ON so.id = ps.so_id
   WHERE so.status = 'confirmed'
);
DELETE FROM packing_packages WHERE packing_session_id IN (
  SELECT ps.id FROM packing_sessions ps
    JOIN sales_orders so ON so.id = ps.so_id
   WHERE so.status = 'confirmed'
);
DELETE FROM packing_sessions ps
 USING sales_orders so
WHERE so.id = ps.so_id AND so.status = 'confirmed';
