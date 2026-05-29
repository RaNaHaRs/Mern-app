-- 017_create_activity_logs.sql
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NULL REFERENCES users(tenant_id) ON DELETE SET NULL,
  user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(200) NOT NULL,
  module VARCHAR(100) DEFAULT 'general',
  resource_type VARCHAR(100),
  resource_id UUID,
  title VARCHAR(255),
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  ip_address INET,
  user_agent TEXT,
  request_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_tenant ON activity_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);
CREATE UNIQUE INDEX IF NOT EXISTS uq_activity_logs_request_id ON activity_logs(request_id) WHERE request_id IS NOT NULL;
