ALTER TABLE giveaways
  ADD COLUMN IF NOT EXISTS giveaway_type VARCHAR(32);

CREATE TABLE IF NOT EXISTS user_deposits (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  bonus_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status VARCHAR(24) NOT NULL DEFAULT 'waiting',
  source VARCHAR(64),
  external_id VARCHAR(128),
  failure_reason VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_user_deposits_status
    CHECK (status IN ('waiting', 'success', 'error', 'cancelled'))
);

ALTER TABLE user_deposits
  ADD COLUMN IF NOT EXISTS bonus_amount NUMERIC(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE user_deposits
  ADD COLUMN IF NOT EXISTS status VARCHAR(24) NOT NULL DEFAULT 'success';

ALTER TABLE user_deposits
  ALTER COLUMN status SET DEFAULT 'waiting';

ALTER TABLE user_deposits
  ADD COLUMN IF NOT EXISTS failure_reason VARCHAR(255);

ALTER TABLE user_deposits
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_user_deposits_user_created_at
  ON user_deposits (user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_user_deposits_user_status_created_at
  ON user_deposits (user_id, status, created_at);
