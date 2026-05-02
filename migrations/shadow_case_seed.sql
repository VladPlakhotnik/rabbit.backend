-- Seed Shadow Case (cases.id = 5) with the 21 CS:GO skins from the
-- official 2014 case lineup.
--
-- Notes for this case specifically:
--   1. The DB tags every Shadow Daggers variant as `covert` rather than
--      `extraordinary` (the usual knife tier). We keep that tagging —
--      it means there's only one "premium" bucket here, not the
--      Glove + Covert split we used for Revolution Case.
--   2. ★ Shadow Daggers | Rust Coat doesn't exist as Field-Tested in
--      csgo_skins (Rust Coat lives in the high-float band only). We
--      use Battle-Scarred at $70.20 for it; the other six knives stay
--      Field-Tested. Mixing exteriors inside a single tier is fine —
--      the lottery only reads `chance` and `skin_hash_name`.
--
-- Chance distribution: tiered by rarity, equal within tier, totals
-- chosen so EV lands in the 20-30% house-edge target.
--
--   tier        skins  Σ chance   per skin     Σ EV
--   --------------------------------------------------
--   Covert        7     1.00%      0.14-0.16% $1.018
--   Classified    3     4.00%      1.33-1.34% $0.701
--   Restricted    4    14.00%      3.50%      $0.323
--   Mil-Spec      7    81.00%     11.57-11.58% $0.346
--   --------------------------------------------------
--   total        21   100.00%               EV $2.388
--
-- Case price = $3.12 → RTP = 2.39/3.12 = 76.5% → operator margin 23.5%.
-- Note: Mil-Spec total bumped from the canonical 80% to 81% to absorb
-- the Glove tier we don't have here — keeps the four tier totals at
-- round numbers and the sum at 100.

BEGIN;

-- Idempotent reseed — running this file twice produces the same state.
DELETE FROM skin_case WHERE case_id = 5;

-- See revolution_case_seed.sql for the rationale on this setval —
-- TypeORM repository.save() bypasses the sequence, drift accumulates.
SELECT setval(
  pg_get_serial_sequence('skin_case', 'id'),
  COALESCE((SELECT MAX(id) FROM skin_case), 0)
);

INSERT INTO skin_case (case_id, skin_hash_name, game_type, chance, is_drop_out) VALUES
  -- Covert tier — 7 skins, 1.00% total
  -- Case Hardened is the headline drop on the lineup image; gets the
  -- +0.02 absorber so the tier totals to a clean 1.00.
  (5, '★ Shadow Daggers | Case Hardened (Field-Tested)',  'csgo',  0.16, true),
  (5, 'USP-S | Kill Confirmed (Field-Tested)',            'csgo',  0.14, true),
  (5, 'M4A1-S | Golden Coil (Field-Tested)',              'csgo',  0.14, true),
  (5, '★ Shadow Daggers | Night (Field-Tested)',          'csgo',  0.14, true),
  (5, '★ Shadow Daggers | Urban Masked (Field-Tested)',   'csgo',  0.14, true),
  (5, '★ Shadow Daggers | Damascus Steel (Field-Tested)', 'csgo',  0.14, true),
  (5, '★ Shadow Daggers | Rust Coat (Battle-Scarred)',    'csgo',  0.14, true),
  -- Classified tier — 3 skins, 4.00% total (G3SG1 Flux absorbs +0.01)
  (5, 'AK-47 | Frontside Misty (Field-Tested)',           'csgo',  1.33, true),
  (5, 'SSG 08 | Big Iron (Field-Tested)',                 'csgo',  1.33, true),
  (5, 'G3SG1 | Flux (Field-Tested)',                      'csgo',  1.34, true),
  -- Restricted tier — 4 skins × 3.50% = 14.00%
  (5, 'Galil AR | Stone Cold (Field-Tested)',             'csgo',  3.50, true),
  (5, 'P250 | Wingshot (Field-Tested)',                   'csgo',  3.50, true),
  (5, 'M249 | Nebula Crusader (Field-Tested)',            'csgo',  3.50, true),
  (5, 'MP7 | Special Delivery (Field-Tested)',            'csgo',  3.50, true),
  -- Mil-Spec tier — 7 skins, 81.00% total (Green Marine absorbs +0.01)
  (5, 'Glock-18 | Wraiths (Field-Tested)',                'csgo', 11.57, true),
  (5, 'Dual Berettas | Dualing Dragons (Field-Tested)',   'csgo', 11.57, true),
  (5, 'FAMAS | Survivor Z (Field-Tested)',                'csgo', 11.57, true),
  (5, 'MAG-7 | Cobalt Core (Field-Tested)',               'csgo', 11.57, true),
  (5, 'MAC-10 | Rangeen (Field-Tested)',                  'csgo', 11.57, true),
  (5, 'XM1014 | Scumbria (Field-Tested)',                 'csgo', 11.57, true),
  (5, 'SCAR-20 | Green Marine (Field-Tested)',            'csgo', 11.58, true);

DO $$
DECLARE total numeric;
BEGIN
  SELECT SUM(chance) INTO total FROM skin_case WHERE case_id = 5;
  IF total <> 100.00 THEN
    RAISE EXCEPTION 'skin_case total chance for case_id=5 is %, expected 100.00', total;
  END IF;
END $$;

COMMIT;
