-- Seed the first Dota 2 case + relax skin_case FK so Dota hash_names
-- can be referenced.
--
-- Steps (idempotent — safe to re-run):
--   1. Drop the legacy FK skin_case → csgo_skins so the table can hold
--      hash_names from either game.
--   2. Add a `game_type` discriminator column to skin_case (defaults
--      'csgo' for existing rows, CHECK whitelists csgo|dota).
--   3. Ensure a "Dota 2" section exists.
--   4. Insert the case row with the user-provided image + price.
--   5. Pick the top-10 currently-popular Dota skins under $5 and link
--      them to the case via skin_case rows. Drop chance is proportional
--      to 1/market_price, normalized so the column sums to ~100.
--
-- Scope: this is the minimal "make a Dota case visible on the site"
-- step. It does NOT make case-opening / inventory / upgrade work for
-- Dota — that's the polymorphism work in the next PR (UserInventory,
-- openCase dispatch on case.game_type, etc.).

BEGIN;

-- ---- 0. Heal id sequences ---------------------------------------------
-- Some PK columns (sections.id, cases.id, skin_case.id) lack a
-- default-bound sequence, so plain INSERT INTO ... (without explicit id)
-- fails with "null value in column id". TypeORM's
-- @PrimaryGeneratedColumn() should emit a SERIAL/IDENTITY when the
-- table is created, but if a table was created via raw SQL or the
-- sequence was dropped at some point, INSERTs break.
--
-- This block detects "no default" on each id column and attaches a
-- fresh sequence pointing at MAX(id)+1. Idempotent: skips silently
-- when a sequence is already in place.
DO $heal_sequences$
DECLARE
  tbl text;
  seq_name text;
  has_default boolean;
  max_id bigint;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['sections', 'cases', 'skin_case']
  LOOP
    SELECT (column_default IS NOT NULL AND column_default LIKE 'nextval%')
      INTO has_default
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = tbl
      AND column_name = 'id';

    IF NOT COALESCE(has_default, false) THEN
      seq_name := tbl || '_id_seq';
      EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I OWNED BY %I.id', seq_name, tbl);
      EXECUTE format('SELECT COALESCE(MAX(id), 0) FROM %I', tbl) INTO max_id;
      -- setval(seq, n, false) → next nextval returns exactly n. Use
      -- max_id + 1 so the first INSERT after this gets MAX(id) + 1
      -- regardless of whether the table was empty.
      EXECUTE format('SELECT setval(%L, %s, false)', seq_name, max_id + 1);
      EXECUTE format(
        'ALTER TABLE %I ALTER COLUMN id SET DEFAULT nextval(%L)',
        tbl, seq_name
      );
      RAISE NOTICE 'Attached sequence % to %.id (next id = %)',
        seq_name, tbl, max_id + 1;
    END IF;
  END LOOP;
END
$heal_sequences$;

-- ---- 1. Drop the FK skin_case → csgo_skins ----------------------------
-- Look up the constraint by what it references rather than guess at
-- the TypeORM-generated name. Idempotent: skip silently when there's
-- nothing to drop.
DO $$
DECLARE
  fk_name text;
BEGIN
  SELECT conname INTO fk_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'skin_case'
    AND c.contype = 'f'
    AND pg_get_constraintdef(c.oid) LIKE '%csgo_skins%';

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE skin_case DROP CONSTRAINT %I', fk_name);
    RAISE NOTICE 'Dropped FK constraint on skin_case: %', fk_name;
  ELSE
    RAISE NOTICE 'No FK from skin_case → csgo_skins found (already dropped?)';
  END IF;
END $$;

-- ---- 2. Add game_type column + check constraint ----------------------
ALTER TABLE skin_case
  ADD COLUMN IF NOT EXISTS game_type varchar(16) NOT NULL DEFAULT 'csgo';

-- Add CHECK only if not present already (no IF NOT EXISTS for CHECK).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'skin_case_game_type_check'
  ) THEN
    ALTER TABLE skin_case
      ADD CONSTRAINT skin_case_game_type_check
      CHECK (game_type IN ('csgo', 'dota'));
  END IF;
END $$;

-- ---- 3. Section "Dota 2" ---------------------------------------------
INSERT INTO sections (name, icon)
SELECT 'Dota 2', '/icons/dota.svg'
WHERE NOT EXISTS (SELECT 1 FROM sections WHERE name = 'Dota 2');

-- ---- 4. Case row -----------------------------------------------------
INSERT INTO cases (
  slug, name, img_url, game_type, case_price,
  remaining_count, max_count, is_popular, is_limited, section_id
)
SELECT
  'dota-2-starter',
  'Dota 2 Стартовый',
  'https://epicloot.run/assets/img/cases/558dbb185239103bbf1f965f113f6a896f56.webp',
  'dota',
  1.50,
  1000,
  1000,
  false,
  false,
  (SELECT id FROM sections WHERE name = 'Dota 2' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM cases WHERE slug = 'dota-2-starter');

-- ---- 5. Ten skin_case rows -------------------------------------------
-- Only fires if the case was just inserted AND has no skin_case rows
-- yet. Re-running the migration after manual tweaks (chance, swap a
-- skin) won't clobber anything.
WITH new_case AS (
  SELECT id FROM cases WHERE slug = 'dota-2-starter' LIMIT 1
),
selected AS (
  SELECT market_hash_name, market_price
  FROM dota_skins
  WHERE image IS NOT NULL AND image != ''
    AND market_price BETWEEN 0.50 AND 5.00
    AND popularity_7d > 0
    AND status = 'available'
  ORDER BY popularity_7d DESC
  LIMIT 10
),
chance_calc AS (
  SELECT
    market_hash_name,
    ROUND(
      ((1.0 / market_price) / SUM(1.0 / market_price) OVER ())::numeric * 100,
      2
    ) AS chance
  FROM selected
)
INSERT INTO skin_case (case_id, skin_hash_name, chance, is_drop_out, game_type)
SELECT
  (SELECT id FROM new_case),
  market_hash_name,
  chance,
  true,
  'dota'
FROM chance_calc
WHERE NOT EXISTS (
  SELECT 1 FROM skin_case WHERE case_id = (SELECT id FROM new_case)
);

COMMIT;

-- ---- Verify ---------------------------------------------------------
-- Run after applying to confirm the case + 10 skins are wired up:
--
--   SELECT c.id, c.name, c.case_price, c.game_type,
--          COUNT(sc.id) AS skins_count,
--          ROUND(SUM(sc.chance)::numeric, 2) AS total_chance
--   FROM cases c
--   LEFT JOIN skin_case sc ON sc.case_id = c.id
--   WHERE c.slug = 'dota-2-starter'
--   GROUP BY c.id;
--
-- Expected: skins_count = 10, total_chance ≈ 100.00 (rounding ±0.01).
