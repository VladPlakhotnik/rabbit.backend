-- Plain SQL equivalent of 1746300000-CreateUserRefreshTokens.ts.
-- Apply manually if your TypeORM CLI / migration runner isn't wired up.

CREATE TABLE "user_refresh_tokens" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"     int           NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash"  varchar(100)  NOT NULL,
  "expires_at"  timestamptz   NOT NULL,
  "used_at"     timestamptz,
  "revoked_at"  timestamptz,
  "ip_address"  varchar(45),
  "user_agent"  varchar(500),
  "created_at"  timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX "IDX_user_refresh_tokens_user_id"   ON "user_refresh_tokens"("user_id");
CREATE INDEX "IDX_user_refresh_tokens_expires_at" ON "user_refresh_tokens"("expires_at");
