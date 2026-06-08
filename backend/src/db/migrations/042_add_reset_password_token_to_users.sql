-- Migration to add forgot/reset password token columns to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_password_token VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_password_expires TIMESTAMPTZ;
