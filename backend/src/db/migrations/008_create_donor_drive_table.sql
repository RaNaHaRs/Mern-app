-- 008_create_donor_drive_table.sql
-- Migration to create donor_drive table for Donor Drive feature

CREATE TABLE IF NOT EXISTS donor_drive (
  id SERIAL PRIMARY KEY,
  stock_number VARCHAR(50) UNIQUE NOT NULL,
  category VARCHAR(30) NOT NULL,
  company VARCHAR(100),
  brand VARCHAR(100),
  model VARCHAR(100),
  serial_number VARCHAR(100),
  pcb_number VARCHAR(100),
  ssd_number VARCHAR(100),
  capacity VARCHAR(50),
  interface VARCHAR(50),
  status VARCHAR(30) DEFAULT 'available',
  quantity INTEGER DEFAULT 1,
  min_quantity INTEGER DEFAULT 1,
  unit_cost NUMERIC(12,2),
  location VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for fast search on key columns
CREATE INDEX idx_donor_drive_stock_number ON donor_drive(stock_number);
CREATE INDEX idx_donor_drive_pcb_number ON donor_drive(pcb_number);
CREATE INDEX idx_donor_drive_ssd_number ON donor_drive(ssd_number);
CREATE INDEX idx_donor_drive_company ON donor_drive(company);
CREATE INDEX idx_donor_drive_model ON donor_drive(model);
CREATE INDEX idx_donor_drive_capacity ON donor_drive(capacity);
