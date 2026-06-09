-- Add discount_amount column to case_inventory_items
-- Allows admin to apply discounts on individual inventory items used in a case

ALTER TABLE case_inventory_items
  ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0;
