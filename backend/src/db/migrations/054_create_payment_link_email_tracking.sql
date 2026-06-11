-- Migration: Create payment_link_email_tracking table
-- Tracks email delivery status for payment links
-- Date: June 11, 2026

CREATE TABLE IF NOT EXISTS payment_link_email_tracking (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_link_id       UUID NOT NULL REFERENCES payment_links(id) ON DELETE CASCADE,
  recipient_email       VARCHAR(255) NOT NULL,
  email_type            VARCHAR(50) DEFAULT 'payment_link',  -- payment_link, payment_received, reminder, etc.
  status                VARCHAR(50) DEFAULT 'pending',       -- pending, sent, failed, bounced, delivered
  message_id            VARCHAR(500),                         -- Nodemailer message ID for tracking
  error_message         TEXT,                                 -- Error details if failed
  sent_at               TIMESTAMP,
  delivered_at          TIMESTAMP,
  bounced_at            TIMESTAMP,
  retry_count           INTEGER DEFAULT 0,
  last_retry_at         TIMESTAMP,
  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_payment_link_email_tracking_link ON payment_link_email_tracking(payment_link_id);
CREATE INDEX IF NOT EXISTS idx_payment_link_email_tracking_status ON payment_link_email_tracking(status);
CREATE INDEX IF NOT EXISTS idx_payment_link_email_tracking_email ON payment_link_email_tracking(recipient_email);
CREATE INDEX IF NOT EXISTS idx_payment_link_email_tracking_created ON payment_link_email_tracking(created_at DESC);

-- Add email_sent column to payment_links if it doesn't exist
ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMP;
ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS email_status VARCHAR(50) DEFAULT 'pending';  -- pending, sent, failed
