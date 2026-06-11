-- Migration: Add security-hardened columns to refresh_tokens table
-- Purpose: Support hashed token storage, token rotation tracking, and revocation
-- Date: 2026-06-10

-- Make old plaintext token column nullable (transitioning to token_hash)
ALTER TABLE refresh_tokens ALTER COLUMN token DROP NOT NULL;

-- Add new security columns to refresh_tokens table
ALTER TABLE refresh_tokens 
ADD COLUMN IF NOT EXISTS token_hash VARCHAR(255),
ADD COLUMN IF NOT EXISTS token_family UUID,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Create index on token_hash for faster lookups (hashed tokens are unique)
CREATE UNIQUE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash 
ON refresh_tokens(token_hash) WHERE token_hash IS NOT NULL;

-- Create index on user_id for faster user token lookups
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id 
ON refresh_tokens(user_id) WHERE is_active = true;

-- Create index on expires_at for cleanup queries
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at 
ON refresh_tokens(expires_at);

-- Optional: Remove old plaintext token column after migration is stable
-- (commented out to preserve backward compatibility)
-- ALTER TABLE refresh_tokens DROP COLUMN token;

-- Add comment documenting the schema
COMMENT ON COLUMN refresh_tokens.token_hash IS 'SHA-256 hash of the refresh token (never store plaintext)';
COMMENT ON COLUMN refresh_tokens.token_family IS 'UUID to track token rotation family for replay attack detection';
COMMENT ON COLUMN refresh_tokens.is_active IS 'Boolean to mark revoked tokens without deleting history for audit trail';
