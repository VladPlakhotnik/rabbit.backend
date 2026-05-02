-- Soft-lock toggle for clicker cases.
--
-- `is_available = false` makes the case unopenable in the API (openCase
-- 400s) and triggers a "locked" overlay on the shop card / detail page.
-- Default `true` so existing rows stay openable. Admin tooling flips
-- this when a case needs to be temporarily hidden without removing the
-- row (which would orphan inventory / history entries).
--
-- Idempotent.

ALTER TABLE clicker_cases
  ADD COLUMN IF NOT EXISTS is_available boolean NOT NULL DEFAULT true;
