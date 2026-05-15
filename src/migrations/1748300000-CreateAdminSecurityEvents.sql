CREATE TABLE IF NOT EXISTS "admin_security_events" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "admin_id"    uuid REFERENCES "admins"("id") ON DELETE SET NULL,
  "admin_email" varchar(254),
  "type"        varchar(64) NOT NULL,
  "ip_address"  varchar(45),
  "user_agent"  varchar(500),
  "metadata"    jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at"  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_admin_security_events_admin_id" ON "admin_security_events"("admin_id");
CREATE INDEX IF NOT EXISTS "IDX_admin_security_events_type" ON "admin_security_events"("type");
CREATE INDEX IF NOT EXISTS "IDX_admin_security_events_created_at" ON "admin_security_events"("created_at");
