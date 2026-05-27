BEGIN;

-- Unify tenant scoping across tenant-owned tables.
-- The migration is additive and backfills from existing ownership links.

-- ---------------------------------------------------------------------------
-- Marketing tables may not exist yet in older environments.
-- Create them here with UUID-compatible references so route-level bootstrap
-- code no longer depends on invalid INTEGER->UUID foreign keys.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS marketing_email_templates (
  id SERIAL PRIMARY KEY,
  tenant_id UUID,
  name VARCHAR(200) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  preview_text VARCHAR(500),
  html_body TEXT NOT NULL,
  text_body TEXT,
  category VARCHAR(100) DEFAULT 'general',
  tags TEXT[] DEFAULT '{}',
  variables TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS marketing_whatsapp_templates (
  id SERIAL PRIMARY KEY,
  tenant_id UUID,
  name VARCHAR(200) NOT NULL,
  message_body TEXT NOT NULL,
  variables TEXT[] DEFAULT '{}',
  category VARCHAR(100) DEFAULT 'general',
  has_media BOOLEAN DEFAULT false,
  media_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id SERIAL PRIMARY KEY,
  tenant_id UUID,
  name VARCHAR(300) NOT NULL,
  description TEXT,
  type VARCHAR(50) NOT NULL DEFAULT 'email',
  status VARCHAR(50) DEFAULT 'draft',
  email_template_id INTEGER REFERENCES marketing_email_templates(id),
  whatsapp_template_id INTEGER REFERENCES marketing_whatsapp_templates(id),
  sms_template TEXT,
  subject_line VARCHAR(500),
  from_name VARCHAR(200),
  from_email VARCHAR(200),
  reply_to VARCHAR(200),
  audience_filter JSONB DEFAULT '{}'::jsonb,
  audience_count INTEGER DEFAULT 0,
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  total_sent INTEGER DEFAULT 0,
  total_delivered INTEGER DEFAULT 0,
  total_opened INTEGER DEFAULT 0,
  total_clicked INTEGER DEFAULT 0,
  total_bounced INTEGER DEFAULT 0,
  total_unsubscribed INTEGER DEFAULT 0,
  settings JSONB DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS marketing_campaign_recipients (
  id SERIAL PRIMARY KEY,
  tenant_id UUID,
  campaign_id INTEGER REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  email VARCHAR(300),
  phone VARCHAR(50),
  name VARCHAR(200),
  status VARCHAR(50) DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  bounce_reason TEXT,
  unsubscribed_at TIMESTAMPTZ,
  personalization JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS marketing_unsubscribes (
  id SERIAL PRIMARY KEY,
  tenant_id UUID,
  email VARCHAR(300),
  phone VARCHAR(50),
  source VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Add tenant_id columns to tenant-owned tables.
-- ---------------------------------------------------------------------------

ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE client_communications ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE case_workflow_logs ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE case_engineer_sessions ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE case_custom_field_values ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE inventory_item_notes ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE inventory_custom_field_values ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE transferred_items ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE case_files ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE accounting_quotes ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE accounting_invoices ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE accounting_invoice_payments ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE accounting_expenses ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE case_images ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE case_solutions ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE case_solution_media ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE case_solution_notes ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE knowledge_base_entries ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE inventory_images ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE media_recycle_bin ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE field_configs ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE custom_fields ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE section_configs ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE hdd_field_mappings ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE inventory_brands ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE inventory_categories ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE problem_history ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE diagnosis_history ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE marketing_email_templates ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE marketing_whatsapp_templates ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE marketing_campaign_recipients ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE marketing_unsubscribes ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- ---------------------------------------------------------------------------
-- Normalize legacy tenant_id column types before UUID backfill logic.
-- Older installs may have inventory_items.tenant_id as INTEGER.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'inventory_items'
      AND column_name = 'tenant_id'
      AND udt_name <> 'uuid'
  ) THEN
    -- inventory_items_active view depends on tenant_id type.
    DROP VIEW IF EXISTS inventory_items_active;

    ALTER TABLE inventory_items
      ALTER COLUMN tenant_id DROP DEFAULT;

    ALTER TABLE inventory_items
      ALTER COLUMN tenant_id TYPE UUID
      USING CASE
        WHEN tenant_id IS NULL THEN NULL
        WHEN tenant_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN tenant_id::text::uuid
        ELSE NULL
      END;

    CREATE OR REPLACE VIEW inventory_items_active AS
      SELECT * FROM inventory_items
      WHERE deleted_at IS NULL;
  END IF;
END $$;
-- ---------------------------------------------------------------------------
-- Normalize legacy tenant_id column types before UUID backfill logic.
-- Older installs may have inventory_items.tenant_id as INTEGER.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'inventory_items'
      AND column_name = 'tenant_id'
      AND udt_name <> 'uuid'
  ) THEN
    -- inventory_items_active view depends on tenant_id type.
DROP VIEW IF EXISTS inventory_items_active;

ALTER TABLE inventory_items
    ALTER COLUMN tenant_id DROP DEFAULT;

ALTER TABLE inventory_items
ALTER COLUMN tenant_id TYPE UUID
      USING CASE
        WHEN tenant_id IS NULL THEN NULL
        WHEN tenant_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN tenant_id::text::uuid
        ELSE NULL
END;

    CREATE OR REPLACE VIEW inventory_items_active AS
SELECT * FROM inventory_items
WHERE deleted_at IS NULL;
END IF;
END $$;
-- ---------------------------------------------------------------------------
-- Normalize uniqueness to tenant-aware keys where shared global uniqueness
-- prevents separate tenants from owning equivalent config/value rows.
-- ---------------------------------------------------------------------------

-- Ensure there are no duplicate brand names (case-insensitive) per tenant
-- which would cause unique index creation to fail. Keep the first row
-- encountered for each (tenant_id, lower(name)) group and remove others.
WITH ranked_brands AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY tenant_id, lower(name) ORDER BY id) AS rn
  FROM inventory_brands
)
DELETE FROM inventory_brands
WHERE id IN (SELECT id FROM ranked_brands WHERE rn > 1);


ALTER TABLE field_configs DROP CONSTRAINT IF EXISTS field_configs_hdd_type_field_key_key;
DROP INDEX IF EXISTS field_configs_hdd_type_field_key_key;

ALTER TABLE section_configs DROP CONSTRAINT IF EXISTS section_configs_section_key_key;
DROP INDEX IF EXISTS section_configs_section_key_key;

ALTER TABLE custom_fields DROP CONSTRAINT IF EXISTS custom_fields_field_key_key;
DROP INDEX IF EXISTS custom_fields_field_key_key;

ALTER TABLE hdd_field_mappings DROP CONSTRAINT IF EXISTS hdd_field_mappings_field_key_key;
DROP INDEX IF EXISTS hdd_field_mappings_field_key_key;

ALTER TABLE inventory_brands DROP CONSTRAINT IF EXISTS inventory_brands_config_key_key;
DROP INDEX IF EXISTS inventory_brands_config_key_key;
DROP INDEX IF EXISTS idx_inventory_brands_name;

ALTER TABLE inventory_categories DROP CONSTRAINT IF EXISTS inventory_categories_category_key_key;
DROP INDEX IF EXISTS inventory_categories_category_key_key;

ALTER TABLE problem_history DROP CONSTRAINT IF EXISTS problem_history_text_key;
DROP INDEX IF EXISTS problem_history_text_key;

ALTER TABLE diagnosis_history DROP CONSTRAINT IF EXISTS diagnosis_history_text_key;
DROP INDEX IF EXISTS diagnosis_history_text_key;

ALTER TABLE inventory_items DROP CONSTRAINT IF EXISTS inventory_items_sku_key;
DROP INDEX IF EXISTS inventory_items_sku_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_field_configs_tenant_type_key
  ON field_configs (tenant_id, hdd_type, field_key);

CREATE UNIQUE INDEX IF NOT EXISTS uq_section_configs_tenant_section_key
  ON section_configs (tenant_id, section_key);

CREATE UNIQUE INDEX IF NOT EXISTS uq_custom_fields_tenant_field_key
  ON custom_fields (tenant_id, field_key);

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_brands_tenant_config_key
  ON inventory_brands (tenant_id, config_key);

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_brands_tenant_name
  ON inventory_brands (tenant_id, lower(name));

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_categories_tenant_category_key
  ON inventory_categories (tenant_id, category_key);

CREATE UNIQUE INDEX IF NOT EXISTS uq_problem_history_tenant_text
  ON problem_history (tenant_id, text);

CREATE UNIQUE INDEX IF NOT EXISTS uq_diagnosis_history_tenant_text
  ON diagnosis_history (tenant_id, text);

CREATE UNIQUE INDEX IF NOT EXISTS uq_hdd_field_mappings_global_field_key
  ON hdd_field_mappings (field_key)
  WHERE tenant_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_hdd_field_mappings_tenant_field_key
  ON hdd_field_mappings (tenant_id, field_key)
  WHERE tenant_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_items_tenant_sku
  ON inventory_items (tenant_id, sku);

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_items_tenant_stock_number
  ON inventory_items (tenant_id, stock_number)
  WHERE stock_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_marketing_unsubscribes_tenant_email
  ON marketing_unsubscribes (tenant_id, email)
  WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_marketing_unsubscribes_tenant_phone
  ON marketing_unsubscribes (tenant_id, phone)
  WHERE phone IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Shared helper functions for backfill and trigger-based tenant propagation.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION crm_effective_tenant_for_user(p_user_id UUID)
RETURNS UUID
LANGUAGE SQL
STABLE
AS $$
  SELECT CASE
           WHEN u.role = 'super_admin' THEN NULL
           ELSE COALESCE(u.tenant_id, u.tenant_owner_id, u.id)
         END
  FROM users u
  WHERE u.id = p_user_id
$$;

CREATE OR REPLACE FUNCTION crm_tenant_from_client(p_client_id UUID)
RETURNS UUID
LANGUAGE SQL
STABLE
AS $$
  SELECT COALESCE(c.tenant_id, crm_effective_tenant_for_user(c.created_by))
  FROM clients c
  WHERE c.id = p_client_id
$$;

CREATE OR REPLACE FUNCTION crm_tenant_from_case(p_case_id UUID)
RETURNS UUID
LANGUAGE SQL
STABLE
AS $$
  SELECT COALESCE(c.tenant_id, crm_tenant_from_client(c.client_id), crm_effective_tenant_for_user(c.created_by))
  FROM cases c
  WHERE c.id = p_case_id
$$;

CREATE OR REPLACE FUNCTION crm_tenant_from_inventory_item(p_item_id UUID)
RETURNS UUID
LANGUAGE SQL
STABLE
AS $$
  SELECT COALESCE(ii.tenant_id, crm_effective_tenant_for_user(ii.added_by))
  FROM inventory_items ii
  WHERE ii.id = p_item_id
$$;

CREATE OR REPLACE FUNCTION crm_tenant_from_accounting_quote(p_quote_id UUID)
RETURNS UUID
LANGUAGE SQL
STABLE
AS $$
  SELECT COALESCE(q.tenant_id, crm_effective_tenant_for_user(q.created_by))
  FROM accounting_quotes q
  WHERE q.id = p_quote_id
$$;

CREATE OR REPLACE FUNCTION crm_tenant_from_accounting_invoice(p_invoice_id UUID)
RETURNS UUID
LANGUAGE SQL
STABLE
AS $$
  SELECT COALESCE(i.tenant_id, crm_tenant_from_accounting_quote(i.quote_id), crm_effective_tenant_for_user(i.created_by))
  FROM accounting_invoices i
  WHERE i.id = p_invoice_id
$$;

CREATE OR REPLACE FUNCTION crm_tenant_from_marketing_campaign(p_campaign_id INTEGER)
RETURNS UUID
LANGUAGE SQL
STABLE
AS $$
  SELECT COALESCE(c.tenant_id, crm_effective_tenant_for_user(c.created_by))
  FROM marketing_campaigns c
  WHERE c.id = p_campaign_id
$$;

CREATE OR REPLACE FUNCTION crm_tenant_from_marketing_email_template(p_template_id INTEGER)
RETURNS UUID
LANGUAGE SQL
STABLE
AS $$
  SELECT COALESCE(t.tenant_id, crm_effective_tenant_for_user(t.created_by))
  FROM marketing_email_templates t
  WHERE t.id = p_template_id
$$;

CREATE OR REPLACE FUNCTION crm_tenant_from_marketing_whatsapp_template(p_template_id INTEGER)
RETURNS UUID
LANGUAGE SQL
STABLE
AS $$
  SELECT COALESCE(t.tenant_id, crm_effective_tenant_for_user(t.created_by))
  FROM marketing_whatsapp_templates t
  WHERE t.id = p_template_id
$$;

-- ---------------------------------------------------------------------------
-- Backfill tenants from current user/client/case/item ownership.
-- ---------------------------------------------------------------------------

UPDATE users
SET tenant_id = NULL
WHERE role = 'super_admin' AND tenant_id IS NOT NULL;

UPDATE users
SET tenant_id = COALESCE(tenant_id, tenant_owner_id, id)
WHERE role <> 'super_admin'
  AND tenant_id IS NULL;

UPDATE clients
SET tenant_id = COALESCE(tenant_id, crm_effective_tenant_for_user(created_by))
WHERE tenant_id IS NULL;

UPDATE client_communications
SET tenant_id = COALESCE(tenant_id, crm_tenant_from_client(client_id), crm_effective_tenant_for_user(user_id))
WHERE tenant_id IS NULL;

UPDATE cases
SET tenant_id = COALESCE(tenant_id, crm_tenant_from_client(client_id), crm_effective_tenant_for_user(created_by))
WHERE tenant_id IS NULL;

UPDATE case_workflow_logs
SET tenant_id = COALESCE(tenant_id, crm_tenant_from_case(case_id), crm_effective_tenant_for_user(engineer_id))
WHERE tenant_id IS NULL;

UPDATE case_engineer_sessions
SET tenant_id = COALESCE(tenant_id, crm_tenant_from_case(case_id), crm_effective_tenant_for_user(engineer_id))
WHERE tenant_id IS NULL;

UPDATE case_custom_field_values v
SET tenant_id = COALESCE(
  v.tenant_id,
  crm_tenant_from_case(v.case_id),
  (SELECT tenant_id FROM custom_fields cf WHERE cf.id = v.custom_field_id)
)
WHERE v.tenant_id IS NULL;

UPDATE inventory_items
SET tenant_id = COALESCE(tenant_id, crm_effective_tenant_for_user(added_by))
WHERE tenant_id IS NULL;

UPDATE inventory_transactions
SET tenant_id = COALESCE(tenant_id, crm_tenant_from_inventory_item(item_id), crm_tenant_from_case(case_id), crm_effective_tenant_for_user(performed_by))
WHERE tenant_id IS NULL;

UPDATE inventory_item_notes
SET tenant_id = COALESCE(tenant_id, crm_tenant_from_inventory_item(inventory_item_id), crm_effective_tenant_for_user(created_by))
WHERE tenant_id IS NULL;

UPDATE inventory_custom_field_values v
SET tenant_id = COALESCE(
  v.tenant_id,
  crm_tenant_from_inventory_item(v.inventory_item_id),
  (SELECT tenant_id FROM custom_fields cf WHERE cf.id = v.custom_field_id)
)
WHERE v.tenant_id IS NULL;

UPDATE transferred_items
SET tenant_id = COALESCE(tenant_id, crm_tenant_from_case(case_id), crm_tenant_from_inventory_item(inventory_item_id), crm_effective_tenant_for_user(transferred_by))
WHERE tenant_id IS NULL;

UPDATE quotations
SET tenant_id = COALESCE(tenant_id, crm_tenant_from_case(case_id), crm_effective_tenant_for_user(created_by))
WHERE tenant_id IS NULL;

UPDATE payments
SET tenant_id = COALESCE(tenant_id, crm_tenant_from_case(case_id), crm_effective_tenant_for_user(recorded_by))
WHERE tenant_id IS NULL;

UPDATE case_files
SET tenant_id = COALESCE(tenant_id, crm_tenant_from_case(case_id), crm_effective_tenant_for_user(uploaded_by))
WHERE tenant_id IS NULL;

UPDATE audit_logs
SET tenant_id = COALESCE(tenant_id, crm_effective_tenant_for_user(user_id))
WHERE tenant_id IS NULL;

UPDATE accounting_quotes
SET tenant_id = COALESCE(tenant_id, crm_effective_tenant_for_user(created_by))
WHERE tenant_id IS NULL;

UPDATE accounting_invoices
SET tenant_id = COALESCE(tenant_id, crm_tenant_from_accounting_quote(quote_id), crm_effective_tenant_for_user(created_by))
WHERE tenant_id IS NULL;

UPDATE accounting_invoice_payments
SET tenant_id = COALESCE(tenant_id, crm_tenant_from_accounting_invoice(invoice_id), crm_effective_tenant_for_user(recorded_by))
WHERE tenant_id IS NULL;

UPDATE accounting_expenses
SET tenant_id = COALESCE(tenant_id, crm_effective_tenant_for_user(created_by))
WHERE tenant_id IS NULL;

UPDATE case_images
SET tenant_id = COALESCE(tenant_id, crm_tenant_from_case(case_id), crm_effective_tenant_for_user(uploaded_by))
WHERE tenant_id IS NULL;

UPDATE case_solutions
SET tenant_id = COALESCE(tenant_id, crm_tenant_from_case(case_id), crm_effective_tenant_for_user(updated_by))
WHERE tenant_id IS NULL;

UPDATE case_solution_media
SET tenant_id = COALESCE(tenant_id, crm_tenant_from_case(case_id), crm_effective_tenant_for_user(uploaded_by))
WHERE tenant_id IS NULL;

UPDATE case_solution_notes
SET tenant_id = COALESCE(tenant_id, crm_tenant_from_case(case_id), crm_effective_tenant_for_user(created_by))
WHERE tenant_id IS NULL;

UPDATE knowledge_base_entries
SET tenant_id = COALESCE(tenant_id, crm_effective_tenant_for_user(created_by))
WHERE tenant_id IS NULL;

UPDATE inventory_images
SET tenant_id = COALESCE(tenant_id, crm_tenant_from_inventory_item(item_id), crm_effective_tenant_for_user(uploaded_by))
WHERE tenant_id IS NULL;

UPDATE media_recycle_bin
SET tenant_id = COALESCE(tenant_id, crm_effective_tenant_for_user(deleted_by), crm_effective_tenant_for_user(uploaded_by))
WHERE tenant_id IS NULL;

UPDATE problem_history
SET tenant_id = COALESCE(tenant_id, crm_effective_tenant_for_user(created_by))
WHERE tenant_id IS NULL
  AND created_by IS NOT NULL;

UPDATE diagnosis_history
SET tenant_id = COALESCE(tenant_id, crm_effective_tenant_for_user(created_by))
WHERE tenant_id IS NULL
  AND created_by IS NOT NULL;

UPDATE marketing_email_templates
SET tenant_id = COALESCE(tenant_id, crm_effective_tenant_for_user(created_by))
WHERE tenant_id IS NULL;

UPDATE marketing_whatsapp_templates
SET tenant_id = COALESCE(tenant_id, crm_effective_tenant_for_user(created_by))
WHERE tenant_id IS NULL;

UPDATE marketing_campaigns
SET tenant_id = COALESCE(
  tenant_id,
  crm_effective_tenant_for_user(created_by),
  crm_tenant_from_marketing_email_template(email_template_id),
  crm_tenant_from_marketing_whatsapp_template(whatsapp_template_id)
)
WHERE tenant_id IS NULL;

UPDATE marketing_campaign_recipients
SET tenant_id = COALESCE(tenant_id, crm_tenant_from_marketing_campaign(campaign_id), crm_tenant_from_client(client_id))
WHERE tenant_id IS NULL;

UPDATE chat_conversations
SET tenant_id = COALESCE(tenant_id, crm_effective_tenant_for_user(NULLIF(participant_user_ids[1]::text, '')::uuid))
WHERE tenant_id IS NULL
  AND array_length(participant_user_ids, 1) > 0
  AND participant_user_ids[1]::text ~* '^[0-9a-f-]{36}$';

UPDATE chat_messages
SET tenant_id = COALESCE(
  tenant_id,
  (SELECT tenant_id FROM chat_conversations cc WHERE cc.id = chat_messages.conversation_id),
  crm_effective_tenant_for_user(NULLIF(sender_id::text, '')::uuid)
)
WHERE tenant_id IS NULL
  AND sender_id::text ~* '^[0-9a-f-]{36}$';

-- ---------------------------------------------------------------------------
-- Copy existing global configuration/history rows into each tenant scope so
-- current per-tenant reads keep behaving after tenant filtering is enforced.
-- ---------------------------------------------------------------------------

WITH tenants AS (
  SELECT DISTINCT tenant_id
  FROM users
  WHERE tenant_id IS NOT NULL
)
INSERT INTO field_configs (tenant_id, hdd_type, field_key, field_status, field_order, created_at, updated_at)
SELECT t.tenant_id, fc.hdd_type, fc.field_key, fc.field_status, fc.field_order, fc.created_at, fc.updated_at
FROM field_configs fc
CROSS JOIN tenants t
WHERE fc.tenant_id IS NULL
ON CONFLICT (tenant_id, hdd_type, field_key) DO NOTHING;

WITH tenants AS (
  SELECT DISTINCT tenant_id
  FROM users
  WHERE tenant_id IS NOT NULL
)
INSERT INTO custom_fields (tenant_id, hdd_type, field_key, field_label, field_type, field_order, is_mandatory, is_active, created_at, updated_at)
SELECT t.tenant_id, cf.hdd_type, cf.field_key, cf.field_label, cf.field_type, cf.field_order, cf.is_mandatory, cf.is_active, cf.created_at, cf.updated_at
FROM custom_fields cf
CROSS JOIN tenants t
WHERE cf.tenant_id IS NULL
ON CONFLICT (tenant_id, field_key) DO NOTHING;

WITH tenants AS (
  SELECT DISTINCT tenant_id
  FROM users
  WHERE tenant_id IS NOT NULL
)
INSERT INTO section_configs (tenant_id, section_key, section_label, is_enabled, created_at, updated_at)
SELECT t.tenant_id, sc.section_key, sc.section_label, sc.is_enabled, sc.created_at, sc.updated_at
FROM section_configs sc
CROSS JOIN tenants t
WHERE sc.tenant_id IS NULL
ON CONFLICT (tenant_id, section_key) DO NOTHING;

WITH tenants AS (
  SELECT DISTINCT tenant_id
  FROM users
  WHERE tenant_id IS NOT NULL
)
INSERT INTO inventory_brands (tenant_id, name, config_key, is_system, active, sort_order, created_at, updated_at)
SELECT t.tenant_id, b.name, b.config_key, b.is_system, b.active, b.sort_order, b.created_at, b.updated_at
FROM inventory_brands b
CROSS JOIN tenants t
WHERE b.tenant_id IS NULL
ON CONFLICT (tenant_id, config_key) DO NOTHING;

WITH tenants AS (
  SELECT DISTINCT tenant_id
  FROM users
  WHERE tenant_id IS NOT NULL
)
INSERT INTO inventory_categories (tenant_id, category_key, label, icon, color, brand_name, form_factor, is_hdd, active, sort_order, created_at, updated_at)
SELECT t.tenant_id, c.category_key, c.label, c.icon, c.color, c.brand_name, c.form_factor, c.is_hdd, c.active, c.sort_order, c.created_at, c.updated_at
FROM inventory_categories c
CROSS JOIN tenants t
WHERE c.tenant_id IS NULL
ON CONFLICT (tenant_id, category_key) DO NOTHING;

WITH tenants AS (
  SELECT DISTINCT tenant_id
  FROM users
  WHERE tenant_id IS NOT NULL
)
INSERT INTO problem_history (tenant_id, text, use_count, last_used_at, category, severity, created_by, created_at, updated_at)
SELECT t.tenant_id, p.text, p.use_count, p.last_used_at, p.category, p.severity, p.created_by, p.created_at, p.updated_at
FROM problem_history p
CROSS JOIN tenants t
WHERE p.tenant_id IS NULL
ON CONFLICT (tenant_id, text) DO NOTHING;

WITH tenants AS (
  SELECT DISTINCT tenant_id
  FROM users
  WHERE tenant_id IS NOT NULL
)
INSERT INTO diagnosis_history (tenant_id, text, use_count, last_used_at, problem_category, recovery_success_rate, avg_recovery_time_hours, created_by, created_at, updated_at)
SELECT t.tenant_id, d.text, d.use_count, d.last_used_at, d.problem_category, d.recovery_success_rate, d.avg_recovery_time_hours, d.created_by, d.created_at, d.updated_at
FROM diagnosis_history d
CROSS JOIN tenants t
WHERE d.tenant_id IS NULL
ON CONFLICT (tenant_id, text) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Trigger to keep tenant_id populated on new writes without route-wide rewrites.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION crm_set_tenant_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'users' THEN
    IF NEW.role = 'super_admin' THEN
      NEW.tenant_id := NULL;
    ELSE
      NEW.tenant_id := COALESCE(NEW.tenant_id, NEW.tenant_owner_id, NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.tenant_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  CASE TG_TABLE_NAME
    WHEN 'clients' THEN
      NEW.tenant_id := crm_effective_tenant_for_user(NEW.created_by);
    WHEN 'client_communications' THEN
      NEW.tenant_id := COALESCE(crm_tenant_from_client(NEW.client_id), crm_effective_tenant_for_user(NEW.user_id));
    WHEN 'cases' THEN
      NEW.tenant_id := COALESCE(crm_tenant_from_client(NEW.client_id), crm_effective_tenant_for_user(NEW.created_by));
    WHEN 'case_workflow_logs' THEN
      NEW.tenant_id := COALESCE(crm_tenant_from_case(NEW.case_id), crm_effective_tenant_for_user(NEW.engineer_id));
    WHEN 'case_engineer_sessions' THEN
      NEW.tenant_id := COALESCE(crm_tenant_from_case(NEW.case_id), crm_effective_tenant_for_user(NEW.engineer_id));
    WHEN 'case_custom_field_values' THEN
      NEW.tenant_id := COALESCE(crm_tenant_from_case(NEW.case_id), (SELECT tenant_id FROM custom_fields WHERE id = NEW.custom_field_id));
    WHEN 'inventory_items' THEN
      NEW.tenant_id := crm_effective_tenant_for_user(NEW.added_by);
    WHEN 'inventory_transactions' THEN
      NEW.tenant_id := COALESCE(crm_tenant_from_inventory_item(NEW.item_id), crm_tenant_from_case(NEW.case_id), crm_effective_tenant_for_user(NEW.performed_by));
    WHEN 'inventory_item_notes' THEN
      NEW.tenant_id := COALESCE(crm_tenant_from_inventory_item(NEW.inventory_item_id), crm_effective_tenant_for_user(NEW.created_by));
    WHEN 'inventory_custom_field_values' THEN
      NEW.tenant_id := COALESCE(crm_tenant_from_inventory_item(NEW.inventory_item_id), (SELECT tenant_id FROM custom_fields WHERE id = NEW.custom_field_id));
    WHEN 'transferred_items' THEN
      NEW.tenant_id := COALESCE(crm_tenant_from_case(NEW.case_id), crm_tenant_from_inventory_item(NEW.inventory_item_id), crm_effective_tenant_for_user(NEW.transferred_by));
    WHEN 'quotations' THEN
      NEW.tenant_id := COALESCE(crm_tenant_from_case(NEW.case_id), crm_effective_tenant_for_user(NEW.created_by));
    WHEN 'payments' THEN
      NEW.tenant_id := COALESCE(crm_tenant_from_case(NEW.case_id), crm_effective_tenant_for_user(NEW.recorded_by));
    WHEN 'case_files' THEN
      NEW.tenant_id := COALESCE(crm_tenant_from_case(NEW.case_id), crm_effective_tenant_for_user(NEW.uploaded_by));
    WHEN 'audit_logs' THEN
      NEW.tenant_id := crm_effective_tenant_for_user(NEW.user_id);
    WHEN 'accounting_quotes' THEN
      NEW.tenant_id := crm_effective_tenant_for_user(NEW.created_by);
    WHEN 'accounting_invoices' THEN
      NEW.tenant_id := COALESCE(crm_tenant_from_accounting_quote(NEW.quote_id), crm_effective_tenant_for_user(NEW.created_by));
    WHEN 'accounting_invoice_payments' THEN
      NEW.tenant_id := COALESCE(crm_tenant_from_accounting_invoice(NEW.invoice_id), crm_effective_tenant_for_user(NEW.recorded_by));
    WHEN 'accounting_expenses' THEN
      NEW.tenant_id := crm_effective_tenant_for_user(NEW.created_by);
    WHEN 'case_images' THEN
      NEW.tenant_id := COALESCE(crm_tenant_from_case(NEW.case_id), crm_effective_tenant_for_user(NEW.uploaded_by));
    WHEN 'case_solutions' THEN
      NEW.tenant_id := COALESCE(crm_tenant_from_case(NEW.case_id), crm_effective_tenant_for_user(NEW.updated_by));
    WHEN 'case_solution_media' THEN
      NEW.tenant_id := COALESCE(crm_tenant_from_case(NEW.case_id), crm_effective_tenant_for_user(NEW.uploaded_by));
    WHEN 'case_solution_notes' THEN
      NEW.tenant_id := COALESCE(crm_tenant_from_case(NEW.case_id), crm_effective_tenant_for_user(NEW.created_by));
    WHEN 'knowledge_base_entries' THEN
      NEW.tenant_id := crm_effective_tenant_for_user(NEW.created_by);
    WHEN 'inventory_images' THEN
      NEW.tenant_id := COALESCE(crm_tenant_from_inventory_item(NEW.item_id), crm_effective_tenant_for_user(NEW.uploaded_by));
    WHEN 'media_recycle_bin' THEN
      NEW.tenant_id := COALESCE(crm_effective_tenant_for_user(NEW.deleted_by), crm_effective_tenant_for_user(NEW.uploaded_by));
    WHEN 'problem_history' THEN
      NEW.tenant_id := crm_effective_tenant_for_user(NEW.created_by);
    WHEN 'diagnosis_history' THEN
      NEW.tenant_id := crm_effective_tenant_for_user(NEW.created_by);
    WHEN 'marketing_email_templates' THEN
      NEW.tenant_id := crm_effective_tenant_for_user(NEW.created_by);
    WHEN 'marketing_whatsapp_templates' THEN
      NEW.tenant_id := crm_effective_tenant_for_user(NEW.created_by);
    WHEN 'marketing_campaigns' THEN
      NEW.tenant_id := COALESCE(crm_effective_tenant_for_user(NEW.created_by), crm_tenant_from_marketing_email_template(NEW.email_template_id), crm_tenant_from_marketing_whatsapp_template(NEW.whatsapp_template_id));
    WHEN 'marketing_campaign_recipients' THEN
      NEW.tenant_id := COALESCE(crm_tenant_from_marketing_campaign(NEW.campaign_id), crm_tenant_from_client(NEW.client_id));
    WHEN 'chat_conversations' THEN
      NEW.tenant_id := NEW.tenant_id;
    WHEN 'chat_messages' THEN
      NEW.tenant_id := COALESCE(NEW.tenant_id, (SELECT tenant_id FROM chat_conversations WHERE id = NEW.conversation_id));
  END CASE;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_set_tenant_id ON users;
CREATE TRIGGER trg_users_set_tenant_id BEFORE INSERT OR UPDATE ON users FOR EACH ROW EXECUTE FUNCTION crm_set_tenant_id();

DROP TRIGGER IF EXISTS trg_clients_set_tenant_id ON clients;
CREATE TRIGGER trg_clients_set_tenant_id BEFORE INSERT OR UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION crm_set_tenant_id();

DROP TRIGGER IF EXISTS trg_client_communications_set_tenant_id ON client_communications;
CREATE TRIGGER trg_client_communications_set_tenant_id BEFORE INSERT OR UPDATE ON client_communications FOR EACH ROW EXECUTE FUNCTION crm_set_tenant_id();

DROP TRIGGER IF EXISTS trg_cases_set_tenant_id ON cases;
CREATE TRIGGER trg_cases_set_tenant_id BEFORE INSERT OR UPDATE ON cases FOR EACH ROW EXECUTE FUNCTION crm_set_tenant_id();

DROP TRIGGER IF EXISTS trg_case_workflow_logs_set_tenant_id ON case_workflow_logs;
CREATE TRIGGER trg_case_workflow_logs_set_tenant_id BEFORE INSERT OR UPDATE ON case_workflow_logs FOR EACH ROW EXECUTE FUNCTION crm_set_tenant_id();

DROP TRIGGER IF EXISTS trg_case_engineer_sessions_set_tenant_id ON case_engineer_sessions;
CREATE TRIGGER trg_case_engineer_sessions_set_tenant_id BEFORE INSERT OR UPDATE ON case_engineer_sessions FOR EACH ROW EXECUTE FUNCTION crm_set_tenant_id();

DROP TRIGGER IF EXISTS trg_case_custom_field_values_set_tenant_id ON case_custom_field_values;
CREATE TRIGGER trg_case_custom_field_values_set_tenant_id BEFORE INSERT OR UPDATE ON case_custom_field_values FOR EACH ROW EXECUTE FUNCTION crm_set_tenant_id();

DROP TRIGGER IF EXISTS trg_inventory_items_set_tenant_id ON inventory_items;
CREATE TRIGGER trg_inventory_items_set_tenant_id BEFORE INSERT OR UPDATE ON inventory_items FOR EACH ROW EXECUTE FUNCTION crm_set_tenant_id();

DROP TRIGGER IF EXISTS trg_inventory_transactions_set_tenant_id ON inventory_transactions;
CREATE TRIGGER trg_inventory_transactions_set_tenant_id BEFORE INSERT OR UPDATE ON inventory_transactions FOR EACH ROW EXECUTE FUNCTION crm_set_tenant_id();

DROP TRIGGER IF EXISTS trg_inventory_item_notes_set_tenant_id ON inventory_item_notes;
CREATE TRIGGER trg_inventory_item_notes_set_tenant_id BEFORE INSERT OR UPDATE ON inventory_item_notes FOR EACH ROW EXECUTE FUNCTION crm_set_tenant_id();

DROP TRIGGER IF EXISTS trg_inventory_custom_field_values_set_tenant_id ON inventory_custom_field_values;
CREATE TRIGGER trg_inventory_custom_field_values_set_tenant_id BEFORE INSERT OR UPDATE ON inventory_custom_field_values FOR EACH ROW EXECUTE FUNCTION crm_set_tenant_id();

DROP TRIGGER IF EXISTS trg_transferred_items_set_tenant_id ON transferred_items;
CREATE TRIGGER trg_transferred_items_set_tenant_id BEFORE INSERT OR UPDATE ON transferred_items FOR EACH ROW EXECUTE FUNCTION crm_set_tenant_id();

DROP TRIGGER IF EXISTS trg_quotations_set_tenant_id ON quotations;
CREATE TRIGGER trg_quotations_set_tenant_id BEFORE INSERT OR UPDATE ON quotations FOR EACH ROW EXECUTE FUNCTION crm_set_tenant_id();

DROP TRIGGER IF EXISTS trg_payments_set_tenant_id ON payments;
CREATE TRIGGER trg_payments_set_tenant_id BEFORE INSERT OR UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION crm_set_tenant_id();

DROP TRIGGER IF EXISTS trg_case_files_set_tenant_id ON case_files;
CREATE TRIGGER trg_case_files_set_tenant_id BEFORE INSERT OR UPDATE ON case_files FOR EACH ROW EXECUTE FUNCTION crm_set_tenant_id();

DROP TRIGGER IF EXISTS trg_audit_logs_set_tenant_id ON audit_logs;
CREATE TRIGGER trg_audit_logs_set_tenant_id BEFORE INSERT OR UPDATE ON audit_logs FOR EACH ROW EXECUTE FUNCTION crm_set_tenant_id();

DROP TRIGGER IF EXISTS trg_accounting_quotes_set_tenant_id ON accounting_quotes;
CREATE TRIGGER trg_accounting_quotes_set_tenant_id BEFORE INSERT OR UPDATE ON accounting_quotes FOR EACH ROW EXECUTE FUNCTION crm_set_tenant_id();

DROP TRIGGER IF EXISTS trg_accounting_invoices_set_tenant_id ON accounting_invoices;
CREATE TRIGGER trg_accounting_invoices_set_tenant_id BEFORE INSERT OR UPDATE ON accounting_invoices FOR EACH ROW EXECUTE FUNCTION crm_set_tenant_id();

DROP TRIGGER IF EXISTS trg_accounting_invoice_payments_set_tenant_id ON accounting_invoice_payments;
CREATE TRIGGER trg_accounting_invoice_payments_set_tenant_id BEFORE INSERT OR UPDATE ON accounting_invoice_payments FOR EACH ROW EXECUTE FUNCTION crm_set_tenant_id();

DROP TRIGGER IF EXISTS trg_accounting_expenses_set_tenant_id ON accounting_expenses;
CREATE TRIGGER trg_accounting_expenses_set_tenant_id BEFORE INSERT OR UPDATE ON accounting_expenses FOR EACH ROW EXECUTE FUNCTION crm_set_tenant_id();

DROP TRIGGER IF EXISTS trg_case_images_set_tenant_id ON case_images;
CREATE TRIGGER trg_case_images_set_tenant_id BEFORE INSERT OR UPDATE ON case_images FOR EACH ROW EXECUTE FUNCTION crm_set_tenant_id();

DROP TRIGGER IF EXISTS trg_case_solutions_set_tenant_id ON case_solutions;
CREATE TRIGGER trg_case_solutions_set_tenant_id BEFORE INSERT OR UPDATE ON case_solutions FOR EACH ROW EXECUTE FUNCTION crm_set_tenant_id();

DROP TRIGGER IF EXISTS trg_case_solution_media_set_tenant_id ON case_solution_media;
CREATE TRIGGER trg_case_solution_media_set_tenant_id BEFORE INSERT OR UPDATE ON case_solution_media FOR EACH ROW EXECUTE FUNCTION crm_set_tenant_id();

DROP TRIGGER IF EXISTS trg_case_solution_notes_set_tenant_id ON case_solution_notes;
CREATE TRIGGER trg_case_solution_notes_set_tenant_id BEFORE INSERT OR UPDATE ON case_solution_notes FOR EACH ROW EXECUTE FUNCTION crm_set_tenant_id();

DROP TRIGGER IF EXISTS trg_knowledge_base_entries_set_tenant_id ON knowledge_base_entries;
CREATE TRIGGER trg_knowledge_base_entries_set_tenant_id BEFORE INSERT OR UPDATE ON knowledge_base_entries FOR EACH ROW EXECUTE FUNCTION crm_set_tenant_id();

DROP TRIGGER IF EXISTS trg_inventory_images_set_tenant_id ON inventory_images;
CREATE TRIGGER trg_inventory_images_set_tenant_id BEFORE INSERT OR UPDATE ON inventory_images FOR EACH ROW EXECUTE FUNCTION crm_set_tenant_id();

DROP TRIGGER IF EXISTS trg_media_recycle_bin_set_tenant_id ON media_recycle_bin;
CREATE TRIGGER trg_media_recycle_bin_set_tenant_id BEFORE INSERT OR UPDATE ON media_recycle_bin FOR EACH ROW EXECUTE FUNCTION crm_set_tenant_id();

DROP TRIGGER IF EXISTS trg_problem_history_set_tenant_id ON problem_history;
CREATE TRIGGER trg_problem_history_set_tenant_id BEFORE INSERT OR UPDATE ON problem_history FOR EACH ROW EXECUTE FUNCTION crm_set_tenant_id();

DROP TRIGGER IF EXISTS trg_diagnosis_history_set_tenant_id ON diagnosis_history;
CREATE TRIGGER trg_diagnosis_history_set_tenant_id BEFORE INSERT OR UPDATE ON diagnosis_history FOR EACH ROW EXECUTE FUNCTION crm_set_tenant_id();

DROP TRIGGER IF EXISTS trg_marketing_email_templates_set_tenant_id ON marketing_email_templates;
CREATE TRIGGER trg_marketing_email_templates_set_tenant_id BEFORE INSERT OR UPDATE ON marketing_email_templates FOR EACH ROW EXECUTE FUNCTION crm_set_tenant_id();

DROP TRIGGER IF EXISTS trg_marketing_whatsapp_templates_set_tenant_id ON marketing_whatsapp_templates;
CREATE TRIGGER trg_marketing_whatsapp_templates_set_tenant_id BEFORE INSERT OR UPDATE ON marketing_whatsapp_templates FOR EACH ROW EXECUTE FUNCTION crm_set_tenant_id();

DROP TRIGGER IF EXISTS trg_marketing_campaigns_set_tenant_id ON marketing_campaigns;
CREATE TRIGGER trg_marketing_campaigns_set_tenant_id BEFORE INSERT OR UPDATE ON marketing_campaigns FOR EACH ROW EXECUTE FUNCTION crm_set_tenant_id();

DROP TRIGGER IF EXISTS trg_marketing_campaign_recipients_set_tenant_id ON marketing_campaign_recipients;
CREATE TRIGGER trg_marketing_campaign_recipients_set_tenant_id BEFORE INSERT OR UPDATE ON marketing_campaign_recipients FOR EACH ROW EXECUTE FUNCTION crm_set_tenant_id();

DROP TRIGGER IF EXISTS trg_chat_conversations_set_tenant_id ON chat_conversations;
CREATE TRIGGER trg_chat_conversations_set_tenant_id BEFORE INSERT OR UPDATE ON chat_conversations FOR EACH ROW EXECUTE FUNCTION crm_set_tenant_id();

DROP TRIGGER IF EXISTS trg_chat_messages_set_tenant_id ON chat_messages;
CREATE TRIGGER trg_chat_messages_set_tenant_id BEFORE INSERT OR UPDATE ON chat_messages FOR EACH ROW EXECUTE FUNCTION crm_set_tenant_id();

-- ---------------------------------------------------------------------------
-- Performance indexes for tenant filtering.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users (tenant_id);
CREATE INDEX IF NOT EXISTS idx_clients_tenant_id ON clients (tenant_id);
CREATE INDEX IF NOT EXISTS idx_client_communications_tenant_id ON client_communications (tenant_id);
CREATE INDEX IF NOT EXISTS idx_cases_tenant_id ON cases (tenant_id);
CREATE INDEX IF NOT EXISTS idx_case_workflow_logs_tenant_id ON case_workflow_logs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_case_engineer_sessions_tenant_id ON case_engineer_sessions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_case_custom_field_values_tenant_id ON case_custom_field_values (tenant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_tenant_id ON inventory_items (tenant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_tenant_id ON inventory_transactions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_item_notes_tenant_id ON inventory_item_notes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_custom_field_values_tenant_id ON inventory_custom_field_values (tenant_id);
CREATE INDEX IF NOT EXISTS idx_transferred_items_tenant_id ON transferred_items (tenant_id);
CREATE INDEX IF NOT EXISTS idx_quotations_tenant_id ON quotations (tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_tenant_id ON payments (tenant_id);
CREATE INDEX IF NOT EXISTS idx_case_files_tenant_id ON case_files (tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON audit_logs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_accounting_quotes_tenant_id ON accounting_quotes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_accounting_invoices_tenant_id ON accounting_invoices (tenant_id);
CREATE INDEX IF NOT EXISTS idx_accounting_invoice_payments_tenant_id ON accounting_invoice_payments (tenant_id);
CREATE INDEX IF NOT EXISTS idx_accounting_expenses_tenant_id ON accounting_expenses (tenant_id);
CREATE INDEX IF NOT EXISTS idx_case_images_tenant_id ON case_images (tenant_id);
CREATE INDEX IF NOT EXISTS idx_case_solutions_tenant_id ON case_solutions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_case_solution_media_tenant_id ON case_solution_media (tenant_id);
CREATE INDEX IF NOT EXISTS idx_case_solution_notes_tenant_id ON case_solution_notes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_entries_tenant_id ON knowledge_base_entries (tenant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_images_tenant_id ON inventory_images (tenant_id);
CREATE INDEX IF NOT EXISTS idx_media_recycle_bin_tenant_id ON media_recycle_bin (tenant_id);
CREATE INDEX IF NOT EXISTS idx_field_configs_tenant_id ON field_configs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_custom_fields_tenant_id ON custom_fields (tenant_id);
CREATE INDEX IF NOT EXISTS idx_section_configs_tenant_id ON section_configs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_hdd_field_mappings_tenant_id ON hdd_field_mappings (tenant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_brands_tenant_id ON inventory_brands (tenant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_categories_tenant_id ON inventory_categories (tenant_id);
CREATE INDEX IF NOT EXISTS idx_problem_history_tenant_id ON problem_history (tenant_id);
CREATE INDEX IF NOT EXISTS idx_diagnosis_history_tenant_id ON diagnosis_history (tenant_id);
CREATE INDEX IF NOT EXISTS idx_marketing_email_templates_tenant_id ON marketing_email_templates (tenant_id);
CREATE INDEX IF NOT EXISTS idx_marketing_whatsapp_templates_tenant_id ON marketing_whatsapp_templates (tenant_id);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_tenant_id ON marketing_campaigns (tenant_id);
CREATE INDEX IF NOT EXISTS idx_marketing_campaign_recipients_tenant_id ON marketing_campaign_recipients (tenant_id);
CREATE INDEX IF NOT EXISTS idx_marketing_unsubscribes_tenant_id ON marketing_unsubscribes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_tenant_id_016 ON chat_conversations (tenant_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_tenant_id_016 ON chat_messages (tenant_id);

COMMIT;
