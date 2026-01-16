-- Migration: Create prelaunch core tables
-- Created: 2025-10-14T12:00:00.000Z
-- Description: Ensure prelaunch tables exist before admin alignment and data migrations.

-- Up Migration
BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- PRE-REGISTRATIONS (pre-launch users)
-- =====================================================
CREATE TABLE IF NOT EXISTS pre_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP NULL,
  referral_code VARCHAR(20) UNIQUE NOT NULL,
  referred_by_code VARCHAR(20),
  ip_address INET,
  user_agent TEXT,
  source VARCHAR(50) DEFAULT 'organic',
  status VARCHAR(20) DEFAULT 'pending' NOT NULL,
  email_verified BOOLEAN DEFAULT FALSE,
  verification_token VARCHAR(100),
  verification_sent_at TIMESTAMP,
  username VARCHAR(15) UNIQUE,
  password_hash TEXT,
  supabase_auth_id UUID UNIQUE,
  user_id UUID,
  CONSTRAINT pre_reg_status_check CHECK (status IN ('pending', 'verified', 'active', 'inactive')),
  CONSTRAINT pre_reg_email_format_check CHECK (
    email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  ),
  CONSTRAINT username_length_check CHECK (
    char_length(username) >= 3 AND char_length(username) <= 15
  ),
  CONSTRAINT username_format_check CHECK (
    username ~* '^[a-zA-Z0-9_]+$'
  )
);

ALTER TABLE pre_registrations ADD COLUMN IF NOT EXISTS username VARCHAR(15) UNIQUE;
ALTER TABLE pre_registrations ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE pre_registrations ADD COLUMN IF NOT EXISTS supabase_auth_id UUID UNIQUE;
ALTER TABLE pre_registrations ADD COLUMN IF NOT EXISTS verification_token VARCHAR(100);
ALTER TABLE pre_registrations ADD COLUMN IF NOT EXISTS verification_sent_at TIMESTAMP;
ALTER TABLE pre_registrations ADD COLUMN IF NOT EXISTS user_id UUID;

CREATE INDEX IF NOT EXISTS idx_pre_reg_email ON pre_registrations(email);
CREATE INDEX IF NOT EXISTS idx_pre_reg_referral_code ON pre_registrations(referral_code);
CREATE INDEX IF NOT EXISTS idx_pre_reg_referred_by ON pre_registrations(referred_by_code);
CREATE INDEX IF NOT EXISTS idx_pre_reg_status ON pre_registrations(status);
CREATE INDEX IF NOT EXISTS idx_pre_reg_created ON pre_registrations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pre_reg_verified ON pre_registrations(email_verified);
CREATE INDEX IF NOT EXISTS idx_pre_reg_username ON pre_registrations(username);
CREATE INDEX IF NOT EXISTS idx_pre_reg_auth_id ON pre_registrations(supabase_auth_id);
CREATE INDEX IF NOT EXISTS idx_pre_reg_verification_token ON pre_registrations(verification_token);

-- =====================================================
-- REFERRALS + LEADERBOARD
-- =====================================================
CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_code VARCHAR(20) NOT NULL,
  referred_email VARCHAR(255) NOT NULL,
  referred_user_id UUID REFERENCES pre_registrations(id) ON DELETE SET NULL,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  ip_address INET,
  purchase_date TIMESTAMP NULL,
  purchase_amount DECIMAL(10,2) NULL DEFAULT 0,
  purchase_verified BOOLEAN DEFAULT FALSE,
  CONSTRAINT referrals_status_check CHECK (status IN ('pending', 'completed', 'rewarded')),
  CONSTRAINT referrals_purchase_amount_check CHECK (purchase_amount >= 0),
  UNIQUE(referrer_code, referred_email)
);

ALTER TABLE referrals ADD COLUMN IF NOT EXISTS purchase_date TIMESTAMP NULL;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS purchase_amount DECIMAL(10,2) NULL DEFAULT 0;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS purchase_verified BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_referrals_referrer_code ON referrals(referrer_code);
CREATE INDEX IF NOT EXISTS idx_referrals_email ON referrals(referred_email);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);
CREATE INDEX IF NOT EXISTS idx_referrals_user_id ON referrals(referred_user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_purchase_verified
  ON referrals(purchase_verified, purchase_date DESC)
  WHERE purchase_verified = TRUE;
CREATE INDEX IF NOT EXISTS idx_referrals_purchase_amount
  ON referrals(referrer_code, purchase_amount DESC)
  WHERE purchase_verified = TRUE;

CREATE TABLE IF NOT EXISTS leaderboard (
  user_id UUID PRIMARY KEY REFERENCES pre_registrations(id) ON DELETE CASCADE,
  referral_count INTEGER DEFAULT 0,
  verified_referral_count INTEGER DEFAULT 0,
  rank INTEGER,
  reward_tier VARCHAR(50),
  prize_eligibility VARCHAR(100),
  last_updated TIMESTAMP DEFAULT NOW(),
  purchase_verified_count INTEGER DEFAULT 0,
  contest_revenue_contributed DECIMAL(10,2) DEFAULT 0,
  last_purchase_verified_at TIMESTAMP NULL,
  CONSTRAINT leaderboard_rank_positive CHECK (rank IS NULL OR rank > 0),
  CONSTRAINT leaderboard_counts_positive CHECK (referral_count >= 0 AND verified_referral_count >= 0),
  CONSTRAINT leaderboard_contest_counts_positive CHECK (
    purchase_verified_count >= 0 AND contest_revenue_contributed >= 0
  )
);

ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS purchase_verified_count INTEGER DEFAULT 0;
ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS contest_revenue_contributed DECIMAL(10,2) DEFAULT 0;
ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS last_purchase_verified_at TIMESTAMP NULL;

CREATE INDEX IF NOT EXISTS idx_leaderboard_rank ON leaderboard(rank ASC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_referral_count ON leaderboard(verified_referral_count DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_updated ON leaderboard(last_updated DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_purchase_verified_count
  ON leaderboard(purchase_verified_count DESC, last_purchase_verified_at DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_contest_revenue
  ON leaderboard(contest_revenue_contributed DESC, last_purchase_verified_at DESC);

-- =====================================================
-- PRE-LAUNCH REWARDS
-- =====================================================
CREATE TABLE IF NOT EXISTS pre_launch_rewards (
  user_id UUID PRIMARY KEY REFERENCES pre_registrations(id) ON DELETE CASCADE,
  free_months INTEGER DEFAULT 0,
  founder_status BOOLEAN DEFAULT FALSE,
  prize_won VARCHAR(100),
  referral_count_at_award INTEGER DEFAULT 0,
  awarded_at TIMESTAMP DEFAULT NOW(),
  notes TEXT,
  CONSTRAINT rewards_free_months_valid CHECK (free_months IN (0, 1, 3, 12))
);

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
CREATE INDEX IF NOT EXISTS idx_referral_rewards_user_redeemed
  ON referral_rewards(user_id, is_redeemed);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_type_tier
  ON referral_rewards(reward_type, tier);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_earned_at
  ON referral_rewards(earned_at DESC);

-- =====================================================
-- VIRAL METRICS
-- =====================================================
CREATE TABLE IF NOT EXISTS viral_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_date DATE DEFAULT CURRENT_DATE,
  total_registrations INTEGER DEFAULT 0,
  verified_registrations INTEGER DEFAULT 0,
  total_referrals INTEGER DEFAULT 0,
  completed_referrals INTEGER DEFAULT 0,
  viral_coefficient DECIMAL(4,2),
  conversion_rate DECIMAL(5,2),
  avg_referrals_per_user DECIMAL(5,2),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(metric_date)
);

-- =====================================================
-- CALENDAR TABLES (minimal set for migration + seed)
-- =====================================================
CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_date DATE NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  types TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  claim_window_start TIMESTAMPTZ NOT NULL,
  claim_window_end TIMESTAMPTZ NOT NULL,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS calendar_vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES pre_registrations(id) ON DELETE CASCADE,
  event_date DATE NOT NULL REFERENCES calendar_events(event_date) ON DELETE CASCADE,
  voucher_type TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'global',
  amount NUMERIC(10,2),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'issued',
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  redeemed_at TIMESTAMPTZ,
  UNIQUE(user_id, event_date, voucher_type, scope)
);

CREATE TABLE IF NOT EXISTS calendar_raffles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  draw_at TIMESTAMPTZ NOT NULL,
  rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'scheduled',
  draw_seed TEXT,
  draw_result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS calendar_raffle_entries (
  raffle_id TEXT NOT NULL REFERENCES calendar_raffles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES pre_registrations(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  event_date DATE NOT NULL,
  count INT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (raffle_id, user_id, source, event_date)
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON calendar_events(event_date);
CREATE INDEX IF NOT EXISTS idx_calendar_events_published ON calendar_events(published);
CREATE INDEX IF NOT EXISTS idx_calendar_vouchers_user_status
  ON calendar_vouchers(user_id, status);
CREATE INDEX IF NOT EXISTS idx_calendar_vouchers_event ON calendar_vouchers(event_date);
CREATE INDEX IF NOT EXISTS idx_calendar_raffle_entries_user
  ON calendar_raffle_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_raffle_entries_raffle
  ON calendar_raffle_entries(raffle_id, user_id);

COMMIT;

-- Down Migration
BEGIN;

DROP TABLE IF EXISTS calendar_raffle_entries CASCADE;
DROP TABLE IF EXISTS calendar_raffles CASCADE;
DROP TABLE IF EXISTS calendar_vouchers CASCADE;
DROP TABLE IF EXISTS calendar_events CASCADE;
DROP TABLE IF EXISTS viral_metrics CASCADE;
DROP TABLE IF EXISTS referral_rewards CASCADE;
DROP TABLE IF EXISTS pre_launch_rewards CASCADE;
DROP TABLE IF EXISTS leaderboard CASCADE;
DROP TABLE IF EXISTS referrals CASCADE;
DROP TABLE IF EXISTS pre_registrations CASCADE;

COMMIT;
