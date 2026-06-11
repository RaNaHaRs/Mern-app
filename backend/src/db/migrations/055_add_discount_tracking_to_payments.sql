-- Migration: Add discount tracking columns to payments table
-- Allows recording gross amount, discount, and collectable amount
-- Date: June 11, 2026

ALTER TABLE payments ADD COLUMN IF NOT EXISTS gross_amount DECIMAL(12,2);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(12,2) DEFAULT 0;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS discount_percentage DECIMAL(5,2) DEFAULT 0;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS collectable_amount DECIMAL(12,2);

-- Create index for discount tracking
CREATE INDEX IF NOT EXISTS idx_payments_discount ON payments(discount_percentage) WHERE discount_percentage > 0;
