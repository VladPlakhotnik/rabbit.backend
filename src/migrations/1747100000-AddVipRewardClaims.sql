-- Plain SQL equivalent of 1747100000-AddVipRewardClaims.ts.
-- Apply manually if your TypeORM CLI / migration runner is not wired up.

CREATE TABLE IF NOT EXISTS "vip_reward_claims" (
  "id" bigserial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "reward_type" varchar(40) NOT NULL,
  "amount" numeric(12,2) NOT NULL DEFAULT 0,
  "key_delta" integer NOT NULL DEFAULT 0,
  "period_start" timestamp NOT NULL,
  "period_end" timestamp NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_vip_reward_claims_user_period"
  ON "vip_reward_claims" ("user_id", "period_start", "period_end", "reward_type");
