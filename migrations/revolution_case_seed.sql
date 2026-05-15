-- Seed Revolution Case (cases.id = 4) with the CS:GO skins from the
-- official 2023 case lineup. Replaces the placeholder Butterfly Knife
-- row that was sitting at chance=100.
--
-- Lineup is 22 skins on the marketing image, but TEC-9 | Rebel
-- (Field-Tested) is missing from csgo_skins (market.csgo.com sync
-- hasn't picked it up yet) — the LEFT JOIN to csgo_skins returns null,
-- the API hands the frontend `skinCases[i].skin === null`, and
-- CasePage crashes. We omit it; once sync ingests the row, rebalance
-- back to 22 in a follow-up.
--
-- Chance distribution: tiered by rarity (CS:GO convention) — within a
-- tier each skin shares the same odds, between tiers the totals scale
-- so the expected drop value is below the case price (the house edge
-- that keeps the operator alive).
--
--   tier         skins  Σ chance   per skin   Σ EV
--   --------------------------------------------------
--   Glove          5     1.00%      0.20%     $1.50
--   Covert         2     1.00%      0.50%     $0.51
--   Classified     3     4.00%      1.33-1.34% $0.21
--   Restricted     5    14.00%      2.80%     $0.11
--   Mil-Spec       6    80.00%     13.33-13.35% $0.08
--   --------------------------------------------------
--   total         21   100.00%               EV $2.42
--
-- Case price = $3.06 → RTP = 2.42/3.06 = 79.1% → operator margin ~21%.
-- Rebalance the tier totals (lines 41-65 below) to retune the margin.

BEGIN;

-- Idempotent reseed — running this file twice produces the same state.
DELETE FROM skin_case WHERE case_id = 4;

-- The id sequence on this table has historically drifted behind MAX(id)
-- (rows inserted via TypeORM repository.save() bypass the sequence, then
-- a manual INSERT collides on the primary key). Re-anchor it to the
-- post-DELETE MAX before inserting fresh rows.
SELECT setval(
  pg_get_serial_sequence('skin_case', 'id'),
  COALESCE((SELECT MAX(id) FROM skin_case), 0)
);

INSERT INTO skin_case (case_id, skin_hash_name, game_type, chance, is_drop_out) VALUES
  -- Glove tier — 5 skins × 0.20% = 1.00%
  (4, '★ Specialist Gloves | Crimson Web (Field-Tested)', 'csgo',  0.20, true),
  (4, '★ Moto Gloves | Polygon (Field-Tested)',           'csgo',  0.20, true),
  (4, '★ Specialist Gloves | Mogul (Field-Tested)',       'csgo',  0.20, true),
  (4, '★ Hand Wraps | Duct Tape (Field-Tested)',          'csgo',  0.20, true),
  (4, '★ Moto Gloves | Transport (Field-Tested)',         'csgo',  0.20, true),
  -- Covert tier — 2 skins × 0.50% = 1.00%
  (4, 'M4A4 | Temukau (Field-Tested)',                    'csgo',  0.50, true),
  (4, 'AK-47 | Head Shot (Field-Tested)',                 'csgo',  0.50, true),
  -- Classified tier — 4.00% / 3 skins, +0.01 absorber on AWP Duality
  (4, 'UMP-45 | Wild Child (Field-Tested)',               'csgo',  1.33, true),
  (4, 'P2000 | Wicked Sick (Field-Tested)',               'csgo',  1.33, true),
  (4, 'AWP | Duality (Field-Tested)',                     'csgo',  1.34, true),
  -- Restricted tier — 5 skins × 2.80% = 14.00%
  (4, 'MAC-10 | Sakkaku (Field-Tested)',                  'csgo',  2.80, true),
  (4, 'M4A1-S | Emphorosaur-S (Field-Tested)',            'csgo',  2.80, true),
  (4, 'Glock-18 | Umbral Bunny (Field-Tested)',          'csgo',  2.80, true),
  (4, 'R8 Revolver | Banana Cannon (Field-Tested)',       'csgo',  2.80, true),
  (4, 'P90 | Neoqueen (Field-Tested)',                    'csgo',  2.80, true),
  -- Mil-Spec tier — 80.00% / 6 skins, +0.02 absorber on P250 Re.built
  (4, 'SG 553 | Cyberforce (Field-Tested)',               'csgo', 13.33, true),
  (4, 'MP5-SD | Liquidation (Field-Tested)',              'csgo', 13.33, true),
  (4, 'SCAR-20 | Fragments (Field-Tested)',               'csgo', 13.33, true),
  (4, 'MAG-7 | Insomnia (Field-Tested)',                  'csgo', 13.33, true),
  (4, 'MP9 | Featherweight (Field-Tested)',               'csgo', 13.33, true),
  (4, 'P250 | Re.built (Field-Tested)',                   'csgo', 13.35, true);

-- Sanity: bail loudly if the chances don't sum to 100.00. case.service.ts
-- relies on the total to map to a 100k-ticket lottery pool — a 99 or 101
-- means rounding errors leak into the drop distribution.
DO $$
DECLARE total numeric;
BEGIN
  SELECT SUM(chance) INTO total FROM skin_case WHERE case_id = 4;
  IF total <> 100.00 THEN
    RAISE EXCEPTION 'skin_case total chance for case_id=4 is %, expected 100.00', total;
  END IF;
END $$;

COMMIT;
