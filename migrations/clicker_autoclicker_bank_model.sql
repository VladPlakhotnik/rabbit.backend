-- Convert autoclicker from "timed buff with manual Activate" to
-- "idle accumulation bank": after IDLE_THRESHOLD seconds of no manual
-- clicks the autoclicker starts ticking once per 3 seconds, debiting
-- energy + crediting a pending bank capped at the level's
-- duration_sec. Player explicitly claims to convert pending → balance.
--
-- Schema impact:
--   1. clicker_users gains three new columns to persist pending state
--      across Redis evictions (apc/apv/last_claim_at).
--   2. clicker_auto_clicker_levels reseeded to 4 tiers (2/4/5/8 hours).
--      duration_sec semantics shift: was "how long Activate runs", now
--      "max idle accumulation seconds". Same column, new meaning.
--
-- Idempotent — safe to re-run.

BEGIN;

-- ---- 1. clicker_users: pending columns ---------------------------------
ALTER TABLE clicker_users
  ADD COLUMN IF NOT EXISTS auto_clicker_pending_count integer NOT NULL DEFAULT 0
    CHECK (auto_clicker_pending_count >= 0);

ALTER TABLE clicker_users
  ADD COLUMN IF NOT EXISTS auto_clicker_pending_value integer NOT NULL DEFAULT 0
    CHECK (auto_clicker_pending_value >= 0);

ALTER TABLE clicker_users
  ADD COLUMN IF NOT EXISTS auto_clicker_last_claim_at timestamptz;

-- ---- 2. Re-anchor any users on the now-removed level 5 -----------------
-- ON DELETE SET NULL on the FK would null them out and effectively
-- revoke their autoclicker. Demoting to level 4 preserves access; the
-- player can still upgrade or claim normally.
UPDATE clicker_users
   SET auto_clicker_level_id = 4
 WHERE auto_clicker_level_id = 5;

DELETE FROM clicker_auto_clicker_levels WHERE id NOT IN (1, 2, 3, 4);

-- ---- 3. Re-seed clicker_auto_clicker_levels (4 tiers) ------------------
-- duration_sec = max idle accumulation seconds.
--   lvl 1: 2h  (7200s)
--   lvl 2: 4h  (14400s)
--   lvl 3: 5h  (18000s)
--   lvl 4: 8h  (28800s)
INSERT INTO clicker_auto_clicker_levels (id, level, upgrade_cost, duration_sec)
VALUES
  (1, 1,   1000,  7200),
  (2, 2,   3000, 14400),
  (3, 3,   8000, 18000),
  (4, 4,  20000, 28800)
ON CONFLICT (id) DO UPDATE SET
  level        = EXCLUDED.level,
  upgrade_cost = EXCLUDED.upgrade_cost,
  duration_sec = EXCLUDED.duration_sec,
  updated_at   = NOW();

SELECT setval(
  'clicker_auto_clicker_levels_id_seq',
  GREATEST(1, (SELECT COALESCE(MAX(id), 0) FROM clicker_auto_clicker_levels))
);

COMMIT;
