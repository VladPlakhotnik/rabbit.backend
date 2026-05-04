-- Lifetime carrots earned per clicker user.
--
-- The `points` column is the player's spendable balance — it goes up
-- on clicks and down on case opens / boost purchases. Level progression
-- previously read from `points`, which made the bar move BACKWARDS
-- whenever the player spent: a level-5 player at 1000/2000 (50%) drops
-- to 200/2000 (10%) after spending 800 on a case, even though their
-- actual lifetime earnings are unchanged.
--
-- `total_points` is the monotonic-up lifetime tally. The Lua hot path
-- bumps it alongside `points` on every credit (manual click, crit
-- bonus, autoclicker tick), the admin grant flow bumps it on positive
-- deltas, and the level bump check now reads from it. Spending leaves
-- total_points untouched, so the progress bar stays where it should.
--
-- Backfill rule for existing rows: total_points starts at MAX(points,
-- current level's points_required). The level threshold floor matters
-- because monotonic level promotion may have already locked the
-- player's level at a tier their `points` balance no longer reflects
-- (post-spend). Without the floor a level-5 player whose balance fell
-- below the level-5 threshold would render with a sub-zero progress
-- segment until their cumulative new earnings climbed past it.
--
-- Idempotent — safe to re-run.

BEGIN;

ALTER TABLE clicker_users
  ADD COLUMN IF NOT EXISTS total_points integer NOT NULL DEFAULT 0
    CHECK (total_points >= 0);

UPDATE clicker_users cu
SET total_points = GREATEST(
  cu.points,
  COALESCE(
    (SELECT cl.points_required
       FROM clicker_levels cl
       WHERE cl.id = cu.level_id),
    0
  )
)
WHERE cu.total_points = 0;

COMMIT;
