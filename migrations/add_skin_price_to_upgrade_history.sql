-- The history page renders the target skin's price in a dedicated column
-- (Figma 68:30897). Reading it via JOIN on `csgo_skins.market_price` would
-- "drift" — the row would silently start showing a different number whenever
-- the catalog price moved. Snapshotting at upgrade time mirrors how the
-- `materials` jsonb already preserves source-skin prices, so a deleted or
-- repriced skin can still render a correct historical row.
--
-- Nullable so existing rows from before this migration stay valid; the
-- application code maps NULL to 0 when serialising the row.

ALTER TABLE upgrade_history
  ADD COLUMN IF NOT EXISTS skin_price numeric(10, 2);
