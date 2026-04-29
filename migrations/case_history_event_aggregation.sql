-- Aggregate case_history by event instead of per-drop.
--
-- Before this migration: opening 5 boxes in one click wrote 5 rows. With
-- a few thousand active users multi-opening daily, that explodes the
-- table fast. After: one row per open-case event regardless of count;
-- individual drops live in a JSONB array on the same row.
--
-- New columns
--   total_drops INTEGER  -- how many boxes were opened (1..5)
--   total_cost  NUMERIC  -- case_price * total_drops, denormalised
--   drops       JSONB    -- [{skin_id, skin_name, skin_img, skin_price, server_seed}, ...]
--
-- Backfill strategy
--   Existing rows = one drop each. Set total_drops=1, total_cost=case_price,
--   and pack the legacy single-skin fields into a one-element drops array
--   so the new read path treats old and new rows identically.

ALTER TABLE case_history
  ADD COLUMN IF NOT EXISTS total_drops INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS total_cost NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS drops JSONB;

UPDATE case_history
SET
  total_cost = case_price,
  drops = jsonb_build_array(
    jsonb_strip_nulls(
      jsonb_build_object(
        'skin_id', skin_id,
        'skin_name', skin_name,
        'skin_img', skin_img,
        'skin_price', skin_price,
        'server_seed', server_seed
      )
    )
  )
WHERE drops IS NULL;
