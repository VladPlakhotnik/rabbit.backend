-- Add game_type discriminator to user-history snapshots so frontend
-- can render Dota vs CSGO skins from history without guessing.
--
-- Tables touched:
--   case_history       — top-level open-case event row
--   upgrade_history    — top-level upgrade row
--
-- Per-drop / per-material game_type is also stored inside the JSONB
-- arrays (`drops` on case_history, `materials` on upgrade_history) by
-- the application code — the columns added here are the case- or
-- upgrade-level discriminators for fast filters.
--
-- Idempotent. Backfill defaults all existing rows to 'csgo' since
-- that's the only game that produced history before this migration.

BEGIN;

-- ---- 0. Heal sequences (TypeORM-style fix from earlier migrations) --
DO $heal_seq$
DECLARE
  tbl text;
  seq_name text;
  has_default boolean;
  max_id bigint;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['case_history', 'upgrade_history']
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
      EXECUTE format('SELECT setval(%L, %s, false)', seq_name, max_id + 1);
      EXECUTE format(
        'ALTER TABLE %I ALTER COLUMN id SET DEFAULT nextval(%L)',
        tbl, seq_name
      );
      RAISE NOTICE 'Attached sequence to %.id (next id = %)',
        tbl, max_id + 1;
    END IF;
  END LOOP;
END
$heal_seq$;

-- ---- 1. case_history.game_type ---------------------------------------
ALTER TABLE case_history
  ADD COLUMN IF NOT EXISTS game_type varchar(16) NOT NULL DEFAULT 'csgo';

DO $case_gt_check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'case_history_game_type_check'
  ) THEN
    ALTER TABLE case_history
      ADD CONSTRAINT case_history_game_type_check
      CHECK (game_type IN ('csgo', 'dota'));
  END IF;
END
$case_gt_check$;

CREATE INDEX IF NOT EXISTS idx_case_history_user_game
  ON case_history(user_id, game_type);

-- ---- 2. upgrade_history.game_type -----------------------------------
ALTER TABLE upgrade_history
  ADD COLUMN IF NOT EXISTS game_type varchar(16) NOT NULL DEFAULT 'csgo';

DO $up_gt_check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'upgrade_history_game_type_check'
  ) THEN
    ALTER TABLE upgrade_history
      ADD CONSTRAINT upgrade_history_game_type_check
      CHECK (game_type IN ('csgo', 'dota'));
  END IF;
END
$up_gt_check$;

CREATE INDEX IF NOT EXISTS idx_upgrade_history_user_game
  ON upgrade_history(user_id, game_type);

COMMIT;
