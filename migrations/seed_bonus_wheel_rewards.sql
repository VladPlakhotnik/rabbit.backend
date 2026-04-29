-- Seeds the 6 wheel rewards (Bonus Drum). Idempotent: safe to re-run.
-- Drop chances are placeholders — tune later via UPDATE rewards SET drop_chance=...
--
-- Assumes the `rewards` and `rewards_cooldown` tables and the `rewards_type_enum`
-- already exist (created by a prior migration / TypeORM bootstrap). If running on
-- a fresh DB, create them via the standard NestJS bootstrap first.

-- 1) Extend the enum to all 6 wheel reward types. ADD VALUE IF NOT EXISTS is
--    idempotent on PG 9.6+. MONEY (legacy value) is left in place for safety;
--    new code uses BALANCE.
ALTER TYPE rewards_type_enum ADD VALUE IF NOT EXISTS 'CODE';
ALTER TYPE rewards_type_enum ADD VALUE IF NOT EXISTS 'CASE';
ALTER TYPE rewards_type_enum ADD VALUE IF NOT EXISTS 'CASHBACK';
ALTER TYPE rewards_type_enum ADD VALUE IF NOT EXISTS 'RESPIN';
ALTER TYPE rewards_type_enum ADD VALUE IF NOT EXISTS 'ITEM';
ALTER TYPE rewards_type_enum ADD VALUE IF NOT EXISTS 'BALANCE';

-- 2) Reset wheel reward pool. We wipe rather than upsert because the schema
--    has no natural key besides the auto-increment id.
TRUNCATE TABLE rewards RESTART IDENTITY CASCADE;

-- 3) Seed the 6 wheel rewards. drop_chance values must sum across active
--    rewards; the service normalises by total so absolute values don't matter.
--    Order here defines awardIndex for the frontend wheel layout (clockwise
--    from the pointer at top): 0=ITEM, 1=CASE, 2=RESPIN, 3=BALANCE, 4=CASHBACK, 5=CODE.
INSERT INTO rewards (type, name, description, value, drop_chance, is_active, created_at) VALUES
    ('ITEM',     'Skin item',           'Random skin from the wheel pool', 0,  10, TRUE, CURRENT_TIMESTAMP),
    ('CASE',     'Free case',           'Free case voucher',                0,  12, TRUE, CURRENT_TIMESTAMP),
    ('RESPIN',   'Extra spin',          'Resets the wheel cooldown',        0,  15, TRUE, CURRENT_TIMESTAMP),
    ('BALANCE',  'Balance top-up',      'Direct credit to wallet',         50,  20, TRUE, CURRENT_TIMESTAMP),
    ('CASHBACK', 'Deposit cashback',    'Cashback on next deposit',        10,  18, TRUE, CURRENT_TIMESTAMP),
    ('CODE',     'Promo code',          'A bonus promo code',               0,  25, TRUE, CURRENT_TIMESTAMP);
