-- Add pending_amount and soft_delete support to cases table

-- Add pending_amount column (amount pending from the case quotation)
ALTER TABLE cases ADD COLUMN IF NOT EXISTS pending_amount DECIMAL(12,2) DEFAULT 0;

-- Add deleted_at column for soft delete functionality
ALTER TABLE cases ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Add is_recycle column to track cases in recycle bin
ALTER TABLE cases ADD COLUMN IF NOT EXISTS is_recycle BOOLEAN DEFAULT false;

-- Create index for active cases (not deleted)
CREATE INDEX IF NOT EXISTS idx_cases_active ON cases(deleted_at) WHERE deleted_at IS NULL;

-- Create index for recycle bin
CREATE INDEX IF NOT EXISTS idx_cases_recycle ON cases(is_recycle, deleted_at);

-- Create index for pending amounts
CREATE INDEX IF NOT EXISTS idx_cases_pending ON cases(pending_amount) WHERE pending_amount > 0 AND deleted_at IS NULL;

-- Create a table to track deleted cases in recycle bin with metadata
CREATE TABLE IF NOT EXISTS cases_recycle_bin (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  case_number VARCHAR(30) NOT NULL,
  client_id UUID REFERENCES clients(id),
  client_name VARCHAR(255),
  deleted_by UUID REFERENCES users(id),
  deletion_reason TEXT,
  deleted_at TIMESTAMPTZ DEFAULT NOW(),
  can_restore BOOLEAN DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_recycle_case ON cases_recycle_bin(case_id);
CREATE INDEX IF NOT EXISTS idx_recycle_deleted ON cases_recycle_bin(deleted_at DESC);
