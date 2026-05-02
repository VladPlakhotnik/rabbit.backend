-- Append-only audit log for every state-changing clicker action.
--
-- Why: anything that touches a clicker user's points / energy / level /
-- inventory is a money-equivalent operation in this game. We need a
-- forensic trail for incident response — "did this player legitimately
-- earn 5M carrots, or did they exploit a bug we shipped on Tuesday?"
-- Without an audit log the only answer is "we don't know"; with one,
-- you grep `action` and reconstruct the timeline.
--
-- Append-only on purpose:
--   - no UPDATE column,
--   - no DELETE policy (we'd need a separate retention job, not in this
--     migration — events expire after 90 days, see future ops doc).
-- This makes the table useless as authoritative state (use clicker_users
-- for that) but unbeatable as a tamper-evident history.
--
-- Filled in incrementally as each PR adds a new action to the codebase:
--   PR1: nothing yet (this migration just creates the table).
--   PR2: 'upgrade_skill'  (auto-clicker / crit-click level bumps)
--   PR3: 'click_crit_hit' (only the rolls that LANDED — saves space vs
--                          logging every roll)
--   PR4: 'auto_clicker_activate', 'auto_clicker_collect'
--   PR5: 'buy_boost'
--   PR6: 'activate_boost', 'boost_expire'
--
-- Idempotent — safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS clicker_history (
  id            bigserial PRIMARY KEY,
  user_id       integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action        varchar(64) NOT NULL,
  -- Raw input the action came in with, minus secrets. JSONB so we can
  -- index / query specific fields later (e.g. "all activate_boost
  -- events for boost_key='x10_multiplier' last 24h").
  payload       jsonb,
  -- Snapshot of the user's relevant clicker state BEFORE the action
  -- ran. Restoring from the log = walking history forward; this column
  -- is what makes that possible without replay.
  state_before  jsonb,
  state_after   jsonb,
  -- Where the action came from. 'ws' for Socket.IO, 'rest' for HTTP,
  -- 'cron' for the flush job. Useful for filtering — e.g. cron-side
  -- failures look very different from user-side ones.
  source        varchar(32) NOT NULL DEFAULT 'ws',
  -- Best-effort client IP; stored as inet so range queries work.
  -- Never relied on for security (proxies / VPN), only forensics.
  ip            inet,
  ts            timestamptz NOT NULL DEFAULT NOW()
);

-- Hot path is "show me everything user X did in the last hour" — covered
-- by (user_id, ts DESC). Adding action as the third column lets us also
-- answer "all upgrade_skill events for user X" without a sequential scan.
CREATE INDEX IF NOT EXISTS clicker_history_user_ts_idx
  ON clicker_history (user_id, ts DESC);

-- Cross-user analytics: "spike in activate_boost events around <ts>".
CREATE INDEX IF NOT EXISTS clicker_history_action_ts_idx
  ON clicker_history (action, ts DESC);

COMMIT;
