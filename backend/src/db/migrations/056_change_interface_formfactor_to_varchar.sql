-- Change interface and form_factor columns from enum to varchar
-- This allows custom values to be stored

BEGIN;

-- First, create new columns with VARCHAR type
ALTER TABLE cases ADD COLUMN interface_varchar VARCHAR(50);
ALTER TABLE cases ADD COLUMN form_factor_varchar VARCHAR(50);

-- Copy data from enum columns to new varchar columns
UPDATE cases SET interface_varchar = interface::text WHERE interface IS NOT NULL;
UPDATE cases SET form_factor_varchar = form_factor::text WHERE form_factor IS NOT NULL;

-- Drop the old enum columns
ALTER TABLE cases DROP COLUMN interface;
ALTER TABLE cases DROP COLUMN form_factor;

-- Rename the new columns to the original names
ALTER TABLE cases RENAME COLUMN interface_varchar TO interface;
ALTER TABLE cases RENAME COLUMN form_factor_varchar TO form_factor;

COMMIT;

-- Drop the old enum types if no longer needed
DROP TYPE IF EXISTS device_interface CASCADE;
DROP TYPE IF EXISTS device_form_factor CASCADE;

