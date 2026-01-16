-- =====================================================
-- MIGRATION 005: Contest Prize Calculation Function
-- Daily calculation of contest prizes based on purchase revenue
-- =====================================================

-- Function to calculate contest prizes based on revenue
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
  -- Only run if contest has started
  IF current_time < contest_start_date THEN
    RAISE NOTICE 'Contest has not started yet. Current time: %, Start date: %', current_time, contest_start_date;
    RETURN QUERY SELECT 0, 0.00, 0.00, 0;
    RETURN;
  END IF;

  -- Calculate total revenue from purchase-verified referrals since contest start
  SELECT
    COALESCE(SUM(r.purchase_amount), 0),
    COUNT(DISTINCT l.user_id)
  INTO total_contest_revenue, participants_count
  FROM referrals r
  JOIN leaderboard l ON l.purchase_verified_count > 0
  WHERE r.purchase_verified = true
    AND r.purchase_date >= contest_start_date;

  -- Calculate prize pool (10% of total revenue)
  calculated_prize_pool := total_contest_revenue * 0.10;

  RAISE NOTICE 'Contest calculations: Revenue: %, Prize Pool: %, Participants: %',
    total_contest_revenue, calculated_prize_pool, participants_count;

  -- Calculate gift card amounts for ranks 4-100
  -- Prize distribution: After top 3 physical prizes, remaining pool goes to ranks 4-100
  -- Use a weighted distribution where higher ranks get more
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
        -- Top 3 get physical prizes (no monetary calculation here)
        WHEN contest_rank = 1 THEN 'iPhone 16 Pro'
        WHEN contest_rank = 2 THEN 'MacBook Air M3'
        WHEN contest_rank = 3 THEN 'AirPods Pro'
        -- Ranks 4-100 get gift cards with weighted distribution
        WHEN contest_rank BETWEEN 4 AND 100 THEN
          CASE
            WHEN calculated_prize_pool > 0 THEN
              CONCAT('$',
                ROUND(
                  calculated_prize_pool * (
                    -- Weighted formula: higher ranks get exponentially more
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
  -- Update prize eligibility with calculated amounts
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

  -- Count how many prizes were calculated
  GET DIAGNOSTICS prizes_calculated = ROW_COUNT;

  -- Log the calculation for audit purposes
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

  -- Return summary
  RETURN QUERY SELECT
    participants_count,
    total_contest_revenue,
    calculated_prize_pool,
    prizes_calculated;

END;
$$ LANGUAGE plpgsql;

-- Function to get current contest status (for API/UI consumption)
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

-- Add a comment to track when this function should be run
COMMENT ON FUNCTION calculate_contest_prizes() IS 'Run daily after Jan 1, 2026 to calculate contest prize distribution. Recommended: cron job at 2 AM UTC';
COMMENT ON FUNCTION get_contest_status() IS 'Get current contest statistics and status for API/UI display';

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================