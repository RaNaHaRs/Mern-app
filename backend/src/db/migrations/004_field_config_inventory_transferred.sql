-- Field configuration, inventory extensions, transferred items

-- ─── Field config tables ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS field_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hdd_type VARCHAR(50) NOT NULL,
  field_key VARCHAR(100) NOT NULL,
  field_status VARCHAR(20) DEFAULT 'optional',
  field_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(hdd_type, field_key)
);

CREATE TABLE IF NOT EXISTS custom_fields (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hdd_type VARCHAR(50) NOT NULL,
  field_key VARCHAR(100) UNIQUE NOT NULL,
  field_label VARCHAR(255) NOT NULL,
  field_type VARCHAR(20) DEFAULT 'text',
  field_order INTEGER DEFAULT 0,
  is_mandatory BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS case_custom_field_values (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  custom_field_id UUID NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE,
  field_value TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(case_id, custom_field_id)
);

CREATE TABLE IF NOT EXISTS hdd_field_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  field_key VARCHAR(100) UNIQUE NOT NULL,
  field_label VARCHAR(255) NOT NULL,
  field_type VARCHAR(20) DEFAULT 'text',
  is_standard BOOLEAN DEFAULT true,
  field_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS section_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  section_key VARCHAR(100) UNIQUE NOT NULL,
  section_label VARCHAR(255) NOT NULL,
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO hdd_field_mappings (field_key, field_label, field_type, field_order) VALUES
  ('serial_number', 'Serial Number', 'text', 1),
  ('model', 'Model', 'text', 2),
  ('manufacture_country', 'Manufacture Country', 'text', 3),
  ('manufacture_date', 'Manufacture Date', 'date', 4),
  ('pcb_number', 'PCB Number', 'text', 5),
  ('pn_number', 'PN Number', 'text', 6),
  ('dcm', 'DCM', 'text', 7),
  ('dcx', 'DCX (3.5 only)', 'text', 8),
  ('date_code', 'Date Code', 'text', 9),
  ('site_code', 'Site Code', 'text', 10),
  ('firmware', 'Firmware', 'text', 11),
  ('company_name', 'Company Name', 'text', 12),
  ('mlc', 'MLC', 'text', 13),
  ('hdd_code', 'HDD Code', 'text', 14),
  ('four_code', '4 Code', 'text', 15),
  ('capacity', 'Capacity', 'text', 16),
  ('interface', 'Interface', 'text', 17),
  ('form_factor', 'Form Factor', 'text', 18),
  ('head_map', 'Head Map', 'text', 19),
  ('family', 'ROM Family', 'text', 20)
ON CONFLICT DO NOTHING;

INSERT INTO section_configs (section_key, section_label) VALUES
  ('image_upload', 'Image Upload Section'),
  ('diagnosis', 'Diagnosis Field'),
  ('quotation', 'Commercial / Quotation Section')
ON CONFLICT DO NOTHING;

-- ─── Inventory extensions ──────────────────────────────────────────────────
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS ui_category VARCHAR(50);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS dynamic_fields JSONB DEFAULT '{}';
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS custom_field_values JSONB DEFAULT '{}';

-- Fix source_case_id type (UUID for cases)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory_items' AND column_name = 'source_case_id'
      AND data_type = 'integer'
  ) THEN
    ALTER TABLE inventory_items ALTER COLUMN source_case_id TYPE UUID USING NULL;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS source_case_id UUID REFERENCES cases(id);

CREATE INDEX IF NOT EXISTS idx_inventory_ui_category ON inventory_items(ui_category);
CREATE INDEX IF NOT EXISTS idx_inventory_dynamic_fields ON inventory_items USING gin(dynamic_fields);

-- Inventory custom field values (per item)
CREATE TABLE IF NOT EXISTS inventory_custom_field_values (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  custom_field_id UUID NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE,
  field_value TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(inventory_item_id, custom_field_id)
);

-- ─── Transferred items ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transferred_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID REFERENCES cases(id) ON DELETE SET NULL,
  inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
  stock_number VARCHAR(100),
  ui_category VARCHAR(50),
  company VARCHAR(100),
  brand VARCHAR(100),
  model VARCHAR(200),
  serial_number VARCHAR(100),
  field_snapshot JSONB DEFAULT '{}',
  custom_field_snapshot JSONB DEFAULT '{}',
  transferred_by UUID REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transferred_items_case ON transferred_items(case_id);
CREATE INDEX IF NOT EXISTS idx_transferred_items_inventory ON transferred_items(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_transferred_items_created ON transferred_items(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_field_configs_type ON field_configs(hdd_type);
CREATE INDEX IF NOT EXISTS idx_custom_fields_type ON custom_fields(hdd_type);
