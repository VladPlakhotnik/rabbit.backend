ALTER TABLE "user_deposits"
  DROP CONSTRAINT IF EXISTS "user_deposits_amount_check",
  DROP CONSTRAINT IF EXISTS "CHK_user_deposits_amount_non_negative";

ALTER TABLE "user_deposits"
  ADD CONSTRAINT "CHK_user_deposits_amount_non_negative"
  CHECK ("amount" >= 0);

ALTER TABLE "user_deposits"
  ADD COLUMN IF NOT EXISTS "external_order_id" varchar(128),
  ADD COLUMN IF NOT EXISTS "provider_status" varchar(32),
  ADD COLUMN IF NOT EXISTS "provider_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "credited_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "steam_id" varchar(32),
  ADD COLUMN IF NOT EXISTS "trade_offer_id" varchar(64);

CREATE UNIQUE INDEX IF NOT EXISTS "IDX_user_deposits_source_external_order_id"
  ON "user_deposits" ("source", "external_order_id")
  WHERE "external_order_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "IDX_user_deposits_source_external_id"
  ON "user_deposits" ("source", "external_id")
  WHERE "external_id" IS NOT NULL;

ALTER TABLE "users"
  ALTER COLUMN "deposit_amount" TYPE numeric(12,2)
  USING COALESCE("deposit_amount", 0)::numeric(12,2);
