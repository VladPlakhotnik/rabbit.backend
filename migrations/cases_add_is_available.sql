-- Soft-lock toggle for regular CS:GO / Dota cases.
--
-- `is_available = false` makes the case invisible in:
--   - the public catalog (GET /cases — filtered out at the SQL level)
--   - section listings (GET /sections — joined-row filter)
--   - case detail (GET /cases/:slug → 404, deliberately the same response
--     a non-existent slug gets, so a disabled case looks identical to one
--     that never existed; doesn't leak admin state)
--   - case opening (POST /cases/:slug/open → 404, same reason)
--
-- Default `true` so existing rows stay visible. Admin tooling flips this
-- when a case needs a temporary takedown — e.g. broken artwork, pricing
-- bug, market sync gap — without DELETEing the row (which would orphan
-- inventory_items and case-history entries).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS lets us re-run the file safely.
-- Mirrors the migration that introduced the same column on
-- `clicker_cases` (clicker_cases_add_is_available.sql).

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS is_available boolean NOT NULL DEFAULT true;
