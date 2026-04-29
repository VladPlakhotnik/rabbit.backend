-- Stores per-user partner program state: level, balances, change limits.
-- 1:1 with users; created lazily on first partner action.

CREATE TABLE IF NOT EXISTS partner_profiles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE,
    level SMALLINT NOT NULL DEFAULT 1,
    referral_balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
    total_earned NUMERIC(12, 2) NOT NULL DEFAULT 0,
    total_referrals_deposit NUMERIC(12, 2) NOT NULL DEFAULT 0,
    last_code_change_at TIMESTAMP NULL,
    code_locked_by_admin BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_partner_profile_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT chk_partner_level CHECK (level BETWEEN 1 AND 5),
    CONSTRAINT chk_partner_balance_nonneg CHECK (referral_balance >= 0),
    CONSTRAINT chk_partner_total_earned_nonneg CHECK (total_earned >= 0),
    CONSTRAINT chk_partner_total_deposit_nonneg CHECK (total_referrals_deposit >= 0)
);

CREATE INDEX IF NOT EXISTS idx_partner_profiles_user_id ON partner_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_partner_profiles_level ON partner_profiles(level);

-- Index on User.referral_parent_id for fast "list my referrals" lookups
CREATE INDEX IF NOT EXISTS idx_users_referral_parent_id ON users(referral_parent_id);
