-- =====================================================
-- MIGRATION 003: Create Referral Rewards Table
-- Creates new table to track email and purchase-based rewards
-- =====================================================

-- Create referral_rewards table
CREATE TABLE IF NOT EXISTS referral_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES pre_registrations(id) ON DELETE CASCADE,
  reward_type VARCHAR(50) NOT NULL,
  tier VARCHAR(50) NOT NULL,
  free_months INTEGER NOT NULL,
  applies_to VARCHAR(50) NOT NULL,
  is_redeemed BOOLEAN DEFAULT FALSE,
  earned_at TIMESTAMP DEFAULT NOW(),
  redeemed_at TIMESTAMP NULL,
  subscription_id VARCHAR(255) NULL, -- For tracking which subscription used the reward
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Constraints
  CONSTRAINT referral_rewards_reward_type_check
    CHECK (reward_type IN ('email_reward', 'purchase_reward')),
  CONSTRAINT referral_rewards_tier_check
    CHECK (tier IN ('1_friend', '10_friends', '25_friends')),
  CONSTRAINT referral_rewards_free_months_check
    CHECK (free_months > 0),
  CONSTRAINT referral_rewards_applies_to_check
    CHECK (applies_to IN ('first_purchase', 'min_1_year', 'min_2_years')),

  -- Prevent duplicate rewards for same user/type/tier combination
  UNIQUE(user_id, reward_type, tier)
);

-- Add indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_referral_rewards_user_id ON referral_rewards(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_user_redeemed ON referral_rewards(user_id, is_redeemed);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_type_tier ON referral_rewards(reward_type, tier);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_earned_at ON referral_rewards(earned_at DESC);

-- Add comments to explain the table structure
COMMENT ON TABLE referral_rewards IS 'Tracks both email-based and purchase-based referral rewards';
COMMENT ON COLUMN referral_rewards.reward_type IS 'Type of reward: email_reward (immediate) or purchase_reward (contest-based)';
COMMENT ON COLUMN referral_rewards.tier IS 'Referral milestone: 1_friend, 10_friends, or 25_friends';
COMMENT ON COLUMN referral_rewards.free_months IS 'Number of free months earned';
COMMENT ON COLUMN referral_rewards.applies_to IS 'Purchase requirement: first_purchase, min_1_year, or min_2_years';
COMMENT ON COLUMN referral_rewards.is_redeemed IS 'Whether the reward has been applied to a subscription';
COMMENT ON COLUMN referral_rewards.subscription_id IS 'ID of subscription that used this reward (if redeemed)';

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_referral_rewards_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update updated_at on row changes
DROP TRIGGER IF EXISTS trigger_update_referral_rewards_updated_at ON referral_rewards;
CREATE TRIGGER trigger_update_referral_rewards_updated_at
  BEFORE UPDATE ON referral_rewards
  FOR EACH ROW
  EXECUTE FUNCTION update_referral_rewards_updated_at();

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================