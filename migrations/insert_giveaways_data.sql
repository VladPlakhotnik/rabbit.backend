-- Insert 3 sample giveaway records
-- Note: Make sure you have at least 3 skins in csgo_skins table and at least 1 user in users table
-- You can check with: SELECT id FROM csgo_skins LIMIT 3; and SELECT id FROM users LIMIT 1;

-- Giveaway 1: Upcoming giveaway (starts in the future)
INSERT INTO giveaways (
    name,
    skin_id,
    participant_count,
    required_deposit_amount,
    participants,
    start_time,
    end_time,
    status,
    winner_user_id
) 
SELECT 
    'Summer Giveaway 2024',
    (SELECT id FROM csgo_skins ORDER BY id LIMIT 1),
    0,
    100.00,
    ARRAY[]::INTEGER[],
    NOW() + INTERVAL '7 days',
    NOW() + INTERVAL '14 days',
    'UPCOMING'::giveaway_status,
    NULL
WHERE EXISTS (SELECT 1 FROM csgo_skins LIMIT 1);

-- Giveaway 2: Active giveaway (currently running)
INSERT INTO giveaways (
    name,
    skin_id,
    participant_count,
    required_deposit_amount,
    participants,
    start_time,
    end_time,
    status,
    winner_user_id
)
SELECT 
    'Weekly Special Giveaway',
    (SELECT id FROM csgo_skins ORDER BY id LIMIT 1 OFFSET 1),
    0,
    50.00,
    ARRAY[]::INTEGER[],
    NOW() - INTERVAL '2 days',
    NOW() + INTERVAL '5 days',
    'ACTIVE'::giveaway_status,
    NULL
WHERE EXISTS (SELECT 1 FROM csgo_skins LIMIT 1 OFFSET 1);

-- Giveaway 3: Completed giveaway (with winner)
-- Вариант 1: Автоматический выбор участников из таблицы users
INSERT INTO giveaways (
    name,
    skin_id,
    participant_count,
    required_deposit_amount,
    participants,
    start_time,
    end_time,
    status,
    winner_user_id
)
SELECT 
    'Spring Giveaway 2024',
    (SELECT id FROM csgo_skins ORDER BY id LIMIT 1 OFFSET 2),
    5,
    200.00,
    -- ARRAY_AGG преобразует результат подзапроса в массив INTEGER[]
    -- Результат: {1, 2, 3, 4, 5} (массив, не объект!)
    (SELECT ARRAY_AGG(id ORDER BY id) FROM (SELECT id FROM users ORDER BY id LIMIT 5) AS u),
    NOW() - INTERVAL '30 days',
    NOW() - INTERVAL '7 days',
    'COMPLETED'::giveaway_status,
    (SELECT id FROM users ORDER BY id LIMIT 1)
WHERE EXISTS (SELECT 1 FROM csgo_skins LIMIT 1 OFFSET 2)
  AND EXISTS (SELECT 1 FROM users LIMIT 1);

-- Вариант 2: Если хотите указать конкретные ID участников вручную, используйте:
/*
INSERT INTO giveaways (
    name,
    skin_id,
    participant_count,
    required_deposit_amount,
    participants,
    start_time,
    end_time,
    status,
    winner_user_id
) VALUES (
    'Spring Giveaway 2024',
    (SELECT id FROM csgo_skins ORDER BY id LIMIT 1 OFFSET 2),
    5,
    200.00,
    ARRAY[1, 2, 3, 4, 5]::INTEGER[],  -- Явное указание массива
    NOW() - INTERVAL '30 days',
    NOW() - INTERVAL '7 days',
    'COMPLETED'::giveaway_status,
    (SELECT id FROM users ORDER BY id LIMIT 1)
);
*/

