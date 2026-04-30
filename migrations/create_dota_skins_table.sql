-- Creates dota_skins — parallel structure to csgo_skins, minus the
-- CS-only fields (float_value, float_part_value, pattern, exterior,
-- is_stattrak, is_souvenir). Dota 2 has its own quality/rarity model
-- (Genuine, Inscribed, Heroic, ...) but no exterior tiers, no
-- StatTrak, no Souvenir.
--
-- Source of truth: market.dota2.net (the Dota counterpart of
-- market.csgo.com — same operator, same API). DMarket
-- (gameId='9a92') is metadata enrichment.
--
-- Schema mirrors csgo_skins so the column names line up across
-- modules — easier to share helpers and reason about. If a column is
-- different, that's intentional.

CREATE TABLE IF NOT EXISTS dota_skins (
  id                    serial PRIMARY KEY,
  market_hash_name      varchar(255) NOT NULL UNIQUE,

  -- Lifecycle / status. Same enum as csgo_skins.
  status                varchar(32) NOT NULL DEFAULT 'available',
  last_seen_in_feed_at  timestamp with time zone,

  -- Pricing (display + raw — see csgo_skins comments for split).
  market_price          numeric(10, 2),
  raw_market_price      numeric(10, 2),
  amount_in_market      varchar(255),

  -- Display metadata (filled by DMarket sync). All nullable —
  -- price-feed-only stubs may not have these yet.
  name                  varchar(255),
  image                 varchar(1024),
  slug                  varchar(255),
  inspect_in_game       varchar(1024),
  name_color            varchar(255),
  background_color      varchar(255),

  -- Dota-specific decorative metadata.
  -- quality: Genuine / Unique / Strange / Vintage / Self-Made /
  --          Frozen / Cursed / Corrupted / Heroic / etc.
  -- rarity:  Common / Uncommon / Rare / Mythical / Legendary /
  --          Immortal / Arcana / Ancient.
  -- hero:    bound hero ("Pudge", "Anti-Mage", ...) — DMarket exposes
  --          this in `extra.hero` for Dota.
  -- slot:    item slot ("weapon", "head", "armor", ...).
  quality               varchar(64),
  rarity                varchar(64),
  hero                  varchar(128),
  slot                  varchar(64),

  collection            varchar(255)[],
  category              varchar(255),
  item_type             varchar(255),

  is_new                boolean NOT NULL DEFAULT false,

  created_at            timestamp without time zone DEFAULT now(),
  updated_at            timestamp without time zone DEFAULT now(),

  CONSTRAINT dota_skins_status_check
    CHECK (status IN ('available', 'unavailable_on_market', 'disabled'))
);

CREATE INDEX IF NOT EXISTS idx_dota_skins_status
  ON dota_skins (status);

CREATE INDEX IF NOT EXISTS idx_dota_skins_hero
  ON dota_skins (hero);

CREATE INDEX IF NOT EXISTS idx_dota_skins_rarity
  ON dota_skins (rarity);

CREATE INDEX IF NOT EXISTS idx_dota_skins_last_seen
  ON dota_skins (last_seen_in_feed_at);
