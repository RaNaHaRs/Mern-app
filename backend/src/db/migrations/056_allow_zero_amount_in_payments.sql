-- Migration: Allow zero amount in payments for 100% discount cases
-- Date: June 11, 2026

-- The amount column can now be 0 for 100% discount payments
-- No change needed to schema as amount >= 0 is already valid
-- This migration documents the business rule

-- Verify the payments table has the new discount columns
ALTER TABLE payments ADD COLUMN IF NOT EXISTS gross_amount DECIMAL(12,2);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(12,2) DEFAULT 0;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS discount_percentage DECIMAL(5,2) DEFAULT 0;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS collectable_amount DECIMAL(12,2);

-- Add comment explaining zero amounts are valid
COMMENT ON COLUMN payments.amount IS 'Payment amount in rupees. Can be 0 for 100% discount cases. See collectable_amount for final amount.';
COMMENT ON COLUMN payments.collectable_amount IS 'Final collectable amount after discount (gross - discount). Can be 0 for 100% discount.';
