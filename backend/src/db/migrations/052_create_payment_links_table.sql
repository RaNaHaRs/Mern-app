-- Migration: Create payment_links table for shareable payment links
-- Separate from Razorpay Checkout flow
-- Date: June 8, 2026

CREATE TABLE IF NOT EXISTS payment_links (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_user_id        UUID REFERENCES users(id) ON DELETE CASCADE,
  purchase_id           UUID REFERENCES saas_purchases(id) ON DELETE SET NULL,
  razorpay_order_id     VARCHAR(255),
  plan_key              VARCHAR(50) NOT NULL,
  plan_label            VARCHAR(100),
  amount                DECIMAL(12, 2) NOT NULL,
  months                INTEGER NOT NULL DEFAULT 1,
  description           TEXT,
  customer_email        VARCHAR(255),
  customer_name         VARCHAR(255),
  status                VARCHAR(50) DEFAULT 'active',  -- active, checkout_initiated, paid, expired, cancelled
  expires_at            TIMESTAMP,
  created_by            UUID,
  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_payment_links_status ON payment_links(status);
CREATE INDEX IF NOT EXISTS idx_payment_links_tenant ON payment_links(tenant_user_id);
CREATE INDEX IF NOT EXISTS idx_payment_links_created ON payment_links(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_links_purchase ON payment_links(purchase_id);
