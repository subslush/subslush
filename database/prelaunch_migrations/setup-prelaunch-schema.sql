-- =====================================================
-- PRE-LAUNCH CAMPAIGN DATABASE SCHEMA
-- Compatible with main SubSlush platform schema
-- =====================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- PRE_REGISTRATIONS TABLE
-- Will be migrated to users table after campaign
-- =====================================================
CREATE TABLE IF NOT EXISTS pre_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,

  -- Fields matching main platform users table
  created_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP NULL,

  -- Pre-launch specific fields
  referral_code VARCHAR(20) UNIQUE NOT NULL,
  referred_by_code VARCHAR(20), -- Will be resolved to user_id during migration
  first_name VARCHAR(100),

  -- Tracking fields
  ip_address INET,
  user_agent TEXT,
  source VARCHAR(50) DEFAULT 'organic', -- 'organic', 'referral', 'influencer_X', etc.

  -- Status matching main platform
  status VARCHAR(20) DEFAULT 'pending' NOT NULL,

  -- Email verification
  email_verified BOOLEAN DEFAULT FALSE,
  verification_token VARCHAR(100),
  verification_sent_at TIMESTAMP,

  -- Constraints
  CONSTRAINT pre_reg_status_check CHECK (status IN ('pending', 'verified', 'active', 'inactive')),
  CONSTRAINT pre_reg_email_format_check CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

COMMENT ON TABLE pre_registrations IS 'Pre-launch user registrations - will migrate to users table after campaign';
COMMENT ON COLUMN pre_registrations.referral_code IS 'Unique code for this user to share with others';
COMMENT ON COLUMN pre_registrations.referred_by_code IS 'Code of the person who referred this user';

-- =====================================================
-- REFERRALS TABLE
-- Tracks referral relationships and status
-- =====================================================
CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_code VARCHAR(20) NOT NULL, -- Person who shared
  referred_email VARCHAR(255) NOT NULL, -- Person who signed up
  referred_user_id UUID REFERENCES pre_registrations(id) ON DELETE SET NULL,
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'completed', 'rewarded'
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP, -- When referred user verified email
  ip_address INET,

  -- Prevent duplicate referrals
  UNIQUE(referrer_code, referred_email),

  -- Constraints
  CONSTRAINT referrals_status_check CHECK (status IN ('pending', 'completed', 'rewarded'))
);

COMMENT ON TABLE referrals IS 'Tracks all referral relationships during pre-launch campaign';
COMMENT ON COLUMN referrals.status IS 'pending=signed up, completed=verified email, rewarded=reward applied';

-- =====================================================
-- LEADERBOARD TABLE
-- Computed statistics for each user
-- =====================================================
CREATE TABLE IF NOT EXISTS leaderboard (
  user_id UUID PRIMARY KEY REFERENCES pre_registrations(id) ON DELETE CASCADE,
  referral_count INTEGER DEFAULT 0,
  verified_referral_count INTEGER DEFAULT 0, -- Only counts verified emails
  rank INTEGER,
  reward_tier VARCHAR(50), -- '1_month', '3_months', '1_year_vip'
  prize_eligibility VARCHAR(100), -- 'top_1_iphone', 'top_2_macbook', 'top_3_airpods', 'top_100_giftcard'
  last_updated TIMESTAMP DEFAULT NOW(),

  -- Constraints
  CONSTRAINT leaderboard_rank_positive CHECK (rank > 0),
  CONSTRAINT leaderboard_counts_positive CHECK (referral_count >= 0 AND verified_referral_count >= 0)
);

COMMENT ON TABLE leaderboard IS 'Real-time leaderboard statistics for pre-launch campaign';
COMMENT ON COLUMN leaderboard.verified_referral_count IS 'Only counts referrals who verified their email';

-- =====================================================
-- PRE_LAUNCH_REWARDS TABLE
-- Rewards earned during campaign - THIS MIGRATES TO MAIN PLATFORM
-- =====================================================
CREATE TABLE IF NOT EXISTS pre_launch_rewards (
  user_id UUID PRIMARY KEY REFERENCES pre_registrations(id) ON DELETE CASCADE,
  free_months INTEGER DEFAULT 0, -- 1, 3, or 12 months
  founder_status BOOLEAN DEFAULT FALSE, -- VIP founder badge
  prize_won VARCHAR(100), -- Physical prize if any
  referral_count_at_award INTEGER DEFAULT 0, -- Snapshot for transparency
  awarded_at TIMESTAMP DEFAULT NOW(),
  notes TEXT,

  -- Constraints
  CONSTRAINT rewards_free_months_valid CHECK (free_months IN (0, 1, 3, 12))
);

COMMENT ON TABLE pre_launch_rewards IS 'Rewards earned during pre-launch - migrates to main platform as user_perks';

-- =====================================================
-- VIRAL_METRICS TABLE
-- Daily campaign statistics
-- =====================================================
CREATE TABLE IF NOT EXISTS viral_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_date DATE DEFAULT CURRENT_DATE,
  total_registrations INTEGER DEFAULT 0,
  verified_registrations INTEGER DEFAULT 0,
  total_referrals INTEGER DEFAULT 0,
  completed_referrals INTEGER DEFAULT 0,
  viral_coefficient DECIMAL(4,2), -- K-factor: avg referrals per user
  conversion_rate DECIMAL(5,2), -- % of referrals that complete registration
  avg_referrals_per_user DECIMAL(5,2),
  created_at TIMESTAMP DEFAULT NOW(),

  -- One record per day
  UNIQUE(metric_date)
);

COMMENT ON TABLE viral_metrics IS 'Daily viral campaign performance metrics';

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Pre-registrations indexes
CREATE INDEX IF NOT EXISTS idx_pre_reg_email ON pre_registrations(email);
CREATE INDEX IF NOT EXISTS idx_pre_reg_referral_code ON pre_registrations(referral_code);
CREATE INDEX IF NOT EXISTS idx_pre_reg_referred_by ON pre_registrations(referred_by_code);
CREATE INDEX IF NOT EXISTS idx_pre_reg_status ON pre_registrations(status);
CREATE INDEX IF NOT EXISTS idx_pre_reg_created ON pre_registrations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pre_reg_verified ON pre_registrations(email_verified);

-- Referrals indexes
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_code ON referrals(referrer_code);
CREATE INDEX IF NOT EXISTS idx_referrals_email ON referrals(referred_email);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);
CREATE INDEX IF NOT EXISTS idx_referrals_user_id ON referrals(referred_user_id);

-- Leaderboard indexes
CREATE INDEX IF NOT EXISTS idx_leaderboard_rank ON leaderboard(rank ASC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_referral_count ON leaderboard(verified_referral_count DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_updated ON leaderboard(last_updated DESC);

-- =====================================================
-- FUNCTIONS FOR LEADERBOARD UPDATES
-- =====================================================

-- Function to update leaderboard when referrals change
CREATE OR REPLACE FUNCTION update_leaderboard()
RETURNS TRIGGER AS $$
BEGIN
  -- Update referral counts
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
    reward_tier = CASE
      WHEN (SELECT COUNT(*) FROM referrals WHERE referrer_code = (SELECT referral_code FROM pre_registrations WHERE id = leaderboard.user_id) AND status = 'completed') >= 25 THEN '1_year_vip'
      WHEN (SELECT COUNT(*) FROM referrals WHERE referrer_code = (SELECT referral_code FROM pre_registrations WHERE id = leaderboard.user_id) AND status = 'completed') >= 5 THEN '3_months'
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

  -- Update ranks (only for top 100 to save compute)
  WITH ranked_users AS (
    SELECT
      user_id,
      ROW_NUMBER() OVER (ORDER BY verified_referral_count DESC, (SELECT created_at FROM pre_registrations WHERE id = user_id) ASC) as new_rank
    FROM leaderboard
    WHERE verified_referral_count > 0
  )
  UPDATE leaderboard
  SET
    rank = ranked_users.new_rank,
    prize_eligibility = CASE
      WHEN ranked_users.new_rank = 1 THEN 'top_1_iphone'
      WHEN ranked_users.new_rank = 2 THEN 'top_2_macbook'
      WHEN ranked_users.new_rank = 3 THEN 'top_3_airpods'
      WHEN ranked_users.new_rank <= 100 THEN 'top_100_giftcard'
      ELSE NULL
    END
  FROM ranked_users
  WHERE leaderboard.user_id = ranked_users.user_id
  AND ranked_users.new_rank <= 100;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update leaderboard when referrals change
DROP TRIGGER IF EXISTS trigger_update_leaderboard ON referrals;
CREATE TRIGGER trigger_update_leaderboard
  AFTER INSERT OR UPDATE OR DELETE ON referrals
  FOR EACH ROW
  EXECUTE FUNCTION update_leaderboard();

-- Function to create leaderboard entry when user registers
CREATE OR REPLACE FUNCTION create_leaderboard_entry()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO leaderboard (user_id, referral_count, verified_referral_count)
  VALUES (NEW.id, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to create leaderboard entry on registration
DROP TRIGGER IF EXISTS trigger_create_leaderboard_entry ON pre_registrations;
CREATE TRIGGER trigger_create_leaderboard_entry
  AFTER INSERT ON pre_registrations
  FOR EACH ROW
  EXECUTE FUNCTION create_leaderboard_entry();

-- =====================================================
-- FUNCTION TO GENERATE UNIQUE REFERRAL CODES
-- =====================================================

CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS VARCHAR(20) AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- No confusing characters (0,O,1,I)
  code VARCHAR(20);
  done BOOLEAN := FALSE;
BEGIN
  WHILE NOT done LOOP
    code := '';
    FOR i IN 1..8 LOOP
      code := code || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;

    -- Check if code exists
    done := NOT EXISTS (SELECT 1 FROM pre_registrations WHERE referral_code = code);
  END LOOP;

  RETURN code;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- SCHEMA SETUP COMPLETE
-- =====================================================