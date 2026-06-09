-- Migration: Make tenant_user_id nullable in saas_purchases
-- Reason: Allow payment records for new subscribers (tenant doesn't exist yet)
-- Date: June 8, 2026

-- Drop the foreign key constraint first
ALTER TABLE saas_purchases
DROP CONSTRAINT IF EXISTS saas_purchases_tenant_user_id_fkey;

-- Make tenant_user_id nullable
ALTER TABLE saas_purchases
ALTER COLUMN tenant_user_id DROP NOT NULL;

-- Recreate the foreign key constraint (still references users, but nullable)
ALTER TABLE saas_purchases
ADD CONSTRAINT saas_purchases_tenant_user_id_fkey 
  FOREIGN KEY (tenant_user_id) REFERENCES users(id) ON DELETE SET NULL;
