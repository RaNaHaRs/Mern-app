-- Automation Center schema
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  subject VARCHAR(512) NOT NULL,
  body TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS automation_triggers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  event VARCHAR(100) NOT NULL,
  recipient_type VARCHAR(50) NOT NULL,
  email_template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  custom_email VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trigger_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trigger_id UUID,
  trigger_name VARCHAR(255),
  event VARCHAR(100),
  recipient VARCHAR(100),
  recipient_email VARCHAR(255),
  status VARCHAR(50),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_triggers_event ON automation_triggers(event);
CREATE INDEX IF NOT EXISTS idx_trigger_logs_event ON trigger_logs(event);
CREATE INDEX IF NOT EXISTS idx_trigger_logs_email ON trigger_logs(recipient_email);
