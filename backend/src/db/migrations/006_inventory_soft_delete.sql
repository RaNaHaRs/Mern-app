-- Add soft delete and status support to inventory_items

-- Add deleted_at column if not exists
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Add status column if not exists
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'available';

-- Create index on deleted_at for soft delete queries
CREATE INDEX IF NOT EXISTS idx_inventory_deleted_at ON inventory_items(deleted_at);

-- Create index on status for quick filtering
CREATE INDEX IF NOT EXISTS idx_inventory_status ON inventory_items(status);

-- Optional: Create a view for non-deleted items
CREATE OR REPLACE VIEW inventory_items_active AS
  SELECT * FROM inventory_items WHERE deleted_at IS NULL;
