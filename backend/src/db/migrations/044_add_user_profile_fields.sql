-- Add profile fields to users table
-- Note: avatar_url already exists in the schema
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
