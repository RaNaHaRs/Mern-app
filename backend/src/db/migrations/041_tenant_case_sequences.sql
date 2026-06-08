-- Migration: 041_tenant_case_sequences.sql
-- Per-tenant case numbering: each tenant gets its own independent sequence
BEGIN;

-- Create tenant_case_sequences table
CREATE TABLE IF NOT EXISTS tenant_case_sequences (
  tenant_id UUID PRIMARY KEY,
  last_sequence INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Backfill sequences for existing tenants based on their current case counts
INSERT INTO tenant_case_sequences (tenant_id, last_sequence)
SELECT
  COALESCE(c.tenant_id, u.tenant_owner_id, u.id) AS tenant_id,
  COUNT(*) AS last_sequence
FROM cases c
LEFT JOIN users u ON c.created_by = u.id
WHERE c.deleted_at IS NULL
  AND COALESCE(c.tenant_id, u.tenant_owner_id, u.id) IS NOT NULL
GROUP BY COALESCE(c.tenant_id, u.tenant_owner_id, u.id)
ON CONFLICT (tenant_id) DO NOTHING;

-- Update generate_case_number function to support per-tenant sequences
CREATE OR REPLACE FUNCTION generate_case_number()
RETURNS TRIGGER AS $$
DECLARE
  seq_num BIGINT;
  format_string TEXT;
  start_value INT := 1;
  current_last BIGINT;
  target_tenant_id UUID;
BEGIN
  SELECT value->>'case_number_format', (value->>'case_number_start')::INT
    INTO format_string, start_value
    FROM platform_settings
    WHERE key = 'company';

  IF format_string IS NULL OR format_string = '' THEN
    format_string := 'DR-{YYYY}-{NNNNN}';
  END IF;
  IF start_value IS NULL OR start_value < 1 THEN
    start_value := 1;
  END IF;

  -- Determine tenant from the case being inserted
  target_tenant_id := COALESCE(
    NEW.tenant_id,
    (SELECT u.tenant_owner_id FROM users u WHERE u.id = NEW.created_by),
    NEW.created_by
  );

  IF target_tenant_id IS NOT NULL THEN
    -- Use per-tenant sequence
    INSERT INTO tenant_case_sequences (tenant_id, last_sequence)
    VALUES (target_tenant_id, start_value)
    ON CONFLICT (tenant_id)
    DO UPDATE SET last_sequence = tenant_case_sequences.last_sequence + 1
    RETURNING last_sequence INTO seq_num;
  ELSE
    -- Fallback to global sequence for super_admin etc.
    SELECT COALESCE(last_value, 0) INTO current_last FROM case_number_seq;
    IF current_last < start_value - 1 THEN
      PERFORM setval('case_number_seq', start_value - 1, false);
    END IF;
    seq_num := nextval('case_number_seq');
  END IF;

  NEW.case_number := format_sequence_string(format_string, seq_num);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;
