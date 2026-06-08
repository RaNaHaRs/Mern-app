-- Migration: add inward_pdf_path to cases
ALTER TABLE cases ADD COLUMN IF NOT EXISTS inward_pdf_path TEXT;
