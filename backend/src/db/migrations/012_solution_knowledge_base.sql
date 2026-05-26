-- Solution notes (per-case, append-only history)
CREATE TABLE IF NOT EXISTS case_solution_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  note_text TEXT NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_case_solution_notes_case_id ON case_solution_notes(case_id);
CREATE INDEX IF NOT EXISTS idx_case_solution_notes_created_at ON case_solution_notes(case_id, created_at DESC);

-- Centralized knowledge base
CREATE TABLE IF NOT EXISTS knowledge_base_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(500) NOT NULL,
  device_type VARCHAR(100),
  category VARCHAR(200),
  problem TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  note_history JSONB DEFAULT '[]'::jsonb,
  case_refs JSONB DEFAULT '[]'::jsonb,
  files JSONB DEFAULT '[]'::jsonb,
  source VARCHAR(20) DEFAULT 'manual',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kb_entries_created_at ON knowledge_base_entries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kb_entries_device_type ON knowledge_base_entries(device_type);
