-- Add missing client fields: state, pincode, whatsapp, middle_name
ALTER TABLE clients ADD COLUMN IF NOT EXISTS state VARCHAR(100);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS pincode VARCHAR(20);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(30);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS middle_name VARCHAR(100);
