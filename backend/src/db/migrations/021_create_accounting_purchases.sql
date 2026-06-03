BEGIN;

CREATE TABLE IF NOT EXISTS accounting_purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_number VARCHAR(30) UNIQUE,
  vendor_name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  case_id UUID REFERENCES cases(id) ON DELETE SET NULL,
  case_number VARCHAR(50),
  amount DECIMAL(12,2) NOT NULL,
  tax_amt DECIMAL(12,2) DEFAULT 0,
  total DECIMAL(12,2) DEFAULT 0,
  purchase_date DATE NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  tenant_id UUID
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accounting_expenses' AND column_name = 'purchase_id'
  ) THEN
    ALTER TABLE accounting_expenses ADD COLUMN purchase_id UUID REFERENCES accounting_purchases(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMIT;
