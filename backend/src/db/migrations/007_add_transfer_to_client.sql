-- Add transfer_to_client column to cases table
ALTER TABLE cases ADD COLUMN IF NOT EXISTS transfer_to_client BOOLEAN DEFAULT false;
