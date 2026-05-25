-- ============================================================
-- MIGRATION: Add Problem & Diagnosis History Tables
-- ============================================================

-- Table to store historically entered problems
CREATE TABLE IF NOT EXISTS problem_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  text VARCHAR(1000) NOT NULL UNIQUE,
  -- Metadata for smart suggestions
  use_count INTEGER DEFAULT 1,
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  category VARCHAR(100),  -- logical, firmware, electrical, mechanical, etc.
  severity VARCHAR(20),   -- low, medium, high, critical
  -- Tracking
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table to store historically entered diagnosis notes
CREATE TABLE IF NOT EXISTS diagnosis_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  text VARCHAR(2000) NOT NULL UNIQUE,
  -- Metadata for smart suggestions
  use_count INTEGER DEFAULT 1,
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  problem_category VARCHAR(100),  -- related problem category
  recovery_success_rate DECIMAL(5,2),  -- 0-100%
  avg_recovery_time_hours DECIMAL(6,2),
  -- Tracking
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast autocomplete searches
CREATE INDEX idx_problem_history_text ON problem_history USING gin(
  text gin_trgm_ops
);
CREATE INDEX idx_problem_history_category ON problem_history(category);
CREATE INDEX idx_problem_history_last_used ON problem_history(last_used_at DESC);

CREATE INDEX idx_diagnosis_history_text ON diagnosis_history USING gin(
  text gin_trgm_ops
);
CREATE INDEX idx_diagnosis_history_category ON diagnosis_history(problem_category);
CREATE INDEX idx_diagnosis_history_last_used ON diagnosis_history(last_used_at DESC);

-- Auto-update updated_at trigger for problem_history
CREATE TRIGGER trg_problem_history_updated 
BEFORE UPDATE ON problem_history 
FOR EACH ROW 
EXECUTE FUNCTION update_updated_at();

-- Auto-update updated_at trigger for diagnosis_history
CREATE TRIGGER trg_diagnosis_history_updated 
BEFORE UPDATE ON diagnosis_history 
FOR EACH ROW 
EXECUTE FUNCTION update_updated_at();
