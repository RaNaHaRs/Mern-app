-- Health status on stock items
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS health VARCHAR(100);

-- Append-only notes timeline per stock item
CREATE TABLE IF NOT EXISTS inventory_item_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  note_text TEXT NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_item_notes_item ON inventory_item_notes(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_item_notes_created ON inventory_item_notes(inventory_item_id, created_at DESC);

-- Migrate legacy single notes field into first timeline entry
INSERT INTO inventory_item_notes (inventory_item_id, note_text, created_at)
SELECT ii.id, TRIM(ii.notes), COALESCE(ii.updated_at, ii.created_at, NOW())
FROM inventory_items ii
WHERE ii.notes IS NOT NULL AND TRIM(ii.notes) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM inventory_item_notes n WHERE n.inventory_item_id = ii.id
  );
