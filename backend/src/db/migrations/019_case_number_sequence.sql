-- Migration: 019_case_number_sequence.sql
-- Create a global sequence for case numbers and replace the generator function
BEGIN;

-- Create sequence if missing
CREATE SEQUENCE IF NOT EXISTS case_number_seq;

-- Initialize sequence value to avoid collisions with existing case numbers
DO $$
DECLARE
  max_seq BIGINT := 0;
BEGIN
  SELECT MAX((regexp_replace(case_number, '.*-(\d+)$', '\1'))::BIGINT) INTO max_seq
  FROM cases
  WHERE case_number ~ '\d+$';
  IF max_seq IS NULL THEN
    max_seq := 0;
  END IF;
  PERFORM setval('case_number_seq', GREATEST(max_seq, 0));
END$$;

-- Helper to format a sequence value with company-defined patterns
CREATE OR REPLACE FUNCTION format_sequence_string(format TEXT, seq_num BIGINT)
RETURNS TEXT AS $$
DECLARE
  formatted TEXT := COALESCE(format, '');
  found TEXT[];
  token TEXT;
  width INT;
  padded TEXT := seq_num::TEXT;
BEGIN
  IF formatted = '' THEN
    RETURN padded;
  END IF;

  formatted := REPLACE(formatted, '{YYYY}', TO_CHAR(NOW(), 'YYYY'));
  formatted := REPLACE(formatted, '{YY}', TO_CHAR(NOW(), 'YY'));
  formatted := REPLACE(formatted, '{MM}', TO_CHAR(NOW(), 'MM'));

  LOOP
    found := regexp_matches(formatted, '\{(N+)\}');
    EXIT WHEN found IS NULL;
    token := found[1];
    width := CHAR_LENGTH(token);
    IF width > 1 THEN
      formatted := regexp_replace(formatted, '\{N+\}', LPAD(padded, width, '0'), '');
    ELSE
      formatted := regexp_replace(formatted, '\{N+\}', padded, '');
    END IF;
  END LOOP;

  RETURN formatted;
END;
$$ LANGUAGE plpgsql STABLE;

-- Replace generator function to use company settings
CREATE OR REPLACE FUNCTION generate_case_number()
RETURNS TRIGGER AS $$
DECLARE
  seq_num BIGINT;
  format_string TEXT;
  start_value INT := 1;
  current_last BIGINT;
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

  SELECT last_value INTO current_last FROM case_number_seq;
  IF current_last < start_value - 1 THEN
    PERFORM setval('case_number_seq', start_value - 1, false);
  END IF;

  seq_num := nextval('case_number_seq');
  NEW.case_number := format_sequence_string(format_string, seq_num);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ensure trigger exists (idempotent)
DROP TRIGGER IF EXISTS trg_case_number ON cases;
CREATE TRIGGER trg_case_number BEFORE INSERT ON cases FOR EACH ROW WHEN (NEW.case_number IS NULL) EXECUTE FUNCTION generate_case_number();

COMMIT;
