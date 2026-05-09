CREATE TABLE IF NOT EXISTS "earn_vault_positions" (
  "id" bigserial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "plan_id" varchar(40) NOT NULL,
  "plan_name" varchar(80) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'active',
  "amount" numeric(12,2) NOT NULL,
  "reward_amount" numeric(12,2) NOT NULL,
  "rate_percent" numeric(6,2) NOT NULL,
  "duration_days" integer NOT NULL,
  "starts_at" timestamp NOT NULL,
  "ends_at" timestamp NOT NULL,
  "claimed_at" timestamp NULL,
  "cancelled_at" timestamp NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "CHK_earn_vault_positions_status"
    CHECK ("status" IN ('active', 'claimed', 'cancelled')),
  CONSTRAINT "CHK_earn_vault_positions_positive_amount"
    CHECK ("amount" > 0 AND "reward_amount" >= 0)
);

CREATE INDEX IF NOT EXISTS "IDX_earn_vault_positions_user_status"
  ON "earn_vault_positions" ("user_id", "status", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "IDX_earn_vault_positions_active_ends"
  ON "earn_vault_positions" ("ends_at")
  WHERE "status" = 'active';
