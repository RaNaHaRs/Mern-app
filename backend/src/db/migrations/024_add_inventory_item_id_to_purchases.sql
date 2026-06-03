BEGIN;

ALTER TABLE accounting_purchases ADD COLUMN IF NOT EXISTS inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_accounting_purchases_inventory_item_id ON accounting_purchases (inventory_item_id);

COMMIT;
