-- ============================================================
-- FIELD CONFIGURATION SYSTEM
-- Store dynamic HDD field configurations and custom fields per tenant
-- ============================================================

-- Field Config Storage
CREATE TABLE IF NOT EXISTS field_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hdd_type VARCHAR(50) NOT NULL,  -- e.g., 'wd_2.5', 'seagate_3.5', 'others_2.5'
  field_key VARCHAR(100) NOT NULL,
  field_status VARCHAR(20) DEFAULT 'optional',  -- mandatory, optional, hidden
  field_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(hdd_type, field_key)
);

-- Custom Fields Definition
CREATE TABLE IF NOT EXISTS custom_fields (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hdd_type VARCHAR(50) NOT NULL,
  field_key VARCHAR(100) UNIQUE NOT NULL,  -- e.g., 'cf_warranty_status_1234567'
  field_label VARCHAR(255) NOT NULL,  -- Display label
  field_type VARCHAR(20) DEFAULT 'text',  -- text, textarea, select, checkbox, date, number
  field_order INTEGER DEFAULT 0,
  is_mandatory BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Custom Field Values for Cases
CREATE TABLE IF NOT EXISTS case_custom_field_values (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  custom_field_id UUID NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE,
  field_value TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(case_id, custom_field_id)
);

-- HDD Standard Fields Mapping
CREATE TABLE IF NOT EXISTS hdd_field_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  field_key VARCHAR(100) UNIQUE NOT NULL,
  field_label VARCHAR(255) NOT NULL,
  field_type VARCHAR(20) DEFAULT 'text',  -- text, date, number, textarea
  is_standard BOOLEAN DEFAULT true,  -- false means it's custom
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed standard HDD fields
INSERT INTO hdd_field_mappings (field_key, field_label, field_type) VALUES
  ('serial_number', 'Serial Number', 'text'),
  ('model', 'Model', 'text'),
  ('manufacture_country', 'Manufacture Country', 'text'),
  ('manufacture_date', 'Manufacture Date', 'date'),
  ('pcb_number', 'PCB Number', 'text'),
  ('pn_number', 'PN Number', 'text'),
  ('dcm', 'DCM', 'text'),
  ('dcx', 'DCX (3.5 only)', 'text'),
  ('date_code', 'Date Code', 'text'),
  ('site_code', 'Site Code', 'text'),
  ('firmware', 'Firmware', 'text'),
  ('company_name', 'Company Name', 'text'),
  ('mlc', 'MLC', 'text'),
  ('hdd_code', 'HDD Code', 'text'),
  ('four_code', '4 Code', 'text')
ON CONFLICT (field_key) DO NOTHING;

-- Section Configuration (enable/disable form sections)
CREATE TABLE IF NOT EXISTS section_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  section_key VARCHAR(100) UNIQUE NOT NULL,  -- e.g., 'image_upload', 'diagnosis', 'quotation'
  section_label VARCHAR(255) NOT NULL,
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed section configurations
INSERT INTO section_configs (section_key, section_label) VALUES
  ('image_upload', 'Image Upload Section'),
  ('diagnosis', 'Diagnosis Field'),
  ('quotation', 'Commercial / Quotation Section')
ON CONFLICT (section_key) DO NOTHING;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_field_configs_type ON field_configs(hdd_type);
CREATE INDEX IF NOT EXISTS idx_custom_fields_type ON custom_fields(hdd_type);
CREATE INDEX IF NOT EXISTS idx_custom_field_values_case ON case_custom_field_values(case_id);
CREATE INDEX IF NOT EXISTS idx_custom_field_values_field ON case_custom_field_values(custom_field_id);
CREATE INDEX IF NOT EXISTS idx_section_configs_key ON section_configs(section_key);

-- Triggers for timestamps
CREATE TRIGGER IF NOT EXISTS trg_field_configs_updated BEFORE UPDATE ON field_configs 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER IF NOT EXISTS trg_custom_fields_updated BEFORE UPDATE ON custom_fields 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER IF NOT EXISTS trg_custom_field_values_updated BEFORE UPDATE ON case_custom_field_values 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
