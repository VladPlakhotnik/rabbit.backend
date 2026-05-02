-- Catalog + inventory for consumable clicker boosts.
--
-- Two tables, one append-only and one mutable:
--
--   clicker_boosts        — admin-curated catalog. Adding / pricing /
--                            deprecating boosts goes through this table
--                            (or an admin tool that writes to it). The
--                            `key` column is the stable cross-system
--                            identifier — Lua scripts, audit log entries,
--                            and the frontend all reference boosts by
--                            key, never by id.
--   clicker_user_boosts   — per-player stockpile. (user_id, boost_key)
--                            is the natural primary key — the player
--                            owns N copies of a given boost; buying
--                            increments, activating decrements.
--
-- effect_type controls what Lua does on activation (PR6):
--   'infinite_energy' → click pays no energy while active
--   'multiplier'      → click reward × effect_value while active
-- effect_value is the multiplier (10 = x10) or 0 / unused for
-- infinite_energy.
--
-- Idempotent: re-runs are safe.

BEGIN;

-- ---- 1. clicker_boosts (catalog) -----------------------------------------
CREATE TABLE IF NOT EXISTS clicker_boosts (
  id           serial PRIMARY KEY,
  key          varchar(64) NOT NULL UNIQUE,
  name         varchar(128) NOT NULL,
  description  varchar(512),
  price        integer NOT NULL CHECK (price >= 0),
  duration_sec integer NOT NULL CHECK (duration_sec > 0),
  effect_type  varchar(32) NOT NULL,
  effect_value integer NOT NULL DEFAULT 0,
  -- Admin soft-lock — pulling a boost without DELETEing the row.
  is_available boolean NOT NULL DEFAULT true,
  image_url    varchar NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT NOW(),
  updated_at   timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT clicker_boosts_effect_type_chk
    CHECK (effect_type IN ('infinite_energy', 'multiplier'))
);

INSERT INTO clicker_boosts (key, name, description, price, duration_sec, effect_type, effect_value)
VALUES
  ('infinite_energy_10s', 'Infinite Energy',
   '10 seconds without energy cost', 800, 10, 'infinite_energy', 0),
  ('x10_multiplier', 'x10 Multiplier',
   'Every tap counts as ten for 30 seconds', 5000, 30, 'multiplier', 10)
ON CONFLICT (key) DO UPDATE SET
  name         = EXCLUDED.name,
  description  = EXCLUDED.description,
  price        = EXCLUDED.price,
  duration_sec = EXCLUDED.duration_sec,
  effect_type  = EXCLUDED.effect_type,
  effect_value = EXCLUDED.effect_value,
  updated_at   = NOW();

-- ---- 2. clicker_user_boosts (inventory) ----------------------------------
-- Composite PK keeps lookups O(1) on the natural query
-- ("how many of this boost does this user own?") and prevents the table
-- from growing duplicate rows. ON DELETE CASCADE on user_id so a deleted
-- user takes their inventory with them; ON DELETE RESTRICT on boost_key
-- so accidentally deleting a boost catalog row leaves the inventory
-- intact (admin must zero counts first).
CREATE TABLE IF NOT EXISTS clicker_user_boosts (
  user_id    integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  boost_key  varchar(64) NOT NULL REFERENCES clicker_boosts(key) ON DELETE RESTRICT,
  count      integer NOT NULL DEFAULT 0 CHECK (count >= 0),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, boost_key)
);

-- Sequence catch-up — boots row sometimes added by hand later, keeps
-- nextval ahead of MAX(id).
SELECT setval(
  'clicker_boosts_id_seq',
  GREATEST(1, (SELECT COALESCE(MAX(id), 0) FROM clicker_boosts))
);

COMMIT;
