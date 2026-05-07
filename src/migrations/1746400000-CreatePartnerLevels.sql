-- Plain SQL equivalent of 1746400000-CreatePartnerLevels.ts.
-- Apply manually if your TypeORM CLI / migration runner isn't wired up.

CREATE TABLE "partner_levels" (
  "id"                     serial         PRIMARY KEY,
  "level"                  smallint       NOT NULL,
  "name"                   varchar(32)    NOT NULL,
  "min_referrals_deposit"  numeric(12,2)  NOT NULL DEFAULT 0,
  "your_percentage"        numeric(5,2)   NOT NULL DEFAULT 0,
  "referral_percentage"    numeric(5,2)   NOT NULL DEFAULT 0,
  "created_at"             timestamptz    NOT NULL DEFAULT now(),
  "updated_at"             timestamptz    NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "IDX_partner_levels_level_unique"
  ON "partner_levels" ("level");

INSERT INTO "partner_levels"
  ("level", "name", "min_referrals_deposit", "your_percentage", "referral_percentage")
VALUES
  (1, 'bronze',   0,      0.20, 15.00),
  (2, 'silver',   500,    0.50, 16.00),
  (3, 'gold',     1000,   1.00, 17.00),
  (4, 'platinum', 5000,   2.00, 18.00),
  (5, 'diamond',  10000,  3.00, 20.00)
ON CONFLICT DO NOTHING;
