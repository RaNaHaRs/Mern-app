-- Inventory brands & categories (Settings HDD Types + Add Stock form)

CREATE TABLE IF NOT EXISTS inventory_brands (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  config_key VARCHAR(100) NOT NULL UNIQUE,
  is_system BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Remove global case-insensitive duplicate brand names before creating
-- the unique index on LOWER(name).
WITH ranked_brands AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY LOWER(name) ORDER BY id) AS rn
  FROM inventory_brands
)
DELETE FROM inventory_brands
WHERE id IN (SELECT id FROM ranked_brands WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_brands_name ON inventory_brands(LOWER(name));

CREATE TABLE IF NOT EXISTS inventory_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_key VARCHAR(50) NOT NULL UNIQUE,
  label VARCHAR(100) NOT NULL,
  icon VARCHAR(10) DEFAULT '💿',
  color VARCHAR(20) DEFAULT '#3b82f6',
  brand_name VARCHAR(100),
  form_factor VARCHAR(20),
  is_hdd BOOLEAN DEFAULT true,
  active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO inventory_brands (name, config_key, is_system, sort_order) VALUES
  ('Western Digital', 'western_digital', true, 1),
  ('Seagate', 'seagate', true, 2),
  ('Toshiba', 'toshiba', false, 3),
  ('Samsung', 'samsung', false, 4),
  ('Hitachi (HGST)', 'hitachi_hgst', false, 5),
  ('Other', 'other', true, 99)
ON CONFLICT DO NOTHING;

INSERT INTO inventory_categories (category_key, label, icon, color, brand_name, form_factor, is_hdd, sort_order) VALUES
  ('wd_35', 'WD 3.5"', '💿', '#3b82f6', 'Western Digital', '3.5', true, 1),
  ('wd_25', 'WD 2.5"', '💽', '#22d3ee', 'Western Digital', '2.5', true, 2),
  ('seagate_35', 'Seagate 3.5"', '💿', '#f59e0b', 'Seagate', '3.5', true, 3),
  ('seagate_25', 'Seagate 2.5"', '💽', '#fbbf24', 'Seagate', '2.5', true, 4),
  ('others_35', 'Others 3.5"', '💿', '#8b5cf6', '', '3.5', true, 5),
  ('others_25', 'Others 2.5"', '💽', '#a78bfa', '', '2.5', true, 6),
  ('pcb', 'PCB', '🔌', '#10b981', '', '', false, 7),
  ('ssd', 'SSD', '⚡', '#06b6d4', '', '', false, 8),
  ('phone', 'Phone', '📱', '#ec4899', '', '', false, 9)
ON CONFLICT DO NOTHING;
