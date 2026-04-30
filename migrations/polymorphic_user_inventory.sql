-- Make `user_inventory` polymorphic across CSGO and Dota 2 skins.
--
-- Before:
--   user_inventory.skin_id INT  →  csgo_skins.id (single FK)
--
-- After:
--   user_inventory.csgo_skin_id INT NULL  →  csgo_skins.id  (nullable FK)
--   user_inventory.dota_skin_id INT NULL  →  dota_skins.id  (nullable FK)
--   user_inventory.game_type varchar(16)  ('csgo' | 'dota')  — discriminator
--   CHECK: exactly one of {csgo_skin_id, dota_skin_id} is non-null (XOR)
--
-- Why XOR + dual nullable FKs instead of a single discriminator-only
-- column with no FK: user_inventory is critical user-state. SQL-level
-- referential integrity prevents stale references when a skin row is
-- ever deleted; the XOR check prevents a bad write that puts a skin
-- in both buckets. SkinCase (junction) used the looser approach
-- (game_type only) because it's reseeded easily; UserInventory cannot
-- be reseeded.
--
-- Idempotent: re-running on an already-migrated table is a no-op
-- (every step gates on existence).

BEGIN;

-- ---- 0. Heal sequence (same TypeORM issue as in seed_dota_starter) ---
DO $heal_seq$
DECLARE
  has_default boolean;
  max_id bigint;
BEGIN
  SELECT (column_default IS NOT NULL AND column_default LIKE 'nextval%')
    INTO has_default
  FROM information_schema.columns
  WHERE table_schema = current_schema()
    AND table_name = 'user_inventory'
    AND column_name = 'id';

  IF NOT COALESCE(has_default, false) THEN
    CREATE SEQUENCE IF NOT EXISTS user_inventory_id_seq OWNED BY user_inventory.id;
    SELECT COALESCE(MAX(id), 0) + 1 INTO max_id FROM user_inventory;
    PERFORM setval('user_inventory_id_seq', max_id, false);
    ALTER TABLE user_inventory ALTER COLUMN id SET DEFAULT nextval('user_inventory_id_seq');
    RAISE NOTICE 'Attached sequence to user_inventory.id (next id = %)', max_id;
  END IF;
END
$heal_seq$;

-- ---- 1. Add new columns (NULL for now to allow backfill) -------------
ALTER TABLE user_inventory ADD COLUMN IF NOT EXISTS csgo_skin_id integer;
ALTER TABLE user_inventory ADD COLUMN IF NOT EXISTS dota_skin_id integer;
ALTER TABLE user_inventory ADD COLUMN IF NOT EXISTS game_type varchar(16);

-- ---- 2. Backfill from the old skin_id ---------------------------------
-- All existing rows are CSGO (Dota didn't have a code path that wrote
-- to user_inventory). Copy skin_id → csgo_skin_id, set game_type=csgo.
DO $backfill$
DECLARE
  has_old_skin_id boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'user_inventory'
      AND column_name = 'skin_id'
  ) INTO has_old_skin_id;

  IF has_old_skin_id THEN
    UPDATE user_inventory
       SET csgo_skin_id = skin_id
     WHERE csgo_skin_id IS NULL
       AND skin_id IS NOT NULL;

    UPDATE user_inventory
       SET game_type = 'csgo'
     WHERE game_type IS NULL;

    RAISE NOTICE 'Backfilled csgo_skin_id from skin_id';
  ELSE
    -- Already migrated: column gone, default game_type for any rows
    -- that somehow have NULL.
    UPDATE user_inventory SET game_type = 'csgo' WHERE game_type IS NULL;
  END IF;
END
$backfill$;

-- ---- 3. Make game_type NOT NULL with default --------------------------
ALTER TABLE user_inventory ALTER COLUMN game_type SET DEFAULT 'csgo';
ALTER TABLE user_inventory ALTER COLUMN game_type SET NOT NULL;

-- ---- 4. Drop the old FK + column --------------------------------------
DO $drop_old_fk$
DECLARE
  fk_name text;
BEGIN
  SELECT conname INTO fk_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'user_inventory'
    AND c.contype = 'f'
    AND pg_get_constraintdef(c.oid) LIKE '%csgo_skins%'
    AND pg_get_constraintdef(c.oid) LIKE '%(skin_id)%';

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE user_inventory DROP CONSTRAINT %I', fk_name);
    RAISE NOTICE 'Dropped legacy FK on user_inventory.skin_id: %', fk_name;
  END IF;
END
$drop_old_fk$;

ALTER TABLE user_inventory DROP COLUMN IF EXISTS skin_id;

-- ---- 5. New FKs (CASCADE-restrict so a deleted skin can't orphan
--                  inventory silently) ----------------------------------
DO $add_csgo_fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_user_inventory_csgo_skin'
  ) THEN
    ALTER TABLE user_inventory
      ADD CONSTRAINT fk_user_inventory_csgo_skin
      FOREIGN KEY (csgo_skin_id) REFERENCES csgo_skins(id) ON DELETE RESTRICT;
  END IF;
END
$add_csgo_fk$;

DO $add_dota_fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_user_inventory_dota_skin'
  ) THEN
    ALTER TABLE user_inventory
      ADD CONSTRAINT fk_user_inventory_dota_skin
      FOREIGN KEY (dota_skin_id) REFERENCES dota_skins(id) ON DELETE RESTRICT;
  END IF;
END
$add_dota_fk$;

-- ---- 6. CHECK constraints --------------------------------------------
-- Exactly one of (csgo_skin_id, dota_skin_id) must be non-null.
DO $xor_check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_inventory_skin_xor_check'
  ) THEN
    ALTER TABLE user_inventory
      ADD CONSTRAINT user_inventory_skin_xor_check
      CHECK (
        (csgo_skin_id IS NOT NULL)::int + (dota_skin_id IS NOT NULL)::int = 1
      );
  END IF;
END
$xor_check$;

-- game_type must agree with which FK column is populated. Application
-- code is responsible for setting it correctly; this CHECK enforces.
DO $game_type_check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_inventory_game_type_check'
  ) THEN
    ALTER TABLE user_inventory
      ADD CONSTRAINT user_inventory_game_type_check
      CHECK (
        game_type IN ('csgo', 'dota')
        AND (
          (game_type = 'csgo' AND csgo_skin_id IS NOT NULL)
          OR
          (game_type = 'dota' AND dota_skin_id IS NOT NULL)
        )
      );
  END IF;
END
$game_type_check$;

-- ---- 7. Indexes -------------------------------------------------------
-- Covering the FK columns + the user_id query (most-used filter on
-- inventory). game_type alone gets a partial index for "show me only
-- CSGO" / "only Dota" view filters.
CREATE INDEX IF NOT EXISTS idx_user_inventory_csgo_skin_id
  ON user_inventory(csgo_skin_id) WHERE csgo_skin_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_inventory_dota_skin_id
  ON user_inventory(dota_skin_id) WHERE dota_skin_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_inventory_user_id
  ON user_inventory(user_id);
CREATE INDEX IF NOT EXISTS idx_user_inventory_game_type
  ON user_inventory(game_type);

COMMIT;

-- ---- Verify ----------------------------------------------------------
-- After applying:
--   SELECT game_type, COUNT(*),
--          COUNT(*) FILTER (WHERE csgo_skin_id IS NOT NULL) AS csgo,
--          COUNT(*) FILTER (WHERE dota_skin_id IS NOT NULL) AS dota
--   FROM user_inventory GROUP BY game_type;
--
-- Existing rows: all game_type='csgo', csgo>0, dota=0.
