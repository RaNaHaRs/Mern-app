-- Add quotation, advance and pending amount fields to cases

ALTER TABLE cases ADD COLUMN IF NOT EXISTS quotation_amount DECIMAL(12,2) DEFAULT 0;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS advance_amount DECIMAL(12,2) DEFAULT 0;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS pending_amount DECIMAL(12,2) DEFAULT 0;
