-- =====================================================
-- MIGRATION 006: Christmas Calendar Campaign Engine
-- Defines calendar schema, policies, RPC functions, and seed data
-- =====================================================

BEGIN;

-- Required extension for UUID helpers and cryptographic routines
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- RUNTIME SETTINGS / FLAGS
-- =====================================================

CREATE TABLE IF NOT EXISTS calendar_settings (
  key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO calendar_settings (key, enabled, metadata)
VALUES ('christmas_calendar_enabled', FALSE, jsonb_build_object('source', 'migration_006'))
ON CONFLICT (key) DO NOTHING;

-- =====================================================
-- CORE CALENDAR TABLES
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

CREATE TABLE IF NOT EXISTS user_calendar_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES pre_registrations(id) ON DELETE CASCADE,
  event_date DATE NOT NULL REFERENCES calendar_events(event_date) ON DELETE CASCADE,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'claimed',
  UNIQUE(user_id, event_date)
);

CREATE TABLE IF NOT EXISTS calendar_streaks (
  user_id UUID PRIMARY KEY REFERENCES pre_registrations(id) ON DELETE CASCADE,
  current_streak INT NOT NULL DEFAULT 0,
  max_streak INT NOT NULL DEFAULT 0,
  last_claimed_date DATE,
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
  event_date DATE,
  count INT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (raffle_id, user_id, source, event_date)
);

CREATE TABLE IF NOT EXISTS calendar_raffle_winners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raffle_id TEXT NOT NULL REFERENCES calendar_raffles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES pre_registrations(id) ON DELETE CASCADE,
  position INT NOT NULL,
  drawn_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  seed_used TEXT NOT NULL,
  audit_hash TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(raffle_id, position)
);

CREATE TABLE IF NOT EXISTS calendar_spin_wheels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_date DATE NOT NULL UNIQUE,
  items JSONB NOT NULL CHECK (jsonb_typeof(items) = 'array'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS calendar_spin_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES pre_registrations(id) ON DELETE CASCADE,
  event_date DATE NOT NULL REFERENCES calendar_events(event_date) ON DELETE CASCADE,
  wheel_id UUID NOT NULL REFERENCES calendar_spin_wheels(id) ON DELETE CASCADE,
  item_index INT NOT NULL,
  item_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  spun_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, event_date)
);

CREATE TABLE IF NOT EXISTS calendar_referral_multipliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_date DATE NOT NULL,
  multiplier NUMERIC(5,2) NOT NULL DEFAULT 1,
  applies_to TEXT NOT NULL,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(event_date, applies_to)
);

CREATE TABLE IF NOT EXISTS calendar_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES pre_registrations(id) ON DELETE CASCADE,
  achievement_key TEXT NOT NULL,
  event_date DATE NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, achievement_key)
);

CREATE TABLE IF NOT EXISTS calendar_event_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  event_type TEXT NOT NULL,
  event_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS calendar_raffle_entry_controls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raffle_id TEXT NOT NULL REFERENCES calendar_raffles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES pre_registrations(id) ON DELETE CASCADE,
  weight_multiplier NUMERIC(6,3) NOT NULL DEFAULT 1,
  excluded BOOLEAN NOT NULL DEFAULT FALSE,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(raffle_id, user_id)
);

CREATE TABLE IF NOT EXISTS calendar_metrics_daily (
  metric_date DATE PRIMARY KEY,
  claims_count INT NOT NULL DEFAULT 0,
  streak_7_count INT NOT NULL DEFAULT 0,
  streak_15_count INT NOT NULL DEFAULT 0,
  vouchers_issued INT NOT NULL DEFAULT 0,
  vouchers_redeemed INT NOT NULL DEFAULT 0,
  raffle_entries_added INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- INDICES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON calendar_events(event_date);
CREATE INDEX IF NOT EXISTS idx_calendar_events_published ON calendar_events(published);
CREATE INDEX IF NOT EXISTS idx_user_calendar_claims_user_date ON user_calendar_claims(user_id, event_date);
CREATE INDEX IF NOT EXISTS idx_calendar_vouchers_user_status ON calendar_vouchers(user_id, status);
CREATE INDEX IF NOT EXISTS idx_calendar_vouchers_event ON calendar_vouchers(event_date);
CREATE INDEX IF NOT EXISTS idx_calendar_raffle_entries_user ON calendar_raffle_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_raffle_entries_raffle ON calendar_raffle_entries(raffle_id, user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_spin_results_user ON calendar_spin_results(user_id, event_date);
CREATE INDEX IF NOT EXISTS idx_calendar_event_log_type ON calendar_event_log(event_type, event_date);
CREATE INDEX IF NOT EXISTS idx_calendar_referral_multipliers_date ON calendar_referral_multipliers(event_date);
CREATE INDEX IF NOT EXISTS idx_calendar_achievements_user ON calendar_achievements(user_id, achievement_key);

-- =====================================================
-- ROW LEVEL SECURITY POLICIES
-- =====================================================

DO $$
BEGIN
  -- Helper policies for user owned tables
  PERFORM 1;

  ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
  ALTER TABLE user_calendar_claims ENABLE ROW LEVEL SECURITY;
  ALTER TABLE calendar_streaks ENABLE ROW LEVEL SECURITY;
  ALTER TABLE calendar_vouchers ENABLE ROW LEVEL SECURITY;
  ALTER TABLE calendar_raffles ENABLE ROW LEVEL SECURITY;
  ALTER TABLE calendar_raffle_entries ENABLE ROW LEVEL SECURITY;
  ALTER TABLE calendar_raffle_winners ENABLE ROW LEVEL SECURITY;
  ALTER TABLE calendar_spin_wheels ENABLE ROW LEVEL SECURITY;
  ALTER TABLE calendar_spin_results ENABLE ROW LEVEL SECURITY;
  ALTER TABLE calendar_referral_multipliers ENABLE ROW LEVEL SECURITY;
  ALTER TABLE calendar_achievements ENABLE ROW LEVEL SECURITY;
  ALTER TABLE calendar_event_log ENABLE ROW LEVEL SECURITY;
  ALTER TABLE calendar_raffle_entry_controls ENABLE ROW LEVEL SECURITY;
  ALTER TABLE calendar_metrics_daily ENABLE ROW LEVEL SECURITY;
  ALTER TABLE calendar_settings ENABLE ROW LEVEL SECURITY;

  -- Drop existing policies if migration re-run
  DROP POLICY IF EXISTS "Public can read calendar events" ON calendar_events;
  CREATE POLICY "Public can read calendar events" ON calendar_events
    FOR SELECT
    USING (published = TRUE OR auth.role() = 'service_role');

  DROP POLICY IF EXISTS "Service manage calendar events" ON calendar_events;
  CREATE POLICY "Service manage calendar events" ON calendar_events
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

  DROP POLICY IF EXISTS "Users view own calendar claims" ON user_calendar_claims;
  CREATE POLICY "Users view own calendar claims" ON user_calendar_claims
    FOR SELECT
    USING (
      user_id IN (SELECT id FROM pre_registrations WHERE supabase_auth_id = auth.uid())
      OR auth.role() = 'service_role'
    );

  DROP POLICY IF EXISTS "Users insert own calendar claims" ON user_calendar_claims;
  CREATE POLICY "Users insert own calendar claims" ON user_calendar_claims
    FOR INSERT
    WITH CHECK (
      user_id IN (SELECT id FROM pre_registrations WHERE supabase_auth_id = auth.uid())
      OR auth.role() = 'service_role'
    );

  DROP POLICY IF EXISTS "Users update own calendar claims" ON user_calendar_claims;
  CREATE POLICY "Users update own calendar claims" ON user_calendar_claims
    FOR UPDATE
    USING (
      user_id IN (SELECT id FROM pre_registrations WHERE supabase_auth_id = auth.uid())
      OR auth.role() = 'service_role'
    );

  DROP POLICY IF EXISTS "Users manage streaks" ON calendar_streaks;
  CREATE POLICY "Users manage streaks" ON calendar_streaks
    USING (
      user_id IN (SELECT id FROM pre_registrations WHERE supabase_auth_id = auth.uid())
      OR auth.role() = 'service_role'
    )
    WITH CHECK (
      user_id IN (SELECT id FROM pre_registrations WHERE supabase_auth_id = auth.uid())
      OR auth.role() = 'service_role'
    );

  DROP POLICY IF EXISTS "Users manage vouchers" ON calendar_vouchers;
  CREATE POLICY "Users manage vouchers" ON calendar_vouchers
    USING (
      user_id IN (SELECT id FROM pre_registrations WHERE supabase_auth_id = auth.uid())
      OR auth.role() = 'service_role'
    )
    WITH CHECK (
      user_id IN (SELECT id FROM pre_registrations WHERE supabase_auth_id = auth.uid())
      OR auth.role() = 'service_role'
    );

  DROP POLICY IF EXISTS "Public read raffles" ON calendar_raffles;
  CREATE POLICY "Public read raffles" ON calendar_raffles
    FOR SELECT
    USING (TRUE);

  DROP POLICY IF EXISTS "Service manage raffles" ON calendar_raffles;
  CREATE POLICY "Service manage raffles" ON calendar_raffles
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

  DROP POLICY IF EXISTS "Users view raffle entries" ON calendar_raffle_entries;
  CREATE POLICY "Users view raffle entries" ON calendar_raffle_entries
    FOR SELECT
    USING (
      user_id IN (SELECT id FROM pre_registrations WHERE supabase_auth_id = auth.uid())
      OR auth.role() = 'service_role'
    );

  DROP POLICY IF EXISTS "Users insert raffle entries" ON calendar_raffle_entries;
  CREATE POLICY "Users insert raffle entries" ON calendar_raffle_entries
    FOR INSERT
    WITH CHECK (
      user_id IN (SELECT id FROM pre_registrations WHERE supabase_auth_id = auth.uid())
      OR auth.role() = 'service_role'
    );

  DROP POLICY IF EXISTS "Users update raffle entries" ON calendar_raffle_entries;
  CREATE POLICY "Users update raffle entries" ON calendar_raffle_entries
    FOR UPDATE
    USING (
      user_id IN (SELECT id FROM pre_registrations WHERE supabase_auth_id = auth.uid())
      OR auth.role() = 'service_role'
    );

  DROP POLICY IF EXISTS "Users view raffle winners" ON calendar_raffle_winners;
  CREATE POLICY "Users view raffle winners" ON calendar_raffle_winners
    FOR SELECT
    USING (TRUE);

  DROP POLICY IF EXISTS "Service manage raffle winners" ON calendar_raffle_winners;
  CREATE POLICY "Service manage raffle winners" ON calendar_raffle_winners
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

  DROP POLICY IF EXISTS "Public read spin wheels" ON calendar_spin_wheels;
  CREATE POLICY "Public read spin wheels" ON calendar_spin_wheels
    FOR SELECT USING (TRUE);

  DROP POLICY IF EXISTS "Service manage spin wheels" ON calendar_spin_wheels;
  CREATE POLICY "Service manage spin wheels" ON calendar_spin_wheels
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

  DROP POLICY IF EXISTS "Users manage spin results" ON calendar_spin_results;
  CREATE POLICY "Users manage spin results" ON calendar_spin_results
    USING (
      user_id IN (SELECT id FROM pre_registrations WHERE supabase_auth_id = auth.uid())
      OR auth.role() = 'service_role'
    )
    WITH CHECK (
      user_id IN (SELECT id FROM pre_registrations WHERE supabase_auth_id = auth.uid())
      OR auth.role() = 'service_role'
    );

  DROP POLICY IF EXISTS "Public read referral multipliers" ON calendar_referral_multipliers;
  CREATE POLICY "Public read referral multipliers" ON calendar_referral_multipliers
    FOR SELECT USING (TRUE);

  DROP POLICY IF EXISTS "Service manage referral multipliers" ON calendar_referral_multipliers;
  CREATE POLICY "Service manage referral multipliers" ON calendar_referral_multipliers
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

  DROP POLICY IF EXISTS "Users manage achievements" ON calendar_achievements;
  CREATE POLICY "Users manage achievements" ON calendar_achievements
    USING (
      user_id IN (SELECT id FROM pre_registrations WHERE supabase_auth_id = auth.uid())
      OR auth.role() = 'service_role'
    )
    WITH CHECK (
      user_id IN (SELECT id FROM pre_registrations WHERE supabase_auth_id = auth.uid())
      OR auth.role() = 'service_role'
    );

  DROP POLICY IF EXISTS "Users log events" ON calendar_event_log;
  CREATE POLICY "Users log events" ON calendar_event_log
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

  DROP POLICY IF EXISTS "Service read event logs" ON calendar_event_log;
  CREATE POLICY "Service read event logs" ON calendar_event_log
    FOR SELECT
    USING (auth.role() = 'service_role');

  DROP POLICY IF EXISTS "Service manage event controls" ON calendar_raffle_entry_controls;
  CREATE POLICY "Service manage event controls" ON calendar_raffle_entry_controls
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

  DROP POLICY IF EXISTS "Read calendar metrics" ON calendar_metrics_daily;
  CREATE POLICY "Read calendar metrics" ON calendar_metrics_daily
    FOR SELECT USING (auth.role() = 'service_role');

  DROP POLICY IF EXISTS "Manage calendar metrics" ON calendar_metrics_daily;
  CREATE POLICY "Manage calendar metrics" ON calendar_metrics_daily
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

  DROP POLICY IF EXISTS "Read calendar settings" ON calendar_settings;
  CREATE POLICY "Read calendar settings" ON calendar_settings
    FOR SELECT USING (TRUE);

  DROP POLICY IF EXISTS "Manage calendar settings" ON calendar_settings;
  CREATE POLICY "Manage calendar settings" ON calendar_settings
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

EXCEPTION WHEN duplicate_object THEN
  NULL;
END$$;

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

CREATE OR REPLACE FUNCTION calendar_assert_feature_enabled()
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_enabled BOOLEAN := FALSE;
BEGIN
  SELECT enabled INTO v_enabled
  FROM calendar_settings
  WHERE key = 'christmas_calendar_enabled';

  IF NOT COALESCE(v_enabled, FALSE) THEN
    RAISE EXCEPTION 'calendar_disabled';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION calendar_assert_user(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'calendar_auth_required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pre_registrations
    WHERE id = p_user_id
      AND supabase_auth_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'calendar_user_mismatch';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION calendar_log_event(
  p_event_type TEXT,
  p_user_id UUID,
  p_event_date DATE,
  p_ip INET,
  p_user_agent TEXT,
  p_payload JSONB
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO calendar_event_log (event_type, user_id, event_date, ip_address, user_agent, payload)
  VALUES (p_event_type, p_user_id, p_event_date, p_ip, p_user_agent, COALESCE(p_payload, '{}'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION calendar_update_metrics(
  p_event_date DATE,
  p_claims_delta INT DEFAULT 0,
  p_vouchers_delta INT DEFAULT 0,
  p_entries_delta INT DEFAULT 0,
  p_streak7_delta INT DEFAULT 0,
  p_streak15_delta INT DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO calendar_metrics_daily (
    metric_date,
    claims_count,
    vouchers_issued,
    raffle_entries_added,
    streak_7_count,
    streak_15_count
  )
  VALUES (
    p_event_date,
    GREATEST(p_claims_delta, 0),
    GREATEST(p_vouchers_delta, 0),
    GREATEST(p_entries_delta, 0),
    GREATEST(p_streak7_delta, 0),
    GREATEST(p_streak15_delta, 0)
  )
  ON CONFLICT (metric_date) DO UPDATE SET
    claims_count = calendar_metrics_daily.claims_count + GREATEST(p_claims_delta, 0),
    vouchers_issued = calendar_metrics_daily.vouchers_issued + GREATEST(p_vouchers_delta, 0),
    raffle_entries_added = calendar_metrics_daily.raffle_entries_added + GREATEST(p_entries_delta, 0),
    streak_7_count = calendar_metrics_daily.streak_7_count + GREATEST(p_streak7_delta, 0),
    streak_15_count = calendar_metrics_daily.streak_15_count + GREATEST(p_streak15_delta, 0),
    updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION calendar_issue_voucher(
  p_user_id UUID,
  p_event_date DATE,
  p_voucher JSONB,
  p_source TEXT DEFAULT 'calendar'
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_scope TEXT := COALESCE(NULLIF(p_voucher->>'scope', ''), 'global');
  v_type TEXT := COALESCE(p_voucher->>'voucher_type', p_voucher->>'type');
  v_amount NUMERIC;
  v_metadata JSONB := COALESCE(p_voucher->'metadata', '{}'::jsonb);
  v_result JSONB;
BEGIN
  IF v_type IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_voucher ? 'amount' THEN
    v_amount := (p_voucher->>'amount')::NUMERIC;
  END IF;

  INSERT INTO calendar_vouchers (user_id, event_date, voucher_type, scope, amount, metadata)
  VALUES (
    p_user_id,
    p_event_date,
    v_type,
    v_scope,
    v_amount,
    v_metadata || jsonb_build_object('source', p_source)
  )
  ON CONFLICT (user_id, event_date, voucher_type, scope) DO NOTHING
  RETURNING to_jsonb(calendar_vouchers) INTO v_result;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION calendar_issue_raffle_entries(
  p_user_id UUID,
  p_event_date DATE,
  p_entry JSONB,
  p_source TEXT DEFAULT 'claim'
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_raffle_id TEXT := p_entry->>'raffle_id';
  v_count INT := GREATEST(COALESCE((p_entry->>'count')::INT, 1), 1);
  v_metadata JSONB := COALESCE(p_entry->'metadata', '{}'::jsonb);
  v_result JSONB;
BEGIN
  IF v_raffle_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO calendar_raffle_entries (raffle_id, user_id, source, event_date, count, metadata)
  VALUES (
    v_raffle_id,
    p_user_id,
    COALESCE(p_entry->>'source', p_source),
    p_event_date,
    v_count,
    v_metadata || jsonb_build_object('source', p_source)
  )
  ON CONFLICT (raffle_id, user_id, source, event_date) DO UPDATE SET
    count = calendar_raffle_entries.count + EXCLUDED.count,
    metadata = calendar_raffle_entries.metadata || EXCLUDED.metadata,
    updated_at = NOW()
  RETURNING jsonb_build_object(
    'raffle_id', raffle_id,
    'user_id', user_id,
    'source', source,
    'event_date', event_date,
    'count', count
  ) INTO v_result;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION calendar_referrals_completed_on_date(
  p_user_id UUID,
  p_event_date DATE
)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  v_referral_code TEXT;
  v_count INT := 0;
BEGIN
  SELECT referral_code INTO v_referral_code
  FROM pre_registrations
  WHERE id = p_user_id;

  IF v_referral_code IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM referrals
  WHERE referrer_code = v_referral_code
    AND status = 'completed'
    AND timezone('UTC', COALESCE(completed_at, created_at))::DATE = p_event_date;

  RETURN COALESCE(v_count, 0);
END;
$$;

-- =====================================================
-- RPC FUNCTIONS
-- =====================================================

CREATE OR REPLACE FUNCTION rpc_calendar_claim(
  p_user_id UUID,
  p_event_date DATE DEFAULT timezone('UTC', NOW())::DATE,
  p_payload JSONB DEFAULT '{}'::jsonb,
  p_request_ip INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_today DATE := COALESCE(p_event_date, timezone('UTC', v_now)::DATE);
  v_event calendar_events%ROWTYPE;
  v_claim user_calendar_claims%ROWTYPE;
  v_inserted BOOLEAN := FALSE;
  v_streak calendar_streaks%ROWTYPE;
  v_current_streak INT := 1;
  v_max_streak INT := 1;
  v_rate_count INT := 0;
  v_vouchers JSONB := '[]'::jsonb;
  v_entries JSONB := '[]'::jsonb;
  v_achievements JSONB := '[]'::jsonb;
  v_metric_vouchers INT := 0;
  v_metric_entries INT := 0;
  v_streak7_delta INT := 0;
  v_streak15_delta INT := 0;
  v_config JSONB := '{}'::jsonb;
  v_temp JSONB;
  v_bonus_per_referral INT := 0;
  v_referral_count INT := 0;
  v_bonus_json JSONB;
  v_record RECORD;
  v_milestone RECORD;
  v_reward RECORD;
BEGIN
  PERFORM calendar_assert_feature_enabled();
  PERFORM calendar_assert_user(p_user_id);

  SELECT * INTO v_event
  FROM calendar_events
  WHERE event_date = v_today;

  IF NOT FOUND OR v_event.published = FALSE THEN
    RAISE EXCEPTION 'calendar_event_unavailable';
  END IF;

  IF v_now < v_event.claim_window_start OR v_now > v_event.claim_window_end THEN
    RAISE EXCEPTION 'calendar_claim_outside_window';
  END IF;

  IF p_request_ip IS NOT NULL THEN
    SELECT COUNT(*) INTO v_rate_count
    FROM calendar_event_log
    WHERE event_type = 'claim'
      AND event_date = v_today
      AND ip_address = p_request_ip;

    IF v_rate_count >= 5 THEN
      RAISE EXCEPTION 'calendar_rate_limited';
    END IF;
  END IF;

  WITH inserted AS (
    INSERT INTO user_calendar_claims (user_id, event_date, payload, status, claimed_at)
    VALUES (p_user_id, v_today, COALESCE(p_payload, '{}'::jsonb), 'claimed', v_now)
    ON CONFLICT DO NOTHING
    RETURNING *
  )
  SELECT * INTO v_claim FROM inserted;
  IF FOUND THEN
    v_inserted := TRUE;
  END IF;

  IF NOT FOUND THEN
    SELECT * INTO v_claim
    FROM user_calendar_claims
    WHERE user_id = p_user_id AND event_date = v_today;
    v_inserted := FALSE;
  END IF;

  IF NOT v_inserted THEN
    PERFORM calendar_log_event('claim_duplicate', p_user_id, v_today, p_request_ip, p_user_agent, jsonb_build_object('payload', p_payload));
    RETURN jsonb_build_object('status', 'duplicate', 'claim', to_jsonb(v_claim));
  END IF;

  SELECT * INTO v_streak
  FROM calendar_streaks
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO calendar_streaks (user_id, current_streak, max_streak, last_claimed_date)
    VALUES (p_user_id, 1, 1, v_today);
    v_current_streak := 1;
    v_max_streak := 1;
  ELSE
    IF v_streak.last_claimed_date = v_today - INTERVAL '1 day' THEN
      v_current_streak := v_streak.current_streak + 1;
    ELSIF v_streak.last_claimed_date = v_today THEN
      v_current_streak := v_streak.current_streak;
    ELSE
      v_current_streak := 1;
    END IF;

    v_max_streak := GREATEST(v_streak.max_streak, v_current_streak);

    UPDATE calendar_streaks
    SET current_streak = v_current_streak,
        max_streak = v_max_streak,
        last_claimed_date = v_today,
        updated_at = NOW()
    WHERE user_id = p_user_id;
  END IF;

  v_config := COALESCE(v_event.config, '{}'::jsonb);

  -- Base vouchers
  FOR v_record IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(v_config->'base_rewards'->'vouchers', '[]'::jsonb)) AS value
  LOOP
    v_temp := calendar_issue_voucher(p_user_id, v_today, v_record.value, 'claim_base');
    IF v_temp IS NOT NULL THEN
      v_vouchers := v_vouchers || jsonb_build_array(v_temp);
      v_metric_vouchers := v_metric_vouchers + 1;
    END IF;
  END LOOP;

  -- Base raffle entries
  FOR v_record IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(v_config->'base_rewards'->'raffle_entries', '[]'::jsonb)) AS value
  LOOP
    v_temp := calendar_issue_raffle_entries(p_user_id, v_today, v_record.value, COALESCE(v_record.value->>'source', 'claim_base'));
    IF v_temp IS NOT NULL THEN
      v_entries := v_entries || jsonb_build_array(v_temp);
      v_metric_entries := v_metric_entries + (v_temp->>'count')::INT;
    END IF;
  END LOOP;

  -- fallback raffle config entries_on_claim
  IF jsonb_array_length(COALESCE(v_config->'base_rewards'->'raffle_entries', '[]'::jsonb)) = 0
     AND (v_config->'raffle'->>'raffle_id') IS NOT NULL
     AND (v_config->'raffle'->>'entries_on_claim') IS NOT NULL THEN
    v_bonus_json := jsonb_build_object(
      'raffle_id', v_config->'raffle'->>'raffle_id',
      'count', (v_config->'raffle'->>'entries_on_claim')::INT,
      'source', 'claim_base'
    );
    v_temp := calendar_issue_raffle_entries(p_user_id, v_today, v_bonus_json, 'claim_base');
    IF v_temp IS NOT NULL THEN
      v_entries := v_entries || jsonb_build_array(v_temp);
      v_metric_entries := v_metric_entries + (v_temp->>'count')::INT;
    END IF;
  END IF;

  -- bonus per referral day
  IF (v_config->'raffle') ? 'bonus_per_referral_today' THEN
    v_bonus_per_referral := COALESCE((v_config->'raffle'->>'bonus_per_referral_today')::INT, 0);
    IF v_bonus_per_referral > 0 AND (v_config->'raffle'->>'raffle_id') IS NOT NULL THEN
      v_referral_count := calendar_referrals_completed_on_date(p_user_id, v_today);
      IF v_referral_count > 0 THEN
        v_bonus_json := jsonb_build_object(
          'raffle_id', v_config->'raffle'->>'raffle_id',
          'count', v_referral_count * v_bonus_per_referral,
          'source', 'referral_bonus',
          'metadata', jsonb_build_object('referrals_today', v_referral_count)
        );
        v_temp := calendar_issue_raffle_entries(p_user_id, v_today, v_bonus_json, 'referral_bonus');
        IF v_temp IS NOT NULL THEN
          v_entries := v_entries || jsonb_build_array(v_temp);
          v_metric_entries := v_metric_entries + (v_temp->>'count')::INT;
        END IF;
      END IF;
    END IF;
  END IF;

  -- Streak achievements and rewards
  FOR v_milestone IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(v_config->'streak'->'milestones', '[]'::jsonb)) AS value
  LOOP
    IF (v_milestone.value->>'threshold')::INT <= v_current_streak THEN
      BEGIN
        INSERT INTO calendar_achievements (user_id, achievement_key, event_date, payload)
        VALUES (
          p_user_id,
          v_milestone.value->>'key',
          v_today,
          jsonb_build_object('threshold', (v_milestone.value->>'threshold')::INT, 'awarded_on', v_today)
        )
        ON CONFLICT (user_id, achievement_key) DO NOTHING
        RETURNING jsonb_build_object('key', achievement_key, 'threshold', (v_milestone.value->>'threshold')::INT) INTO v_temp;

        IF v_temp IS NOT NULL THEN
          v_achievements := v_achievements || jsonb_build_array(v_temp);
          IF (v_milestone.value->>'threshold')::INT = 7 THEN
            v_streak7_delta := 1;
          ELSIF (v_milestone.value->>'threshold')::INT = 15 THEN
            v_streak15_delta := 1;
          END IF;

          -- milestone vouchers
          FOR v_reward IN
            SELECT value
            FROM jsonb_array_elements(COALESCE(v_milestone.value->'rewards'->'vouchers', '[]'::jsonb)) AS value
          LOOP
            v_temp := calendar_issue_voucher(p_user_id, v_today, v_reward.value, 'streak_bonus');
            IF v_temp IS NOT NULL THEN
              v_vouchers := v_vouchers || jsonb_build_array(v_temp);
              v_metric_vouchers := v_metric_vouchers + 1;
            END IF;
          END LOOP;

          FOR v_reward IN
            SELECT value
            FROM jsonb_array_elements(COALESCE(v_milestone.value->'rewards'->'raffle_entries', '[]'::jsonb)) AS value
          LOOP
            v_temp := calendar_issue_raffle_entries(p_user_id, v_today, v_reward.value, 'streak_bonus');
            IF v_temp IS NOT NULL THEN
              v_entries := v_entries || jsonb_build_array(v_temp);
              v_metric_entries := v_metric_entries + (v_temp->>'count')::INT;
            END IF;
          END LOOP;
        END IF;
      EXCEPTION WHEN unique_violation THEN
        NULL;
      END;
    END IF;
  END LOOP;

  PERFORM calendar_log_event('claim', p_user_id, v_today, p_request_ip, p_user_agent,
    jsonb_build_object(
      'claim_id', v_claim.id,
      'vouchers', jsonb_array_length(v_vouchers),
      'entries', jsonb_array_length(v_entries),
      'streak', v_current_streak
    )
  );

  PERFORM calendar_update_metrics(v_today, 1, v_metric_vouchers, v_metric_entries, v_streak7_delta, v_streak15_delta);

  RETURN jsonb_build_object(
    'status', 'claimed',
    'claim', to_jsonb(v_claim),
    'streak', jsonb_build_object('current', v_current_streak, 'max', v_max_streak),
    'vouchers', v_vouchers,
    'raffle_entries', v_entries,
    'achievements', v_achievements
  );
END;
$$;

CREATE OR REPLACE FUNCTION rpc_calendar_choice(
  p_user_id UUID,
  p_event_date DATE DEFAULT timezone('UTC', NOW())::DATE,
  p_choice JSONB DEFAULT '{}'::jsonb,
  p_request_ip INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event calendar_events%ROWTYPE;
  v_claim user_calendar_claims%ROWTYPE;
  v_config JSONB := '{}'::jsonb;
  v_choice_key TEXT := COALESCE(p_choice->>'key', p_choice->>'slug');
  v_choice RECORD;
  v_vouchers JSONB := '[]'::jsonb;
  v_entries JSONB := '[]'::jsonb;
  v_temp JSONB;
  v_metric_vouchers INT := 0;
  v_metric_entries INT := 0;
  v_reward RECORD;
BEGIN
  PERFORM calendar_assert_feature_enabled();
  PERFORM calendar_assert_user(p_user_id);

  SELECT * INTO v_event
  FROM calendar_events
  WHERE event_date = p_event_date;

  IF NOT FOUND OR v_event.published = FALSE THEN
    RAISE EXCEPTION 'calendar_event_unavailable';
  END IF;

  SELECT * INTO v_claim
  FROM user_calendar_claims
  WHERE user_id = p_user_id AND event_date = p_event_date;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'calendar_choice_requires_claim';
  END IF;

  v_config := COALESCE(v_event.config, '{}'::jsonb);

  SELECT value INTO v_choice
  FROM jsonb_array_elements(COALESCE(v_config->'choices', '[]'::jsonb)) AS value
  WHERE value->>'key' = v_choice_key;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'calendar_choice_invalid';
  END IF;

  UPDATE user_calendar_claims
  SET payload = jsonb_set(payload, '{choice}', COALESCE(p_choice, '{}'::jsonb), true)
  WHERE id = v_claim.id
  RETURNING * INTO v_claim;

  FOR v_reward IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(v_choice.value->'rewards'->'vouchers', '[]'::jsonb)) AS value
  LOOP
    v_temp := calendar_issue_voucher(p_user_id, p_event_date, v_reward.value, 'choice');
    IF v_temp IS NOT NULL THEN
      v_vouchers := v_vouchers || jsonb_build_array(v_temp);
      v_metric_vouchers := v_metric_vouchers + 1;
    END IF;
  END LOOP;

  FOR v_reward IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(v_choice.value->'rewards'->'raffle_entries', '[]'::jsonb)) AS value
  LOOP
    v_temp := calendar_issue_raffle_entries(p_user_id, p_event_date, v_reward.value, 'choice');
    IF v_temp IS NOT NULL THEN
      v_entries := v_entries || jsonb_build_array(v_temp);
      v_metric_entries := v_metric_entries + (v_temp->>'count')::INT;
    END IF;
  END LOOP;

  PERFORM calendar_log_event('choice', p_user_id, p_event_date, p_request_ip, p_user_agent,
    jsonb_build_object('choice', v_choice_key, 'rewards', jsonb_array_length(v_vouchers)));

  IF v_metric_vouchers > 0 OR v_metric_entries > 0 THEN
    PERFORM calendar_update_metrics(p_event_date, 0, v_metric_vouchers, v_metric_entries, 0, 0);
  END IF;

  RETURN jsonb_build_object(
    'status', 'recorded',
    'claim', to_jsonb(v_claim),
    'choice', v_choice.value,
    'vouchers', v_vouchers,
    'raffle_entries', v_entries
  );
END;
$$;

CREATE OR REPLACE FUNCTION rpc_calendar_spin(
  p_user_id UUID,
  p_event_date DATE DEFAULT timezone('UTC', NOW())::DATE,
  p_request_ip INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event calendar_events%ROWTYPE;
  v_claim user_calendar_claims%ROWTYPE;
  v_wheel calendar_spin_wheels%ROWTYPE;
  v_existing calendar_spin_results%ROWTYPE;
  v_random NUMERIC;
  v_selected RECORD;
  v_payload JSONB := '{}'::jsonb;
  v_vouchers JSONB := '[]'::jsonb;
  v_entries JSONB := '[]'::jsonb;
  v_temp JSONB;
  v_metric_vouchers INT := 0;
  v_metric_entries INT := 0;
  v_reward RECORD;
BEGIN
  PERFORM calendar_assert_feature_enabled();
  PERFORM calendar_assert_user(p_user_id);

  SELECT * INTO v_event
  FROM calendar_events
  WHERE event_date = p_event_date;

  IF NOT FOUND OR v_event.published = FALSE THEN
    RAISE EXCEPTION 'calendar_event_unavailable';
  END IF;

  SELECT * INTO v_claim
  FROM user_calendar_claims
  WHERE user_id = p_user_id AND event_date = p_event_date;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'calendar_spin_requires_claim';
  END IF;

  SELECT * INTO v_existing
  FROM calendar_spin_results
  WHERE user_id = p_user_id AND event_date = p_event_date;

  IF FOUND THEN
    RETURN jsonb_build_object('status', 'duplicate', 'result', to_jsonb(v_existing));
  END IF;

  SELECT * INTO v_wheel
  FROM calendar_spin_wheels
  WHERE event_date = p_event_date;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'calendar_spin_unavailable';
  END IF;

  v_random := random();

  WITH items AS (
    SELECT
      ROW_NUMBER() OVER () - 1 AS idx,
      value AS item,
      COALESCE((value->>'weight')::NUMERIC, 1) AS weight
    FROM jsonb_array_elements(v_wheel.items) AS value
  ), weighted AS (
    SELECT
      idx,
      item,
      weight,
      SUM(weight) OVER (ORDER BY idx) AS cumulative,
      SUM(weight) OVER () AS total
    FROM items
  )
  SELECT idx, item
  INTO v_selected
  FROM weighted
  WHERE cumulative / NULLIF(total, 0)::NUMERIC >= v_random
  ORDER BY idx
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT idx, item INTO v_selected
    FROM (
      SELECT ROW_NUMBER() OVER () - 1 AS idx, item
      FROM jsonb_array_elements(v_wheel.items) AS item
    ) fallback
    ORDER BY idx
    LIMIT 1;
  END IF;

  v_payload := COALESCE(v_selected.item->'payload', '{}'::jsonb);

  INSERT INTO calendar_spin_results (user_id, event_date, wheel_id, item_index, item_payload)
  VALUES (p_user_id, p_event_date, v_wheel.id, v_selected.idx, v_payload)
  ON CONFLICT (user_id, event_date) DO NOTHING
  RETURNING * INTO v_existing;

  FOR v_reward IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(v_payload->'vouchers', '[]'::jsonb)) AS value
  LOOP
    v_temp := calendar_issue_voucher(p_user_id, p_event_date, v_reward.value, 'spin');
    IF v_temp IS NOT NULL THEN
      v_vouchers := v_vouchers || jsonb_build_array(v_temp);
      v_metric_vouchers := v_metric_vouchers + 1;
    END IF;
  END LOOP;

  FOR v_reward IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(v_payload->'raffle_entries', '[]'::jsonb)) AS value
  LOOP
    v_temp := calendar_issue_raffle_entries(p_user_id, p_event_date, v_reward.value, 'spin');
    IF v_temp IS NOT NULL THEN
      v_entries := v_entries || jsonb_build_array(v_temp);
      v_metric_entries := v_metric_entries + (v_temp->>'count')::INT;
    END IF;
  END LOOP;

  PERFORM calendar_log_event('spin', p_user_id, p_event_date, p_request_ip, p_user_agent,
    jsonb_build_object('item_index', v_selected.idx, 'payload', v_payload));

  IF v_metric_vouchers > 0 OR v_metric_entries > 0 THEN
    PERFORM calendar_update_metrics(p_event_date, 0, v_metric_vouchers, v_metric_entries, 0, 0);
  END IF;

  RETURN jsonb_build_object(
    'status', 'spun',
    'result', to_jsonb(v_existing),
    'vouchers', v_vouchers,
    'raffle_entries', v_entries
  );
END;
$$;

CREATE OR REPLACE FUNCTION rpc_calendar_validate_upgrade(
  p_user_id UUID,
  p_event_date DATE DEFAULT timezone('UTC', NOW())::DATE,
  p_request_ip INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event calendar_events%ROWTYPE;
  v_config JSONB := '{}'::jsonb;
  v_upgrade RECORD;
  v_condition_referrals INT := 0;
  v_referrals_today INT := 0;
  v_target_scope TEXT;
  v_target_type TEXT;
  v_existing calendar_vouchers%ROWTYPE;
  v_updates JSONB := '[]'::jsonb;
  v_new_voucher JSONB;
BEGIN
  PERFORM calendar_assert_feature_enabled();
  PERFORM calendar_assert_user(p_user_id);

  SELECT * INTO v_event
  FROM calendar_events
  WHERE event_date = p_event_date;

  IF NOT FOUND OR v_event.published = FALSE THEN
    RAISE EXCEPTION 'calendar_event_unavailable';
  END IF;

  v_config := COALESCE(v_event.config, '{}'::jsonb);

  IF jsonb_array_length(COALESCE(v_config->'conditional_upgrades', '[]'::jsonb)) = 0 THEN
    RETURN jsonb_build_object('status', 'noop', 'upgrades', v_updates);
  END IF;

  v_referrals_today := calendar_referrals_completed_on_date(p_user_id, p_event_date);

  FOR v_upgrade IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(v_config->'conditional_upgrades', '[]'::jsonb)) AS value
  LOOP
    v_condition_referrals := COALESCE((v_upgrade.value->'condition'->>'referrals_today_gte')::INT, 0);

    IF v_referrals_today < v_condition_referrals THEN
      CONTINUE;
    END IF;

    v_target_scope := COALESCE(v_upgrade.value->'target'->>'scope', 'global');
    v_target_type := COALESCE(v_upgrade.value->'target'->>'voucher_type', v_upgrade.value->'target'->>'type');

    SELECT * INTO v_existing
    FROM calendar_vouchers
    WHERE user_id = p_user_id
      AND event_date = p_event_date
      AND voucher_type = v_target_type
      AND scope = v_target_scope
    FOR UPDATE;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    IF (v_existing.metadata->>'upgrade_status') = 'applied' THEN
      CONTINUE;
    END IF;

    UPDATE calendar_vouchers
    SET voucher_type = COALESCE(v_upgrade.value->'replace'->>'voucher_type', v_existing.voucher_type),
        scope = COALESCE(v_upgrade.value->'replace'->>'scope', v_existing.scope),
        amount = COALESCE((v_upgrade.value->'replace'->>'amount')::NUMERIC, v_existing.amount),
        metadata = (v_existing.metadata || COALESCE(v_upgrade.value->'replace'->'metadata', '{}'::jsonb))
          || jsonb_build_object('upgrade_status', 'applied', 'upgraded_at', NOW(), 'referrals_today', v_referrals_today)
    WHERE id = v_existing.id
    RETURNING to_jsonb(calendar_vouchers) INTO v_new_voucher;

    IF v_new_voucher IS NOT NULL THEN
      v_updates := v_updates || jsonb_build_array(v_new_voucher);
    END IF;
  END LOOP;

  PERFORM calendar_log_event('validate_upgrade', p_user_id, p_event_date, p_request_ip, p_user_agent,
    jsonb_build_object('upgrades', jsonb_array_length(v_updates)));

  RETURN jsonb_build_object('status', 'processed', 'upgrades', v_updates);
END;
$$;

CREATE OR REPLACE FUNCTION rpc_calendar_raffle_draw(
  p_raffle_id TEXT,
  p_seed TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raffle calendar_raffles%ROWTYPE;
  v_winners JSONB := '[]'::jsonb;
  v_total_entries BIGINT := 0;
  v_seed_float DOUBLE PRECISION;
  v_winners_count INT := 1;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'calendar_admin_only';
  END IF;

  SELECT * INTO v_raffle
  FROM calendar_raffles
  WHERE id = p_raffle_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'calendar_raffle_not_found';
  END IF;

  v_winners_count := GREATEST(COALESCE((v_raffle.rules->>'winners_count')::INT, 1), 1);

  SELECT SUM(count) INTO v_total_entries
  FROM calendar_raffle_entries
  WHERE raffle_id = p_raffle_id;

  IF COALESCE(v_total_entries, 0) = 0 THEN
    RAISE EXCEPTION 'calendar_raffle_no_entries';
  END IF;

  SELECT ((('x' || substr(encode(digest(p_seed || ':' || p_raffle_id, 'sha256'), 'hex'), 1, 8))::bit(32)::INT)::DOUBLE PRECISION / 2147483647.0)
  INTO v_seed_float;

  v_seed_float := LEAST(GREATEST(v_seed_float, -0.999999), 0.999999);
  PERFORM setseed(v_seed_float);

  DELETE FROM calendar_raffle_winners WHERE raffle_id = p_raffle_id;

  WITH weighted AS (
    SELECT
      e.user_id,
      SUM(e.count) AS raw_count,
      COALESCE(ctrl.weight_multiplier, 1)::NUMERIC AS weight_multiplier,
      COALESCE(ctrl.excluded, FALSE) AS excluded
    FROM calendar_raffle_entries e
    LEFT JOIN calendar_raffle_entry_controls ctrl
      ON ctrl.raffle_id = e.raffle_id AND ctrl.user_id = e.user_id
    WHERE e.raffle_id = p_raffle_id
    GROUP BY e.user_id, ctrl.weight_multiplier, ctrl.excluded
  ), expanded AS (
    SELECT
      user_id,
      (raw_count * weight_multiplier) AS weighted_count
    FROM weighted
    WHERE excluded = FALSE AND raw_count > 0
  ), scored AS (
    SELECT
      user_id,
      weighted_count,
      LN(random()) / NULLIF(weighted_count, 0) AS score
    FROM expanded
    WHERE weighted_count > 0
  ), winners AS (
    SELECT
      user_id,
      ROW_NUMBER() OVER (ORDER BY score DESC) AS winner_position
    FROM scored
    ORDER BY score DESC
    LIMIT v_winners_count
  )
  INSERT INTO calendar_raffle_winners (raffle_id, user_id, position, seed_used, audit_hash)
  SELECT
    p_raffle_id,
    user_id,
    winner_position,
    p_seed,
    encode(digest(p_seed || ':' || user_id::TEXT || ':' || winner_position::TEXT, 'sha256'), 'hex')
  FROM winners;

  SELECT jsonb_agg(row_to_json(w)) INTO v_winners
  FROM (
    SELECT raffle_id, user_id, position, audit_hash
    FROM calendar_raffle_winners
    WHERE raffle_id = p_raffle_id
    ORDER BY position
  ) w;

  UPDATE calendar_raffles
  SET status = 'drawn',
      draw_seed = p_seed,
      draw_result = v_winners,
      updated_at = NOW()
  WHERE id = p_raffle_id;

  PERFORM calendar_log_event('raffle_draw', NULL, NULL, NULL, NULL,
    jsonb_build_object('raffle_id', p_raffle_id, 'seed', p_seed, 'winners', v_winners));

  RETURN jsonb_build_object('status', 'drawn', 'winners', v_winners, 'seed', p_seed);
END;
$$;

-- =====================================================
-- REFERRAL MULTIPLIER TRIGGER
-- =====================================================

CREATE OR REPLACE FUNCTION calendar_apply_referral_multiplier()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_date DATE := timezone('UTC', COALESCE(NEW.completed_at, NEW.created_at))::DATE;
  v_multiplier RECORD;
  v_user UUID;
  v_entry JSONB;
BEGIN
  IF NEW.status <> 'completed' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND COALESCE(OLD.status, '') = 'completed' THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_user
  FROM pre_registrations
  WHERE referral_code = NEW.referrer_code;

  IF v_user IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_multiplier
  FROM calendar_referral_multipliers
  WHERE event_date = v_event_date
    AND applies_to = 'raffle_entries';

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_entry := jsonb_build_object(
    'raffle_id', COALESCE(v_multiplier.metadata->>'raffle_id', 'mega_25'),
    'count', GREATEST(1, CEIL(v_multiplier.multiplier)),
    'source', 'referral_multiplier',
    'metadata', jsonb_build_object('referral_id', NEW.id)
  );

  PERFORM calendar_issue_raffle_entries(v_user, v_event_date, v_entry, 'referral_multiplier');

  PERFORM calendar_log_event('referral_bonus', v_user, v_event_date, NULL, NULL,
    jsonb_build_object('referral_id', NEW.id, 'multiplier', v_multiplier.multiplier));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_calendar_referral_multiplier ON referrals;
CREATE TRIGGER trg_calendar_referral_multiplier
AFTER INSERT OR UPDATE ON referrals
FOR EACH ROW
WHEN (NEW.status = 'completed')
EXECUTE FUNCTION calendar_apply_referral_multiplier();

-- =====================================================
-- SEED DATA FOR CALENDAR 2025
-- =====================================================

INSERT INTO calendar_raffles (id, name, start_at, end_at, draw_at, rules, status)
VALUES (
  'mega_25',
  'Dec 25 Mega Gift',
  '2025-12-01T00:00:00Z',
  '2025-12-26T00:00:00Z',
  '2025-12-26T02:00:00Z',
  jsonb_build_object('winners_count', 3, 'description', 'Grand raffle for Dec 25'),
  'open'
)
ON CONFLICT (id) DO UPDATE SET
  start_at = EXCLUDED.start_at,
  end_at = EXCLUDED.end_at,
  draw_at = EXCLUDED.draw_at,
  rules = EXCLUDED.rules;

WITH days AS (
  SELECT
    dd::DATE AS event_date,
    CONCAT('dec-', to_char(dd, 'DD')) AS slug,
    CASE
      WHEN dd::DATE = DATE '2025-12-12' THEN ARRAY['D','S']
      WHEN dd::DATE IN (DATE '2025-12-04', DATE '2025-12-06', DATE '2025-12-10', DATE '2025-12-15', DATE '2025-12-19', DATE '2025-12-23', DATE '2025-12-25') THEN ARRAY['D','R']
      ELSE ARRAY['D']
    END AS types,
    CASE WHEN dd::DATE IN (DATE '2025-12-04', DATE '2025-12-06', DATE '2025-12-10', DATE '2025-12-15', DATE '2025-12-19', DATE '2025-12-23') THEN 1 ELSE 0 END AS referral_bonus,
    CASE WHEN dd::DATE = DATE '2025-12-10' THEN TRUE ELSE FALSE END AS upgrade_day,
    CASE WHEN dd::DATE = DATE '2025-12-01' THEN TRUE ELSE FALSE END AS choice_day,
    CASE WHEN dd::DATE = DATE '2025-12-12' THEN TRUE ELSE FALSE END AS spin_day
  FROM generate_series('2025-12-01'::DATE, '2025-12-25'::DATE, '1 day') dd
)
INSERT INTO calendar_events (event_date, slug, types, config, claim_window_start, claim_window_end, published)
SELECT
  event_date,
  slug,
  types,
  (
    jsonb_build_object(
      'base_rewards', jsonb_build_object(
        'vouchers', jsonb_build_array(
          jsonb_build_object(
            'voucher_type', 'percent_off',
            'scope', CASE WHEN event_date = DATE '2025-12-10' THEN 'Crunchyroll' ELSE 'global' END,
            'amount', CASE WHEN event_date = DATE '2025-12-25' THEN 25 ELSE 10 END,
            'metadata', jsonb_build_object('day', slug)
          )
        ),
        'raffle_entries', jsonb_build_array(
          jsonb_build_object(
            'raffle_id', 'mega_25',
            'count', CASE WHEN event_date = DATE '2025-12-25' THEN 5 ELSE 1 END,
            'source', 'claim'
          )
        )
      ),
      'raffle', jsonb_build_object(
        'raffle_id', 'mega_25',
        'entries_on_claim', CASE WHEN event_date = DATE '2025-12-25' THEN 5 ELSE 1 END,
        'bonus_per_referral_today', referral_bonus
      ),
      'streak', jsonb_build_object(
        'milestones', jsonb_build_array(
          jsonb_build_object(
            'key', 'streak_7',
            'threshold', 7,
            'rewards', jsonb_build_object(
              'raffle_entries', jsonb_build_array(
                jsonb_build_object('raffle_id', 'mega_25', 'count', 5, 'source', 'streak_bonus')
              )
            )
          ),
          jsonb_build_object(
            'key', 'streak_15',
            'threshold', 15,
            'rewards', jsonb_build_object(
              'vouchers', jsonb_build_array(
                jsonb_build_object('voucher_type', 'percent_off', 'scope', 'global', 'amount', 25)
              )
            )
          )
        )
      ),
      'ui', jsonb_build_object('badges', types)
    )
    || CASE
      WHEN upgrade_day THEN jsonb_build_object(
        'conditional_upgrades', jsonb_build_array(
          jsonb_build_object(
            'target', jsonb_build_object('voucher_type', 'percent_off', 'scope', 'Crunchyroll'),
            'condition', jsonb_build_object('referrals_today_gte', 1),
            'replace', jsonb_build_object('amount', 20, 'metadata', jsonb_build_object('upgrade_group', 'dec10_double'))
          )
        )
      )
      ELSE '{}'::jsonb
    END
    || CASE
      WHEN choice_day THEN jsonb_build_object(
        'choices', jsonb_build_array(
          jsonb_build_object(
            'key', 'voucher_stackable',
            'title', 'Stackable Voucher',
            'rewards', jsonb_build_object(
              'vouchers', jsonb_build_array(
                jsonb_build_object('voucher_type', 'stackable', 'scope', 'global', 'amount', 5)
              )
            )
          ),
          jsonb_build_object(
            'key', 'raffle_push',
            'title', 'Raffle Surge',
            'rewards', jsonb_build_object(
              'raffle_entries', jsonb_build_array(
                jsonb_build_object('raffle_id', 'mega_25', 'count', 3, 'source', 'choice')
              )
            )
          )
        )
      )
      ELSE '{}'::jsonb
    END
    || CASE
      WHEN spin_day THEN jsonb_build_object('spin', jsonb_build_object('wheel', 'dec12_holly'))
      ELSE '{}'::jsonb
    END
  ) AS config,
  (event_date::timestamp AT TIME ZONE 'UTC') AS claim_window_start,
  ((event_date + INTERVAL '1 day')::timestamp AT TIME ZONE 'UTC') AS claim_window_end,
  TRUE
FROM days
ON CONFLICT (event_date) DO UPDATE SET
  slug = EXCLUDED.slug,
  types = EXCLUDED.types,
  config = EXCLUDED.config,
  claim_window_start = EXCLUDED.claim_window_start,
  claim_window_end = EXCLUDED.claim_window_end,
  published = EXCLUDED.published;

INSERT INTO calendar_spin_wheels (event_date, items)
VALUES (
  DATE '2025-12-12',
  jsonb_build_array(
    jsonb_build_object('label', '5 Entries', 'weight', 40, 'payload', jsonb_build_object('raffle_entries', jsonb_build_array(jsonb_build_object('raffle_id', 'mega_25', 'count', 5)))),
    jsonb_build_object('label', '10 Entries', 'weight', 30, 'payload', jsonb_build_object('raffle_entries', jsonb_build_array(jsonb_build_object('raffle_id', 'mega_25', 'count', 10)))),
    jsonb_build_object('label', 'Golden Voucher', 'weight', 20, 'payload', jsonb_build_object('vouchers', jsonb_build_array(jsonb_build_object('voucher_type', 'percent_off', 'scope', 'premium', 'amount', 30)))),
    jsonb_build_object('label', 'Streak Boost', 'weight', 10, 'payload', jsonb_build_object('raffle_entries', jsonb_build_array(jsonb_build_object('raffle_id', 'mega_25', 'count', 15, 'source', 'spin_bonus'))))
  )
)
ON CONFLICT (event_date) DO UPDATE SET
  items = EXCLUDED.items;

INSERT INTO calendar_referral_multipliers (event_date, multiplier, applies_to, notes, metadata)
SELECT
  event_date,
  2.0,
  'raffle_entries',
  'Multiplier day',
  jsonb_build_object('raffle_id', 'mega_25')
FROM (VALUES
  (DATE '2025-12-04'),
  (DATE '2025-12-06'),
  (DATE '2025-12-10'),
  (DATE '2025-12-15'),
  (DATE '2025-12-19'),
  (DATE '2025-12-23')
) AS d(event_date)
ON CONFLICT (event_date, applies_to) DO UPDATE SET
  multiplier = EXCLUDED.multiplier,
  metadata = EXCLUDED.metadata;

-- =====================================================
-- END OF BASE STRUCTURE SECTION
-- Additional functions, triggers, and seed data appended below
-- =====================================================

COMMIT;
