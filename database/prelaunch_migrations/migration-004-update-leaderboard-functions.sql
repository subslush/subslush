-- =====================================================
-- MIGRATION 004: Update Leaderboard Functions for Dual Tracking
-- Updates trigger functions to handle both email and purchase verification
-- =====================================================

-- Updated function to handle both email and purchase verification
CREATE OR REPLACE FUNCTION update_leaderboard()
RETURNS TRIGGER AS $$
BEGIN
  -- Update all referral counts for the affected user
  UPDATE leaderboard
  SET
    -- Total referral count (all referrals)
    referral_count = (
      SELECT COUNT(*)
      FROM referrals
      WHERE referrer_code = (
        SELECT referral_code
        FROM pre_registrations
        WHERE id = leaderboard.user_id
      )
    ),
    -- Email verified referral count (for immediate rewards)
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
    -- Purchase verified referral count (for contest)
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
    -- Contest revenue contributed (sum of purchase amounts)
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
    -- Last purchase verification timestamp
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
    -- Email-based reward tier (based on verified emails)
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

  -- Update contest-based rankings (only for top 100 to save compute)
  -- Rankings are based on purchase_verified_count for the contest
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
    -- Contest prize eligibility is based on purchase counts only
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

  -- Update traditional email-based rankings (for display purposes)
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

-- Function to automatically create/update email rewards when leaderboard changes
CREATE OR REPLACE FUNCTION update_email_rewards()
RETURNS TRIGGER AS $$
DECLARE
  reward_tiers RECORD;
BEGIN
  -- Check for email-based reward milestones and create rewards if they don't exist
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
    -- Insert reward if it doesn't exist (ON CONFLICT DO NOTHING prevents duplicates)
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

-- Create trigger for automatic email reward creation
DROP TRIGGER IF EXISTS trigger_update_email_rewards ON leaderboard;
CREATE TRIGGER trigger_update_email_rewards
  AFTER UPDATE ON leaderboard
  FOR EACH ROW
  WHEN (NEW.verified_referral_count > OLD.verified_referral_count)
  EXECUTE FUNCTION update_email_rewards();

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================