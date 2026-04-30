-- TM market.csgo.com class_instance fields.
--
-- These come from `/api/v2/prices/class_instance/{currency}.json`
-- (a different endpoint than the bulk price feed in prices/{currency}.json
-- that we already poll). The class_instance endpoint exposes per-listing
-- class+instance pairs with extra fields the bulk feed doesn't carry.
--
-- Daily-static fields:
--   ru_name      — Russian display name (e.g. "AK-47 | Азимов (...)")
--   ru_quality   — quality on Russian (e.g. "После полевых испытаний")
--   rarity       — rarity tier on Russian (e.g. "Тайное", "Засекреченное")
--   phase        — Doppler / Marble Fade phase, empty for non-phase skins
--
-- Volatile (refreshed daily — buy/sell-side market signals):
--   buy_order      — the highest current bid: max someone is willing to
--                    pay right now (for "instant cash-out" pricing)
--   avg_price      — moving-average price across recent sales
--   popularity_7d  — number of sales in the last 7 days
--
-- All nullable: a skin row created via the price feed (which only has
-- price/volume) gets these populated only after the next class_instance
-- sync runs. Existing CS rows already enriched by DMarket get the same
-- columns filled in over time.
--
-- DotaSkin already declares `rarity` (it had its own meaning there);
-- the migration is conditional on column existence so re-running is
-- safe on either game's table.

-- ============ csgo_skins ============
ALTER TABLE csgo_skins ADD COLUMN IF NOT EXISTS buy_order numeric(10,2);
ALTER TABLE csgo_skins ADD COLUMN IF NOT EXISTS avg_price numeric(10,2);
ALTER TABLE csgo_skins ADD COLUMN IF NOT EXISTS popularity_7d integer;
ALTER TABLE csgo_skins ADD COLUMN IF NOT EXISTS ru_name varchar(255);
ALTER TABLE csgo_skins ADD COLUMN IF NOT EXISTS ru_quality varchar(64);
ALTER TABLE csgo_skins ADD COLUMN IF NOT EXISTS rarity varchar(64);
ALTER TABLE csgo_skins ADD COLUMN IF NOT EXISTS phase varchar(32);

-- Indexed: rarity is the most common filter on the market UI; the
-- others are read but not filtered on, so no index needed.
CREATE INDEX IF NOT EXISTS idx_csgo_skins_rarity ON csgo_skins(rarity)
  WHERE rarity IS NOT NULL;

-- ============ dota_skins ============
ALTER TABLE dota_skins ADD COLUMN IF NOT EXISTS buy_order numeric(10,2);
ALTER TABLE dota_skins ADD COLUMN IF NOT EXISTS avg_price numeric(10,2);
ALTER TABLE dota_skins ADD COLUMN IF NOT EXISTS popularity_7d integer;
ALTER TABLE dota_skins ADD COLUMN IF NOT EXISTS ru_name varchar(255);
ALTER TABLE dota_skins ADD COLUMN IF NOT EXISTS ru_quality varchar(64);
ALTER TABLE dota_skins ADD COLUMN IF NOT EXISTS phase varchar(32);
-- `rarity` already exists on dota_skins from the original schema.
