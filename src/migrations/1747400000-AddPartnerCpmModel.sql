-- Plain SQL equivalent of 1747400000-AddPartnerCpmModel.ts.
-- Apply manually if your TypeORM CLI / migration runner isn't wired up.

ALTER TABLE "partner_levels"
ADD COLUMN IF NOT EXISTS "cpm_rate" numeric(6,2) NOT NULL DEFAULT 0;

UPDATE "partner_levels"
SET
  "your_percentage" = CASE "level"
    WHEN 1 THEN 10.00
    WHEN 2 THEN 12.00
    WHEN 3 THEN 15.00
    WHEN 4 THEN 18.00
    WHEN 5 THEN 20.00
    ELSE "your_percentage"
  END,
  "referral_percentage" = CASE "level"
    WHEN 1 THEN 5.00
    WHEN 2 THEN 6.00
    WHEN 3 THEN 7.00
    WHEN 4 THEN 8.00
    WHEN 5 THEN 10.00
    ELSE "referral_percentage"
  END,
  "cpm_rate" = CASE "level"
    WHEN 1 THEN 0.25
    WHEN 2 THEN 0.35
    WHEN 3 THEN 0.50
    WHEN 4 THEN 0.75
    WHEN 5 THEN 1.00
    ELSE "cpm_rate"
  END,
  "updated_at" = now();

CREATE TABLE IF NOT EXISTS "partner_cpm_daily_stats" (
  "id" serial PRIMARY KEY,
  "partner_user_id" int NOT NULL,
  "referral_code" varchar(64) NOT NULL,
  "day" date NOT NULL,
  "impressions" int NOT NULL DEFAULT 0,
  "unique_impressions" int NOT NULL DEFAULT 0,
  "payable_impressions" int NOT NULL DEFAULT 0,
  "estimated_amount" numeric(12,4) NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "IDX_partner_cpm_daily_stats_partner_code_day_unique"
ON "partner_cpm_daily_stats" ("partner_user_id", "referral_code", "day");

CREATE INDEX IF NOT EXISTS "IDX_partner_cpm_daily_stats_partner_day"
ON "partner_cpm_daily_stats" ("partner_user_id", "day");

CREATE TABLE IF NOT EXISTS "partner_cpm_visitors" (
  "id" serial PRIMARY KEY,
  "partner_user_id" int NOT NULL,
  "referral_code" varchar(64) NOT NULL,
  "visitor_hash" varchar(64) NOT NULL,
  "day" date NOT NULL,
  "source" varchar(128) NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "IDX_partner_cpm_visitors_partner_hash_day_unique"
ON "partner_cpm_visitors" ("partner_user_id", "visitor_hash", "day");

CREATE INDEX IF NOT EXISTS "IDX_partner_cpm_visitors_partner_day"
ON "partner_cpm_visitors" ("partner_user_id", "day");
