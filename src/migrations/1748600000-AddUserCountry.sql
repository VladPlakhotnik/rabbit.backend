ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "country_code" varchar(2),
  ADD COLUMN IF NOT EXISTS "country_source" varchar(32),
  ADD COLUMN IF NOT EXISTS "country_detected_at" timestamptz;

CREATE INDEX IF NOT EXISTS "IDX_users_country_code"
  ON "users" ("country_code");

