BEGIN;

-- Add updated_at column to accounting_expenses table
ALTER TABLE accounting_expenses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add deleted_at for soft-delete consistency
ALTER TABLE accounting_expenses ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

COMMIT;
