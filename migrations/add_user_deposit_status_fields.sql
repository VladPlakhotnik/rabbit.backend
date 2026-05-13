ALTER TABLE user_deposits
  ADD COLUMN IF NOT EXISTS bonus_amount NUMERIC(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE user_deposits
  ADD COLUMN IF NOT EXISTS status VARCHAR(24) NOT NULL DEFAULT 'success';

ALTER TABLE user_deposits
  ADD COLUMN IF NOT EXISTS failure_reason VARCHAR(255);

ALTER TABLE user_deposits
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE user_deposits
  ALTER COLUMN status SET DEFAULT 'waiting';

ALTER TABLE user_deposits
  DROP CONSTRAINT IF EXISTS chk_user_deposits_status;

ALTER TABLE user_deposits
  ADD CONSTRAINT chk_user_deposits_status
    CHECK (status IN ('waiting', 'success', 'error', 'cancelled'));

CREATE INDEX IF NOT EXISTS idx_user_deposits_user_status_created_at
  ON user_deposits (user_id, status, created_at);
