-- Clicker level tables: refactor + seed.
--
-- Why: clicker_levels used to carry `reward_per_click` and `upgrade_cost`,
-- but the per-click reward already lives in clicker_click_levels (the
-- boost), and "upgrade_cost" was misleading — for clicker_levels it's the
-- points threshold needed to *reach* the rank, not the cost of an upgrade.
--
-- This migration:
--   1. Drops `reward_per_click` from clicker_levels.
--   2. Renames `upgrade_cost` to `points_required` on the same table.
--   3. Ensures `level` exists on clicker_energy_levels.
--   4. Heals id sequences if missing.
--   5. Seeds 15 bunny ranks with rebalanced thresholds (more granular early
--      progression so the progress bar visibly moves between L1-L10),
--      10 click-boost levels, and 10 energy-boost levels.
--
-- Idempotent — safe to re-run.

BEGIN;

-- ---- 1. Schema for clicker_levels ----------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clicker_levels' AND column_name = 'reward_per_click'
  ) THEN
    ALTER TABLE clicker_levels DROP COLUMN reward_per_click;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clicker_levels' AND column_name = 'upgrade_cost'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clicker_levels' AND column_name = 'points_required'
  ) THEN
    ALTER TABLE clicker_levels RENAME COLUMN upgrade_cost TO points_required;
  END IF;
END $$;

ALTER TABLE clicker_levels
  ADD COLUMN IF NOT EXISTS points_required integer NOT NULL DEFAULT 0;
ALTER TABLE clicker_levels
  ADD COLUMN IF NOT EXISTS image_url varchar NOT NULL DEFAULT '';
ALTER TABLE clicker_levels
  ADD COLUMN IF NOT EXISTS level integer NOT NULL DEFAULT 1;

-- ---- 2. Schema for clicker_energy_levels ---------------------------------
ALTER TABLE clicker_energy_levels
  ADD COLUMN IF NOT EXISTS level integer NOT NULL DEFAULT 1;
ALTER TABLE clicker_energy_levels
  ADD COLUMN IF NOT EXISTS image_url varchar NOT NULL DEFAULT '';

-- ---- 3. Heal id sequences ------------------------------------------------
DO $$
DECLARE
  tname text;
BEGIN
  FOR tname IN
    SELECT unnest(ARRAY[
      'clicker_levels',
      'clicker_click_levels',
      'clicker_energy_levels'
    ])
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = tname
        AND column_name = 'id'
        AND column_default LIKE 'nextval%'
    ) THEN
      EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I', tname || '_id_seq');
      EXECUTE format(
        'ALTER SEQUENCE %I OWNED BY %I.id',
        tname || '_id_seq', tname
      );
      EXECUTE format(
        'ALTER TABLE %I ALTER COLUMN id SET DEFAULT nextval(%L)',
        tname, tname || '_id_seq'
      );
    END IF;
  END LOOP;
END $$;

-- ---- 4. Move users off any boost level above 10 (FK guard) ---------------
-- The seed below caps click/energy boosts at 10 — anyone already promoted
-- past that gets pinned at 10 so the subsequent DELETE doesn't trip the
-- foreign key.
UPDATE clicker_users SET click_level_id = 10  WHERE click_level_id  > 10;
UPDATE clicker_users SET energy_level_id = 10 WHERE energy_level_id > 10;

-- Drop any boost rows above 10 from previous migrations.
DELETE FROM clicker_click_levels  WHERE id > 10;
DELETE FROM clicker_energy_levels WHERE id > 10;

-- ---- 5. Seed: bunny ranks (clicker_levels) -------------------------------
-- `points_required` is cumulative — the player's `points` must reach this
-- value to be promoted to the rank. Level 1 starts at 0.
-- Thresholds rebalanced for more visible progress at low levels.
INSERT INTO clicker_levels (id, level, image_url, points_required, created_at, updated_at)
VALUES
  ( 1,  1, '',         0, NOW(), NOW()),
  ( 2,  2, '',       100, NOW(), NOW()),
  ( 3,  3, '',       500, NOW(), NOW()),
  ( 4,  4, '',      2000, NOW(), NOW()),
  ( 5,  5, '',      8000, NOW(), NOW()),
  ( 6,  6, '',     25000, NOW(), NOW()),
  ( 7,  7, '',     75000, NOW(), NOW()),
  ( 8,  8, '',    200000, NOW(), NOW()),
  ( 9,  9, '',    500000, NOW(), NOW()),
  (10, 10, '',   1200000, NOW(), NOW()),
  (11, 11, '',   3000000, NOW(), NOW()),
  (12, 12, '',   7500000, NOW(), NOW()),
  (13, 13, '',  18000000, NOW(), NOW()),
  (14, 14, '',  45000000, NOW(), NOW()),
  (15, 15, '', 100000000, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  level           = EXCLUDED.level,
  image_url       = EXCLUDED.image_url,
  points_required = EXCLUDED.points_required,
  updated_at      = NOW();

-- ---- 6. Seed: click boost (clicker_click_levels) -------------------------
-- 10 levels. `reward_per_click` is the points granted (and energy spent)
-- per click. `upgrade_cost` is the points the player spends to buy this
-- level. Level 1 is free (everyone starts there).
INSERT INTO clicker_click_levels (id, level, image_url, reward_per_click, upgrade_cost, created_at, updated_at)
VALUES
  ( 1,  1, '',  1,      0, NOW(), NOW()),
  ( 2,  2, '',  2,    200, NOW(), NOW()),
  ( 3,  3, '',  3,    800, NOW(), NOW()),
  ( 4,  4, '',  4,   2500, NOW(), NOW()),
  ( 5,  5, '',  5,   8000, NOW(), NOW()),
  ( 6,  6, '',  7,  20000, NOW(), NOW()),
  ( 7,  7, '', 10,  50000, NOW(), NOW()),
  ( 8,  8, '', 15, 120000, NOW(), NOW()),
  ( 9,  9, '', 20, 300000, NOW(), NOW()),
  (10, 10, '', 30, 750000, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  level            = EXCLUDED.level,
  image_url        = EXCLUDED.image_url,
  reward_per_click = EXCLUDED.reward_per_click,
  upgrade_cost     = EXCLUDED.upgrade_cost,
  updated_at       = NOW();

-- ---- 7. Seed: energy boost (clicker_energy_levels) -----------------------
-- 10 levels. `energy_amount` is the max energy capacity this level grants;
-- `upgrade_cost` is the points the player spends to buy this level.
INSERT INTO clicker_energy_levels (id, level, image_url, energy_amount, upgrade_cost, created_at, updated_at)
VALUES
  ( 1,  1, '',  1000,      0, NOW(), NOW()),
  ( 2,  2, '',  2000,    200, NOW(), NOW()),
  ( 3,  3, '',  3500,    800, NOW(), NOW()),
  ( 4,  4, '',  5000,   2500, NOW(), NOW()),
  ( 5,  5, '',  7500,   8000, NOW(), NOW()),
  ( 6,  6, '', 10000,  20000, NOW(), NOW()),
  ( 7,  7, '', 15000,  50000, NOW(), NOW()),
  ( 8,  8, '', 20000, 120000, NOW(), NOW()),
  ( 9,  9, '', 30000, 300000, NOW(), NOW()),
  (10, 10, '', 50000, 750000, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  level         = EXCLUDED.level,
  image_url     = EXCLUDED.image_url,
  energy_amount = EXCLUDED.energy_amount,
  upgrade_cost  = EXCLUDED.upgrade_cost,
  updated_at    = NOW();

-- ---- 8. Bring sequences past the highest manually-inserted id ------------
SELECT setval(
  'clicker_levels_id_seq',
  GREATEST(1, (SELECT COALESCE(MAX(id), 0) FROM clicker_levels))
);
SELECT setval(
  'clicker_click_levels_id_seq',
  GREATEST(1, (SELECT COALESCE(MAX(id), 0) FROM clicker_click_levels))
);
SELECT setval(
  'clicker_energy_levels_id_seq',
  GREATEST(1, (SELECT COALESCE(MAX(id), 0) FROM clicker_energy_levels))
);

COMMIT;
