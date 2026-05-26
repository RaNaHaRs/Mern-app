-- Problem & diagnosis history for smart autocomplete (no pg_trgm required)

CREATE TABLE IF NOT EXISTS problem_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  text VARCHAR(1000) NOT NULL UNIQUE,
  use_count INTEGER DEFAULT 1,
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  category VARCHAR(100),
  severity VARCHAR(20),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS diagnosis_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  text VARCHAR(2000) NOT NULL UNIQUE,
  use_count INTEGER DEFAULT 1,
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  problem_category VARCHAR(100),
  recovery_success_rate DECIMAL(5,2),
  avg_recovery_time_hours DECIMAL(6,2),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_problem_history_text_lower ON problem_history (lower(text));
CREATE INDEX IF NOT EXISTS idx_problem_history_last_used ON problem_history (last_used_at DESC);
CREATE INDEX IF NOT EXISTS idx_diagnosis_history_text_lower ON diagnosis_history (lower(text));
CREATE INDEX IF NOT EXISTS idx_diagnosis_history_last_used ON diagnosis_history (last_used_at DESC);

-- Seed common problem descriptions (idempotent)
INSERT INTO problem_history (text, use_count, category)
VALUES
  ('Not detecting', 1, 'general'),
  ('Not spinning', 1, 'general'),
  ('Not accessible', 1, 'general'),
  ('Not booting', 1, 'general'),
  ('Clicking sound', 1, 'mechanical'),
  ('Clicking after drop', 1, 'mechanical'),
  ('Clicking and not detecting', 1, 'mechanical'),
  ('Drive not recognized by BIOS', 1, 'general'),
  ('Slow read / bad sectors', 1, 'logical'),
  ('Burnt PCB smell', 1, 'electrical'),
  ('Water damage', 1, 'physical'),
  ('Dropped drive', 1, 'physical')
ON CONFLICT (text) DO NOTHING;
