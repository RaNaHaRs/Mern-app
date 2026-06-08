-- ============================================================
-- MIGRATION 043: Password Reset Rate Limiting Table
-- Tracks reset requests per user per day (max 5/day).
-- ============================================================

CREATE TABLE IF NOT EXISTS password_reset_attempts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email         VARCHAR(255) NOT NULL,
  attempt_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  last_attempt  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One row per user per day
  CONSTRAINT uq_reset_attempts_user_date UNIQUE (user_id, attempt_date)
);

CREATE INDEX IF NOT EXISTS idx_reset_attempts_user    ON password_reset_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_reset_attempts_email   ON password_reset_attempts(email);
CREATE INDEX IF NOT EXISTS idx_reset_attempts_date    ON password_reset_attempts(attempt_date);

-- Also add reset_token_used_at to users so we can detect replay even after NULL-ing the token
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_used_at TIMESTAMPTZ;
