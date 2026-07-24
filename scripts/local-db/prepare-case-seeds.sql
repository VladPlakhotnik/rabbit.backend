-- The post-dump Revolution/Shadow content migrations only reseed skin_case;
-- they assume their parent case rows already exist. The 2026-04-30 snapshot
-- does not contain those two rows, so reconstruct the referenced catalog
-- records in the disposable local copy before applying the original seeds.

INSERT INTO cases (
  id,
  name,
  img_url,
  case_price,
  section_id,
  remaining_count,
  max_count,
  is_popular,
  is_limited,
  slug,
  game,
  game_type
)
VALUES
  (
    4,
    'Revolution Case',
    'https://jabka.skin/cdn/serviceitems/9e8d22c6-fec1-41ac-8148-6e105748330e-676bcf9642f2e.webp',
    3.06,
    1,
    1000,
    1000,
    false,
    false,
    'revolution-case',
    'csgo',
    'csgo'
  ),
  (
    5,
    'Shadow Case',
    'https://jabka.skin/cdn/serviceitems/8eb063ff-40a2-408a-aa0d-e25dc3f14a5f-676bcf964d292.webp',
    3.12,
    1,
    1000,
    1000,
    false,
    false,
    'shadow-case',
    'csgo',
    'csgo'
  )
ON CONFLICT (id) DO NOTHING;

SELECT setval(
  pg_get_serial_sequence('cases', 'id'),
  GREATEST(1, (SELECT COALESCE(MAX(id), 0) FROM cases))
);
