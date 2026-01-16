-- =====================================================
-- MIGRATION 013: Local-midnight claim & choice windows
-- Aligns claim/choice/reset windows to the user's local timezone
-- by accepting a timezone offset and computing the window per user.
-- Removes legacy overloads to avoid PostgREST ambiguity.
-- =====================================================

BEGIN;

-- Drop existing versions to prevent overload conflicts
DROP FUNCTION IF EXISTS public.rpc_calendar_claim(UUID, DATE, JSONB, INET, TEXT, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.rpc_calendar_claim(UUID, DATE, JSONB, INET, TEXT);
DROP FUNCTION IF EXISTS public.rpc_calendar_choice(UUID, DATE, JSONB, INET, TEXT, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.rpc_calendar_choice(UUID, DATE, JSONB, INET, TEXT);
DROP FUNCTION IF EXISTS public.rpc_calendar_choice_reset(UUID, DATE, INET, TEXT, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.rpc_calendar_choice_reset(UUID, DATE, INET, TEXT);

-- Claim: window based on user's local midnight
CREATE OR REPLACE FUNCTION rpc_calendar_claim(
  p_user_id UUID,
  p_event_date DATE DEFAULT timezone('UTC', NOW())::DATE,
  p_payload JSONB DEFAULT '{}'::jsonb,
  p_request_ip INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_override_now TIMESTAMPTZ DEFAULT NULL,
  p_timezone_offset_minutes INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := COALESCE(p_override_now, NOW());
  v_today DATE := COALESCE(p_event_date, timezone('UTC', v_now)::DATE);
  v_event calendar_events%ROWTYPE;
  v_claim user_calendar_claims%ROWTYPE;
  v_inserted BOOLEAN := FALSE;
  v_streak calendar_streaks%ROWTYPE;
  v_current_streak INT := 1;
  v_max_streak INT := 1;
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
  v_offset INT := COALESCE(p_timezone_offset_minutes, 0);
  v_window_start TIMESTAMPTZ;
  v_window_end TIMESTAMPTZ;
BEGIN
  PERFORM calendar_assert_feature_enabled();
  PERFORM calendar_assert_user(p_user_id);

  SELECT * INTO v_event
  FROM calendar_events
  WHERE event_date = v_today;

  IF NOT FOUND OR v_event.published = FALSE THEN
    RAISE EXCEPTION 'calendar_event_unavailable';
  END IF;

  v_window_start := (v_today::timestamp AT TIME ZONE 'UTC') - (v_offset || ' minutes')::interval;
  v_window_end := v_window_start + INTERVAL '1 day';

  IF v_now < v_window_start OR v_now > v_window_end THEN
    RAISE EXCEPTION 'calendar_claim_outside_window';
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
        updated_at = v_now
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

-- Choice: window based on user's local midnight
CREATE OR REPLACE FUNCTION rpc_calendar_choice(
  p_user_id UUID,
  p_event_date DATE DEFAULT timezone('UTC', NOW())::DATE,
  p_choice JSONB DEFAULT '{}'::jsonb,
  p_request_ip INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_override_now TIMESTAMPTZ DEFAULT NULL,
  p_timezone_offset_minutes INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := COALESCE(p_override_now, NOW());
  v_event calendar_events%ROWTYPE;
  v_claim user_calendar_claims%ROWTYPE;
  v_config JSONB := '{}'::jsonb;
  v_choice_key TEXT := COALESCE(p_choice->>'key', p_choice->>'slug');
  v_choice RECORD;
  v_vouchers JSONB := '[]'::jsonb;
  v_entries JSONB := '[]'::jsonb;
  v_temp JSONB;
  v_new_voucher_count INT := 0;
  v_new_entry_count INT := 0;
  v_reward RECORD;
  v_existing_choice JSONB;
  v_previous_choice_key TEXT;
  v_redeemed_choice_count INT := 0;
  v_removed_vouchers INT := 0;
  v_removed_entries INT := 0;
  v_offset INT := COALESCE(p_timezone_offset_minutes, 0);
  v_window_start TIMESTAMPTZ;
  v_window_end TIMESTAMPTZ;
BEGIN
  PERFORM calendar_assert_feature_enabled();
  PERFORM calendar_assert_user(p_user_id);

  SELECT * INTO v_event
  FROM calendar_events
  WHERE event_date = p_event_date;

  IF NOT FOUND OR v_event.published = FALSE THEN
    RAISE EXCEPTION 'calendar_event_unavailable';
  END IF;

  v_window_start := (p_event_date::timestamp AT TIME ZONE 'UTC') - (v_offset || ' minutes')::interval;
  v_window_end := v_window_start + INTERVAL '1 day';

  IF v_now < v_window_start OR v_now > v_window_end THEN
    RAISE EXCEPTION 'calendar_choice_outside_window';
  END IF;

  SELECT * INTO v_claim
  FROM user_calendar_claims
  WHERE user_id = p_user_id AND event_date = p_event_date
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'calendar_choice_requires_claim';
  END IF;

  v_existing_choice := v_claim.payload->'choice';
  v_previous_choice_key := COALESCE(v_existing_choice->>'key', v_existing_choice->>'slug');

  v_config := COALESCE(v_event.config, '{}'::jsonb);

  SELECT value INTO v_choice
  FROM jsonb_array_elements(COALESCE(v_config->'choices', '[]'::jsonb)) AS value
  WHERE value->>'key' = v_choice_key;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'calendar_choice_invalid';
  END IF;

  IF v_previous_choice_key IS NOT NULL AND v_previous_choice_key = v_choice_key THEN
    RETURN jsonb_build_object(
      'status', 'unchanged',
      'claim', to_jsonb(v_claim),
      'choice', v_choice.value,
      'vouchers', '[]'::jsonb,
      'raffle_entries', '[]'::jsonb
    );
  END IF;

  IF v_previous_choice_key IS NOT NULL THEN
    SELECT COUNT(*) INTO v_redeemed_choice_count
    FROM calendar_vouchers
    WHERE user_id = p_user_id
      AND event_date = p_event_date
      AND metadata->>'source' = 'choice'
      AND status <> 'issued';

    IF v_redeemed_choice_count > 0 THEN
      RAISE EXCEPTION 'calendar_choice_locked';
    END IF;

    WITH deleted_vouchers AS (
      DELETE FROM calendar_vouchers
      WHERE user_id = p_user_id
        AND event_date = p_event_date
        AND metadata->>'source' = 'choice'
      RETURNING 1
    ), deleted_entries AS (
      DELETE FROM calendar_raffle_entries
      WHERE user_id = p_user_id
        AND event_date = p_event_date
        AND source = 'choice'
      RETURNING count
    )
    SELECT COALESCE((SELECT COUNT(*) FROM deleted_vouchers), 0),
           COALESCE((SELECT SUM(count) FROM deleted_entries), 0)
    INTO v_removed_vouchers, v_removed_entries;
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
      v_new_voucher_count := v_new_voucher_count + 1;
    END IF;
  END LOOP;

  FOR v_reward IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(v_choice.value->'rewards'->'raffle_entries', '[]'::jsonb)) AS value
  LOOP
    v_temp := calendar_issue_raffle_entries(p_user_id, p_event_date, v_reward.value, 'choice');
    IF v_temp IS NOT NULL THEN
      v_entries := v_entries || jsonb_build_array(v_temp);
      v_new_entry_count := v_new_entry_count + COALESCE((v_temp->>'count')::INT, 0);
    END IF;
  END LOOP;

  PERFORM calendar_log_event('choice', p_user_id, p_event_date, p_request_ip, p_user_agent,
    jsonb_build_object(
      'choice', v_choice_key,
      'previous_choice', v_previous_choice_key,
      'removed_vouchers', v_removed_vouchers,
      'removed_entries', v_removed_entries
    )
  );

  IF (v_new_voucher_count - v_removed_vouchers) <> 0 OR (v_new_entry_count - v_removed_entries) <> 0 THEN
    PERFORM calendar_update_metrics(
      p_event_date,
      0,
      v_new_voucher_count - v_removed_vouchers,
      v_new_entry_count - v_removed_entries,
      0,
      0
    );
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

-- Choice reset: window based on user's local midnight
CREATE OR REPLACE FUNCTION rpc_calendar_choice_reset(
  p_user_id UUID,
  p_event_date DATE DEFAULT timezone('UTC', NOW())::DATE,
  p_request_ip INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_override_now TIMESTAMPTZ DEFAULT NULL,
  p_timezone_offset_minutes INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := COALESCE(p_override_now, NOW());
  v_event calendar_events%ROWTYPE;
  v_claim user_calendar_claims%ROWTYPE;
  v_existing_choice JSONB;
  v_existing_choice_key TEXT;
  v_redeemed_choice_count INT := 0;
  v_removed_vouchers INT := 0;
  v_removed_entries INT := 0;
  v_offset INT := COALESCE(p_timezone_offset_minutes, 0);
  v_window_start TIMESTAMPTZ;
  v_window_end TIMESTAMPTZ;
BEGIN
  PERFORM calendar_assert_feature_enabled();
  PERFORM calendar_assert_user(p_user_id);

  SELECT * INTO v_event
  FROM calendar_events
  WHERE event_date = p_event_date;

  IF NOT FOUND OR v_event.published = FALSE THEN
    RAISE EXCEPTION 'calendar_event_unavailable';
  END IF;

  v_window_start := (p_event_date::timestamp AT TIME ZONE 'UTC') - (v_offset || ' minutes')::interval;
  v_window_end := v_window_start + INTERVAL '1 day';

  IF v_now < v_window_start OR v_now > v_window_end THEN
    RAISE EXCEPTION 'calendar_choice_outside_window';
  END IF;

  SELECT * INTO v_claim
  FROM user_calendar_claims
  WHERE user_id = p_user_id AND event_date = p_event_date
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'calendar_choice_requires_claim';
  END IF;

  v_existing_choice := v_claim.payload->'choice';
  v_existing_choice_key := COALESCE(v_existing_choice->>'key', v_existing_choice->>'slug');

  IF v_existing_choice_key IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'noop',
      'claim', to_jsonb(v_claim),
      'removed_vouchers', 0,
      'removed_entries', 0
    );
  END IF;

  SELECT COUNT(*) INTO v_redeemed_choice_count
  FROM calendar_vouchers
  WHERE user_id = p_user_id
    AND event_date = p_event_date
    AND metadata->>'source' = 'choice'
    AND status <> 'issued';

  IF v_redeemed_choice_count > 0 THEN
    RAISE EXCEPTION 'calendar_choice_locked';
  END IF;

  WITH deleted_vouchers AS (
    DELETE FROM calendar_vouchers
    WHERE user_id = p_user_id
      AND event_date = p_event_date
      AND metadata->>'source' = 'choice'
    RETURNING 1
  ), deleted_entries AS (
    DELETE FROM calendar_raffle_entries
    WHERE user_id = p_user_id
      AND event_date = p_event_date
      AND source = 'choice'
    RETURNING count
  )
  SELECT COALESCE((SELECT COUNT(*) FROM deleted_vouchers), 0),
         COALESCE((SELECT SUM(count) FROM deleted_entries), 0)
  INTO v_removed_vouchers, v_removed_entries;

  UPDATE user_calendar_claims
  SET payload = payload - 'choice'
  WHERE id = v_claim.id
  RETURNING * INTO v_claim;

  PERFORM calendar_log_event('choice_reset', p_user_id, p_event_date, p_request_ip, p_user_agent,
    jsonb_build_object(
      'previous_choice', v_existing_choice_key,
      'removed_vouchers', v_removed_vouchers,
      'removed_entries', v_removed_entries
    )
  );

  IF v_removed_vouchers > 0 OR v_removed_entries > 0 THEN
    PERFORM calendar_update_metrics(
      p_event_date,
      0,
      -v_removed_vouchers,
      -v_removed_entries,
      0,
      0
    );
  END IF;

  RETURN jsonb_build_object(
    'status', 'reset',
    'claim', to_jsonb(v_claim),
    'removed_vouchers', v_removed_vouchers,
    'removed_entries', v_removed_entries
  );
END;
$$;

COMMIT;
