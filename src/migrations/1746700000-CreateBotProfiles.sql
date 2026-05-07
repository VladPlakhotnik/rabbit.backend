CREATE TABLE IF NOT EXISTS "bot_profiles" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "wealth_tier" varchar(16) NOT NULL,
  "archetype" varchar(24) NOT NULL,
  "favorite_game" varchar(16) NOT NULL DEFAULT 'mixed',
  "virtual_bankroll" numeric(12,2) NOT NULL,
  "min_stake" numeric(12,2) NOT NULL,
  "max_stake" numeric(12,2) NOT NULL,
  "risk_appetite" numeric(4,3) NOT NULL,
  "patience" numeric(4,3) NOT NULL,
  "impulsivity" numeric(4,3) NOT NULL,
  "loss_chasing" numeric(4,3) NOT NULL,
  "confidence" numeric(4,3) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "UQ_bot_profiles_user_id" UNIQUE ("user_id"),
  CONSTRAINT "CHK_bot_profiles_wealth_tier"
    CHECK ("wealth_tier" IN ('low', 'mid', 'high', 'whale')),
  CONSTRAINT "CHK_bot_profiles_archetype"
    CHECK ("archetype" IN ('cautious', 'grinder', 'sniper', 'swingy', 'collector', 'highroller')),
  CONSTRAINT "CHK_bot_profiles_favorite_game"
    CHECK ("favorite_game" IN ('cases', 'mines', 'crash', 'mixed')),
  CONSTRAINT "CHK_bot_profiles_bankroll"
    CHECK ("virtual_bankroll" >= 1.00),
  CONSTRAINT "CHK_bot_profiles_stakes"
    CHECK ("min_stake" >= 0.50 AND "max_stake" >= "min_stake"),
  CONSTRAINT "CHK_bot_profiles_traits"
    CHECK (
      "risk_appetite" BETWEEN 0 AND 1 AND
      "patience" BETWEEN 0 AND 1 AND
      "impulsivity" BETWEEN 0 AND 1 AND
      "loss_chasing" BETWEEN 0 AND 1 AND
      "confidence" BETWEEN 0 AND 1
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS "IDX_bot_profiles_user_id"
  ON "bot_profiles" ("user_id");

INSERT INTO "bot_profiles" (
  "user_id",
  "wealth_tier",
  "archetype",
  "favorite_game",
  "virtual_bankroll",
  "min_stake",
  "max_stake",
  "risk_appetite",
  "patience",
  "impulsivity",
  "loss_chasing",
  "confidence"
)
SELECT
  "id",
  CASE
    WHEN "id" % 20 = 0 THEN 'whale'
    WHEN "id" % 7 = 0 THEN 'high'
    WHEN "id" % 3 = 0 THEN 'mid'
    ELSE 'low'
  END,
  CASE
    WHEN "id" % 6 = 0 THEN 'highroller'
    WHEN "id" % 6 = 1 THEN 'cautious'
    WHEN "id" % 6 = 2 THEN 'grinder'
    WHEN "id" % 6 = 3 THEN 'sniper'
    WHEN "id" % 6 = 4 THEN 'swingy'
    ELSE 'collector'
  END,
  CASE
    WHEN "id" % 5 = 0 THEN 'crash'
    WHEN "id" % 5 = 1 THEN 'mines'
    WHEN "id" % 5 = 2 THEN 'cases'
    ELSE 'mixed'
  END,
  CASE
    WHEN "id" % 20 = 0 THEN 5200.00 + ("id" % 9) * 350.00
    WHEN "id" % 7 = 0 THEN 1100.00 + ("id" % 8) * 115.00
    WHEN "id" % 3 = 0 THEN 240.00 + ("id" % 7) * 42.00
    ELSE 38.00 + ("id" % 6) * 11.00
  END,
  CASE
    WHEN "id" % 20 = 0 THEN 25.00
    WHEN "id" % 7 = 0 THEN 5.00
    WHEN "id" % 3 = 0 THEN 1.00
    ELSE 0.50
  END,
  CASE
    WHEN "id" % 20 = 0 THEN 700.00
    WHEN "id" % 7 = 0 THEN 180.00
    WHEN "id" % 3 = 0 THEN 35.00
    ELSE 8.00
  END,
  CASE
    WHEN "id" % 6 = 0 THEN 0.780
    WHEN "id" % 6 = 1 THEN 0.220
    WHEN "id" % 6 = 2 THEN 0.360
    WHEN "id" % 6 = 3 THEN 0.420
    WHEN "id" % 6 = 4 THEN 0.680
    ELSE 0.480
  END,
  CASE
    WHEN "id" % 6 = 0 THEN 0.600
    WHEN "id" % 6 = 1 THEN 0.360
    WHEN "id" % 6 = 2 THEN 0.580
    WHEN "id" % 6 = 3 THEN 0.800
    WHEN "id" % 6 = 4 THEN 0.500
    ELSE 0.430
  END,
  CASE
    WHEN "id" % 6 = 0 THEN 0.340
    WHEN "id" % 6 = 1 THEN 0.080
    WHEN "id" % 6 = 2 THEN 0.140
    WHEN "id" % 6 = 3 THEN 0.100
    WHEN "id" % 6 = 4 THEN 0.550
    ELSE 0.320
  END,
  CASE
    WHEN "id" % 6 = 0 THEN 0.520
    WHEN "id" % 6 = 1 THEN 0.160
    WHEN "id" % 6 = 2 THEN 0.250
    WHEN "id" % 6 = 3 THEN 0.180
    WHEN "id" % 6 = 4 THEN 0.660
    ELSE 0.240
  END,
  CASE
    WHEN "id" % 6 = 0 THEN 0.750
    WHEN "id" % 6 = 1 THEN 0.380
    WHEN "id" % 6 = 2 THEN 0.520
    WHEN "id" % 6 = 3 THEN 0.720
    WHEN "id" % 6 = 4 THEN 0.600
    ELSE 0.500
  END
FROM "users"
WHERE "role" = 'bot'
ON CONFLICT ("user_id") DO NOTHING;
