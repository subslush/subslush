-- =====================================================
-- MIGRATION 010: Safe choice reset support
-- Adds ability to reset or replace a daily choice within the claim window
-- and prevents reward stacking after the day ends.
-- =====================================================

BEGIN;

-- Allow metrics to be decremented safely when reversing a choice
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
DECLARE
  v_claims_delta INT := COALESCE(p_claims_delta, 0);
  v_vouchers_delta INT := COALESCE(p_vouchers_delta, 0);
  v_entries_delta INT := COALESCE(p_entries_delta, 0);
  v_streak7_delta INT := COALESCE(p_streak7_delta, 0);
  v_streak15_delta INT := COALESCE(p_streak15_delta, 0);
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
    GREATEST(v_claims_delta, 0),
    GREATEST(v_vouchers_delta, 0),
    GREATEST(v_entries_delta, 0),
    GREATEST(v_streak7_delta, 0),
    GREATEST(v_streak15_delta, 0)
  )
  ON CONFLICT (metric_date) DO UPDATE SET
    claims_count = GREATEST(calendar_metrics_daily.claims_count + v_claims_delta, 0),
    vouchers_issued = GREATEST(calendar_metrics_daily.vouchers_issued + v_vouchers_delta, 0),
    raffle_entries_added = GREATEST(calendar_metrics_daily.raffle_entries_added + v_entries_delta, 0),
    streak_7_count = GREATEST(calendar_metrics_daily.streak_7_count + v_streak7_delta, 0),
    streak_15_count = GREATEST(calendar_metrics_daily.streak_15_count + v_streak15_delta, 0),
    updated_at = NOW();
END;
$$;

-- Choice selection now enforces the claim window and safely replaces earlier selections
CREATE OR REPLACE FUNCTION rpc_calendar_choice(
  p_user_id UUID,
  p_event_date DATE DEFAULT timezone('UTC', NOW())::DATE,
  p_choice JSONB DEFAULT '{}'::jsonb,
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
BEGIN
  PERFORM calendar_assert_feature_enabled();
  PERFORM calendar_assert_user(p_user_id);

  SELECT * INTO v_event
  FROM calendar_events
  WHERE event_date = p_event_date;

  IF NOT FOUND OR v_event.published = FALSE THEN
    RAISE EXCEPTION 'calendar_event_unavailable';
  END IF;

  IF v_now < v_event.claim_window_start OR v_now > v_event.claim_window_end THEN
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

  -- No-op if the same choice is submitted again
  IF v_previous_choice_key IS NOT NULL AND v_previous_choice_key = v_choice_key THEN
    RETURN jsonb_build_object(
      'status', 'unchanged',
      'claim', to_jsonb(v_claim),
      'choice', v_choice.value,
      'vouchers', '[]'::jsonb,
      'raffle_entries', '[]'::jsonb
    );
  END IF;

  -- Block switching if any choice rewards were already redeemed
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

-- Explicit reset endpoint to clear a choice before the day ends
CREATE OR REPLACE FUNCTION rpc_calendar_choice_reset(
  p_user_id UUID,
  p_event_date DATE DEFAULT timezone('UTC', NOW())::DATE,
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
  v_event calendar_events%ROWTYPE;
  v_claim user_calendar_claims%ROWTYPE;
  v_existing_choice JSONB;
  v_existing_choice_key TEXT;
  v_redeemed_choice_count INT := 0;
  v_removed_vouchers INT := 0;
  v_removed_entries INT := 0;
BEGIN
  PERFORM calendar_assert_feature_enabled();
  PERFORM calendar_assert_user(p_user_id);

  SELECT * INTO v_event
  FROM calendar_events
  WHERE event_date = p_event_date;

  IF NOT FOUND OR v_event.published = FALSE THEN
    RAISE EXCEPTION 'calendar_event_unavailable';
  END IF;

  IF v_now < v_event.claim_window_start OR v_now > v_event.claim_window_end THEN
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
