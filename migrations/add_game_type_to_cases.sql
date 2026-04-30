-- Adds `game_type` to cases — distinguishes CS / Dota cases at the
-- catalog level. Skin-side polymorphism (SkinCase, UserInventory)
-- comes in PR3b/c; this migration is intentionally minimal.
--
-- Default 'csgo' on existing rows: every case in the DB today maps
-- to CSGO skins via skin_case → csgo_skins, so the default reflects
-- reality. New Dota cases will be created with game_type='dota'
-- (admin tool / direct SQL until the admin UI lands).

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS game_type varchar(16) NOT NULL DEFAULT 'csgo';

-- Lock the value space so a typo doesn't slip in via a careless
-- update.
ALTER TABLE cases DROP CONSTRAINT IF EXISTS cases_game_type_check;
ALTER TABLE cases
  ADD CONSTRAINT cases_game_type_check
  CHECK (game_type IN ('csgo', 'dota'));

-- The catalog list endpoint filters on game_type heavily; the index
-- pays for itself within hours of going live.
CREATE INDEX IF NOT EXISTS idx_cases_game_type
  ON cases (game_type);
