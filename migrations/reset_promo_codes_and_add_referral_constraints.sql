-- Reset promo codes data and tighten constraints for the partner program.
-- 1. Wipes existing promo_codes / promo_code_rewards.
-- 2. Adds a partial unique index ensuring a single ACTIVE referral code per partner.
-- 3. Adds a case-insensitive lookup index on the code column.

TRUNCATE TABLE promo_code_rewards RESTART IDENTITY CASCADE;
TRUNCATE TABLE promo_codes RESTART IDENTITY CASCADE;

-- Case-insensitive lookup for activate(code)
CREATE UNIQUE INDEX IF NOT EXISTS promo_codes_code_upper_unique
    ON promo_codes (UPPER(code));

-- Exactly one ACTIVE referral code per partner
CREATE UNIQUE INDEX IF NOT EXISTS promo_codes_referral_owner_unique
    ON promo_codes (created_by)
    WHERE type = 'REFERRAL' AND status = 'ACTIVE';

-- Quick lookup of partner referral codes by owner
CREATE INDEX IF NOT EXISTS promo_codes_created_by_type_idx
    ON promo_codes (created_by, type);
