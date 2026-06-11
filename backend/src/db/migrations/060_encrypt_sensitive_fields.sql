-- Migration: Encrypt Sensitive Fields
-- Date: 2025-01-XX
-- Purpose: Add encrypted columns for sensitive data (SMTP password, Razorpay secret, API keys)
--          Old unencrypted columns marked as deprecated

-- Add encrypted columns to settings table for super_admin SMTP configuration
ALTER TABLE settings ADD COLUMN IF NOT EXISTS encrypted_smtp_password bytea;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS smtp_password_encrypted boolean DEFAULT false;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS encrypted_razorpay_secret bytea;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS razorpay_secret_encrypted boolean DEFAULT false;

-- Add comment marking old columns as deprecated (existing columns remain for backward compatibility)
COMMENT ON COLUMN settings.smtp_password IS 'DEPRECATED: Use encrypted_smtp_password instead. Old plaintext values should be migrated.';
COMMENT ON COLUMN settings.razorpay_secret IS 'DEPRECATED: Use encrypted_razorpay_secret instead. Old plaintext values should be migrated.';

-- Add encrypted columns to integrations table for API keys
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS encrypted_api_key bytea;
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS api_key_encrypted boolean DEFAULT false;

-- Mark old column as deprecated
COMMENT ON COLUMN integrations.api_key IS 'DEPRECATED: Use encrypted_api_key instead. Old plaintext values should be migrated.';

-- Add security audit columns for tracking encryption changes
ALTER TABLE settings ADD COLUMN IF NOT EXISTS encrypted_fields_updated_at timestamp;
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS encrypted_fields_updated_at timestamp;

-- Create index on encryption flags for faster queries
CREATE INDEX IF NOT EXISTS idx_settings_encryption_status ON settings(smtp_password_encrypted, razorpay_secret_encrypted);
CREATE INDEX IF NOT EXISTS idx_integrations_encryption_status ON integrations(api_key_encrypted);

-- Log the migration
INSERT INTO migration_logs (migration_name, status, executed_at)
VALUES ('060_encrypt_sensitive_fields', 'completed', NOW())
ON CONFLICT DO NOTHING;
