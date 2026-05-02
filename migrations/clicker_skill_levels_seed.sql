-- Skill upgrade tracks for the new auto-clicker / crit-click skills.
-- Mirrors the shape of clicker_click_levels and clicker_energy_levels —
-- one row per tier, players move up by spending points (carrots).
--
-- Locked behind a Shop purchase: clicker_users.{auto_clicker_level_id,
-- crit_click_level_id} stay NULL until the player buys the skill,
-- which then writes 1 (= just unlocked, level 1). The UpgradeModal on
-- the game tab steps it up from there.
--
-- Why two skills as separate tables instead of one polymorphic skill
-- table: each skill has its OWN payoff dimension — auto-clicker measures
-- duration in seconds, crit-click measures chance in percent. Forcing
-- both into a single `reward integer` would lose that meaning at the
-- type level and force every consumer (Lua scripts, frontend UI) to
-- branch on `skill_kind` anyway. Two tables = self-documenting.
--
-- Idempotent — safe to re-run.

BEGIN;

-- ---- 1. clicker_auto_clicker_levels --------------------------------------
-- duration_sec: how long the autoclicker keeps generating clicks for
-- the player after an Activate. Cost climbs ~3× per tier so each
-- upgrade feels meaningful but not punishing.
CREATE TABLE IF NOT EXISTS clicker_auto_clicker_levels (
  id            serial PRIMARY KEY,
  level         integer NOT NULL,
  upgrade_cost  integer NOT NULL,
  duration_sec  integer NOT NULL CHECK (duration_sec > 0),
  image_url     varchar NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT NOW(),
  updated_at    timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (level)
);

INSERT INTO clicker_auto_clicker_levels (id, level, upgrade_cost, duration_sec)
VALUES
  (1, 1,   1000,  10),
  (2, 2,   3000,  30),
  (3, 3,   8000,  60),
  (4, 4,  20000, 120),
  (5, 5,  50000, 300)
ON CONFLICT (id) DO UPDATE SET
  level        = EXCLUDED.level,
  upgrade_cost = EXCLUDED.upgrade_cost,
  duration_sec = EXCLUDED.duration_sec,
  updated_at   = NOW();

-- ---- 2. clicker_crit_click_levels ----------------------------------------
-- crit_chance_pct: integer percent (0-100). A click rolls a random
-- number on the server side; if it falls under crit_chance_pct the
-- click pays out at crit_multiplier × normal cost.
-- Multiplier stays fixed at x10 across all tiers — varying both
-- dimensions makes the upgrade modal unreadable.
CREATE TABLE IF NOT EXISTS clicker_crit_click_levels (
  id              serial PRIMARY KEY,
  level           integer NOT NULL,
  upgrade_cost    integer NOT NULL,
  crit_chance_pct integer NOT NULL CHECK (crit_chance_pct >= 0 AND crit_chance_pct <= 100),
  image_url       varchar NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  updated_at      timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (level)
);

INSERT INTO clicker_crit_click_levels (id, level, upgrade_cost, crit_chance_pct)
VALUES
  (1, 1,   1500,  5),
  (2, 2,   4000,  8),
  (3, 3,  10000, 12),
  (4, 4,  25000, 16),
  (5, 5,  60000, 20)
ON CONFLICT (id) DO UPDATE SET
  level           = EXCLUDED.level,
  upgrade_cost    = EXCLUDED.upgrade_cost,
  crit_chance_pct = EXCLUDED.crit_chance_pct,
  updated_at      = NOW();

-- ---- 3. clicker_users — add nullable level_id columns --------------------
-- NULL = skill not unlocked; integer >= 1 = unlocked at that tier.
-- Foreign-key to the level catalog so an admin can't accidentally point
-- a user at a tier that doesn't exist. ON DELETE SET NULL would leave
-- a player without a skill if a level row is removed, which is
-- preferable to a hard error mid-click.
ALTER TABLE clicker_users
  ADD COLUMN IF NOT EXISTS auto_clicker_level_id integer
    REFERENCES clicker_auto_clicker_levels(id) ON DELETE SET NULL;

ALTER TABLE clicker_users
  ADD COLUMN IF NOT EXISTS crit_click_level_id integer
    REFERENCES clicker_crit_click_levels(id) ON DELETE SET NULL;

-- ---- 4. Bring sequences past the manually-inserted rows -----------------
SELECT setval(
  'clicker_auto_clicker_levels_id_seq',
  GREATEST(1, (SELECT COALESCE(MAX(id), 0) FROM clicker_auto_clicker_levels))
);
SELECT setval(
  'clicker_crit_click_levels_id_seq',
  GREATEST(1, (SELECT COALESCE(MAX(id), 0) FROM clicker_crit_click_levels))
);

COMMIT;
