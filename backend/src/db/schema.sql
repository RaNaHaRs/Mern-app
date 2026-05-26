-- ============================================================
-- DATA RECOVERY CRM - ENTERPRISE DATABASE SCHEMA
-- Agent 2: Database Design
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- ENUMS
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'case_stage') THEN
    CREATE TYPE case_stage AS ENUM (
      'received', 'inspection', 'diagnosis', 'quotation',
      'approved', 'rejected', 'recovery_in_progress', 'imaging',
      'data_extraction', 'verification', 'completed', 'delivered', 'failed'
    );
  END IF;
END$$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'failure_type') THEN
    CREATE TYPE failure_type AS ENUM ('logical', 'firmware', 'electrical', 'mechanical', 'unknown');
  END IF;
END$$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'device_interface') THEN
    CREATE TYPE device_interface AS ENUM ('SATA', 'NVMe', 'SAS', 'IDE', 'USB', 'PCIe', 'mSATA', 'M2', 'eSATA');
  END IF;
END$$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'device_form_factor') THEN
    CREATE TYPE device_form_factor AS ENUM ('3.5', '2.5', 'M.2', 'mSATA', 'U.2', 'PCIe_card');
  END IF;
END$$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'nand_type') THEN
    CREATE TYPE nand_type AS ENUM ('SLC', 'MLC', 'TLC', 'QLC', 'PLC', 'CMR', 'SMR');
  END IF;
END$$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'risk_level') THEN
    CREATE TYPE risk_level AS ENUM ('low', 'medium', 'high', 'critical');
  END IF;
END$$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
    CREATE TYPE payment_status AS ENUM ('pending', 'partial', 'paid', 'refunded', 'waived');
  END IF;
END$$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'item_category') THEN
    CREATE TYPE item_category AS ENUM ('spare_part', 'donor_drive', 'tool', 'consumable');
  END IF;
END$$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'file_type') THEN
    CREATE TYPE file_type AS ENUM ('client_data', 'recovered_data', 'report', 'image', 'diagnostic', 'other');
  END IF;
END$$;

-- ============================================================
-- USERS (RBAC)
-- ============================================================

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  role VARCHAR(100) NOT NULL DEFAULT 'staff',
  is_active BOOLEAN DEFAULT true,
  avatar_url VARCHAR(500),
  phone VARCHAR(20),
  specializations TEXT[],     -- e.g. ['head_swap', 'firmware', 'SSD']
  permissions JSONB,
  notes TEXT,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CLIENTS (CRM)
-- ============================================================

CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_code VARCHAR(20) UNIQUE NOT NULL,   -- e.g. CLT-0001
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(30) NOT NULL,
  phone_alt VARCHAR(30),
  company VARCHAR(200),
  address TEXT,
  city VARCHAR(100),
  country VARCHAR(100) DEFAULT 'India',
  id_type VARCHAR(50),
  id_number VARCHAR(100),
  referral_source VARCHAR(100),
  notes TEXT,
  is_corporate BOOLEAN DEFAULT false,
  is_vip BOOLEAN DEFAULT false,
  total_cases INTEGER DEFAULT 0,
  total_paid DECIMAL(12,2) DEFAULT 0,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE client_communications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  type VARCHAR(50) NOT NULL,  -- call, email, whatsapp, in_person
  direction VARCHAR(10) DEFAULT 'outbound',  -- inbound/outbound
  summary TEXT NOT NULL,
  follow_up_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- STORAGE MODEL INTELLIGENCE DATABASE
-- ============================================================

CREATE TABLE storage_brands (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(50) NOT NULL UNIQUE,
  logo_url VARCHAR(500),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE storage_models (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  brand_id UUID NOT NULL REFERENCES storage_brands(id),
  model_number VARCHAR(200) NOT NULL,
  series VARCHAR(100),
  capacity_gb INTEGER NOT NULL,
  rpm INTEGER,                           -- NULL for SSDs
  nand_type nand_type,
  interface device_interface NOT NULL,
  form_factor device_form_factor NOT NULL,
  -- Low-level engineering data
  controller_chip VARCHAR(100),
  pcb_number VARCHAR(100),
  firmware_family VARCHAR(100),
  microcode_version VARCHAR(100),
  head_map TEXT,                         -- JSON string describing head assignments
  platter_count INTEGER,
  rom_type VARCHAR(50),                  -- e.g. "SPI ROM", "MX25L1606"
  -- Intelligence
  risk_level risk_level DEFAULT 'medium',
  common_failures TEXT[],               -- array of failure descriptions
  known_issues JSONB,                    -- structured known issue data
  recovery_strategy JSONB,              -- recommended approach
  tool_compatibility TEXT[],            -- PC-3000, MRT, DeepSpar, etc.
  do_notes TEXT,
  dont_notes TEXT,
  notes TEXT,
  is_verified BOOLEAN DEFAULT false,    -- verified by senior engineer
  verified_by UUID REFERENCES users(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(brand_id, model_number)
);

CREATE TABLE failure_library (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  model_id UUID REFERENCES storage_models(id) ON DELETE SET NULL,
  brand_id UUID REFERENCES storage_brands(id),             -- can be brand-wide
  failure_type failure_type NOT NULL,
  title VARCHAR(200) NOT NULL,
  symptoms TEXT[] NOT NULL,
  root_cause TEXT,
  solution_steps JSONB NOT NULL,         -- ordered array of steps
  tools_required TEXT[],
  success_rate DECIMAL(5,2),             -- 0-100%
  avg_recovery_time_hours DECIMAL(6,2),
  difficulty_level INTEGER CHECK (difficulty_level BETWEEN 1 AND 5),
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CASES / JOBS
-- ============================================================

CREATE TABLE cases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_number VARCHAR(30) UNIQUE NOT NULL,   -- e.g. DR-2025-00001
  client_id UUID NOT NULL REFERENCES clients(id),
  -- Device Info
  device_brand VARCHAR(100),
  device_model VARCHAR(200),
  storage_model_id UUID REFERENCES storage_models(id),
  serial_number VARCHAR(100),
  capacity_gb INTEGER,
  interface device_interface,
  form_factor device_form_factor,
  -- Failure Info
  failure_type failure_type DEFAULT 'unknown',
  symptoms TEXT[],
  symptom_notes TEXT,
  initial_diagnosis TEXT,
  final_diagnosis TEXT,
  -- Workflow
  stage case_stage DEFAULT 'received',
  priority INTEGER DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),  -- 1=critical,5=low
  assigned_engineer UUID REFERENCES users(id),
  -- Timing
  received_at TIMESTAMPTZ DEFAULT NOW(),
  deadline_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  -- Smart Assist Output (cached at creation)
  ai_risk_level risk_level,
  ai_suggested_strategy JSONB,
  ai_confidence DECIMAL(5,2),
  -- Recovery Details
  recovery_progress_pct DECIMAL(5,2) DEFAULT 0,
  data_recovered_gb DECIMAL(10,3),
  total_data_gb DECIMAL(10,3),
  imaging_tool VARCHAR(100),
  recovery_tool VARCHAR(100),
  transfer_to_client BOOLEAN DEFAULT false,
  -- Internal
  internal_notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE case_workflow_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  from_stage case_stage,
  to_stage case_stage NOT NULL,
  engineer_id UUID REFERENCES users(id),
  notes TEXT,
  time_spent_minutes INTEGER DEFAULT 0,
  actions_performed TEXT[],
  tools_used TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE case_engineer_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  engineer_id UUID NOT NULL REFERENCES users(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  work_description TEXT,
  stage case_stage
);

-- ============================================================
-- DONOR MATCHING
-- ============================================================

CREATE TABLE donor_matching (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  model_id UUID NOT NULL REFERENCES storage_models(id),
  donor_model_id UUID NOT NULL REFERENCES storage_models(id),
  compatibility_score DECIMAL(5,2) CHECK (compatibility_score BETWEEN 0 AND 100),
  match_reason TEXT[],  -- e.g. ['same_pcb', 'same_firmware', 'same_heads']
  head_compatible BOOLEAN DEFAULT false,
  pcb_compatible BOOLEAN DEFAULT false,
  firmware_compatible BOOLEAN DEFAULT false,
  notes TEXT,
  verified_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(model_id, donor_model_id)
);

-- ============================================================
-- INVENTORY
-- ============================================================

CREATE TABLE inventory_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  category item_category NOT NULL,
  storage_model_id UUID REFERENCES storage_models(id),  -- for donor drives / parts
  description TEXT,
  quantity INTEGER DEFAULT 0,
  min_quantity INTEGER DEFAULT 1,       -- reorder threshold
  unit_cost DECIMAL(10,2),
  location VARCHAR(100),                -- shelf/bin location
  condition VARCHAR(50),                -- new, used, refurb
  serial_number VARCHAR(100),
  firmware_version VARCHAR(100),        -- for donor drives
  pcb_number VARCHAR(100),              -- for donor drives
  head_map TEXT,                        -- for donor drives
  is_available BOOLEAN DEFAULT true,
  reserved_for_case UUID REFERENCES cases(id),
  notes TEXT,
  added_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE inventory_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID NOT NULL REFERENCES inventory_items(id),
  case_id UUID REFERENCES cases(id),
  type VARCHAR(20) NOT NULL,  -- in, out, reserved, returned, disposed
  quantity INTEGER NOT NULL,
  notes TEXT,
  performed_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PAYMENTS & QUOTATIONS
-- ============================================================

CREATE TABLE quotations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  quote_number VARCHAR(30) UNIQUE,
  estimated_cost DECIMAL(12,2) NOT NULL,
  parts_cost DECIMAL(12,2) DEFAULT 0,
  service_cost DECIMAL(12,2) DEFAULT 0,
  tax_pct DECIMAL(5,2) DEFAULT 18,       -- GST default
  total_amount DECIMAL(12,2),
  currency VARCHAR(10) DEFAULT 'INR',
  valid_until DATE,
  approved_by_client BOOLEAN,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES cases(id),
  quotation_id UUID REFERENCES quotations(id),
  amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'INR',
  method VARCHAR(50),     -- cash, UPI, card, bank_transfer, cheque
  reference_number VARCHAR(100),
  status payment_status DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  notes TEXT,
  recorded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- FILE MANAGEMENT
-- ============================================================

CREATE TABLE case_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  file_name VARCHAR(500) NOT NULL,
  original_name VARCHAR(500) NOT NULL,
  file_path VARCHAR(1000) NOT NULL,    -- server-side path (not exposed)
  file_size BIGINT NOT NULL,           -- bytes
  mime_type VARCHAR(100),
  file_type file_type DEFAULT 'other',
  checksum VARCHAR(64),                -- SHA-256 for integrity
  is_encrypted BOOLEAN DEFAULT false,
  description TEXT,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- AUDIT LOGS (SECURITY)
-- ============================================================

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50),           -- case, client, file, user, etc.
  resource_id UUID,
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================

CREATE INDEX idx_cases_client ON cases(client_id);
CREATE INDEX idx_cases_stage ON cases(stage);
CREATE INDEX idx_cases_assigned ON cases(assigned_engineer);
CREATE INDEX idx_cases_created ON cases(created_at DESC);
CREATE INDEX idx_cases_number ON cases(case_number);
CREATE INDEX idx_workflow_case ON case_workflow_logs(case_id);
CREATE INDEX idx_storage_models_brand ON storage_models(brand_id);
CREATE INDEX idx_storage_models_model ON storage_models(model_number);
CREATE INDEX idx_storage_models_trgm ON storage_models USING gin(model_number gin_trgm_ops);
CREATE INDEX idx_inventory_category ON inventory_items(category);
CREATE INDEX idx_inventory_model ON inventory_items(storage_model_id);
CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX idx_clients_code ON clients(client_code);
CREATE INDEX idx_clients_search ON clients USING gin(
  (first_name || ' ' || last_name || ' ' || COALESCE(email, '') || ' ' || phone) gin_trgm_ops
);

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_clients_updated BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_cases_updated BEFORE UPDATE ON cases FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_storage_models_updated BEFORE UPDATE ON storage_models FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_inventory_updated BEFORE UPDATE ON inventory_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_quotations_updated BEFORE UPDATE ON quotations FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-generate case number
CREATE OR REPLACE FUNCTION generate_case_number()
RETURNS TRIGGER AS $$
DECLARE
  year_part VARCHAR(4);
  seq_num INTEGER;
BEGIN
  year_part := TO_CHAR(NOW(), 'YYYY');
  SELECT COUNT(*) + 1 INTO seq_num FROM cases WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW());
  NEW.case_number := 'DR-' || year_part || '-' || LPAD(seq_num::TEXT, 5, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_case_number BEFORE INSERT ON cases FOR EACH ROW WHEN (NEW.case_number IS NULL) EXECUTE FUNCTION generate_case_number();

-- Auto-generate client code
CREATE OR REPLACE FUNCTION generate_client_code()
RETURNS TRIGGER AS $$
DECLARE
  seq_num INTEGER;
BEGIN
  SELECT COUNT(*) + 1 INTO seq_num FROM clients;
  NEW.client_code := 'CLT-' || LPAD(seq_num::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_client_code BEFORE INSERT ON clients FOR EACH ROW WHEN (NEW.client_code IS NULL) EXECUTE FUNCTION generate_client_code();

-- ============================================================
-- SEED DATA - BRANDS
-- ============================================================

INSERT INTO storage_brands (name) VALUES
  ('Western Digital'), ('Seagate'), ('Toshiba'), ('Samsung'),
  ('Hitachi'), ('HGST'), ('SanDisk'), ('Kingston'), ('Crucial'), ('Intel');

-- ============================================================
-- ACCOUNTING MODULE
-- ============================================================

CREATE TABLE accounting_quotes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_number VARCHAR(30) UNIQUE,
  title VARCHAR(255) NOT NULL,
  client_name VARCHAR(255) NOT NULL,
  company VARCHAR(255),
  case_number VARCHAR(50),
  line_items JSONB DEFAULT '[]',
  discount_pct DECIMAL(5,2) DEFAULT 0,
  discount_amt DECIMAL(12,2) DEFAULT 0,
  tax_pct DECIMAL(5,2) DEFAULT 18,
  tax_amt DECIMAL(12,2) DEFAULT 0,
  subtotal DECIMAL(12,2) DEFAULT 0,
  total DECIMAL(12,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'draft',  -- draft, sent, accepted, rejected, invoiced
  valid_until DATE,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE accounting_invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_number VARCHAR(30) UNIQUE,
  quote_id UUID REFERENCES accounting_quotes(id),
  title VARCHAR(255) NOT NULL,
  client_name VARCHAR(255) NOT NULL,
  company VARCHAR(255),
  client_address TEXT,
  client_gstin VARCHAR(20),
  case_number VARCHAR(50),
  line_items JSONB DEFAULT '[]',
  discount_pct DECIMAL(5,2) DEFAULT 0,
  discount_amt DECIMAL(12,2) DEFAULT 0,
  tax_pct DECIMAL(5,2) DEFAULT 18,
  tax_amt DECIMAL(12,2) DEFAULT 0,
  subtotal DECIMAL(12,2) DEFAULT 0,
  total DECIMAL(12,2) DEFAULT 0,
  amount_paid DECIMAL(12,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'unpaid',  -- unpaid, paid, partial, overdue, cancelled
  due_date DATE,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE accounting_invoice_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES accounting_invoices(id) ON DELETE CASCADE,
  amount DECIMAL(12,2) NOT NULL,
  method VARCHAR(50),
  reference VARCHAR(100),
  note TEXT,
  recorded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE accounting_expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL,
  category VARCHAR(50) DEFAULT 'other',
  description TEXT NOT NULL,
  vendor VARCHAR(255),
  amount DECIMAL(12,2) NOT NULL,
  tax_amt DECIMAL(12,2) DEFAULT 0,
  total DECIMAL(12,2),
  receipt_note TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CASE MEDIA (IMAGES & SOLUTION DOCUMENTATION)
-- ============================================================

CREATE TABLE case_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  name VARCHAR(500) NOT NULL,
  mime_type VARCHAR(100),
  data TEXT NOT NULL,  -- base64 data URI
  size INTEGER,
  caption TEXT,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE case_solutions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID UNIQUE NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  text_note TEXT,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE case_solution_media (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  name VARCHAR(500) NOT NULL,
  mime_type VARCHAR(100),
  data TEXT NOT NULL,  -- base64 data URI
  size INTEGER,
  caption TEXT,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INVENTORY IMAGES
-- ============================================================

CREATE TABLE inventory_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  name VARCHAR(500) NOT NULL,
  mime_type VARCHAR(100),
  data TEXT NOT NULL,  -- base64 data URI
  size INTEGER,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SEED DATA - ADMIN USER (password: Admin@1234)
-- ============================================================
-- Password hash is pre-computed for 'Admin@1234' with bcrypt rounds=12
-- Run the backend seeder to generate proper hash

