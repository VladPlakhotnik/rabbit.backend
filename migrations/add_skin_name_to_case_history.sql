-- Add `skin_name` to case_history.
--
-- Captures the full market_hash_name of the dropped skin at open-case
-- time. The profile's case-history detail modal renders weapon + skin
-- labels from this — without it we'd have to JOIN csgo_skins on every
-- read, and would lose history rows for skins later removed from the
-- catalogue.
--
-- Nullable on purpose: rows written before this column exists will
-- backfill as NULL and the frontend renders a generic "Drop" label for
-- those, never crashing.
ALTER TABLE case_history
  ADD COLUMN IF NOT EXISTS skin_name VARCHAR(255);
