-- =====================================================
-- MIGRATION 011: Remove claim IP rate limiting
-- Redefines rpc_calendar_claim without the per-IP limit.
-- =====================================================

BEGIN;

CREATE OR REPLACE FUNCTION rpc_calendar_claim(
  p_user_id UUID,
  p_event_date DATE DEFAULT timezone('UTC', NOW())::DATE,
  p_payload JSONB DEFAULT '{}'::jsonb,
  p_request_ip INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_override_now TIMESTAMPTZ DEFAULT NULL
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

COMMIT;
