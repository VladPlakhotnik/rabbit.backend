-- Plain-SQL equivalent of 1747900000-DropUserRank.ts.
-- Apply manually if your TypeORM CLI / runner isn't wired up.

ALTER TABLE "users"
  DROP COLUMN IF EXISTS "rank";
