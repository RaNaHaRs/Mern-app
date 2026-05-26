-- Extend failure_type enum for legacy tables (failure_library, etc.)
DO $$ BEGIN
  ALTER TYPE failure_type ADD VALUE IF NOT EXISTS 'head_crash';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE failure_type ADD VALUE IF NOT EXISTS 'pcb_damage';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE failure_type ADD VALUE IF NOT EXISTS 'motor_failure';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE failure_type ADD VALUE IF NOT EXISTS 'bad_sectors';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE failure_type ADD VALUE IF NOT EXISTS 'water_damage';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE failure_type ADD VALUE IF NOT EXISTS 'fire_damage';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- cases.failure_type: enum -> VARCHAR so admin-configured custom types always persist
ALTER TABLE cases ALTER COLUMN failure_type DROP DEFAULT;
ALTER TABLE cases
  ALTER COLUMN failure_type TYPE VARCHAR(100)
  USING failure_type::text;
ALTER TABLE cases ALTER COLUMN failure_type SET DEFAULT 'unknown';
