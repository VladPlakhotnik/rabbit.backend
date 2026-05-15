ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "is_blocked" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "blocked_reason" text,
  ADD COLUMN IF NOT EXISTS "blocked_reason_template" varchar(64),
  ADD COLUMN IF NOT EXISTS "blocked_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "blocked_by_admin_id" uuid,
  ADD COLUMN IF NOT EXISTS "unblocked_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "unblocked_by_admin_id" uuid;

CREATE INDEX IF NOT EXISTS "IDX_users_is_blocked"
  ON "users" ("is_blocked");
