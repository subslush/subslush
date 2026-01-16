-- =====================================================
-- MIGRATION 002: Add Purchase Tracking to Leaderboard
-- Adds contest-specific fields to leaderboard table
-- =====================================================

-- Add purchase-related columns to leaderboard table
ALTER TABLE leaderboard
ADD COLUMN IF NOT EXISTS purchase_verified_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS contest_revenue_contributed DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_purchase_verified_at TIMESTAMP NULL;

-- Add constraint to ensure purchase counts are valid
ALTER TABLE leaderboard
ADD CONSTRAINT IF NOT EXISTS leaderboard_purchase_counts_positive
CHECK (purchase_verified_count >= 0 AND contest_revenue_contributed >= 0);

-- Add indexes for contest leaderboard queries
CREATE INDEX IF NOT EXISTS idx_leaderboard_purchase_count
ON leaderboard(purchase_verified_count DESC, last_purchase_verified_at DESC);

CREATE INDEX IF NOT EXISTS idx_leaderboard_contest_revenue
ON leaderboard(contest_revenue_contributed DESC, last_purchase_verified_at DESC);

-- Add comments to explain new columns
COMMENT ON COLUMN leaderboard.purchase_verified_count IS 'Count of referrals who have made purchases (for contest ranking)';
COMMENT ON COLUMN leaderboard.contest_revenue_contributed IS 'Total revenue contributed by this users referrals (for prize calculations)';
COMMENT ON COLUMN leaderboard.last_purchase_verified_at IS 'Timestamp of most recent purchase verification';

-- Update existing leaderboard entries to have default values
UPDATE leaderboard
SET
  purchase_verified_count = 0,
  contest_revenue_contributed = 0.00,
  last_purchase_verified_at = NULL
WHERE purchase_verified_count IS NULL;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================