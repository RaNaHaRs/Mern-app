-- ============================================================
-- INVENTORY EXTENDED SCHEMA MIGRATION
-- Moved from index.js runInventoryMigration() to prevent
-- running on every server startup
-- ============================================================

-- Add extended inventory columns
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS stock_number VARCHAR(100);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS company VARCHAR(100);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS brand VARCHAR(100);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS model VARCHAR(200);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS firmware VARCHAR(100);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS site_code VARCHAR(100);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS date_code VARCHAR(50);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS head_map VARCHAR(200);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS family VARCHAR(100);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS capacity VARCHAR(50);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS interface VARCHAR(50);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS form_factor VARCHAR(50);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'available';
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS ui_category VARCHAR(50);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS dynamic_fields JSONB DEFAULT '{}';
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS custom_field_values JSONB DEFAULT '{}';
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS source_case_id UUID;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS health VARCHAR(100);

-- Update tenant_id for existing records
UPDATE inventory_items ii
  SET tenant_id = COALESCE(ii.tenant_id, u.tenant_id, u.tenant_owner_id, u.id)
  FROM users u
  WHERE ii.tenant_id IS NULL
    AND ii.added_by = u.id;

-- Update status for existing records
UPDATE inventory_items SET status='available' WHERE status IS NULL;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_inventory_tenant ON inventory_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_stock_number ON inventory_items(stock_number);
CREATE INDEX IF NOT EXISTS idx_inventory_pcb ON inventory_items(pcb_number);
CREATE INDEX IF NOT EXISTS idx_inventory_serial ON inventory_items(serial_number);
CREATE INDEX IF NOT EXISTS idx_inventory_model ON inventory_items(model);
CREATE INDEX IF NOT EXISTS idx_inventory_deleted_at ON inventory_items(deleted_at);

-- Create inventory item notes table
CREATE TABLE IF NOT EXISTS inventory_item_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  note_text TEXT NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_item_notes_item ON inventory_item_notes(inventory_item_id);
