-- Adds richer fields to upgrade_history so the history page / admin can show
-- the actual outcome, the chance the user was rolled against, the mode used,
-- and a snapshot of the materials consumed.
--
-- All columns are nullable: existing rows from before this migration stay
-- valid, and the application code handles null defensively.

ALTER TABLE upgrade_history
  ADD COLUMN IF NOT EXISTS success boolean,
  ADD COLUMN IF NOT EXISTS chance numeric(5, 2),
  ADD COLUMN IF NOT EXISTS mode varchar(16),
  ADD COLUMN IF NOT EXISTS materials jsonb;

CREATE INDEX IF NOT EXISTS idx_upgrade_history_user_created
  ON upgrade_history (user_id, created_at DESC);
