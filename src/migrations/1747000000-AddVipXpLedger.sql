-- Plain SQL equivalent of 1747000000-AddVipXpLedger.ts.
-- Apply manually if your TypeORM CLI / migration runner is not wired up.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "vip_xp" numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "vip_theoretical_rake" numeric(12,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "vip_ledger" (
  "id" bigserial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "source_type" varchar(40) NOT NULL,
  "source_id" varchar(80),
  "wager_amount" numeric(12,2) NOT NULL DEFAULT 0,
  "house_edge_bps" integer NOT NULL DEFAULT 0,
  "product_xp_rate_bps" integer NOT NULL DEFAULT 10000,
  "theoretical_rake" numeric(12,2) NOT NULL DEFAULT 0,
  "vip_xp" numeric(12,2) NOT NULL DEFAULT 0,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_vip_ledger_user_created"
  ON "vip_ledger" ("user_id", "created_at" DESC);

UPDATE "users"
SET
  "vip_xp" = "vip_qualifying_volume",
  "vip_theoretical_rake" = ROUND(("vip_qualifying_volume" * 0.10)::numeric, 2)
WHERE "vip_xp" = 0
  AND "vip_theoretical_rake" = 0
  AND "vip_qualifying_volume" > 0;

INSERT INTO "vip_ledger" (
  "user_id",
  "source_type",
  "source_id",
  "wager_amount",
  "house_edge_bps",
  "product_xp_rate_bps",
  "theoretical_rake",
  "vip_xp",
  "metadata"
)
SELECT
  u."id",
  'historical_case_backfill',
  'migration:1747000000',
  u."vip_xp",
  1000,
  10000,
  u."vip_theoretical_rake",
  u."vip_xp",
  jsonb_build_object(
    'source', 'vip_qualifying_volume',
    'note', 'Backfilled from historical regular case turnover using the 10% baseline XP model'
  )
FROM "users" u
WHERE u."vip_xp" > 0
  AND NOT EXISTS (
    SELECT 1
    FROM "vip_ledger" existing
    WHERE existing."user_id" = u."id"
      AND existing."source_type" = 'historical_case_backfill'
      AND existing."source_id" = 'migration:1747000000'
  );
