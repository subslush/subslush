-- =====================================================
-- DUAL-PHASE REFERRAL SYSTEM COMPLETE MIGRATION
-- Applies all migrations for the dual-phase referral system
--
-- Run this script to implement:
-- - Email-verified referrals (immediate rewards)
-- - Purchase-verified referrals (contest system starting Jan 1, 2026)
-- - New API endpoints and database structure
-- - Updated triggers and functions
-- =====================================================

\echo 'Starting dual-phase referral system migration...'

-- MIGRATION 001: Add Purchase Tracking to Referrals
\echo 'Migration 001: Adding purchase tracking to referrals table...'

ALTER TABLE referrals
ADD COLUMN IF NOT EXISTS purchase_date TIMESTAMP NULL,
ADD COLUMN IF NOT EXISTS purchase_amount DECIMAL(10,2) NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS purchase_verified BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_referrals_purchase_verified
ON referrals(purchase_verified, purchase_date DESC)
WHERE purchase_verified = TRUE;

CREATE INDEX IF NOT EXISTS idx_referrals_purchase_amount
ON referrals(referrer_code, purchase_amount DESC)
WHERE purchase_verified = TRUE;

COMMENT ON COLUMN referrals.purchase_date IS 'Date when referred user made their first purchase (for contest tracking)';
COMMENT ON COLUMN referrals.purchase_amount IS 'Amount of first purchase by referred user';
COMMENT ON COLUMN referrals.purchase_verified IS 'Whether referred user has made a purchase (for contest eligibility)';

\echo 'Migration 001: Complete'

-- MIGRATION 002: Add Purchase Tracking to Leaderboard
\echo 'Migration 002: Adding purchase tracking to leaderboard table...'

ALTER TABLE leaderboard
ADD COLUMN IF NOT EXISTS purchase_verified_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS contest_revenue_contributed DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_purchase_verified_at TIMESTAMP NULL;

ALTER TABLE leaderboard
ADD CONSTRAINT IF NOT EXISTS leaderboard_purchase_counts_positive
CHECK (purchase_verified_count >= 0 AND contest_revenue_contributed >= 0);

CREATE INDEX IF NOT EXISTS idx_leaderboard_purchase_count
ON leaderboard(purchase_verified_count DESC, last_purchase_verified_at DESC);

CREATE INDEX IF NOT EXISTS idx_leaderboard_contest_revenue
ON leaderboard(contest_revenue_contributed DESC, last_purchase_verified_at DESC);

COMMENT ON COLUMN leaderboard.purchase_verified_count IS 'Count of referrals who have made purchases (for contest ranking)';
COMMENT ON COLUMN leaderboard.contest_revenue_contributed IS 'Total revenue contributed by this users referrals (for prize calculations)';
COMMENT ON COLUMN leaderboard.last_purchase_verified_at IS 'Timestamp of most recent purchase verification';

UPDATE leaderboard
SET
  purchase_verified_count = 0,
  contest_revenue_contributed = 0.00,
  last_purchase_verified_at = NULL
WHERE purchase_verified_count IS NULL;

\echo 'Migration 002: Complete'

-- MIGRATION 003: Create Referral Rewards Table
\echo 'Migration 003: Creating referral_rewards table...'

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
  subscription_id VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT referral_rewards_reward_type_check
    CHECK (reward_type IN ('email_reward', 'purchase_reward')),
  CONSTRAINT referral_rewards_tier_check
    CHECK (tier IN ('1_friend', '10_friends', '25_friends')),
  CONSTRAINT referral_rewards_free_months_check
    CHECK (free_months > 0),
  CONSTRAINT referral_rewards_applies_to_check
    CHECK (applies_to IN ('first_purchase', 'min_1_year', 'min_2_years')),

  UNIQUE(user_id, reward_type, tier)
);

CREATE INDEX IF NOT EXISTS idx_referral_rewards_user_id ON referral_rewards(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_user_redeemed ON referral_rewards(user_id, is_redeemed);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_type_tier ON referral_rewards(reward_type, tier);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_earned_at ON referral_rewards(earned_at DESC);

COMMENT ON TABLE referral_rewards IS 'Tracks both email-based and purchase-based referral rewards';
COMMENT ON COLUMN referral_rewards.reward_type IS 'Type of reward: email_reward (immediate) or purchase_reward (contest-based)';
COMMENT ON COLUMN referral_rewards.tier IS 'Referral milestone: 1_friend, 10_friends, or 25_friends';
COMMENT ON COLUMN referral_rewards.free_months IS 'Number of free months earned';
COMMENT ON COLUMN referral_rewards.applies_to IS 'Purchase requirement: first_purchase, min_1_year, or min_2_years';
COMMENT ON COLUMN referral_rewards.is_redeemed IS 'Whether the reward has been applied to a subscription';
COMMENT ON COLUMN referral_rewards.subscription_id IS 'ID of subscription that used this reward (if redeemed)';

CREATE OR REPLACE FUNCTION update_referral_rewards_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_referral_rewards_updated_at ON referral_rewards;
CREATE TRIGGER trigger_update_referral_rewards_updated_at
  BEFORE UPDATE ON referral_rewards
  FOR EACH ROW
  EXECUTE FUNCTION update_referral_rewards_updated_at();

\echo 'Migration 003: Complete'

-- MIGRATION 004: Update Leaderboard Functions for Dual Tracking
\echo 'Migration 004: Updating leaderboard functions...'

CREATE OR REPLACE FUNCTION update_leaderboard()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE leaderboard
  SET
    referral_count = (
      SELECT COUNT(*)
      FROM referrals
      WHERE referrer_code = (
        SELECT referral_code
        FROM pre_registrations
        WHERE id = leaderboard.user_id
      )
    ),
    verified_referral_count = (
      SELECT COUNT(*)
      FROM referrals
      WHERE referrer_code = (
        SELECT referral_code
        FROM pre_registrations
        WHERE id = leaderboard.user_id
      )
      AND status = 'completed'
    ),
    purchase_verified_count = (
      SELECT COUNT(*)
      FROM referrals
      WHERE referrer_code = (
        SELECT referral_code
        FROM pre_registrations
        WHERE id = leaderboard.user_id
      )
      AND purchase_verified = true
    ),
    contest_revenue_contributed = (
      SELECT COALESCE(SUM(purchase_amount), 0)
      FROM referrals
      WHERE referrer_code = (
        SELECT referral_code
        FROM pre_registrations
        WHERE id = leaderboard.user_id
      )
      AND purchase_verified = true
    ),
    last_purchase_verified_at = (
      SELECT MAX(purchase_date)
      FROM referrals
      WHERE referrer_code = (
        SELECT referral_code
        FROM pre_registrations
        WHERE id = leaderboard.user_id
      )
      AND purchase_verified = true
    ),
    reward_tier = CASE
      WHEN (SELECT COUNT(*) FROM referrals WHERE referrer_code = (SELECT referral_code FROM pre_registrations WHERE id = leaderboard.user_id) AND status = 'completed') >= 25 THEN '1_year_vip'
      WHEN (SELECT COUNT(*) FROM referrals WHERE referrer_code = (SELECT referral_code FROM pre_registrations WHERE id = leaderboard.user_id) AND status = 'completed') >= 10 THEN '3_months'
      WHEN (SELECT COUNT(*) FROM referrals WHERE referrer_code = (SELECT referral_code FROM pre_registrations WHERE id = leaderboard.user_id) AND status = 'completed') >= 1 THEN '1_month'
      ELSE NULL
    END,
    last_updated = NOW()
  WHERE user_id = (
    SELECT id FROM pre_registrations WHERE referral_code = (
      CASE
        WHEN TG_OP = 'INSERT' THEN NEW.referrer_code
        WHEN TG_OP = 'UPDATE' THEN NEW.referrer_code
        ELSE OLD.referrer_code
      END
    )
  );

  WITH ranked_users AS (
    SELECT
      user_id,
      ROW_NUMBER() OVER (
        ORDER BY
          purchase_verified_count DESC,
          contest_revenue_contributed DESC,
          last_purchase_verified_at ASC NULLS LAST,
          (SELECT created_at FROM pre_registrations WHERE id = user_id) ASC
      ) as new_contest_rank
    FROM leaderboard
    WHERE purchase_verified_count > 0
  )
  UPDATE leaderboard
  SET
    prize_eligibility = CASE
      WHEN ranked_users.new_contest_rank = 1 THEN 'top_1_iphone'
      WHEN ranked_users.new_contest_rank = 2 THEN 'top_2_macbook'
      WHEN ranked_users.new_contest_rank = 3 THEN 'top_3_airpods'
      WHEN ranked_users.new_contest_rank <= 100 THEN 'top_100_giftcard'
      ELSE NULL
    END
  FROM ranked_users
  WHERE leaderboard.user_id = ranked_users.user_id
  AND ranked_users.new_contest_rank <= 100;

  WITH email_ranked_users AS (
    SELECT
      user_id,
      ROW_NUMBER() OVER (
        ORDER BY
          verified_referral_count DESC,
          (SELECT created_at FROM pre_registrations WHERE id = user_id) ASC
      ) as new_email_rank
    FROM leaderboard
    WHERE verified_referral_count > 0
  )
  UPDATE leaderboard
  SET
    rank = email_ranked_users.new_email_rank
  FROM email_ranked_users
  WHERE leaderboard.user_id = email_ranked_users.user_id
  AND email_ranked_users.new_email_rank <= 100;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_email_rewards()
RETURNS TRIGGER AS $$
DECLARE
  reward_tiers RECORD;
BEGIN
  FOR reward_tiers IN
    SELECT
      tier_name,
      required_count,
      free_months,
      applies_to
    FROM (VALUES
      ('1_friend', 1, 1, 'first_purchase'),
      ('10_friends', 10, 3, 'min_1_year'),
      ('25_friends', 25, 6, 'min_2_years')
    ) AS tiers(tier_name, required_count, free_months, applies_to)
    WHERE NEW.verified_referral_count >= required_count
  LOOP
    INSERT INTO referral_rewards (
      user_id,
      reward_type,
      tier,
      free_months,
      applies_to,
      is_redeemed,
      earned_at
    )
    VALUES (
      NEW.user_id,
      'email_reward',
      reward_tiers.tier_name,
      reward_tiers.free_months,
      reward_tiers.applies_to,
      false,
      NOW()
    )
    ON CONFLICT (user_id, reward_type, tier) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_email_rewards ON leaderboard;
CREATE TRIGGER trigger_update_email_rewards
  AFTER UPDATE ON leaderboard
  FOR EACH ROW
  WHEN (NEW.verified_referral_count > OLD.verified_referral_count)
  EXECUTE FUNCTION update_email_rewards();

\echo 'Migration 004: Complete'

-- MIGRATION 005: Contest Prize Calculation Function
\echo 'Migration 005: Creating contest prize calculation functions...'

CREATE OR REPLACE FUNCTION calculate_contest_prizes()
RETURNS TABLE(
  total_participants INTEGER,
  total_revenue DECIMAL(10,2),
  prize_pool DECIMAL(10,2),
  top_100_calculated INTEGER
) AS $$
DECLARE
  contest_start_date TIMESTAMP := '2026-01-01 00:00:00 UTC';
  current_time TIMESTAMP := NOW();
  total_contest_revenue DECIMAL(10,2) := 0;
  calculated_prize_pool DECIMAL(10,2) := 0;
  participants_count INTEGER := 0;
  prizes_calculated INTEGER := 0;
BEGIN
  IF current_time < contest_start_date THEN
    RAISE NOTICE 'Contest has not started yet. Current time: %, Start date: %', current_time, contest_start_date;
    RETURN QUERY SELECT 0, 0.00, 0.00, 0;
    RETURN;
  END IF;

  SELECT
    COALESCE(SUM(r.purchase_amount), 0),
    COUNT(DISTINCT l.user_id)
  INTO total_contest_revenue, participants_count
  FROM referrals r
  JOIN leaderboard l ON l.purchase_verified_count > 0
  WHERE r.purchase_verified = true
    AND r.purchase_date >= contest_start_date;

  calculated_prize_pool := total_contest_revenue * 0.10;

  RAISE NOTICE 'Contest calculations: Revenue: %, Prize Pool: %, Participants: %',
    total_contest_revenue, calculated_prize_pool, participants_count;

  WITH contest_rankings AS (
    SELECT
      l.user_id,
      l.purchase_verified_count,
      l.contest_revenue_contributed,
      l.last_purchase_verified_at,
      pr.email,
      pr.referral_code,
      ROW_NUMBER() OVER (
        ORDER BY
          l.purchase_verified_count DESC,
          l.contest_revenue_contributed DESC,
          l.last_purchase_verified_at ASC NULLS LAST,
          pr.created_at ASC
      ) as contest_rank
    FROM leaderboard l
    JOIN pre_registrations pr ON pr.id = l.user_id
    WHERE l.purchase_verified_count > 0
    ORDER BY contest_rank
  ),
  prize_calculations AS (
    SELECT
      user_id,
      contest_rank,
      CASE
        WHEN contest_rank = 1 THEN 'iPhone 16 Pro'
        WHEN contest_rank = 2 THEN 'MacBook Air M3'
        WHEN contest_rank = 3 THEN 'AirPods Pro'
        WHEN contest_rank BETWEEN 4 AND 100 THEN
          CASE
            WHEN calculated_prize_pool > 0 THEN
              CONCAT('$',
                ROUND(
                  calculated_prize_pool * (
                    POWER(101 - contest_rank, 1.5) / (
                      SELECT SUM(POWER(101 - rank_num, 1.5))
                      FROM generate_series(4, LEAST(100, (SELECT MAX(contest_rank) FROM contest_rankings))) rank_num
                    )
                  ), 2
                )::TEXT,
                ' Gift Card'
              )
            ELSE 'TBD'
          END
        ELSE NULL
      END as prize_description,
      CASE
        WHEN contest_rank BETWEEN 4 AND 100 AND calculated_prize_pool > 0 THEN
          ROUND(
            calculated_prize_pool * (
              POWER(101 - contest_rank, 1.5) / (
                SELECT SUM(POWER(101 - rank_num, 1.5))
                FROM generate_series(4, LEAST(100, (SELECT MAX(contest_rank) FROM contest_rankings))) rank_num
              )
            ), 2
          )
        ELSE 0
      END as gift_card_amount
    FROM contest_rankings
    WHERE contest_rank <= 100
  )
  UPDATE leaderboard
  SET
    prize_eligibility = CASE
      WHEN pc.contest_rank = 1 THEN 'top_1_iphone'
      WHEN pc.contest_rank = 2 THEN 'top_2_macbook'
      WHEN pc.contest_rank = 3 THEN 'top_3_airpods'
      WHEN pc.contest_rank BETWEEN 4 AND 100 THEN
        CONCAT('top_100_giftcard_$', pc.gift_card_amount::TEXT)
      ELSE NULL
    END,
    last_updated = current_time
  FROM prize_calculations pc
  WHERE leaderboard.user_id = pc.user_id;

  GET DIAGNOSTICS prizes_calculated = ROW_COUNT;

  INSERT INTO viral_metrics (
    metric_date,
    total_registrations,
    verified_registrations,
    total_referrals,
    completed_referrals,
    viral_coefficient,
    conversion_rate,
    avg_referrals_per_user
  )
  SELECT
    CURRENT_DATE,
    (SELECT COUNT(*) FROM pre_registrations),
    (SELECT COUNT(*) FROM pre_registrations WHERE email_verified = true),
    (SELECT COUNT(*) FROM referrals),
    (SELECT COUNT(*) FROM referrals WHERE status = 'completed'),
    CASE
      WHEN (SELECT COUNT(*) FROM pre_registrations) > 0
      THEN (SELECT COUNT(*) FROM referrals)::DECIMAL / (SELECT COUNT(*) FROM pre_registrations)
      ELSE 0
    END,
    CASE
      WHEN (SELECT COUNT(*) FROM referrals) > 0
      THEN (SELECT COUNT(*) FROM referrals WHERE status = 'completed')::DECIMAL * 100 / (SELECT COUNT(*) FROM referrals)
      ELSE 0
    END,
    CASE
      WHEN (SELECT COUNT(*) FROM pre_registrations) > 0
      THEN (SELECT COUNT(*) FROM referrals)::DECIMAL / (SELECT COUNT(*) FROM pre_registrations)
      ELSE 0
    END
  ON CONFLICT (metric_date) DO UPDATE SET
    total_registrations = EXCLUDED.total_registrations,
    verified_registrations = EXCLUDED.verified_registrations,
    total_referrals = EXCLUDED.total_referrals,
    completed_referrals = EXCLUDED.completed_referrals,
    viral_coefficient = EXCLUDED.viral_coefficient,
    conversion_rate = EXCLUDED.conversion_rate,
    avg_referrals_per_user = EXCLUDED.avg_referrals_per_user,
    created_at = NOW();

  RETURN QUERY SELECT
    participants_count,
    total_contest_revenue,
    calculated_prize_pool,
    prizes_calculated;

END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_contest_status()
RETURNS TABLE(
  is_active BOOLEAN,
  starts_at TIMESTAMP,
  total_participants INTEGER,
  total_revenue DECIMAL(10,2),
  prize_pool DECIMAL(10,2),
  last_calculated TIMESTAMP
) AS $$
DECLARE
  contest_start_date TIMESTAMP := '2026-01-01 00:00:00 UTC';
  current_time TIMESTAMP := NOW();
BEGIN
  RETURN QUERY
  SELECT
    (current_time >= contest_start_date) as is_active,
    contest_start_date as starts_at,
    COALESCE(
      (SELECT COUNT(DISTINCT l.user_id)
       FROM leaderboard l
       WHERE l.purchase_verified_count > 0), 0
    ) as total_participants,
    COALESCE(
      (SELECT SUM(r.purchase_amount)
       FROM referrals r
       WHERE r.purchase_verified = true
         AND r.purchase_date >= contest_start_date), 0.00
    ) as total_revenue,
    COALESCE(
      (SELECT SUM(r.purchase_amount) * 0.10
       FROM referrals r
       WHERE r.purchase_verified = true
         AND r.purchase_date >= contest_start_date), 0.00
    ) as prize_pool,
    (SELECT MAX(created_at) FROM viral_metrics) as last_calculated;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_contest_prizes() IS 'Run daily after Jan 1, 2026 to calculate contest prize distribution. Recommended: cron job at 2 AM UTC';
COMMENT ON FUNCTION get_contest_status() IS 'Get current contest statistics and status for API/UI display';

\echo 'Migration 005: Complete'

-- Generate any missing email rewards for existing users
\echo 'Generating missing email rewards for existing users...'

INSERT INTO referral_rewards (user_id, reward_type, tier, free_months, applies_to, is_redeemed, earned_at)
SELECT DISTINCT
  l.user_id,
  'email_reward',
  CASE
    WHEN l.verified_referral_count >= 25 THEN '25_friends'
    WHEN l.verified_referral_count >= 10 THEN '10_friends'
    WHEN l.verified_referral_count >= 1 THEN '1_friend'
  END as tier,
  CASE
    WHEN l.verified_referral_count >= 25 THEN 6
    WHEN l.verified_referral_count >= 10 THEN 3
    WHEN l.verified_referral_count >= 1 THEN 1
  END as free_months,
  CASE
    WHEN l.verified_referral_count >= 25 THEN 'min_2_years'
    WHEN l.verified_referral_count >= 10 THEN 'min_1_year'
    WHEN l.verified_referral_count >= 1 THEN 'first_purchase'
  END as applies_to,
  false,
  NOW()
FROM leaderboard l
WHERE l.verified_referral_count >= 1
  AND NOT EXISTS (
    SELECT 1 FROM referral_rewards rr
    WHERE rr.user_id = l.user_id
    AND rr.reward_type = 'email_reward'
    AND rr.tier = CASE
      WHEN l.verified_referral_count >= 25 THEN '25_friends'
      WHEN l.verified_referral_count >= 10 THEN '10_friends'
      WHEN l.verified_referral_count >= 1 THEN '1_friend'
    END
  );

\echo 'Email rewards generation complete'

-- Final verification
\echo 'Running final verification...'

DO $$
DECLARE
    ref_count INTEGER;
    lb_count INTEGER;
    reward_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO ref_count FROM referrals WHERE purchase_verified IS NOT NULL;
    SELECT COUNT(*) INTO lb_count FROM leaderboard WHERE purchase_verified_count IS NOT NULL;
    SELECT COUNT(*) INTO reward_count FROM referral_rewards;

    RAISE NOTICE 'Verification: % referrals with purchase tracking, % leaderboard entries with purchase data, % rewards created',
        ref_count, lb_count, reward_count;
END $$;

\echo '=====================================================';
\echo 'DUAL-PHASE REFERRAL SYSTEM MIGRATION COMPLETE';
\echo '=====================================================';
\echo '';
\echo 'Summary of changes:';
\echo '✓ Referrals table: Added purchase tracking fields';
\echo '✓ Leaderboard table: Added contest metrics';
\echo '✓ New table: referral_rewards for tracking email & contest rewards';
\echo '✓ Updated triggers: Support dual tracking system';
\echo '✓ New functions: Contest prize calculation and status';
\echo '✓ Email rewards: Generated for existing qualified users';
\echo '';
\echo 'Next steps:';
\echo '1. Deploy new API endpoints (already created)';
\echo '2. Deploy updated UI components (already created)';
\echo '3. Set up daily cron job to run calculate_contest_prizes() after Jan 1, 2026';
\echo '4. Test purchase tracking integration with your subscription system';
\echo '';
\echo 'System is ready for dual-phase operation!';
\echo '=====================================================';