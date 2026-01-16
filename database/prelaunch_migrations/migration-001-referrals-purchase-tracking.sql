-- =====================================================
-- MIGRATION 001: Add Purchase Tracking to Referrals
-- Adds purchase verification fields to existing referrals table
-- =====================================================

-- Add purchase tracking columns to referrals table
ALTER TABLE referrals
ADD COLUMN IF NOT EXISTS purchase_date TIMESTAMP NULL,
ADD COLUMN IF NOT EXISTS purchase_amount DECIMAL(10,2) NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS purchase_verified BOOLEAN DEFAULT FALSE;

-- Add index for efficient purchase-verified queries
CREATE INDEX IF NOT EXISTS idx_referrals_purchase_verified
ON referrals(purchase_verified, purchase_date DESC)
WHERE purchase_verified = TRUE;

-- Add index for purchase amount queries (for contest calculations)
CREATE INDEX IF NOT EXISTS idx_referrals_purchase_amount
ON referrals(referrer_code, purchase_amount DESC)
WHERE purchase_verified = TRUE;

-- Add comment to explain new columns
COMMENT ON COLUMN referrals.purchase_date IS 'Date when referred user made their first purchase (for contest tracking)';
COMMENT ON COLUMN referrals.purchase_amount IS 'Amount of first purchase by referred user';
COMMENT ON COLUMN referrals.purchase_verified IS 'Whether referred user has made a purchase (for contest eligibility)';

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================