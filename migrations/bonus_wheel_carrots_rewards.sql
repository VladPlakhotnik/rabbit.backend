-- Bonus Wheel catalog refresh:
-- - replace cashback wheel prizes with clicker carrots
-- - attach item rewards to real skin rows
-- - attach case rewards to real case rows
-- - keep legacy MONEY/CASHBACK rows claim-safe instead of truncating history

ALTER TYPE reward_type ADD VALUE IF NOT EXISTS 'CASE';
ALTER TYPE reward_type ADD VALUE IF NOT EXISTS 'CARROTS';
ALTER TYPE reward_type ADD VALUE IF NOT EXISTS 'CASHBACK';
ALTER TYPE reward_type ADD VALUE IF NOT EXISTS 'RESPIN';
ALTER TYPE reward_type ADD VALUE IF NOT EXISTS 'BALANCE';

ALTER TABLE rewards ADD COLUMN IF NOT EXISTS case_id integer NULL;
ALTER TABLE rewards ADD COLUMN IF NOT EXISTS csgo_skin_id integer NULL;
ALTER TABLE rewards ADD COLUMN IF NOT EXISTS dota_skin_id integer NULL;
ALTER TABLE rewards ADD COLUMN IF NOT EXISTS game_type varchar(16) NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rewards_case_id_fkey'
  ) THEN
    ALTER TABLE rewards
      ADD CONSTRAINT rewards_case_id_fkey
      FOREIGN KEY (case_id) REFERENCES cases(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rewards_csgo_skin_id_fkey'
  ) THEN
    ALTER TABLE rewards
      ADD CONSTRAINT rewards_csgo_skin_id_fkey
      FOREIGN KEY (csgo_skin_id) REFERENCES csgo_skins(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rewards_dota_skin_id_fkey'
  ) THEN
    ALTER TABLE rewards
      ADD CONSTRAINT rewards_dota_skin_id_fkey
      FOREIGN KEY (dota_skin_id) REFERENCES dota_skins(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rewards_one_skin_reference_chk'
  ) THEN
    ALTER TABLE rewards
      ADD CONSTRAINT rewards_one_skin_reference_chk
      CHECK (csgo_skin_id IS NULL OR dota_skin_id IS NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS rewards_type_active_idx ON rewards(type, is_active);
CREATE INDEX IF NOT EXISTS rewards_case_id_idx ON rewards(case_id);
CREATE INDEX IF NOT EXISTS rewards_csgo_skin_id_idx ON rewards(csgo_skin_id);
CREATE INDEX IF NOT EXISTS rewards_dota_skin_id_idx ON rewards(dota_skin_id);

UPDATE rewards
SET type = 'BALANCE'
WHERE type = 'MONEY';

UPDATE rewards
SET is_active = FALSE
WHERE type = 'CASHBACK';

UPDATE rewards
SET
  name = 'Balance ' || trim(to_char(value, 'FM999999990.##')),
  description = 'Direct balance credit',
  case_id = NULL,
  csgo_skin_id = NULL,
  dota_skin_id = NULL,
  game_type = NULL,
  is_active = TRUE
WHERE type = 'BALANCE';

UPDATE rewards
SET
  name = 'Promocode ' || trim(to_char(value, 'FM999999990.##')) || '%',
  description = 'Deposit bonus promo code',
  case_id = NULL,
  csgo_skin_id = NULL,
  dota_skin_id = NULL,
  game_type = NULL,
  is_active = TRUE
WHERE type = 'CODE';

WITH ranked_skins AS (
  SELECT
    id,
    market_hash_name,
    market_price,
    row_number() OVER (ORDER BY market_price ASC, id ASC) AS rn
  FROM csgo_skins
  WHERE market_price IS NOT NULL
    AND image IS NOT NULL
    AND market_price BETWEEN 0.20 AND 3.00
    AND market_hash_name !~* 'Sticker|Graffiti|Music Kit|Patch|Charm|Case|Key|Pass|Package|Capsule|Souvenir Token'
),
ranked_rewards AS (
  SELECT
    id,
    row_number() OVER (ORDER BY id ASC) AS rn
  FROM rewards
  WHERE type = 'ITEM'
)
UPDATE rewards r
SET
  name = s.market_hash_name,
  description = 'Skin item reward',
  value = s.market_price,
  drop_chance = CASE rr.rn
    WHEN 1 THEN 3
    WHEN 2 THEN 2
    WHEN 3 THEN 1
    WHEN 4 THEN 0.5
    ELSE 0.2
  END,
  case_id = NULL,
  csgo_skin_id = s.id,
  dota_skin_id = NULL,
  game_type = 'csgo',
  is_active = TRUE
FROM ranked_rewards rr
JOIN ranked_skins s ON s.rn = rr.rn
WHERE r.id = rr.id;

INSERT INTO rewards (
  type, name, description, value, drop_chance, is_active,
  case_id, csgo_skin_id, dota_skin_id, game_type, created_at
)
SELECT *
FROM (
  VALUES
    ('CARROTS'::reward_type, 'Carrots 200', 'Clicker carrot points', 200::numeric, 18::double precision, TRUE, NULL::integer, NULL::integer, NULL::integer, NULL::varchar, CURRENT_TIMESTAMP),
    ('CARROTS'::reward_type, 'Carrots 500', 'Clicker carrot points', 500::numeric, 12::double precision, TRUE, NULL::integer, NULL::integer, NULL::integer, NULL::varchar, CURRENT_TIMESTAMP),
    ('CARROTS'::reward_type, 'Carrots 1000', 'Clicker carrot points', 1000::numeric, 7::double precision, TRUE, NULL::integer, NULL::integer, NULL::integer, NULL::varchar, CURRENT_TIMESTAMP),
    ('CARROTS'::reward_type, 'Carrots 5000', 'Clicker carrot points', 5000::numeric, 1::double precision, TRUE, NULL::integer, NULL::integer, NULL::integer, NULL::varchar, CURRENT_TIMESTAMP),
    ('CARROTS'::reward_type, 'Carrots 200000', 'Clicker jackpot carrot points', 200000::numeric, 0.02::double precision, TRUE, NULL::integer, NULL::integer, NULL::integer, NULL::varchar, CURRENT_TIMESTAMP),
    ('RESPIN'::reward_type, 'Respin', 'Reset bonus wheel cooldown', 1::numeric, 10::double precision, TRUE, NULL::integer, NULL::integer, NULL::integer, NULL::varchar, CURRENT_TIMESTAMP)
) AS incoming(type, name, description, value, drop_chance, is_active, case_id, csgo_skin_id, dota_skin_id, game_type, created_at)
WHERE NOT EXISTS (
  SELECT 1
  FROM rewards r
  WHERE r.type = incoming.type
    AND r.name = incoming.name
    AND r.value = incoming.value
);

INSERT INTO rewards (
  type, name, description, value, drop_chance, is_active,
  case_id, csgo_skin_id, dota_skin_id, game_type, created_at
)
SELECT
  'CASE'::reward_type,
  c.name,
  'Free case open',
  c.case_price,
  CASE c.slug
    WHEN 'dota-2-starter' THEN 2
    WHEN 'fracture-case' THEN 1.2
    WHEN 'revolution-case' THEN 0.8
    ELSE 0.5
  END,
  TRUE,
  c.id,
  NULL,
  NULL,
  c.game_type,
  CURRENT_TIMESTAMP
FROM cases c
WHERE c.slug IN ('dota-2-starter', 'fracture-case', 'revolution-case')
  AND NOT EXISTS (
    SELECT 1
    FROM rewards r
    WHERE r.type = 'CASE'
      AND r.case_id = c.id
  );
