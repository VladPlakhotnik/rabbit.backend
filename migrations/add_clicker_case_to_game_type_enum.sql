-- Add `clicker_case` to the Postgres ENUM `game_type`.
--
-- The TypeScript enum (provably-fair/enums/game-type.enum.ts) already has
-- CLICKER_CASE = 'clicker_case'; the DB-side enum is the lagging one.
-- ProvablyFairService.generateSeed inserts this value when ClickerCasesService
-- rolls a drop, and Postgres rejects unknown enum labels:
--   QueryFailedError: invalid input value for enum game_type: "clicker_case"
--
-- IMPORTANT: ALTER TYPE … ADD VALUE cannot run inside a transaction block.
-- This file therefore intentionally omits BEGIN / COMMIT — psql's
-- autocommit mode handles it as a standalone statement. If you wrap this
-- in a transaction yourself it will fail with
--   "ALTER TYPE ... ADD cannot run inside a transaction block".
--
-- IF NOT EXISTS makes this re-runnable on databases that have already had
-- the value added (Postgres 12+).

ALTER TYPE game_type ADD VALUE IF NOT EXISTS 'clicker_case';
