-- Plain SQL equivalent of 1746100000-CreateAdminTables.ts.
-- Apply manually if your TypeORM CLI / migration runner isn't wired up.
-- Order matters — run top to bottom.

CREATE TYPE "admin_role" AS ENUM ('super_admin', 'admin', 'manager', 'viewer');

CREATE TABLE "admins" (
  "id"                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "email"                  varchar(254)  NOT NULL,
  "password_hash"          varchar(100)  NOT NULL,
  "first_name"             varchar(100)  NOT NULL,
  "last_name"              varchar(100)  NOT NULL,
  "role"                   "admin_role"  NOT NULL DEFAULT 'manager',
  "is_active"              boolean       NOT NULL DEFAULT true,
  "failed_login_attempts"  int           NOT NULL DEFAULT 0,
  "locked_until"           timestamptz,
  "last_login_at"          timestamptz,
  "last_login_ip"          varchar(45),
  "created_by_id"          uuid REFERENCES "admins"("id") ON DELETE SET NULL,
  "totp_secret"            varchar(64),
  "totp_enabled"           boolean       NOT NULL DEFAULT false,
  "created_at"             timestamptz   NOT NULL DEFAULT now(),
  "updated_at"             timestamptz   NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "IDX_admins_email_unique" ON "admins"("email");

CREATE TABLE "admin_refresh_tokens" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "admin_id"    uuid          NOT NULL REFERENCES "admins"("id") ON DELETE CASCADE,
  "token_hash"  varchar(100)  NOT NULL,
  "expires_at"  timestamptz   NOT NULL,
  "used_at"     timestamptz,
  "revoked_at"  timestamptz,
  "ip_address"  varchar(45),
  "user_agent"  varchar(500),
  "created_at"  timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX "IDX_admin_refresh_tokens_admin_id"   ON "admin_refresh_tokens"("admin_id");
CREATE INDEX "IDX_admin_refresh_tokens_expires_at" ON "admin_refresh_tokens"("expires_at");
