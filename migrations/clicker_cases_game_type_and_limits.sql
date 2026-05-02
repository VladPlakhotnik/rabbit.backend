-- Add `game_type` to clicker_cases + flip the seeded cases to limited
-- supply.
--
-- Why:
--   1. The shop now filters by CS / Dota at the server level, so we need
--      a discriminator column on clicker_cases. Default 'csgo' matches
--      every existing row (Dota clicker cases don't exist yet).
--   2. Product wants every clicker case to be a *limited supply* so we
--      can cap how many CSGO skins go out the door. The previous seed
--      shipped with `is_limited=false`; this migration flips both
--      starter / deluxe cases to limited mode and seeds reasonable
--      starting counts.
--
-- Caps chosen so the shop's "remaining" badge is meaningful but doesn't
-- run out during a small playtest:
--   rabbit-starter: 1000 (cheap case, gets opened often)
--   rabbit-deluxe:   200 (mid-tier, runs out faster — that's the point)
--
-- Idempotent — re-running won't reset `remaining_count` if the case was
-- already limited (CASE guard below).

BEGIN;

-- ---- 1. game_type column + CHECK + index --------------------------------
ALTER TABLE clicker_cases
  ADD COLUMN IF NOT EXISTS game_type varchar(16) NOT NULL DEFAULT 'csgo';

ALTER TABLE clicker_cases DROP CONSTRAINT IF EXISTS clicker_cases_game_type_check;
ALTER TABLE clicker_cases
  ADD CONSTRAINT clicker_cases_game_type_check
  CHECK (game_type IN ('csgo', 'dota'));

CREATE INDEX IF NOT EXISTS idx_clicker_cases_game_type
  ON clicker_cases (game_type);

-- ---- 2. Flip seeded cases to limited supply -----------------------------
-- Only set remaining_count when the case wasn't limited before, so we
-- don't reset progress on re-run.
UPDATE clicker_cases
   SET is_limited = true,
       max_count = 1000,
       remaining_count = CASE
         WHEN is_limited = false OR max_count = 0 THEN 1000
         ELSE remaining_count
       END,
       updated_at = NOW()
 WHERE slug = 'rabbit-starter';

UPDATE clicker_cases
   SET is_limited = true,
       max_count = 200,
       remaining_count = CASE
         WHEN is_limited = false OR max_count = 0 THEN 200
         ELSE remaining_count
       END,
       updated_at = NOW()
 WHERE slug = 'rabbit-deluxe';

COMMIT;
