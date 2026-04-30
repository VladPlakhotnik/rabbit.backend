-- Adds skin status + market_hash_name-parsed fields to csgo_skins.
--
-- Why:
--   - Market source-of-truth (market.csgo.com) is now authoritative for
--     "does this skin exist + price". Skins that disappear from the bulk
--     feed are kept in DB but flipped to `unavailable_on_market` rather
--     than deleted — they often come back, and we don't want to lose
--     case-skin links / inventory references.
--   - Each Steam Market hash_name combination is its own listing
--     (StatTrak / Souvenir / different exteriors are distinct). We parse
--     these out of `market_hash_name` to enable UI grouping ("AK-47
--     Asiimov: 5 variants from $35 to $410") without re-parsing in
--     application code on every render.
--
-- All new columns are nullable / default-valued so the migration is safe
-- on a populated table. The follow-up sync run fills them in.

ALTER TABLE csgo_skins
  ADD COLUMN IF NOT EXISTS status varchar(32) NOT NULL DEFAULT 'available',
  ADD COLUMN IF NOT EXISTS weapon varchar(255),
  ADD COLUMN IF NOT EXISTS skin_name varchar(255),
  ADD COLUMN IF NOT EXISTS is_stattrak boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_souvenir boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_seen_in_feed_at timestamp with time zone,
  -- Real (un-marked-up) price from the marketplace. `market_price` is
  -- the price users see and pay (= raw * (1 + markup)); we send
  -- `raw_market_price` to the buy-for endpoint as the cap. Keeping
  -- both lets us tune markup without re-syncing or polluting the
  -- price the rest of the app already uses.
  ADD COLUMN IF NOT EXISTS raw_market_price numeric(10, 2);

-- exterior column already exists from the original schema (varchar(255));
-- nothing to do for it here.

-- Status check — keep the value space tight so a typo in code doesn't
-- silently insert garbage.
ALTER TABLE csgo_skins DROP CONSTRAINT IF EXISTS csgo_skins_status_check;
ALTER TABLE csgo_skins
  ADD CONSTRAINT csgo_skins_status_check
  CHECK (status IN ('available', 'unavailable_on_market', 'disabled'));

-- UI grouping query: filter by (weapon, skin_name) to aggregate variants.
CREATE INDEX IF NOT EXISTS idx_csgo_skins_weapon_skin_name
  ON csgo_skins (weapon, skin_name);

-- Status filter — the case-opening + market UI both filter on
-- status='available' constantly.
CREATE INDEX IF NOT EXISTS idx_csgo_skins_status
  ON csgo_skins (status);

-- Stale-data sweep — pick skins that haven't been in the feed for >N
-- days and consider them gone. Indexed for fast scan.
CREATE INDEX IF NOT EXISTS idx_csgo_skins_last_seen
  ON csgo_skins (last_seen_in_feed_at);
