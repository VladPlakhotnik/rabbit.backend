-- Seed Revolution Case (cases.id = 4) with the CS:GO skins from the
-- official 2023 case lineup. Replaces the placeholder Butterfly Knife
-- row that was sitting at chance=100.
--
-- Lineup is 22 skins on the marketing image, but TEC-9 | Rebel
-- (Field-Tested) is missing from csgo_skins (market.csgo.com sync
-- hasn't picked it up yet). We CAN'T include it in skin_case until
-- it's there: case.service.ts assumes the LEFT JOIN to csgo_skins
-- always resolves, and the CasePage frontend reads `.skin.name` /
-- `.skin.image` directly — a null skin crashes the page.
--
-- So this seed is 21 skins. Once the missing TEC-9 row appears in
-- csgo_skins, run a follow-up that rebalances back to 22. Suggested
-- distribution then: 21 × 4.55 + 1 × 4.45 = 100.00.
--
-- Chance distribution: ~equal across the 21 skins. 21 × 4.76 = 99.96
-- (four cents short), so the four most expensive items take 4.77 to
-- bring the total to exactly 100.00 — the numeric(5,2) constraint and
-- ticket-pool arithmetic in case.service.ts both want a clean total.

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
  -- Top tier: gloves & knife-equivalents (the 4 most expensive on the
  -- lineup image take the +0.01 leftover from rounding).
  (4, '★ Specialist Gloves | Crimson Web (Field-Tested)', 'csgo', 4.77, true),
  (4, '★ Moto Gloves | Polygon (Field-Tested)',           'csgo', 4.77, true),
  (4, '★ Specialist Gloves | Mogul (Field-Tested)',       'csgo', 4.77, true),
  (4, '★ Hand Wraps | Duct Tape (Field-Tested)',          'csgo', 4.77, true),
  (4, '★ Moto Gloves | Transport (Field-Tested)',         'csgo', 4.76, true),
  -- Covert / Classified rifles
  (4, 'M4A4 | Temukau (Field-Tested)',                    'csgo', 4.76, true),
  (4, 'AK-47 | Head Shot (Field-Tested)',                 'csgo', 4.76, true),
  -- Restricted / Mil-Spec
  (4, 'P2000 | Wicked Sick (Field-Tested)',               'csgo', 4.76, true),
  (4, 'UMP-45 | Wild Child (Field-Tested)',               'csgo', 4.76, true),
  (4, 'AWP | Duality (Field-Tested)',                     'csgo', 4.76, true),
  (4, 'R8 Revolver | Banana Cannon (Field-Tested)',       'csgo', 4.76, true),
  (4, 'Glock-18 | Umbral Rabbit (Field-Tested)',          'csgo', 4.76, true),
  (4, 'M4A1-S | Emphorosaur-S (Field-Tested)',            'csgo', 4.76, true),
  (4, 'P90 | Neoqueen (Field-Tested)',                    'csgo', 4.76, true),
  (4, 'MAC-10 | Sakkaku (Field-Tested)',                  'csgo', 4.76, true),
  (4, 'MP5-SD | Liquidation (Field-Tested)',              'csgo', 4.76, true),
  (4, 'MP9 | Featherweight (Field-Tested)',               'csgo', 4.76, true),
  (4, 'MAG-7 | Insomnia (Field-Tested)',                  'csgo', 4.76, true),
  (4, 'SG 553 | Cyberforce (Field-Tested)',               'csgo', 4.76, true),
  (4, 'P250 | Re.built (Field-Tested)',                   'csgo', 4.76, true),
  (4, 'SCAR-20 | Fragments (Field-Tested)',               'csgo', 4.76, true);

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
