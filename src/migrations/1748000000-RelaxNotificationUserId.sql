-- Plain-SQL equivalent of 1748000000-RelaxNotificationUserId.ts.
-- Apply manually if your TypeORM CLI / runner isn't wired up.

ALTER TABLE "notifications"
  ALTER COLUMN "user_id" DROP NOT NULL;
