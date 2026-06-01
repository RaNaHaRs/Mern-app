-- Convert case stage enums to VARCHAR to support custom stages
BEGIN;

ALTER TABLE cases ALTER COLUMN stage TYPE VARCHAR(100) USING stage::text;
ALTER TABLE case_workflow_logs ALTER COLUMN from_stage TYPE VARCHAR(100) USING from_stage::text;
ALTER TABLE case_workflow_logs ALTER COLUMN to_stage TYPE VARCHAR(100) USING to_stage::text;
ALTER TABLE case_engineer_sessions ALTER COLUMN stage TYPE VARCHAR(100) USING stage::text;

COMMIT;
