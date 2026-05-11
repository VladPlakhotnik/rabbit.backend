-- Plain SQL equivalent of 1747300000-AddDiscordSubscriptionBonus.ts.
-- Apply manually if your TypeORM CLI / migration runner is not wired up.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "discord_user_id" varchar(64) NULL;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "discord_username" varchar(100) NULL;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "discord_bonus_claimed" boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_discord_user_id"
  ON "users" ("discord_user_id")
  WHERE "discord_user_id" IS NOT NULL;
