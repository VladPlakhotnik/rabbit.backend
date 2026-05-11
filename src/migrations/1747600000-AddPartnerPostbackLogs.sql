-- Plain SQL equivalent of 1747600000-AddPartnerPostbackLogs.ts.
-- Apply manually if your local environment does not run TypeORM migrations automatically.

CREATE TABLE IF NOT EXISTS "partner_postback_delivery_logs" (
  "id" serial PRIMARY KEY,
  "partner_user_id" int NOT NULL,
  "event_type" varchar(48) NOT NULL,
  "status" varchar(16) NOT NULL,
  "target_url" varchar(512),
  "http_status" int,
  "error" varchar(512),
  "attempts" int NOT NULL DEFAULT 0,
  "payload" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_partner_postback_logs_partner_created"
  ON "partner_postback_delivery_logs" ("partner_user_id", "created_at" DESC);
