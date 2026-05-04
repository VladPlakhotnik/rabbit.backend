-- Plain-SQL equivalent of 1746200000-RenameUserRoles.ts.
-- Apply manually if your TypeORM CLI / runner isn't wired up.
-- Idempotent — rows already on the new vocabulary won't match.

UPDATE "users"
SET    "role" = 'player'
WHERE  "role" IN ('user', 'admin', 'moderator');

UPDATE "users"
SET    "role" = 'player'
WHERE  "role" IS NULL OR "role" = '';
