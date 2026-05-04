-- Per-level energy regen rates.
--
-- Before this migration regen was a single global value (env var
-- CLICKER_ENERGY_REGEN_PER_SEC, defaulting to 0.2/sec). That meant a
-- level-1 player (max_energy=1000) refilled in ~83 minutes while a
-- level-10 player (max_energy=50000) needed ~70 hours — playable at
-- low tiers, broken at high tiers.
--
-- New model: each `clicker_energy_levels` row carries its own
-- `regen_per_sec_milli` (units/sec × 1000, matching the Redis hash
-- `r` field that the click Lua reads). Bootstrap pulls the value
-- straight off the user's owned tier and writes it to Redis. The env
-- override remains as a global fallback for cold rows /
-- unmaterialised columns.
--
-- The seeded values target a per-tier refill time that scales with
-- the cap so higher tiers don't feel punishing:
--
--    lvl  cap        target refill   r=cap*1000/sec
--    ────────────────────────────────────────────
--    1    1000       60 min          278
--    2    2000       90 min          370
--    3    3500       2 h             486
--    4    5000       2.5 h           556
--    5    7500       3 h             694
--    6    10000      3.5 h           794
--    7    15000      4 h             1042
--    8    20000      4.5 h           1235
--    9    30000      5 h             1667
--    10   50000      5.5 h           2525
--
-- Idempotent — safe to re-run.

BEGIN;

ALTER TABLE clicker_energy_levels
  ADD COLUMN IF NOT EXISTS regen_per_sec_milli integer NOT NULL DEFAULT 0
    CHECK (regen_per_sec_milli >= 0);

UPDATE clicker_energy_levels
SET regen_per_sec_milli = CASE id
  WHEN 1  THEN 278
  WHEN 2  THEN 370
  WHEN 3  THEN 486
  WHEN 4  THEN 556
  WHEN 5  THEN 694
  WHEN 6  THEN 794
  WHEN 7  THEN 1042
  WHEN 8  THEN 1235
  WHEN 9  THEN 1667
  WHEN 10 THEN 2525
  ELSE regen_per_sec_milli
END
WHERE id BETWEEN 1 AND 10;

COMMIT;
