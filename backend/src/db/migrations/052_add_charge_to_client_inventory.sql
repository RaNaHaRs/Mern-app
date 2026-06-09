-- Allow marking inventory items as chargeable to the client
-- When checked, the charge amount is added to the case's pending_amount

ALTER TABLE case_inventory_items
  ADD COLUMN IF NOT EXISTS charge_to_client BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS client_charge_amount DECIMAL(12,2) NOT NULL DEFAULT 0;
