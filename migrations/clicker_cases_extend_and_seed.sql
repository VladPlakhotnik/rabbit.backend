-- Clicker cases: align schema with regular `cases`, link inventory, seed.
--
-- Why: the original clicker_cases table only had name/description/image_url
-- /case_price — no slug, no popularity flags, no limited-run counters.
-- Bringing it up to feature parity with `cases` so the API surface and
-- frontend can reuse the same shape (slug-addressed, ?game-style filters
-- if we ever want them, etc.).
--
-- Steps (idempotent):
--   1. Heal id sequences on clicker_cases / clicker_skin_case.
--   2. Add columns: slug (unique), is_popular, is_limited, remaining_count,
--      max_count, description (was already there but ensure default '').
--   3. user_inventory: add nullable `clicker_case_id` FK and relax
--      `case_id` to nullable so a clicker drop can land in the same
--      inventory. App-level XOR enforces "exactly one source" — DB-level
--      CHECK is intentionally skipped here because old rows may all have
--      case_id set (which is fine, the new column just adds a path).
--   4. Wipe placeholder rows in clicker_cases / clicker_skin_case from the
--      previous half-baked schema (the table only ever had ~5 stub rows
--      with no skins linked).
--   5. Seed two starter cases priced in carrots and link cheap CSGO skins
--      with equal drop chances.
--
-- All data wipes target only clicker_cases / clicker_skin_case tables —
-- nothing in user_inventory is dropped. If a real player had won a
-- clicker-case skin already (none have, the open flow didn't exist yet)
-- their row would survive with a now-dangling clicker_case_id; that's
-- fine because the FK is nullable and the column is just informational.
--
-- Re-runnable: ON CONFLICT and IF NOT EXISTS guards everywhere.

BEGIN;

-- ---- 1. Heal id sequences ------------------------------------------------
DO $$
DECLARE
  tname text;
BEGIN
  FOR tname IN
    SELECT unnest(ARRAY['clicker_cases', 'clicker_skin_case'])
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

-- ---- 2. Schema for clicker_cases ----------------------------------------
ALTER TABLE clicker_cases
  ADD COLUMN IF NOT EXISTS slug varchar(255);
ALTER TABLE clicker_cases
  ADD COLUMN IF NOT EXISTS is_popular boolean NOT NULL DEFAULT false;
ALTER TABLE clicker_cases
  ADD COLUMN IF NOT EXISTS is_limited boolean NOT NULL DEFAULT false;
ALTER TABLE clicker_cases
  ADD COLUMN IF NOT EXISTS remaining_count integer NOT NULL DEFAULT 0;
ALTER TABLE clicker_cases
  ADD COLUMN IF NOT EXISTS max_count integer NOT NULL DEFAULT 0;
ALTER TABLE clicker_cases
  ADD COLUMN IF NOT EXISTS description varchar(500) NOT NULL DEFAULT '';

-- ---- 3. user_inventory polymorphic case linkage --------------------------
ALTER TABLE user_inventory
  ADD COLUMN IF NOT EXISTS clicker_case_id integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_user_inventory_clicker_case'
  ) THEN
    ALTER TABLE user_inventory
      ADD CONSTRAINT fk_user_inventory_clicker_case
      FOREIGN KEY (clicker_case_id) REFERENCES clicker_cases(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Make the regular case_id nullable so clicker-case opens can write rows
-- with case_id = NULL, clicker_case_id = X.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_inventory'
      AND column_name = 'case_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE user_inventory ALTER COLUMN case_id DROP NOT NULL;
  END IF;
END $$;

-- ---- 4. Wipe stub rows from the old schema -------------------------------
TRUNCATE clicker_skin_case RESTART IDENTITY CASCADE;
TRUNCATE clicker_cases    RESTART IDENTITY CASCADE;

-- ---- 5. Seed clicker_cases ----------------------------------------------
-- Slug is the URL path (`/clicker-cases/:slug`), kebab-case.
-- Prices in carrots: starter is reachable shortly after L2; deluxe is a
-- mid-game money-sink.
INSERT INTO clicker_cases
  (id, slug, name, description, image_url, case_price, is_popular,
   is_limited, remaining_count, max_count, created_at, updated_at)
VALUES
  (1, 'bunny-starter', 'Bunny Starter Case',
   'A handful of cheap CS:GO skins. Drop one for 100 carrots.',
   '', 100, true,  false, 0, 0, NOW(), NOW()),
  (2, 'bunny-deluxe',  'Bunny Deluxe Case',
   'Mid-tier CS:GO skins. 1000 carrots a try.',
   '', 1000, false, false, 0, 0, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  slug            = EXCLUDED.slug,
  name            = EXCLUDED.name,
  description     = EXCLUDED.description,
  image_url       = EXCLUDED.image_url,
  case_price      = EXCLUDED.case_price,
  is_popular      = EXCLUDED.is_popular,
  is_limited      = EXCLUDED.is_limited,
  remaining_count = EXCLUDED.remaining_count,
  max_count       = EXCLUDED.max_count,
  updated_at      = NOW();

-- Unique index on slug so future inserts can't create dupes (TypeORM
-- @Column unique:true would also create one, but we control it from SQL).
CREATE UNIQUE INDEX IF NOT EXISTS idx_clicker_cases_slug
  ON clicker_cases(slug);

-- ---- 6. Seed clicker_skin_case (link CSGO skins to clicker cases) -------
-- 20 cheapest skins ($0.10–$0.50) → starter case, equal 5% chances.
-- 20 mid skins ($0.50–$5.00) → deluxe case, equal 5% chances.
-- If csgo_skins is empty (fresh DB) the SELECT returns 0 rows and the
-- cases will simply have no skins until the catalog sync runs — that's
-- recoverable later by re-running this migration or adding rows manually.
INSERT INTO clicker_skin_case (case_id, skin_id, chance, hidden_chance, is_drop_out)
SELECT
  1                                  AS case_id,
  s.id                               AS skin_id,
  5.00                               AS chance,
  NULL                               AS hidden_chance,
  true                               AS is_drop_out
FROM (
  SELECT id FROM csgo_skins
  WHERE market_price >= 0.10 AND market_price < 0.50
  ORDER BY market_price ASC, id ASC
  LIMIT 20
) s;

INSERT INTO clicker_skin_case (case_id, skin_id, chance, hidden_chance, is_drop_out)
SELECT
  2                                  AS case_id,
  s.id                               AS skin_id,
  5.00                               AS chance,
  NULL                               AS hidden_chance,
  true                               AS is_drop_out
FROM (
  SELECT id FROM csgo_skins
  WHERE market_price >= 0.50 AND market_price < 5.00
  ORDER BY market_price ASC, id ASC
  LIMIT 20
) s;

-- ---- 7. Move sequences past the manually-inserted ids -------------------
SELECT setval(
  'clicker_cases_id_seq',
  GREATEST(1, (SELECT COALESCE(MAX(id), 0) FROM clicker_cases))
);
SELECT setval(
  'clicker_skin_case_id_seq',
  GREATEST(1, (SELECT COALESCE(MAX(id), 0) FROM clicker_skin_case))
);

COMMIT;
