--
-- PostgreSQL database dump
--

\restrict COa1THJgQrv9Z5ewM53OQhHnrZC8tusVX2HVwmyFFRxR1k2CpaIGFgemjrjhZEW

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.10 (Ubuntu 17.10-1.pgdg24.04+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: calendar_apply_referral_multiplier(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calendar_apply_referral_multiplier() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: calendar_assert_feature_enabled(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calendar_assert_feature_enabled() RETURNS void
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


--
-- Name: calendar_assert_user(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calendar_assert_user(p_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: calendar_issue_raffle_entries(uuid, date, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calendar_issue_raffle_entries(p_user_id uuid, p_event_date date, p_entry jsonb, p_source text DEFAULT 'claim'::text) RETURNS jsonb
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


--
-- Name: calendar_issue_voucher(uuid, date, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calendar_issue_voucher(p_user_id uuid, p_event_date date, p_voucher jsonb, p_source text DEFAULT 'calendar'::text) RETURNS jsonb
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


--
-- Name: calendar_log_event(text, uuid, date, inet, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calendar_log_event(p_event_type text, p_user_id uuid, p_event_date date, p_ip inet, p_user_agent text, p_payload jsonb) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO calendar_event_log (event_type, user_id, event_date, ip_address, user_agent, payload)
  VALUES (p_event_type, p_user_id, p_event_date, p_ip, p_user_agent, COALESCE(p_payload, '{}'::jsonb));
END;
$$;


--
-- Name: calendar_referrals_completed_on_date(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calendar_referrals_completed_on_date(p_user_id uuid, p_event_date date) RETURNS integer
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


--
-- Name: calendar_update_metrics(date, integer, integer, integer, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calendar_update_metrics(p_event_date date, p_claims_delta integer DEFAULT 0, p_vouchers_delta integer DEFAULT 0, p_entries_delta integer DEFAULT 0, p_streak7_delta integer DEFAULT 0, p_streak15_delta integer DEFAULT 0) RETURNS void
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


--
-- Name: credit_transactions_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.credit_transactions_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: enforce_order_allocation_parity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_order_allocation_parity() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_order_id UUID;
  v_status TEXT;
  v_order_coupon INTEGER;
  v_order_total INTEGER;
  v_items_coupon INTEGER;
  v_payment_total INTEGER;
  v_payment_count INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'orders' THEN
    v_order_id := NEW.id;
  ELSIF TG_TABLE_NAME = 'order_items' THEN
    v_order_id := COALESCE(NEW.order_id, OLD.order_id);
  ELSIF TG_TABLE_NAME = 'payment_items' THEN
    SELECT order_id
      INTO v_order_id
      FROM order_items
     WHERE id = COALESCE(NEW.order_item_id, OLD.order_item_id);
  ELSE
    RETURN NULL;
  END IF;

  IF v_order_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT status,
         COALESCE(coupon_discount_cents, 0),
         COALESCE(total_cents, 0)
    INTO v_status, v_order_coupon, v_order_total
    FROM orders
   WHERE id = v_order_id;

  IF v_status IS NULL OR v_status = 'cart' THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(COALESCE(coupon_discount_cents, 0)), 0)
    INTO v_items_coupon
    FROM order_items
   WHERE order_id = v_order_id;

  IF v_items_coupon <> v_order_coupon THEN
    RAISE EXCEPTION
      'Order coupon allocation mismatch (order_id=% items=% order=%)',
      v_order_id, v_items_coupon, v_order_coupon;
  END IF;

  SELECT COALESCE(SUM(COALESCE(pi.allocated_total_cents, 0)), 0),
         COUNT(pi.payment_id)
    INTO v_payment_total, v_payment_count
    FROM payment_items pi
    JOIN order_items oi ON oi.id = pi.order_item_id
   WHERE oi.order_id = v_order_id;

  IF v_payment_count > 0 AND v_payment_total <> v_order_total THEN
    RAISE EXCEPTION
      'Order payment allocation mismatch (order_id=% items=% order=%)',
      v_order_id, v_payment_total, v_order_total;
  END IF;

  RETURN NULL;
END;
$$;


--
-- Name: enforce_payment_item_singleton(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_payment_item_singleton() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_payment_id UUID;
  v_item_count INTEGER;
  v_single_item UUID;
  v_payment_item UUID;
BEGIN
  IF TG_TABLE_NAME = 'payments' THEN
    v_payment_id := NEW.id;
  ELSE
    v_payment_id := COALESCE(NEW.payment_id, OLD.payment_id);
  END IF;

  IF v_payment_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COUNT(*), (ARRAY_AGG(order_item_id))[1]
  INTO v_item_count, v_single_item
  FROM payment_items
  WHERE payment_id = v_payment_id;

  SELECT order_item_id INTO v_payment_item
  FROM payments
  WHERE id = v_payment_id;

  IF v_item_count > 1 THEN
    IF v_payment_item IS NOT NULL THEN
      RAISE EXCEPTION
        'payments.order_item_id must be NULL when payment has multiple items (payment_id=%)',
        v_payment_id;
    END IF;
  ELSIF v_item_count = 1 THEN
    IF v_payment_item IS DISTINCT FROM v_single_item THEN
      RAISE EXCEPTION
        'payments.order_item_id must match payment_items when single item (payment_id=%)',
        v_payment_id;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;


--
-- Name: generate_referral_code(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_referral_code() RETURNS character varying
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: payments_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.payments_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: rpc_calendar_choice(uuid, date, jsonb, inet, text, timestamp with time zone, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_calendar_choice(p_user_id uuid, p_event_date date DEFAULT (timezone('UTC'::text, now()))::date, p_choice jsonb DEFAULT '{}'::jsonb, p_request_ip inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text, p_override_now timestamp with time zone DEFAULT NULL::timestamp with time zone, p_timezone_offset_minutes integer DEFAULT 0) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: rpc_calendar_choice_reset(uuid, date, inet, text, timestamp with time zone, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_calendar_choice_reset(p_user_id uuid, p_event_date date DEFAULT (timezone('UTC'::text, now()))::date, p_request_ip inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text, p_override_now timestamp with time zone DEFAULT NULL::timestamp with time zone, p_timezone_offset_minutes integer DEFAULT 0) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: rpc_calendar_claim(uuid, date, jsonb, inet, text, timestamp with time zone, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_calendar_claim(p_user_id uuid, p_event_date date DEFAULT (timezone('UTC'::text, now()))::date, p_payload jsonb DEFAULT '{}'::jsonb, p_request_ip inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text, p_override_now timestamp with time zone DEFAULT NULL::timestamp with time zone, p_timezone_offset_minutes integer DEFAULT 0) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: rpc_calendar_raffle_draw(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_calendar_raffle_draw(p_raffle_id text, p_seed text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: rpc_calendar_spin(uuid, date, inet, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_calendar_spin(p_user_id uuid, p_event_date date DEFAULT (timezone('UTC'::text, now()))::date, p_request_ip inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: rpc_calendar_validate_upgrade(uuid, date, inet, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_calendar_validate_upgrade(p_user_id uuid, p_event_date date DEFAULT (timezone('UTC'::text, now()))::date, p_request_ip inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: subscriptions_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.subscriptions_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_email_rewards(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_email_rewards() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: update_referral_rewards_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_referral_rewards_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: user_payment_methods_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.user_payment_methods_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    action character varying(120) NOT NULL,
    entity_type character varying(60) NOT NULL,
    entity_id uuid,
    before jsonb,
    after jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    ip_address text,
    user_agent text,
    request_id text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: admin_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subscription_id uuid,
    task_type character varying(50) NOT NULL,
    due_date timestamp without time zone NOT NULL,
    completed_at timestamp without time zone,
    assigned_admin uuid,
    notes text,
    priority character varying(10) DEFAULT 'medium'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    order_id uuid,
    user_id uuid,
    task_category character varying(50),
    sla_due_at timestamp without time zone,
    is_issue boolean DEFAULT false NOT NULL,
    payment_confirmed_at timestamp without time zone,
    mmu_cycle_index integer,
    mmu_cycle_total integer,
    CONSTRAINT admin_tasks_completion_check CHECK (((completed_at IS NULL) OR (completed_at >= created_at))),
    CONSTRAINT admin_tasks_priority_check CHECK (((priority)::text = ANY ((ARRAY['low'::character varying, 'medium'::character varying, 'high'::character varying, 'urgent'::character varying])::text[]))),
    CONSTRAINT admin_tasks_type_check CHECK (((task_type)::text = ANY ((ARRAY['credential_provision'::character varying, 'renewal'::character varying, 'cancellation'::character varying, 'support'::character varying, 'verification'::character varying, 'manual_monthly_upgrade'::character varying])::text[])))
);


--
-- Name: bis_inquiries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bis_inquiries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255) NOT NULL,
    email_normalized character varying(255) NOT NULL,
    topic character varying(20) NOT NULL,
    message text NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT bis_inquiries_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'issue'::character varying, 'cancelled'::character varying, 'solved'::character varying])::text[]))),
    CONSTRAINT bis_inquiries_topic_check CHECK (((topic)::text = ANY ((ARRAY['bug'::character varying, 'issue'::character varying, 'suggestion'::character varying])::text[])))
);


--
-- Name: calendar_achievements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_achievements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    achievement_key text NOT NULL,
    event_date date NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    awarded_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: calendar_event_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_event_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    event_type text NOT NULL,
    event_date date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    ip_address inet,
    user_agent text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: calendar_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_date date NOT NULL,
    slug text NOT NULL,
    types text[] DEFAULT ARRAY[]::text[] NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    claim_window_start timestamp with time zone NOT NULL,
    claim_window_end timestamp with time zone NOT NULL,
    published boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: calendar_metrics_daily; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_metrics_daily (
    metric_date date NOT NULL,
    claims_count integer DEFAULT 0 NOT NULL,
    streak_7_count integer DEFAULT 0 NOT NULL,
    streak_15_count integer DEFAULT 0 NOT NULL,
    vouchers_issued integer DEFAULT 0 NOT NULL,
    vouchers_redeemed integer DEFAULT 0 NOT NULL,
    raffle_entries_added integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: calendar_raffle_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_raffle_entries (
    raffle_id text NOT NULL,
    user_id uuid NOT NULL,
    source text NOT NULL,
    event_date date NOT NULL,
    count integer DEFAULT 0 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: calendar_raffle_entry_controls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_raffle_entry_controls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    raffle_id text NOT NULL,
    user_id uuid NOT NULL,
    weight_multiplier numeric(6,3) DEFAULT 1 NOT NULL,
    excluded boolean DEFAULT false NOT NULL,
    reason text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: calendar_raffle_winners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_raffle_winners (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    raffle_id text NOT NULL,
    user_id uuid NOT NULL,
    "position" integer NOT NULL,
    drawn_at timestamp with time zone DEFAULT now() NOT NULL,
    seed_used text NOT NULL,
    audit_hash text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: calendar_raffles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_raffles (
    id text NOT NULL,
    name text NOT NULL,
    start_at timestamp with time zone NOT NULL,
    end_at timestamp with time zone NOT NULL,
    draw_at timestamp with time zone NOT NULL,
    rules jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'scheduled'::text NOT NULL,
    draw_seed text,
    draw_result jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: calendar_referral_multipliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_referral_multipliers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_date date NOT NULL,
    multiplier numeric(5,2) DEFAULT 1 NOT NULL,
    applies_to text NOT NULL,
    notes text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: calendar_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_settings (
    key text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: calendar_spin_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_spin_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    event_date date NOT NULL,
    wheel_id uuid NOT NULL,
    item_index integer NOT NULL,
    item_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    spun_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: calendar_spin_wheels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_spin_wheels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_date date NOT NULL,
    items jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT calendar_spin_wheels_items_check CHECK ((jsonb_typeof(items) = 'array'::text))
);


--
-- Name: calendar_streaks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_streaks (
    user_id uuid NOT NULL,
    current_streak integer DEFAULT 0 NOT NULL,
    max_streak integer DEFAULT 0 NOT NULL,
    last_claimed_date date,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: calendar_vouchers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_vouchers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    event_date date NOT NULL,
    voucher_type text NOT NULL,
    scope text DEFAULT 'global'::text NOT NULL,
    amount numeric(10,2),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'issued'::text NOT NULL,
    issued_at timestamp with time zone DEFAULT now() NOT NULL,
    redeemed_at timestamp with time zone
);


--
-- Name: coupon_redemptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coupon_redemptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    coupon_id uuid NOT NULL,
    user_id uuid NOT NULL,
    order_id uuid,
    status character varying(20) DEFAULT 'reserved'::character varying NOT NULL,
    reserved_at timestamp without time zone DEFAULT now() NOT NULL,
    redeemed_at timestamp without time zone,
    expires_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT coupon_redemptions_status_check CHECK (((status)::text = ANY ((ARRAY['reserved'::character varying, 'redeemed'::character varying, 'expired'::character varying, 'voided'::character varying])::text[])))
);


--
-- Name: coupons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coupons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(64) NOT NULL,
    code_normalized character varying(64) NOT NULL,
    percent_off numeric(5,2) NOT NULL,
    scope character varying(20) DEFAULT 'global'::character varying NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    starts_at timestamp without time zone,
    ends_at timestamp without time zone,
    max_redemptions integer,
    bound_user_id uuid,
    first_order_only boolean DEFAULT false NOT NULL,
    category character varying(80),
    product_id uuid,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    term_months integer,
    apply_scope character varying(30) DEFAULT 'highest_eligible_item'::character varying NOT NULL,
    CONSTRAINT coupons_apply_scope_check CHECK (((apply_scope)::text = ANY ((ARRAY['highest_eligible_item'::character varying, 'order_total'::character varying])::text[]))),
    CONSTRAINT coupons_max_redemptions_check CHECK ((max_redemptions >= 0)),
    CONSTRAINT coupons_percent_off_check CHECK (((percent_off >= (0)::numeric) AND (percent_off <= (100)::numeric))),
    CONSTRAINT coupons_scope_check CHECK (((scope)::text = ANY ((ARRAY['global'::character varying, 'category'::character varying, 'product'::character varying])::text[]))),
    CONSTRAINT coupons_scope_target_check CHECK (((((scope)::text = 'global'::text) AND (category IS NULL) AND (product_id IS NULL)) OR (((scope)::text = 'category'::text) AND (category IS NOT NULL) AND (product_id IS NULL)) OR (((scope)::text = 'product'::text) AND (product_id IS NOT NULL) AND (category IS NULL)))),
    CONSTRAINT coupons_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'inactive'::character varying])::text[]))),
    CONSTRAINT coupons_term_months_check CHECK (((term_months IS NULL) OR (term_months > 0)))
);


--
-- Name: credential_reveal_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.credential_reveal_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    subscription_id uuid,
    success boolean DEFAULT false NOT NULL,
    failure_reason text,
    metadata jsonb DEFAULT '{}'::jsonb,
    ip_address text,
    user_agent text,
    request_id text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE credential_reveal_audit_logs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.credential_reveal_audit_logs IS 'Audit log for credential reveal attempts';


--
-- Name: COLUMN credential_reveal_audit_logs.success; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.credential_reveal_audit_logs.success IS 'Whether the credential reveal succeeded';


--
-- Name: COLUMN credential_reveal_audit_logs.failure_reason; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.credential_reveal_audit_logs.failure_reason IS 'Failure reason if reveal failed';


--
-- Name: credit_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.credit_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type character varying(20) NOT NULL,
    amount numeric(18,8) NOT NULL,
    balance_before numeric(18,8) DEFAULT 0,
    balance_after numeric(18,8) DEFAULT 0,
    description text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    payment_id character varying(100),
    payment_provider character varying(20) DEFAULT 'nowpayments'::character varying,
    payment_status character varying(20),
    payment_currency character varying(10),
    payment_amount numeric(18,8),
    blockchain_hash character varying(100),
    monitoring_status character varying(20) DEFAULT 'pending'::character varying,
    last_monitored_at timestamp without time zone,
    retry_count integer DEFAULT 0,
    order_id uuid,
    product_variant_id uuid,
    price_cents integer,
    currency character varying(10),
    auto_renew boolean,
    next_billing_at timestamp without time zone,
    renewal_method character varying(20),
    status_reason text,
    referral_reward_id uuid,
    pre_launch_reward_id uuid,
    order_item_id uuid,
    CONSTRAINT credit_transactions_amount_sign_check CHECK (((((type)::text = ANY ((ARRAY['deposit'::character varying, 'bonus'::character varying, 'refund'::character varying])::text[])) AND (amount >= (0)::numeric)) OR (((type)::text = ANY ((ARRAY['purchase'::character varying, 'withdrawal'::character varying, 'refund_reversal'::character varying])::text[])) AND (amount <= (0)::numeric)))),
    CONSTRAINT credit_transactions_monitoring_status_check CHECK (((monitoring_status)::text = ANY ((ARRAY['pending'::character varying, 'monitoring'::character varying, 'completed'::character varying, 'failed'::character varying, 'skipped'::character varying])::text[]))),
    CONSTRAINT credit_transactions_payment_provider_check CHECK (((payment_provider IS NULL) OR ((payment_provider)::text = ANY ((ARRAY['nowpayments'::character varying, 'stripe'::character varying, 'pay4bit'::character varying, 'paypal'::character varying, 'payop'::character varying, 'antom'::character varying, 'manual'::character varying, 'admin'::character varying])::text[])))),
    CONSTRAINT credit_transactions_payment_status_check CHECK (((payment_status IS NULL) OR ((payment_status)::text = ANY ((ARRAY['pending'::character varying, 'waiting'::character varying, 'confirming'::character varying, 'confirmed'::character varying, 'sending'::character varying, 'partially_paid'::character varying, 'finished'::character varying, 'failed'::character varying, 'refunded'::character varying, 'expired'::character varying])::text[]))))
);


--
-- Name: fx_rate_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fx_rate_cache (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    base_currency character varying(10) NOT NULL,
    quote_currency character varying(10) NOT NULL,
    rate numeric(20,10) NOT NULL,
    fetched_at timestamp without time zone NOT NULL,
    source_fetch_id uuid,
    is_lkg boolean DEFAULT false NOT NULL,
    stale_after timestamp without time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT fx_rate_cache_rate_check CHECK ((rate > (0)::numeric))
);


--
-- Name: fx_rate_fetches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fx_rate_fetches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source character varying(50) DEFAULT 'currencyapi'::character varying NOT NULL,
    base_currency character varying(10) DEFAULT 'USD'::character varying NOT NULL,
    status character varying(20) NOT NULL,
    fetch_started_at timestamp without time zone DEFAULT now() NOT NULL,
    fetch_completed_at timestamp without time zone,
    http_status integer,
    rates_count integer,
    is_success boolean DEFAULT false NOT NULL,
    error_code character varying(100),
    error_message text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT fx_rate_fetches_status_check CHECK (((status)::text = ANY ((ARRAY['success'::character varying, 'failed'::character varying, 'skipped'::character varying])::text[])))
);


--
-- Name: guest_claim_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guest_claim_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    guest_identity_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: guest_identities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guest_identities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    user_id uuid,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    last_used_at timestamp without time zone
);


--
-- Name: maxmind_risk_assessments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.maxmind_risk_assessments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    user_id uuid NOT NULL,
    trigger_type character varying(40) DEFAULT 'repeat_material_change'::character varying NOT NULL,
    trigger_reasons jsonb DEFAULT '[]'::jsonb NOT NULL,
    should_run boolean DEFAULT true NOT NULL,
    decision character varying(20) DEFAULT 'allow'::character varying NOT NULL,
    risk_score numeric(5,2),
    risk_score_reason text,
    ip_address text,
    country_code character varying(2),
    device_fingerprint text,
    payment_fingerprint text,
    amount_cents integer,
    currency character varying(10),
    is_first_order boolean DEFAULT false NOT NULL,
    provider character varying(30),
    local_signals jsonb DEFAULT '{}'::jsonb NOT NULL,
    maxmind_request jsonb,
    maxmind_response jsonb,
    error_message text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    evaluated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT maxmind_risk_decision_check CHECK (((decision)::text = ANY ((ARRAY['allow'::character varying, 'review'::character varying, 'block'::character varying, 'skipped'::character varying, 'error'::character varying])::text[]))),
    CONSTRAINT maxmind_risk_score_range_check CHECK (((risk_score IS NULL) OR ((risk_score >= (0)::numeric) AND (risk_score <= (100)::numeric)))),
    CONSTRAINT maxmind_risk_trigger_type_check CHECK (((trigger_type)::text = ANY ((ARRAY['first_order'::character varying, 'repeat_material_change'::character varying, 'manual_review'::character varying])::text[])))
);


--
-- Name: newsletter_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.newsletter_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255) NOT NULL,
    email_normalized character varying(255) NOT NULL,
    status character varying(20) DEFAULT 'subscribed'::character varying NOT NULL,
    source character varying(60),
    coupon_id uuid,
    coupon_code character varying(64),
    coupon_sent_at timestamp without time zone,
    subscribed_at timestamp without time zone DEFAULT now() NOT NULL,
    unsubscribed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT newsletter_status_check CHECK (((status)::text = ANY ((ARRAY['subscribed'::character varying, 'unsubscribed'::character varying])::text[])))
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    read_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    order_id uuid,
    subscription_id uuid,
    dedupe_key text NOT NULL,
    cleared_at timestamp without time zone
);


--
-- Name: TABLE notifications; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.notifications IS 'User-facing notifications with read tracking';


--
-- Name: COLUMN notifications.dedupe_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notifications.dedupe_key IS 'Idempotency key to prevent duplicate notifications';


--
-- Name: order_compliance_evidence_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_compliance_evidence_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    user_id uuid,
    event_type text NOT NULL,
    customer_email text,
    paypal_order_id text,
    paypal_transaction_id text,
    ip_address text,
    product_delivered jsonb,
    delivery_timestamp timestamp without time zone,
    license_account_access_evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT order_compliance_evidence_logs_event_type_check CHECK ((event_type = ANY (ARRAY['paypal_payment_capture'::text, 'order_delivery'::text, 'credential_reveal'::text])))
);


--
-- Name: TABLE order_compliance_evidence_logs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.order_compliance_evidence_logs IS 'Compliance evidence for payment, delivery, and credential-access actions';


--
-- Name: COLUMN order_compliance_evidence_logs.product_delivered; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.order_compliance_evidence_logs.product_delivered IS 'JSON array snapshot of delivered products';


--
-- Name: COLUMN order_compliance_evidence_logs.license_account_access_evidence; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.order_compliance_evidence_logs.license_account_access_evidence IS 'Evidence payload for account access/license reveal actions';


--
-- Name: order_item_upgrade_selections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_item_upgrade_selections (
    order_item_id uuid NOT NULL,
    selection_type character varying(50),
    account_identifier text,
    credentials_encrypted text,
    manual_monthly_acknowledged_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT order_item_upgrade_selections_type_check CHECK (((selection_type IS NULL) OR ((selection_type)::text = ANY ((ARRAY['upgrade_new_account'::character varying, 'upgrade_own_account'::character varying])::text[]))))
);


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    product_variant_id uuid,
    quantity integer DEFAULT 1 NOT NULL,
    unit_price_cents integer NOT NULL,
    currency character varying(10) NOT NULL,
    total_price_cents integer NOT NULL,
    description text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    term_months integer,
    base_price_cents integer,
    discount_percent numeric(5,2),
    auto_renew boolean,
    coupon_discount_cents integer,
    settlement_currency character varying(10),
    settlement_unit_price_cents integer,
    settlement_base_price_cents integer,
    settlement_coupon_discount_cents integer,
    settlement_total_price_cents integer,
    CONSTRAINT order_items_base_price_cents_check CHECK ((base_price_cents >= 0)),
    CONSTRAINT order_items_coupon_discount_cents_check CHECK ((coupon_discount_cents >= 0)),
    CONSTRAINT order_items_discount_percent_check CHECK (((discount_percent >= (0)::numeric) AND (discount_percent <= (100)::numeric))),
    CONSTRAINT order_items_quantity_check CHECK ((quantity > 0)),
    CONSTRAINT order_items_settlement_base_price_cents_check CHECK ((settlement_base_price_cents >= 0)),
    CONSTRAINT order_items_settlement_coupon_discount_cents_check CHECK ((settlement_coupon_discount_cents >= 0)),
    CONSTRAINT order_items_settlement_total_price_cents_check CHECK ((settlement_total_price_cents >= 0)),
    CONSTRAINT order_items_settlement_unit_price_cents_check CHECK ((settlement_unit_price_cents >= 0)),
    CONSTRAINT order_items_term_months_check CHECK ((term_months > 0)),
    CONSTRAINT order_items_total_price_cents_check CHECK ((total_price_cents >= 0)),
    CONSTRAINT order_items_unit_price_cents_check CHECK ((unit_price_cents >= 0))
);


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    status character varying(30) DEFAULT 'cart'::character varying NOT NULL,
    status_reason text,
    currency character varying(10),
    subtotal_cents integer,
    discount_cents integer DEFAULT 0,
    total_cents integer,
    paid_with_credits boolean DEFAULT false NOT NULL,
    auto_renew boolean DEFAULT false NOT NULL,
    payment_provider character varying(20),
    payment_reference character varying(150),
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    term_months integer,
    coupon_id uuid,
    coupon_code character varying(64),
    coupon_discount_cents integer,
    contact_email text,
    checkout_session_key text,
    checkout_mode character varying(20),
    stripe_session_id character varying(150),
    pricing_snapshot_id uuid,
    settlement_currency character varying(10),
    settlement_total_cents integer,
    CONSTRAINT orders_coupon_discount_cents_check CHECK ((coupon_discount_cents >= 0)),
    CONSTRAINT orders_discount_cents_check CHECK ((discount_cents >= 0)),
    CONSTRAINT orders_payment_provider_check CHECK (((payment_provider IS NULL) OR ((payment_provider)::text = ANY ((ARRAY['credits'::character varying, 'nowpayments'::character varying, 'stripe'::character varying, 'pay4bit'::character varying, 'paypal'::character varying, 'payop'::character varying, 'antom'::character varying, 'manual'::character varying, 'admin'::character varying])::text[])))),
    CONSTRAINT orders_settlement_total_cents_check CHECK ((settlement_total_cents >= 0)),
    CONSTRAINT orders_status_check CHECK (((status)::text = ANY ((ARRAY['cart'::character varying, 'pending_payment'::character varying, 'paid'::character varying, 'in_process'::character varying, 'delivered'::character varying, 'cancelled'::character varying])::text[]))),
    CONSTRAINT orders_subtotal_cents_check CHECK ((subtotal_cents >= 0)),
    CONSTRAINT orders_term_months_check CHECK ((term_months > 0)),
    CONSTRAINT orders_total_cents_check CHECK ((total_cents >= 0))
);


--
-- Name: payment_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider character varying(30) NOT NULL,
    event_id character varying(150) NOT NULL,
    event_type character varying(100) NOT NULL,
    order_id uuid,
    payment_id uuid,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: payment_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_items (
    payment_id uuid NOT NULL,
    order_item_id uuid NOT NULL,
    allocated_subtotal_cents integer NOT NULL,
    allocated_discount_cents integer NOT NULL,
    allocated_total_cents integer NOT NULL,
    CONSTRAINT payment_items_allocated_discount_cents_check CHECK ((allocated_discount_cents >= 0)),
    CONSTRAINT payment_items_allocated_subtotal_cents_check CHECK ((allocated_subtotal_cents >= 0)),
    CONSTRAINT payment_items_allocated_total_cents_check CHECK ((allocated_total_cents >= 0))
);


--
-- Name: payment_refunds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_refunds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payment_id character varying(100) NOT NULL,
    user_id uuid NOT NULL,
    amount numeric(18,8) NOT NULL,
    reason character varying(50) NOT NULL,
    description text,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    approved_by uuid,
    processed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT payment_refunds_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT payment_refunds_reason_check CHECK (((reason)::text = ANY ((ARRAY['user_request'::character varying, 'payment_error'::character varying, 'service_issue'::character varying, 'overpayment'::character varying, 'admin_decision'::character varying, 'dispute'::character varying])::text[]))),
    CONSTRAINT payment_refunds_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'processing'::character varying, 'completed'::character varying, 'failed'::character varying, 'rejected'::character varying])::text[])))
);


--
-- Name: payment_monitoring_dashboard; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.payment_monitoring_dashboard AS
 SELECT payment_id,
    user_id,
    payment_status,
    monitoring_status,
    payment_currency,
    payment_amount,
    retry_count,
    last_monitored_at,
    created_at AS payment_created_at,
    updated_at AS last_updated,
        CASE
            WHEN ((payment_status)::text = ANY ((ARRAY['finished'::character varying, 'failed'::character varying, 'expired'::character varying, 'refunded'::character varying])::text[])) THEN 'final'::text
            WHEN (last_monitored_at < (now() - '01:00:00'::interval)) THEN 'stale'::text
            WHEN (retry_count >= 3) THEN 'high_retry'::text
            ELSE 'normal'::text
        END AS monitoring_priority,
    (EXISTS ( SELECT 1
           FROM public.payment_refunds pr
          WHERE ((pr.payment_id)::text = (ct.payment_id)::text))) AS has_refund_request
   FROM public.credit_transactions ct
  WHERE (payment_id IS NOT NULL)
  ORDER BY
        CASE
            WHEN ((payment_status)::text = ANY ((ARRAY['pending'::character varying, 'waiting'::character varying, 'confirming'::character varying, 'confirmed'::character varying, 'sending'::character varying, 'partially_paid'::character varying])::text[])) THEN 1
            ELSE 2
        END, retry_count DESC, last_monitored_at NULLS FIRST;


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider character varying(20) NOT NULL,
    provider_payment_id character varying(150) NOT NULL,
    status character varying(30) DEFAULT 'pending'::character varying NOT NULL,
    provider_status character varying(50),
    purpose character varying(30) DEFAULT 'credit_topup'::character varying NOT NULL,
    amount numeric(18,8) NOT NULL,
    currency character varying(10) NOT NULL,
    amount_usd numeric(18,8),
    payment_method_type character varying(30),
    subscription_id uuid,
    credit_transaction_id uuid,
    expires_at timestamp without time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    order_id uuid,
    product_variant_id uuid,
    price_cents integer,
    auto_renew boolean,
    next_billing_at timestamp without time zone,
    renewal_method character varying(20),
    status_reason text,
    term_months integer,
    base_price_cents integer,
    discount_percent numeric(5,2),
    checkout_mode character varying(20),
    stripe_session_id character varying(150),
    order_item_id uuid,
    CONSTRAINT payments_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT payments_base_price_cents_check CHECK ((base_price_cents >= 0)),
    CONSTRAINT payments_discount_percent_check CHECK (((discount_percent >= (0)::numeric) AND (discount_percent <= (100)::numeric))),
    CONSTRAINT payments_provider_check CHECK (((provider)::text = ANY ((ARRAY['nowpayments'::character varying, 'stripe'::character varying, 'pay4bit'::character varying, 'paypal'::character varying, 'payop'::character varying, 'antom'::character varying, 'manual'::character varying, 'admin'::character varying])::text[]))),
    CONSTRAINT payments_purpose_check CHECK (((purpose)::text = ANY ((ARRAY['subscription'::character varying, 'credit_topup'::character varying, 'one_time'::character varying])::text[]))),
    CONSTRAINT payments_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'requires_payment_method'::character varying, 'requires_action'::character varying, 'processing'::character varying, 'succeeded'::character varying, 'failed'::character varying, 'canceled'::character varying, 'expired'::character varying])::text[]))),
    CONSTRAINT payments_term_months_check CHECK ((term_months > 0))
);


--
-- Name: TABLE payments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.payments IS 'Unified payment intents across providers (Stripe, NOWPayments, manual)';


--
-- Name: COLUMN payments.provider; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.payments.provider IS 'Payment provider (nowpayments, stripe, manual, admin)';


--
-- Name: COLUMN payments.provider_payment_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.payments.provider_payment_id IS 'Provider-specific payment/intent identifier';


--
-- Name: COLUMN payments.purpose; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.payments.purpose IS 'Business purpose of the payment (subscription, credit_topup, one_time)';


--
-- Name: COLUMN payments.credit_transaction_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.payments.credit_transaction_id IS 'Linked credit transaction when the payment funds credits';


--
-- Name: pin_reset_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pin_reset_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    requested_by uuid,
    confirmed_by uuid,
    code_hash text NOT NULL,
    code_salt text NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    confirmed_at timestamp without time zone,
    CONSTRAINT pin_reset_requests_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'confirmed'::character varying, 'expired'::character varying, 'superseded'::character varying, 'failed'::character varying])::text[])))
);


--
-- Name: pre_launch_rewards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pre_launch_rewards (
    user_id uuid NOT NULL,
    free_months integer DEFAULT 0,
    founder_status boolean DEFAULT false,
    prize_won character varying(100),
    referral_count_at_award integer DEFAULT 0,
    awarded_at timestamp without time zone DEFAULT now(),
    notes text,
    redeemed_by_user_id uuid,
    redeemed_at timestamp without time zone,
    applied_value_cents integer,
    CONSTRAINT rewards_free_months_valid CHECK ((free_months = ANY (ARRAY[0, 1, 3, 12])))
);


--
-- Name: TABLE pre_launch_rewards; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.pre_launch_rewards IS 'Rewards earned during pre-launch - migrates to main platform as user_perks';


--
-- Name: pre_registrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pre_registrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255) NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    last_login timestamp without time zone,
    referral_code character varying(20) NOT NULL,
    referred_by_code character varying(20),
    ip_address inet,
    user_agent text,
    source character varying(50) DEFAULT 'organic'::character varying,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    email_verified boolean DEFAULT false,
    verification_token character varying(100),
    verification_sent_at timestamp without time zone,
    username character varying(15),
    password_hash text,
    supabase_auth_id uuid,
    user_id uuid,
    CONSTRAINT pre_reg_email_format_check CHECK (((email)::text ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'::text)),
    CONSTRAINT pre_reg_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'verified'::character varying, 'active'::character varying, 'inactive'::character varying])::text[]))),
    CONSTRAINT username_format_check CHECK (((username)::text ~* '^[a-zA-Z0-9_]+$'::text)),
    CONSTRAINT username_length_check CHECK (((char_length((username)::text) >= 3) AND (char_length((username)::text) <= 15)))
);


--
-- Name: TABLE pre_registrations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.pre_registrations IS 'Pre-launch user registrations - will migrate to users table after campaign';


--
-- Name: COLUMN pre_registrations.referral_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pre_registrations.referral_code IS 'Unique code for this user to share with others';


--
-- Name: COLUMN pre_registrations.referred_by_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pre_registrations.referred_by_code IS 'Code of the person who referred this user';


--
-- Name: price_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.price_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_variant_id uuid NOT NULL,
    price_cents integer NOT NULL,
    currency character varying(10) NOT NULL,
    starts_at timestamp without time zone DEFAULT now() NOT NULL,
    ends_at timestamp without time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT price_history_price_cents_check CHECK ((price_cents >= 0)),
    CONSTRAINT price_history_window_check CHECK (((ends_at IS NULL) OR (ends_at > starts_at)))
);


--
-- Name: pricing_publish_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pricing_publish_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    snapshot_id uuid DEFAULT gen_random_uuid() NOT NULL,
    status character varying(20) DEFAULT 'started'::character varying NOT NULL,
    triggered_by character varying(30) DEFAULT 'scheduler'::character varying NOT NULL,
    fx_fetch_id uuid,
    published_at timestamp without time zone,
    reason text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT pricing_publish_runs_status_check CHECK (((status)::text = ANY ((ARRAY['started'::character varying, 'succeeded'::character varying, 'failed'::character varying, 'skipped'::character varying])::text[]))),
    CONSTRAINT pricing_publish_runs_triggered_by_check CHECK (((triggered_by)::text = ANY ((ARRAY['scheduler'::character varying, 'manual'::character varying, 'system'::character varying])::text[])))
);


--
-- Name: product_category_map; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_category_map (
    product_id uuid NOT NULL,
    category_key character varying(120) NOT NULL,
    category character varying(120) NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_category_map_category_check CHECK ((btrim((category)::text) <> ''::text)),
    CONSTRAINT product_category_map_category_key_check CHECK (((btrim((category_key)::text) <> ''::text) AND ((category_key)::text = lower(btrim((category_key)::text)))))
);


--
-- Name: product_fixed_price_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_fixed_price_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    price_cents integer NOT NULL,
    currency character varying(10) NOT NULL,
    starts_at timestamp without time zone DEFAULT now() NOT NULL,
    ends_at timestamp without time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_fixed_price_history_price_cents_check CHECK ((price_cents >= 0)),
    CONSTRAINT product_fixed_price_history_window_check CHECK (((ends_at IS NULL) OR (ends_at > starts_at)))
);


--
-- Name: product_label_map; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_label_map (
    product_id uuid NOT NULL,
    label_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: product_labels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_labels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    slug character varying(100) NOT NULL,
    description text,
    color character varying(20),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: product_media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    media_type character varying(20) NOT NULL,
    url text NOT NULL,
    alt_text character varying(200),
    sort_order integer DEFAULT 0 NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_media_type_check CHECK (((media_type)::text = ANY ((ARRAY['image'::character varying, 'video'::character varying])::text[])))
);


--
-- Name: product_sub_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_sub_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category character varying(120) NOT NULL,
    name character varying(120) NOT NULL,
    slug character varying(160) NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: product_sub_category_map; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_sub_category_map (
    product_id uuid NOT NULL,
    sub_category_id uuid NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: product_variant_terms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_variant_terms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_variant_id uuid NOT NULL,
    months integer NOT NULL,
    discount_percent numeric(5,2),
    is_active boolean DEFAULT true NOT NULL,
    is_recommended boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_variant_terms_discount_percent_check CHECK (((discount_percent >= (0)::numeric) AND (discount_percent <= (100)::numeric))),
    CONSTRAINT product_variant_terms_months_check CHECK ((months > 0))
);


--
-- Name: product_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_variants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    name character varying(150) NOT NULL,
    variant_code character varying(50),
    description text,
    service_plan character varying(50),
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(150) NOT NULL,
    slug character varying(150) NOT NULL,
    description text,
    service_type character varying(50),
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    logo_key character varying(150),
    category character varying(100),
    default_currency character varying(10),
    max_subscriptions integer,
    sub_category character varying(120),
    duration_months integer,
    fixed_price_cents integer,
    fixed_price_currency character varying(10),
    CONSTRAINT products_duration_months_check CHECK (((duration_months IS NULL) OR (duration_months > 0))),
    CONSTRAINT products_fixed_price_cents_check CHECK (((fixed_price_cents IS NULL) OR (fixed_price_cents >= 0))),
    CONSTRAINT products_fixed_price_pair_check CHECK ((((fixed_price_cents IS NULL) AND (fixed_price_currency IS NULL)) OR ((fixed_price_cents IS NOT NULL) AND (fixed_price_currency IS NOT NULL)))),
    CONSTRAINT products_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'inactive'::character varying])::text[])))
);


--
-- Name: referral_rewards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referral_rewards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    reward_type character varying(50) NOT NULL,
    tier character varying(50) NOT NULL,
    free_months integer NOT NULL,
    applies_to character varying(50) NOT NULL,
    is_redeemed boolean DEFAULT false,
    earned_at timestamp without time zone DEFAULT now(),
    redeemed_at timestamp without time zone,
    subscription_id character varying(255),
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    redeemed_by_user_id uuid,
    applied_value_cents integer,
    CONSTRAINT referral_rewards_applies_to_check CHECK (((applies_to)::text = ANY ((ARRAY['first_purchase'::character varying, 'min_1_year'::character varying, 'min_2_years'::character varying])::text[]))),
    CONSTRAINT referral_rewards_free_months_check CHECK ((free_months > 0)),
    CONSTRAINT referral_rewards_reward_type_check CHECK (((reward_type)::text = ANY ((ARRAY['email_reward'::character varying, 'purchase_reward'::character varying])::text[]))),
    CONSTRAINT referral_rewards_tier_check CHECK (((tier)::text = ANY ((ARRAY['1_friend'::character varying, '10_friends'::character varying, '25_friends'::character varying])::text[])))
);


--
-- Name: TABLE referral_rewards; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.referral_rewards IS 'Tracks both email-based and purchase-based referral rewards';


--
-- Name: COLUMN referral_rewards.reward_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.referral_rewards.reward_type IS 'Type of reward: email_reward (immediate) or purchase_reward (contest-based)';


--
-- Name: COLUMN referral_rewards.tier; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.referral_rewards.tier IS 'Referral milestone: 1_friend, 10_friends, or 25_friends';


--
-- Name: COLUMN referral_rewards.free_months; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.referral_rewards.free_months IS 'Number of free months earned';


--
-- Name: COLUMN referral_rewards.applies_to; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.referral_rewards.applies_to IS 'Purchase requirement: first_purchase, min_1_year, or min_2_years';


--
-- Name: COLUMN referral_rewards.is_redeemed; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.referral_rewards.is_redeemed IS 'Whether the reward has been applied to a subscription';


--
-- Name: COLUMN referral_rewards.subscription_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.referral_rewards.subscription_id IS 'ID of subscription that used this reward (if redeemed)';


--
-- Name: referrals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referrals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    referrer_code character varying(20) NOT NULL,
    referred_email character varying(255) NOT NULL,
    referred_user_id uuid,
    status character varying(20) DEFAULT 'pending'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    completed_at timestamp without time zone,
    ip_address inet,
    purchase_date timestamp without time zone,
    purchase_amount numeric(10,2) DEFAULT 0,
    purchase_verified boolean DEFAULT false,
    CONSTRAINT referrals_purchase_amount_check CHECK ((purchase_amount >= (0)::numeric)),
    CONSTRAINT referrals_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'completed'::character varying, 'rewarded'::character varying])::text[])))
);


--
-- Name: TABLE referrals; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.referrals IS 'Tracks all referral relationships during pre-launch campaign';


--
-- Name: COLUMN referrals.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.referrals.status IS 'pending=signed up, completed=verified email, rewarded=reward applied';


--
-- Name: COLUMN referrals.purchase_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.referrals.purchase_date IS 'Date when referred user made their first purchase (for contest tracking)';


--
-- Name: COLUMN referrals.purchase_amount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.referrals.purchase_amount IS 'Amount of first purchase by referred user';


--
-- Name: COLUMN referrals.purchase_verified; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.referrals.purchase_verified IS 'Whether referred user has made a purchase (for contest eligibility)';


--
-- Name: refund_management_dashboard; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.refund_management_dashboard AS
 SELECT pr.id AS refund_id,
    pr.payment_id,
    pr.user_id,
    pr.amount,
    pr.reason,
    pr.status,
    pr.created_at AS requested_at,
    pr.approved_by,
    pr.processed_at,
    ct.payment_status,
    ct.payment_amount AS original_payment_amount,
    ct.payment_currency,
    (EXTRACT(epoch FROM (now() - (pr.created_at)::timestamp with time zone)) / (3600)::numeric) AS hours_pending,
        CASE
            WHEN (((pr.status)::text = 'pending'::text) AND (pr.created_at < (now() - '24:00:00'::interval))) THEN 'urgent'::text
            WHEN (((pr.status)::text = 'pending'::text) AND (pr.created_at < (now() - '04:00:00'::interval))) THEN 'attention'::text
            ELSE 'normal'::text
        END AS priority_level
   FROM (public.payment_refunds pr
     LEFT JOIN public.credit_transactions ct ON (((ct.payment_id)::text = (pr.payment_id)::text)))
  ORDER BY
        CASE pr.status
            WHEN 'pending'::text THEN 1
            WHEN 'approved'::text THEN 2
            WHEN 'processing'::text THEN 3
            ELSE 4
        END, pr.created_at DESC;


--
-- Name: share_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.share_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    platform character varying(20) NOT NULL,
    referral_code character varying(20) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT share_events_platform_check CHECK (((platform)::text = ANY ((ARRAY['twitter'::character varying, 'facebook'::character varying, 'linkedin'::character varying, 'whatsapp'::character varying, 'email'::character varying, 'copy'::character varying])::text[])))
);


--
-- Name: subscription_reminder_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_reminder_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subscription_id uuid NOT NULL,
    reminder_stage character varying(10) NOT NULL,
    target_expiry_at timestamp without time zone NOT NULL,
    notification_id uuid,
    email_sent_at timestamp without time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT subscription_reminder_events_stage_check CHECK (((reminder_stage)::text = ANY ((ARRAY['7d'::character varying, '3d'::character varying, '24h'::character varying])::text[])))
);


--
-- Name: subscription_renewals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_renewals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subscription_id uuid NOT NULL,
    cycle_end_date date NOT NULL,
    status character varying(30) DEFAULT 'pending'::character varying NOT NULL,
    invoice_payment_id uuid,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: subscription_upgrade_selections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_upgrade_selections (
    subscription_id uuid NOT NULL,
    order_id uuid,
    selection_type character varying(50),
    account_identifier text,
    credentials_encrypted text,
    manual_monthly_acknowledged_at timestamp without time zone,
    submitted_at timestamp without time zone,
    locked_at timestamp without time zone,
    reminder_24h_at timestamp without time zone,
    reminder_48h_at timestamp without time zone,
    auto_selected_at timestamp without time zone,
    upgrade_options_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT subscription_upgrade_selections_type_check CHECK (((selection_type IS NULL) OR ((selection_type)::text = ANY ((ARRAY['upgrade_new_account'::character varying, 'upgrade_own_account'::character varying])::text[]))))
);


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    service_type text NOT NULL,
    service_plan text NOT NULL,
    start_date timestamp without time zone NOT NULL,
    end_date timestamp without time zone NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    order_id uuid,
    product_variant_id uuid,
    price_cents integer,
    currency character varying(10),
    auto_renew boolean,
    next_billing_at timestamp without time zone,
    renewal_method character varying(20),
    status_reason text,
    referral_reward_id uuid,
    pre_launch_reward_id uuid,
    renewal_date timestamp without time zone,
    billing_payment_method_id uuid,
    auto_renew_enabled_at timestamp without time zone,
    auto_renew_disabled_at timestamp without time zone,
    term_months integer,
    base_price_cents integer,
    discount_percent numeric(5,2),
    metadata jsonb,
    credentials_encrypted text,
    term_start_at timestamp without time zone,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    renewal_invoice_payment_id uuid,
    renewal_invoice_status character varying(30),
    order_item_id uuid,
    CONSTRAINT subscriptions_base_price_cents_check CHECK ((base_price_cents >= 0)),
    CONSTRAINT subscriptions_date_order_check CHECK ((start_date <= end_date)),
    CONSTRAINT subscriptions_discount_percent_check CHECK (((discount_percent >= (0)::numeric) AND (discount_percent <= (100)::numeric))),
    CONSTRAINT subscriptions_renewal_check CHECK ((renewal_date >= start_date)),
    CONSTRAINT subscriptions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'expired'::text, 'cancelled'::text, 'pending'::text]))),
    CONSTRAINT subscriptions_term_months_check CHECK ((term_months > 0))
);


--
-- Name: COLUMN subscriptions.renewal_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.subscriptions.renewal_date IS 'Next renewal date for the subscription';


--
-- Name: user_calendar_claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_calendar_claims (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    event_date date NOT NULL,
    claimed_at timestamp with time zone DEFAULT now() NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'claimed'::text NOT NULL
);


--
-- Name: user_payment_methods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_payment_methods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider character varying(20) NOT NULL,
    provider_customer_id character varying(150),
    provider_payment_method_id character varying(150) NOT NULL,
    brand character varying(50),
    last4 character varying(4),
    exp_month integer,
    exp_year integer,
    status character varying(30) DEFAULT 'active'::character varying NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    setup_intent_id character varying(150),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_payment_methods_provider_check CHECK (((provider)::text = 'stripe'::text)),
    CONSTRAINT user_payment_methods_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'revoked'::character varying, 'expired'::character varying, 'requires_action'::character varying])::text[])))
);


--
-- Name: user_perks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_perks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    source_type character varying(30) NOT NULL,
    source_id uuid NOT NULL,
    reward_type character varying(50) NOT NULL,
    tier character varying(50),
    applies_to character varying(50),
    free_months integer,
    founder_status boolean,
    prize_won character varying(100),
    notes text,
    awarded_at timestamp without time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_perks_reward_type_check CHECK (((reward_type)::text = ANY ((ARRAY['pre_launch'::character varying, 'email_reward'::character varying, 'purchase_reward'::character varying])::text[]))),
    CONSTRAINT user_perks_source_type_check CHECK (((source_type)::text = ANY ((ARRAY['pre_launch_reward'::character varying, 'referral_reward'::character varying])::text[])))
);


--
-- Name: user_raffle_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_raffle_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    raffle_id text NOT NULL,
    source text NOT NULL,
    event_date date NOT NULL,
    count integer DEFAULT 0 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_raffle_entries_count_check CHECK ((count >= 0))
);


--
-- Name: user_status_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_status_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    old_status text NOT NULL,
    new_status text NOT NULL,
    reason text,
    changed_by uuid,
    changed_at timestamp without time zone DEFAULT now() NOT NULL,
    ip_address text
);


--
-- Name: user_vouchers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_vouchers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    source_type character varying(30) NOT NULL,
    source_id uuid,
    event_date date,
    voucher_type text NOT NULL,
    scope text DEFAULT 'global'::text NOT NULL,
    amount numeric(10,2),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'issued'::text NOT NULL,
    issued_at timestamp with time zone DEFAULT now() NOT NULL,
    redeemed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    first_name text,
    last_name text,
    status text DEFAULT 'active'::text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    last_login timestamp without time zone,
    display_name character varying(100),
    user_timezone character varying(50),
    language_preference character varying(10),
    notification_preferences jsonb DEFAULT '{}'::jsonb,
    profile_updated_at timestamp without time zone DEFAULT now(),
    pre_registration_id uuid,
    pin_hash text,
    pin_set_at timestamp without time zone,
    pin_failed_attempts integer DEFAULT 0 NOT NULL,
    pin_locked_until timestamp without time zone,
    email_verified_at timestamp without time zone,
    stripe_customer_id character varying(150),
    is_guest boolean DEFAULT false NOT NULL,
    guest_claimed_at timestamp without time zone,
    CONSTRAINT users_email_format_check CHECK ((email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'::text)),
    CONSTRAINT users_pin_failed_attempts_check CHECK ((pin_failed_attempts >= 0)),
    CONSTRAINT users_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'suspended'::text, 'deleted'::text])))
);


--
-- Name: COLUMN users.pin_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.pin_hash IS 'Hashed 4-digit PIN for credential reveal';


--
-- Name: COLUMN users.pin_set_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.pin_set_at IS 'Timestamp when PIN was set';


--
-- Name: COLUMN users.pin_failed_attempts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.pin_failed_attempts IS 'Consecutive failed PIN attempts';


--
-- Name: COLUMN users.pin_locked_until; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.pin_locked_until IS 'Lockout expiration timestamp after too many PIN failures';


--
-- Name: admin_audit_logs admin_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_logs
    ADD CONSTRAINT admin_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: admin_tasks admin_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_tasks
    ADD CONSTRAINT admin_tasks_pkey PRIMARY KEY (id);


--
-- Name: bis_inquiries bis_inquiries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bis_inquiries
    ADD CONSTRAINT bis_inquiries_pkey PRIMARY KEY (id);


--
-- Name: calendar_achievements calendar_achievements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_achievements
    ADD CONSTRAINT calendar_achievements_pkey PRIMARY KEY (id);


--
-- Name: calendar_achievements calendar_achievements_user_id_achievement_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_achievements
    ADD CONSTRAINT calendar_achievements_user_id_achievement_key_key UNIQUE (user_id, achievement_key);


--
-- Name: calendar_event_log calendar_event_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_event_log
    ADD CONSTRAINT calendar_event_log_pkey PRIMARY KEY (id);


--
-- Name: calendar_events calendar_events_event_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_event_date_key UNIQUE (event_date);


--
-- Name: calendar_events calendar_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_pkey PRIMARY KEY (id);


--
-- Name: calendar_events calendar_events_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_slug_key UNIQUE (slug);


--
-- Name: calendar_metrics_daily calendar_metrics_daily_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_metrics_daily
    ADD CONSTRAINT calendar_metrics_daily_pkey PRIMARY KEY (metric_date);


--
-- Name: calendar_raffle_entries calendar_raffle_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_raffle_entries
    ADD CONSTRAINT calendar_raffle_entries_pkey PRIMARY KEY (raffle_id, user_id, source, event_date);


--
-- Name: calendar_raffle_entry_controls calendar_raffle_entry_controls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_raffle_entry_controls
    ADD CONSTRAINT calendar_raffle_entry_controls_pkey PRIMARY KEY (id);


--
-- Name: calendar_raffle_entry_controls calendar_raffle_entry_controls_raffle_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_raffle_entry_controls
    ADD CONSTRAINT calendar_raffle_entry_controls_raffle_id_user_id_key UNIQUE (raffle_id, user_id);


--
-- Name: calendar_raffle_winners calendar_raffle_winners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_raffle_winners
    ADD CONSTRAINT calendar_raffle_winners_pkey PRIMARY KEY (id);


--
-- Name: calendar_raffle_winners calendar_raffle_winners_raffle_id_position_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_raffle_winners
    ADD CONSTRAINT calendar_raffle_winners_raffle_id_position_key UNIQUE (raffle_id, "position");


--
-- Name: calendar_raffles calendar_raffles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_raffles
    ADD CONSTRAINT calendar_raffles_pkey PRIMARY KEY (id);


--
-- Name: calendar_referral_multipliers calendar_referral_multipliers_event_date_applies_to_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_referral_multipliers
    ADD CONSTRAINT calendar_referral_multipliers_event_date_applies_to_key UNIQUE (event_date, applies_to);


--
-- Name: calendar_referral_multipliers calendar_referral_multipliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_referral_multipliers
    ADD CONSTRAINT calendar_referral_multipliers_pkey PRIMARY KEY (id);


--
-- Name: calendar_settings calendar_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_settings
    ADD CONSTRAINT calendar_settings_pkey PRIMARY KEY (key);


--
-- Name: calendar_spin_results calendar_spin_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_spin_results
    ADD CONSTRAINT calendar_spin_results_pkey PRIMARY KEY (id);


--
-- Name: calendar_spin_results calendar_spin_results_user_id_event_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_spin_results
    ADD CONSTRAINT calendar_spin_results_user_id_event_date_key UNIQUE (user_id, event_date);


--
-- Name: calendar_spin_wheels calendar_spin_wheels_event_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_spin_wheels
    ADD CONSTRAINT calendar_spin_wheels_event_date_key UNIQUE (event_date);


--
-- Name: calendar_spin_wheels calendar_spin_wheels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_spin_wheels
    ADD CONSTRAINT calendar_spin_wheels_pkey PRIMARY KEY (id);


--
-- Name: calendar_streaks calendar_streaks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_streaks
    ADD CONSTRAINT calendar_streaks_pkey PRIMARY KEY (user_id);


--
-- Name: calendar_vouchers calendar_vouchers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_vouchers
    ADD CONSTRAINT calendar_vouchers_pkey PRIMARY KEY (id);


--
-- Name: calendar_vouchers calendar_vouchers_user_id_event_date_voucher_type_scope_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_vouchers
    ADD CONSTRAINT calendar_vouchers_user_id_event_date_voucher_type_scope_key UNIQUE (user_id, event_date, voucher_type, scope);


--
-- Name: coupon_redemptions coupon_redemptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon_redemptions
    ADD CONSTRAINT coupon_redemptions_pkey PRIMARY KEY (id);


--
-- Name: coupons coupons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_pkey PRIMARY KEY (id);


--
-- Name: credential_reveal_audit_logs credential_reveal_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credential_reveal_audit_logs
    ADD CONSTRAINT credential_reveal_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: credit_transactions credit_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_transactions
    ADD CONSTRAINT credit_transactions_pkey PRIMARY KEY (id);


--
-- Name: fx_rate_cache fx_rate_cache_pair_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fx_rate_cache
    ADD CONSTRAINT fx_rate_cache_pair_unique UNIQUE (base_currency, quote_currency);


--
-- Name: fx_rate_cache fx_rate_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fx_rate_cache
    ADD CONSTRAINT fx_rate_cache_pkey PRIMARY KEY (id);


--
-- Name: fx_rate_fetches fx_rate_fetches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fx_rate_fetches
    ADD CONSTRAINT fx_rate_fetches_pkey PRIMARY KEY (id);


--
-- Name: guest_claim_tokens guest_claim_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guest_claim_tokens
    ADD CONSTRAINT guest_claim_tokens_pkey PRIMARY KEY (id);


--
-- Name: guest_identities guest_identities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guest_identities
    ADD CONSTRAINT guest_identities_pkey PRIMARY KEY (id);


--
-- Name: maxmind_risk_assessments maxmind_risk_assessments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maxmind_risk_assessments
    ADD CONSTRAINT maxmind_risk_assessments_pkey PRIMARY KEY (id);


--
-- Name: newsletter_subscriptions newsletter_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newsletter_subscriptions
    ADD CONSTRAINT newsletter_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_dedupe_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_dedupe_key_key UNIQUE (dedupe_key);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: order_compliance_evidence_logs order_compliance_evidence_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_compliance_evidence_logs
    ADD CONSTRAINT order_compliance_evidence_logs_pkey PRIMARY KEY (id);


--
-- Name: order_item_upgrade_selections order_item_upgrade_selections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_item_upgrade_selections
    ADD CONSTRAINT order_item_upgrade_selections_pkey PRIMARY KEY (order_item_id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: payment_events payment_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_events
    ADD CONSTRAINT payment_events_pkey PRIMARY KEY (id);


--
-- Name: payment_items payment_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_items
    ADD CONSTRAINT payment_items_pkey PRIMARY KEY (payment_id, order_item_id);


--
-- Name: payment_refunds payment_refunds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_refunds
    ADD CONSTRAINT payment_refunds_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: pin_reset_requests pin_reset_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pin_reset_requests
    ADD CONSTRAINT pin_reset_requests_pkey PRIMARY KEY (id);


--
-- Name: pre_launch_rewards pre_launch_rewards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pre_launch_rewards
    ADD CONSTRAINT pre_launch_rewards_pkey PRIMARY KEY (user_id);


--
-- Name: pre_registrations pre_registrations_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pre_registrations
    ADD CONSTRAINT pre_registrations_email_key UNIQUE (email);


--
-- Name: pre_registrations pre_registrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pre_registrations
    ADD CONSTRAINT pre_registrations_pkey PRIMARY KEY (id);


--
-- Name: pre_registrations pre_registrations_referral_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pre_registrations
    ADD CONSTRAINT pre_registrations_referral_code_key UNIQUE (referral_code);


--
-- Name: pre_registrations pre_registrations_supabase_auth_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pre_registrations
    ADD CONSTRAINT pre_registrations_supabase_auth_id_key UNIQUE (supabase_auth_id);


--
-- Name: pre_registrations pre_registrations_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pre_registrations
    ADD CONSTRAINT pre_registrations_username_key UNIQUE (username);


--
-- Name: price_history price_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_history
    ADD CONSTRAINT price_history_pkey PRIMARY KEY (id);


--
-- Name: pricing_publish_runs pricing_publish_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_publish_runs
    ADD CONSTRAINT pricing_publish_runs_pkey PRIMARY KEY (id);


--
-- Name: pricing_publish_runs pricing_publish_runs_snapshot_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_publish_runs
    ADD CONSTRAINT pricing_publish_runs_snapshot_unique UNIQUE (snapshot_id);


--
-- Name: product_category_map product_category_map_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_category_map
    ADD CONSTRAINT product_category_map_pkey PRIMARY KEY (product_id, category_key);


--
-- Name: product_fixed_price_history product_fixed_price_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_fixed_price_history
    ADD CONSTRAINT product_fixed_price_history_pkey PRIMARY KEY (id);


--
-- Name: product_label_map product_label_map_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_label_map
    ADD CONSTRAINT product_label_map_pkey PRIMARY KEY (product_id, label_id);


--
-- Name: product_labels product_labels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_labels
    ADD CONSTRAINT product_labels_pkey PRIMARY KEY (id);


--
-- Name: product_media product_media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_media
    ADD CONSTRAINT product_media_pkey PRIMARY KEY (id);


--
-- Name: product_sub_categories product_sub_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_sub_categories
    ADD CONSTRAINT product_sub_categories_pkey PRIMARY KEY (id);


--
-- Name: product_sub_category_map product_sub_category_map_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_sub_category_map
    ADD CONSTRAINT product_sub_category_map_pkey PRIMARY KEY (product_id, sub_category_id);


--
-- Name: product_variant_terms product_variant_terms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variant_terms
    ADD CONSTRAINT product_variant_terms_pkey PRIMARY KEY (id);


--
-- Name: product_variant_terms product_variant_terms_unique_month; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variant_terms
    ADD CONSTRAINT product_variant_terms_unique_month UNIQUE (product_variant_id, months);


--
-- Name: product_variants product_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: referral_rewards referral_rewards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_rewards
    ADD CONSTRAINT referral_rewards_pkey PRIMARY KEY (id);


--
-- Name: referral_rewards referral_rewards_user_id_reward_type_tier_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_rewards
    ADD CONSTRAINT referral_rewards_user_id_reward_type_tier_key UNIQUE (user_id, reward_type, tier);


--
-- Name: referrals referrals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_pkey PRIMARY KEY (id);


--
-- Name: referrals referrals_referrer_code_referred_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_referrer_code_referred_email_key UNIQUE (referrer_code, referred_email);


--
-- Name: share_events share_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_events
    ADD CONSTRAINT share_events_pkey PRIMARY KEY (id);


--
-- Name: subscription_reminder_events subscription_reminder_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_reminder_events
    ADD CONSTRAINT subscription_reminder_events_pkey PRIMARY KEY (id);


--
-- Name: subscription_reminder_events subscription_reminder_events_unique_stage; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_reminder_events
    ADD CONSTRAINT subscription_reminder_events_unique_stage UNIQUE (subscription_id, reminder_stage, target_expiry_at);


--
-- Name: subscription_renewals subscription_renewals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_renewals
    ADD CONSTRAINT subscription_renewals_pkey PRIMARY KEY (id);


--
-- Name: subscription_upgrade_selections subscription_upgrade_selections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_upgrade_selections
    ADD CONSTRAINT subscription_upgrade_selections_pkey PRIMARY KEY (subscription_id);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: user_calendar_claims user_calendar_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_calendar_claims
    ADD CONSTRAINT user_calendar_claims_pkey PRIMARY KEY (id);


--
-- Name: user_calendar_claims user_calendar_claims_user_id_event_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_calendar_claims
    ADD CONSTRAINT user_calendar_claims_user_id_event_date_key UNIQUE (user_id, event_date);


--
-- Name: user_payment_methods user_payment_methods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_payment_methods
    ADD CONSTRAINT user_payment_methods_pkey PRIMARY KEY (id);


--
-- Name: user_perks user_perks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_perks
    ADD CONSTRAINT user_perks_pkey PRIMARY KEY (id);


--
-- Name: user_raffle_entries user_raffle_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_raffle_entries
    ADD CONSTRAINT user_raffle_entries_pkey PRIMARY KEY (id);


--
-- Name: user_raffle_entries user_raffle_entries_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_raffle_entries
    ADD CONSTRAINT user_raffle_entries_unique UNIQUE (raffle_id, user_id, source, event_date);


--
-- Name: user_status_audit user_status_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_status_audit
    ADD CONSTRAINT user_status_audit_pkey PRIMARY KEY (id);


--
-- Name: user_vouchers user_vouchers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_vouchers
    ADD CONSTRAINT user_vouchers_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_admin_audit_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_audit_logs_created_at ON public.admin_audit_logs USING btree (created_at);


--
-- Name: idx_admin_audit_logs_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_audit_logs_entity ON public.admin_audit_logs USING btree (entity_type, entity_id);


--
-- Name: idx_admin_audit_logs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_audit_logs_user_id ON public.admin_audit_logs USING btree (user_id);


--
-- Name: idx_admin_tasks_assigned_admin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_tasks_assigned_admin ON public.admin_tasks USING btree (assigned_admin);


--
-- Name: idx_admin_tasks_assigned_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_tasks_assigned_due ON public.admin_tasks USING btree (assigned_admin, due_date);


--
-- Name: idx_admin_tasks_completion_stats; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_tasks_completion_stats ON public.admin_tasks USING btree (task_type, completed_at, created_at);


--
-- Name: idx_admin_tasks_due_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_tasks_due_date ON public.admin_tasks USING btree (due_date);


--
-- Name: idx_admin_tasks_incomplete; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_tasks_incomplete ON public.admin_tasks USING btree (due_date, priority) WHERE (completed_at IS NULL);


--
-- Name: idx_admin_tasks_is_issue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_tasks_is_issue ON public.admin_tasks USING btree (is_issue);


--
-- Name: idx_admin_tasks_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_tasks_order_id ON public.admin_tasks USING btree (order_id);


--
-- Name: idx_admin_tasks_payment_confirmed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_tasks_payment_confirmed_at ON public.admin_tasks USING btree (payment_confirmed_at);


--
-- Name: idx_admin_tasks_sla_due_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_tasks_sla_due_at ON public.admin_tasks USING btree (sla_due_at);


--
-- Name: idx_admin_tasks_subscription_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_tasks_subscription_id ON public.admin_tasks USING btree (subscription_id);


--
-- Name: idx_admin_tasks_task_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_tasks_task_category ON public.admin_tasks USING btree (task_category);


--
-- Name: idx_admin_tasks_type_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_tasks_type_priority ON public.admin_tasks USING btree (task_type, priority);


--
-- Name: idx_admin_tasks_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_tasks_user_id ON public.admin_tasks USING btree (user_id);


--
-- Name: idx_bis_inquiries_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bis_inquiries_created_at ON public.bis_inquiries USING btree (created_at);


--
-- Name: idx_bis_inquiries_email_normalized; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bis_inquiries_email_normalized ON public.bis_inquiries USING btree (email_normalized);


--
-- Name: idx_bis_inquiries_status_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bis_inquiries_status_created_at ON public.bis_inquiries USING btree (status, created_at DESC);


--
-- Name: idx_calendar_achievements_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_achievements_user ON public.calendar_achievements USING btree (user_id, achievement_key);


--
-- Name: idx_calendar_event_log_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_event_log_type ON public.calendar_event_log USING btree (event_type, event_date);


--
-- Name: idx_calendar_events_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_events_date ON public.calendar_events USING btree (event_date);


--
-- Name: idx_calendar_events_published; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_events_published ON public.calendar_events USING btree (published);


--
-- Name: idx_calendar_raffle_entries_raffle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_raffle_entries_raffle ON public.calendar_raffle_entries USING btree (raffle_id, user_id);


--
-- Name: idx_calendar_raffle_entries_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_raffle_entries_user ON public.calendar_raffle_entries USING btree (user_id);


--
-- Name: idx_calendar_referral_multipliers_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_referral_multipliers_date ON public.calendar_referral_multipliers USING btree (event_date);


--
-- Name: idx_calendar_spin_results_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_spin_results_user ON public.calendar_spin_results USING btree (user_id, event_date);


--
-- Name: idx_calendar_vouchers_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_vouchers_event ON public.calendar_vouchers USING btree (event_date);


--
-- Name: idx_calendar_vouchers_user_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_vouchers_user_status ON public.calendar_vouchers USING btree (user_id, status);


--
-- Name: idx_coupon_redemptions_coupon; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coupon_redemptions_coupon ON public.coupon_redemptions USING btree (coupon_id);


--
-- Name: idx_coupon_redemptions_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coupon_redemptions_expires ON public.coupon_redemptions USING btree (expires_at) WHERE (expires_at IS NOT NULL);


--
-- Name: idx_coupon_redemptions_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coupon_redemptions_order ON public.coupon_redemptions USING btree (order_id);


--
-- Name: idx_coupon_redemptions_order_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_coupon_redemptions_order_unique ON public.coupon_redemptions USING btree (order_id) WHERE (order_id IS NOT NULL);


--
-- Name: idx_coupon_redemptions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coupon_redemptions_status ON public.coupon_redemptions USING btree (status);


--
-- Name: idx_coupon_redemptions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coupon_redemptions_user ON public.coupon_redemptions USING btree (user_id);


--
-- Name: idx_coupons_bound_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coupons_bound_user ON public.coupons USING btree (bound_user_id) WHERE (bound_user_id IS NOT NULL);


--
-- Name: idx_coupons_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coupons_category ON public.coupons USING btree (category) WHERE (category IS NOT NULL);


--
-- Name: idx_coupons_code_normalized; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_coupons_code_normalized ON public.coupons USING btree (code_normalized);


--
-- Name: idx_coupons_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coupons_product ON public.coupons USING btree (product_id) WHERE (product_id IS NOT NULL);


--
-- Name: idx_coupons_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coupons_scope ON public.coupons USING btree (scope);


--
-- Name: idx_coupons_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coupons_status ON public.coupons USING btree (status);


--
-- Name: idx_credential_reveal_audit_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credential_reveal_audit_logs_created_at ON public.credential_reveal_audit_logs USING btree (created_at);


--
-- Name: idx_credential_reveal_audit_logs_subscription_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credential_reveal_audit_logs_subscription_id ON public.credential_reveal_audit_logs USING btree (subscription_id);


--
-- Name: idx_credential_reveal_audit_logs_success; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credential_reveal_audit_logs_success ON public.credential_reveal_audit_logs USING btree (success);


--
-- Name: idx_credential_reveal_audit_logs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credential_reveal_audit_logs_user_id ON public.credential_reveal_audit_logs USING btree (user_id);


--
-- Name: idx_credit_transactions_blockchain_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credit_transactions_blockchain_hash ON public.credit_transactions USING btree (blockchain_hash);


--
-- Name: idx_credit_transactions_last_monitored_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credit_transactions_last_monitored_at ON public.credit_transactions USING btree (last_monitored_at);


--
-- Name: idx_credit_transactions_monitoring_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credit_transactions_monitoring_status ON public.credit_transactions USING btree (monitoring_status);


--
-- Name: idx_credit_transactions_next_billing_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credit_transactions_next_billing_at ON public.credit_transactions USING btree (next_billing_at) WHERE (next_billing_at IS NOT NULL);


--
-- Name: idx_credit_transactions_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credit_transactions_order_id ON public.credit_transactions USING btree (order_id);


--
-- Name: idx_credit_transactions_order_item_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credit_transactions_order_item_id ON public.credit_transactions USING btree (order_item_id);


--
-- Name: idx_credit_transactions_payment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credit_transactions_payment_id ON public.credit_transactions USING btree (payment_id);


--
-- Name: idx_credit_transactions_payment_monitoring; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credit_transactions_payment_monitoring ON public.credit_transactions USING btree (payment_status, monitoring_status, last_monitored_at) WHERE (payment_id IS NOT NULL);


--
-- Name: idx_credit_transactions_payment_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credit_transactions_payment_provider ON public.credit_transactions USING btree (payment_provider);


--
-- Name: idx_credit_transactions_payment_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credit_transactions_payment_status ON public.credit_transactions USING btree (payment_status);


--
-- Name: idx_credit_transactions_pending_payments; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credit_transactions_pending_payments ON public.credit_transactions USING btree (payment_id, payment_status, created_at) WHERE ((payment_id IS NOT NULL) AND ((payment_status)::text = ANY ((ARRAY['pending'::character varying, 'waiting'::character varying, 'confirming'::character varying, 'confirmed'::character varying, 'sending'::character varying, 'partially_paid'::character varying])::text[])));


--
-- Name: idx_credit_transactions_pre_launch_reward_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credit_transactions_pre_launch_reward_id ON public.credit_transactions USING btree (pre_launch_reward_id) WHERE (pre_launch_reward_id IS NOT NULL);


--
-- Name: idx_credit_transactions_product_variant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credit_transactions_product_variant_id ON public.credit_transactions USING btree (product_variant_id);


--
-- Name: idx_credit_transactions_referral_reward_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credit_transactions_referral_reward_id ON public.credit_transactions USING btree (referral_reward_id) WHERE (referral_reward_id IS NOT NULL);


--
-- Name: idx_credit_transactions_retry_count; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credit_transactions_retry_count ON public.credit_transactions USING btree (retry_count);


--
-- Name: idx_credit_transactions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credit_transactions_user_id ON public.credit_transactions USING btree (user_id);


--
-- Name: idx_fx_rate_cache_fetched_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fx_rate_cache_fetched_at ON public.fx_rate_cache USING btree (fetched_at DESC);


--
-- Name: idx_fx_rate_cache_is_lkg; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fx_rate_cache_is_lkg ON public.fx_rate_cache USING btree (is_lkg);


--
-- Name: idx_fx_rate_fetches_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fx_rate_fetches_created_at ON public.fx_rate_fetches USING btree (created_at DESC);


--
-- Name: idx_fx_rate_fetches_status_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fx_rate_fetches_status_created_at ON public.fx_rate_fetches USING btree (status, created_at DESC);


--
-- Name: idx_guest_claim_tokens_unused; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_guest_claim_tokens_unused ON public.guest_claim_tokens USING btree (token_hash) WHERE (used_at IS NULL);


--
-- Name: idx_maxmind_risk_assessments_decision_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_maxmind_risk_assessments_decision_created_at ON public.maxmind_risk_assessments USING btree (decision, created_at DESC);


--
-- Name: idx_maxmind_risk_assessments_order_id_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_maxmind_risk_assessments_order_id_created_at ON public.maxmind_risk_assessments USING btree (order_id, created_at DESC);


--
-- Name: idx_maxmind_risk_assessments_should_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_maxmind_risk_assessments_should_run ON public.maxmind_risk_assessments USING btree (should_run, created_at DESC);


--
-- Name: idx_maxmind_risk_assessments_trigger_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_maxmind_risk_assessments_trigger_created_at ON public.maxmind_risk_assessments USING btree (trigger_type, created_at DESC);


--
-- Name: idx_maxmind_risk_assessments_user_id_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_maxmind_risk_assessments_user_id_created_at ON public.maxmind_risk_assessments USING btree (user_id, created_at DESC);


--
-- Name: idx_newsletter_coupon_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_newsletter_coupon_id ON public.newsletter_subscriptions USING btree (coupon_id) WHERE (coupon_id IS NOT NULL);


--
-- Name: idx_newsletter_email_normalized; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_newsletter_email_normalized ON public.newsletter_subscriptions USING btree (email_normalized);


--
-- Name: idx_newsletter_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_newsletter_status ON public.newsletter_subscriptions USING btree (status);


--
-- Name: idx_newsletter_subscribed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_newsletter_subscribed_at ON public.newsletter_subscriptions USING btree (subscribed_at);


--
-- Name: idx_notifications_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_type ON public.notifications USING btree (type);


--
-- Name: idx_notifications_user_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_created_at ON public.notifications USING btree (user_id, created_at DESC);


--
-- Name: idx_notifications_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id);


--
-- Name: idx_notifications_user_read_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_read_at ON public.notifications USING btree (user_id, read_at);


--
-- Name: idx_order_compliance_evidence_logs_event_type_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_compliance_evidence_logs_event_type_created_at ON public.order_compliance_evidence_logs USING btree (event_type, created_at DESC);


--
-- Name: idx_order_compliance_evidence_logs_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_compliance_evidence_logs_order_id ON public.order_compliance_evidence_logs USING btree (order_id);


--
-- Name: idx_order_compliance_evidence_logs_paypal_transaction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_compliance_evidence_logs_paypal_transaction ON public.order_compliance_evidence_logs USING btree (paypal_transaction_id) WHERE (paypal_transaction_id IS NOT NULL);


--
-- Name: idx_order_items_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_order_id ON public.order_items USING btree (order_id);


--
-- Name: idx_order_items_product_variant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_product_variant_id ON public.order_items USING btree (product_variant_id);


--
-- Name: idx_order_items_settlement_currency; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_settlement_currency ON public.order_items USING btree (settlement_currency) WHERE (settlement_currency IS NOT NULL);


--
-- Name: idx_orders_checkout_session_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_orders_checkout_session_key ON public.orders USING btree (checkout_session_key) WHERE (checkout_session_key IS NOT NULL);


--
-- Name: idx_orders_coupon_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_coupon_code ON public.orders USING btree (coupon_code) WHERE (coupon_code IS NOT NULL);


--
-- Name: idx_orders_coupon_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_coupon_id ON public.orders USING btree (coupon_id) WHERE (coupon_id IS NOT NULL);


--
-- Name: idx_orders_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_created_at ON public.orders USING btree (created_at);


--
-- Name: idx_orders_payment_reference; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_payment_reference ON public.orders USING btree (payment_provider, payment_reference);


--
-- Name: idx_orders_pricing_snapshot_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_pricing_snapshot_id ON public.orders USING btree (pricing_snapshot_id) WHERE (pricing_snapshot_id IS NOT NULL);


--
-- Name: idx_orders_settlement_currency; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_settlement_currency ON public.orders USING btree (settlement_currency) WHERE (settlement_currency IS NOT NULL);


--
-- Name: idx_orders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_status ON public.orders USING btree (status);


--
-- Name: idx_orders_stripe_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_stripe_session_id ON public.orders USING btree (stripe_session_id);


--
-- Name: idx_orders_user_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_user_created_at ON public.orders USING btree (user_id, created_at DESC);


--
-- Name: idx_orders_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_user_id ON public.orders USING btree (user_id);


--
-- Name: idx_payment_items_order_item_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_items_order_item_id ON public.payment_items USING btree (order_item_id);


--
-- Name: idx_payment_refunds_approved_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_refunds_approved_by ON public.payment_refunds USING btree (approved_by);


--
-- Name: idx_payment_refunds_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_refunds_created_at ON public.payment_refunds USING btree (created_at);


--
-- Name: idx_payment_refunds_payment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_refunds_payment_id ON public.payment_refunds USING btree (payment_id);


--
-- Name: idx_payment_refunds_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_refunds_status ON public.payment_refunds USING btree (status);


--
-- Name: idx_payment_refunds_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_refunds_user_id ON public.payment_refunds USING btree (user_id);


--
-- Name: idx_payments_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_created_at ON public.payments USING btree (created_at);


--
-- Name: idx_payments_next_billing_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_next_billing_at ON public.payments USING btree (next_billing_at) WHERE (next_billing_at IS NOT NULL);


--
-- Name: idx_payments_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_order_id ON public.payments USING btree (order_id);


--
-- Name: idx_payments_order_item_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_order_item_id ON public.payments USING btree (order_item_id);


--
-- Name: idx_payments_product_variant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_product_variant_id ON public.payments USING btree (product_variant_id);


--
-- Name: idx_payments_provider_payment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_provider_payment_id ON public.payments USING btree (provider, provider_payment_id);


--
-- Name: idx_payments_purpose_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_purpose_status ON public.payments USING btree (purpose, status);


--
-- Name: idx_payments_stripe_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_stripe_session_id ON public.payments USING btree (stripe_session_id);


--
-- Name: idx_payments_user_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_user_status ON public.payments USING btree (user_id, status);


--
-- Name: idx_pin_reset_requests_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pin_reset_requests_expires_at ON public.pin_reset_requests USING btree (expires_at);


--
-- Name: idx_pin_reset_requests_user_status_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pin_reset_requests_user_status_created_at ON public.pin_reset_requests USING btree (user_id, status, created_at DESC);


--
-- Name: idx_pre_launch_rewards_redeemed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pre_launch_rewards_redeemed_at ON public.pre_launch_rewards USING btree (redeemed_at) WHERE (redeemed_at IS NOT NULL);


--
-- Name: idx_pre_launch_rewards_redeemed_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pre_launch_rewards_redeemed_by ON public.pre_launch_rewards USING btree (redeemed_by_user_id) WHERE (redeemed_by_user_id IS NOT NULL);


--
-- Name: idx_pre_reg_auth_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pre_reg_auth_id ON public.pre_registrations USING btree (supabase_auth_id);


--
-- Name: idx_pre_reg_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pre_reg_created ON public.pre_registrations USING btree (created_at DESC);


--
-- Name: idx_pre_reg_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pre_reg_email ON public.pre_registrations USING btree (email);


--
-- Name: idx_pre_reg_referral_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pre_reg_referral_code ON public.pre_registrations USING btree (referral_code);


--
-- Name: idx_pre_reg_referred_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pre_reg_referred_by ON public.pre_registrations USING btree (referred_by_code);


--
-- Name: idx_pre_reg_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pre_reg_status ON public.pre_registrations USING btree (status);


--
-- Name: idx_pre_reg_username; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pre_reg_username ON public.pre_registrations USING btree (username);


--
-- Name: idx_pre_reg_verification_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pre_reg_verification_token ON public.pre_registrations USING btree (verification_token);


--
-- Name: idx_pre_reg_verified; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pre_reg_verified ON public.pre_registrations USING btree (email_verified);


--
-- Name: idx_pre_registrations_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_pre_registrations_user_id ON public.pre_registrations USING btree (user_id) WHERE (user_id IS NOT NULL);


--
-- Name: idx_price_history_variant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_price_history_variant_id ON public.price_history USING btree (product_variant_id);


--
-- Name: idx_price_history_variant_start; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_price_history_variant_start ON public.price_history USING btree (product_variant_id, starts_at DESC);


--
-- Name: idx_pricing_publish_runs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_publish_runs_created_at ON public.pricing_publish_runs USING btree (created_at DESC);


--
-- Name: idx_pricing_publish_runs_status_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_publish_runs_status_created_at ON public.pricing_publish_runs USING btree (status, created_at DESC);


--
-- Name: idx_product_category_map_category_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_category_map_category_key ON public.product_category_map USING btree (category_key);


--
-- Name: idx_product_category_map_primary; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_category_map_primary ON public.product_category_map USING btree (product_id, is_primary);


--
-- Name: idx_product_category_map_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_category_map_product ON public.product_category_map USING btree (product_id);


--
-- Name: idx_product_fixed_price_history_product_currency_start; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_fixed_price_history_product_currency_start ON public.product_fixed_price_history USING btree (product_id, upper((currency)::text), starts_at DESC);


--
-- Name: idx_product_fixed_price_history_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_fixed_price_history_product_id ON public.product_fixed_price_history USING btree (product_id);


--
-- Name: idx_product_fixed_price_history_product_start; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_fixed_price_history_product_start ON public.product_fixed_price_history USING btree (product_id, starts_at DESC);


--
-- Name: idx_product_label_map_label_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_label_map_label_id ON public.product_label_map USING btree (label_id);


--
-- Name: idx_product_labels_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_product_labels_slug ON public.product_labels USING btree (slug);


--
-- Name: idx_product_media_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_media_product_id ON public.product_media USING btree (product_id);


--
-- Name: idx_product_media_product_primary; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_media_product_primary ON public.product_media USING btree (product_id, is_primary);


--
-- Name: idx_product_media_product_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_media_product_sort ON public.product_media USING btree (product_id, sort_order);


--
-- Name: idx_product_sub_categories_category_normalized; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_sub_categories_category_normalized ON public.product_sub_categories USING btree (lower(btrim((category)::text)));


--
-- Name: idx_product_sub_category_map_primary; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_sub_category_map_primary ON public.product_sub_category_map USING btree (product_id, is_primary);


--
-- Name: idx_product_sub_category_map_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_sub_category_map_product ON public.product_sub_category_map USING btree (product_id);


--
-- Name: idx_product_sub_category_map_sub_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_sub_category_map_sub_category ON public.product_sub_category_map USING btree (sub_category_id);


--
-- Name: idx_product_variant_terms_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_variant_terms_active ON public.product_variant_terms USING btree (is_active);


--
-- Name: idx_product_variant_terms_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_variant_terms_sort ON public.product_variant_terms USING btree (product_variant_id, sort_order);


--
-- Name: idx_product_variant_terms_variant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_variant_terms_variant_id ON public.product_variant_terms USING btree (product_variant_id);


--
-- Name: idx_product_variants_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_variants_active ON public.product_variants USING btree (is_active);


--
-- Name: idx_product_variants_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_variants_product_id ON public.product_variants USING btree (product_id);


--
-- Name: idx_product_variants_service_plan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_variants_service_plan ON public.product_variants USING btree (service_plan);


--
-- Name: idx_products_category_sub_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_category_sub_category ON public.products USING btree (category, sub_category) WHERE ((category IS NOT NULL) AND (sub_category IS NOT NULL));


--
-- Name: idx_products_duration_months; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_duration_months ON public.products USING btree (duration_months) WHERE (duration_months IS NOT NULL);


--
-- Name: idx_products_fixed_price; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_fixed_price ON public.products USING btree (fixed_price_currency, fixed_price_cents) WHERE (fixed_price_cents IS NOT NULL);


--
-- Name: idx_products_service_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_service_type ON public.products USING btree (service_type);


--
-- Name: idx_products_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_products_slug ON public.products USING btree (slug);


--
-- Name: idx_products_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_status ON public.products USING btree (status);


--
-- Name: idx_products_sub_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_sub_category ON public.products USING btree (sub_category) WHERE (sub_category IS NOT NULL);


--
-- Name: idx_referral_rewards_earned_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referral_rewards_earned_at ON public.referral_rewards USING btree (earned_at DESC);


--
-- Name: idx_referral_rewards_redeemed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referral_rewards_redeemed_at ON public.referral_rewards USING btree (redeemed_at) WHERE (redeemed_at IS NOT NULL);


--
-- Name: idx_referral_rewards_redeemed_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referral_rewards_redeemed_by ON public.referral_rewards USING btree (redeemed_by_user_id) WHERE (redeemed_by_user_id IS NOT NULL);


--
-- Name: idx_referral_rewards_type_tier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referral_rewards_type_tier ON public.referral_rewards USING btree (reward_type, tier);


--
-- Name: idx_referral_rewards_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referral_rewards_user_id ON public.referral_rewards USING btree (user_id);


--
-- Name: idx_referral_rewards_user_redeemed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referral_rewards_user_redeemed ON public.referral_rewards USING btree (user_id, is_redeemed);


--
-- Name: idx_referrals_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referrals_email ON public.referrals USING btree (referred_email);


--
-- Name: idx_referrals_purchase_amount; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referrals_purchase_amount ON public.referrals USING btree (referrer_code, purchase_amount DESC) WHERE (purchase_verified = true);


--
-- Name: idx_referrals_purchase_verified; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referrals_purchase_verified ON public.referrals USING btree (purchase_verified, purchase_date DESC) WHERE (purchase_verified = true);


--
-- Name: idx_referrals_referrer_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referrals_referrer_code ON public.referrals USING btree (referrer_code);


--
-- Name: idx_referrals_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referrals_status ON public.referrals USING btree (status);


--
-- Name: idx_referrals_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referrals_user_id ON public.referrals USING btree (referred_user_id);


--
-- Name: idx_share_events_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_share_events_created_at ON public.share_events USING btree (created_at);


--
-- Name: idx_share_events_platform; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_share_events_platform ON public.share_events USING btree (platform);


--
-- Name: idx_share_events_referral_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_share_events_referral_code ON public.share_events USING btree (referral_code);


--
-- Name: idx_share_events_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_share_events_user ON public.share_events USING btree (user_id);


--
-- Name: idx_subscription_reminder_events_email_sent_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscription_reminder_events_email_sent_at ON public.subscription_reminder_events USING btree (email_sent_at) WHERE (email_sent_at IS NOT NULL);


--
-- Name: idx_subscription_reminder_events_stage_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscription_reminder_events_stage_expiry ON public.subscription_reminder_events USING btree (reminder_stage, target_expiry_at);


--
-- Name: idx_subscriptions_active_service; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscriptions_active_service ON public.subscriptions USING btree (service_type) WHERE (status = 'active'::text);


--
-- Name: idx_subscriptions_active_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscriptions_active_user ON public.subscriptions USING btree (user_id) WHERE (status = 'active'::text);


--
-- Name: idx_subscriptions_auto_renew; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscriptions_auto_renew ON public.subscriptions USING btree (auto_renew) WHERE (auto_renew = true);


--
-- Name: idx_subscriptions_billing_payment_method; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscriptions_billing_payment_method ON public.subscriptions USING btree (billing_payment_method_id);


--
-- Name: idx_subscriptions_end_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscriptions_end_date ON public.subscriptions USING btree (end_date);


--
-- Name: idx_subscriptions_metadata_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscriptions_metadata_gin ON public.subscriptions USING gin (metadata);


--
-- Name: idx_subscriptions_next_billing_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscriptions_next_billing_at ON public.subscriptions USING btree (next_billing_at) WHERE (next_billing_at IS NOT NULL);


--
-- Name: idx_subscriptions_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscriptions_order_id ON public.subscriptions USING btree (order_id);


--
-- Name: idx_subscriptions_payment_method; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscriptions_payment_method ON public.subscriptions USING btree (((metadata ->> 'payment_method'::text))) WHERE ((metadata ->> 'payment_method'::text) IS NOT NULL);


--
-- Name: idx_subscriptions_product_variant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscriptions_product_variant_id ON public.subscriptions USING btree (product_variant_id);


--
-- Name: idx_subscriptions_region; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscriptions_region ON public.subscriptions USING btree (((metadata ->> 'region'::text))) WHERE ((metadata ->> 'region'::text) IS NOT NULL);


--
-- Name: idx_subscriptions_renewal_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscriptions_renewal_date ON public.subscriptions USING btree (renewal_date);


--
-- Name: idx_subscriptions_renewal_method; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscriptions_renewal_method ON public.subscriptions USING btree (renewal_method) WHERE (renewal_method IS NOT NULL);


--
-- Name: idx_subscriptions_service_plan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscriptions_service_plan ON public.subscriptions USING btree (service_type, service_plan);


--
-- Name: idx_subscriptions_service_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscriptions_service_type ON public.subscriptions USING btree (service_type);


--
-- Name: idx_subscriptions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscriptions_status ON public.subscriptions USING btree (status);


--
-- Name: idx_subscriptions_term_start_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscriptions_term_start_at ON public.subscriptions USING btree (term_start_at) WHERE (term_start_at IS NOT NULL);


--
-- Name: idx_subscriptions_user_count; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscriptions_user_count ON public.subscriptions USING btree (user_id) WHERE (status = ANY (ARRAY['active'::text, 'pending'::text]));


--
-- Name: idx_subscriptions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscriptions_user_id ON public.subscriptions USING btree (user_id);


--
-- Name: idx_subscriptions_user_service; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscriptions_user_service ON public.subscriptions USING btree (user_id, service_type);


--
-- Name: idx_subscriptions_user_status_renewal_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscriptions_user_status_renewal_date ON public.subscriptions USING btree (user_id, status, renewal_date);


--
-- Name: idx_upgrade_selections_locked_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_upgrade_selections_locked_at ON public.subscription_upgrade_selections USING btree (locked_at);


--
-- Name: idx_upgrade_selections_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_upgrade_selections_order_id ON public.subscription_upgrade_selections USING btree (order_id);


--
-- Name: idx_upgrade_selections_submitted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_upgrade_selections_submitted_at ON public.subscription_upgrade_selections USING btree (submitted_at);


--
-- Name: idx_user_calendar_claims_user_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_calendar_claims_user_date ON public.user_calendar_claims USING btree (user_id, event_date);


--
-- Name: idx_user_payment_methods_provider_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_payment_methods_provider_customer ON public.user_payment_methods USING btree (provider_customer_id);


--
-- Name: idx_user_payment_methods_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_payment_methods_user_id ON public.user_payment_methods USING btree (user_id);


--
-- Name: idx_user_perks_reward_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_perks_reward_type ON public.user_perks USING btree (reward_type);


--
-- Name: idx_user_perks_source_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_user_perks_source_unique ON public.user_perks USING btree (source_type, source_id);


--
-- Name: idx_user_perks_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_perks_user_id ON public.user_perks USING btree (user_id);


--
-- Name: idx_user_raffle_entries_raffle_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_raffle_entries_raffle_id ON public.user_raffle_entries USING btree (raffle_id);


--
-- Name: idx_user_raffle_entries_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_raffle_entries_user_id ON public.user_raffle_entries USING btree (user_id);


--
-- Name: idx_user_status_audit_changed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_status_audit_changed_at ON public.user_status_audit USING btree (changed_at);


--
-- Name: idx_user_status_audit_changed_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_status_audit_changed_by ON public.user_status_audit USING btree (changed_by);


--
-- Name: idx_user_status_audit_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_status_audit_user_id ON public.user_status_audit USING btree (user_id);


--
-- Name: idx_user_vouchers_event_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_vouchers_event_date ON public.user_vouchers USING btree (event_date);


--
-- Name: idx_user_vouchers_source_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_user_vouchers_source_unique ON public.user_vouchers USING btree (source_type, source_id) WHERE (source_id IS NOT NULL);


--
-- Name: idx_user_vouchers_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_vouchers_status ON public.user_vouchers USING btree (status);


--
-- Name: idx_user_vouchers_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_vouchers_user_id ON public.user_vouchers USING btree (user_id);


--
-- Name: idx_users_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_active ON public.users USING btree (created_at DESC) WHERE (status = 'active'::text);


--
-- Name: idx_users_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_created_at ON public.users USING btree (created_at);


--
-- Name: idx_users_display_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_display_name ON public.users USING btree (display_name) WHERE (display_name IS NOT NULL);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_users_language_preference; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_language_preference ON public.users USING btree (language_preference) WHERE (language_preference IS NOT NULL);


--
-- Name: idx_users_last_login; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_last_login ON public.users USING btree (last_login DESC) WHERE (last_login IS NOT NULL);


--
-- Name: idx_users_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_name ON public.users USING btree (first_name, last_name);


--
-- Name: idx_users_pre_registration_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_users_pre_registration_id ON public.users USING btree (pre_registration_id) WHERE (pre_registration_id IS NOT NULL);


--
-- Name: idx_users_profile_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_profile_updated_at ON public.users USING btree (profile_updated_at);


--
-- Name: idx_users_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_status ON public.users USING btree (status);


--
-- Name: idx_users_user_timezone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_user_timezone ON public.users USING btree (user_timezone) WHERE (user_timezone IS NOT NULL);


--
-- Name: uq_product_category_map_primary_per_product; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_product_category_map_primary_per_product ON public.product_category_map USING btree (product_id) WHERE (is_primary = true);


--
-- Name: uq_product_fixed_price_history_product_currency_start; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_product_fixed_price_history_product_currency_start ON public.product_fixed_price_history USING btree (product_id, currency, starts_at);


--
-- Name: uq_product_sub_categories_category_name_normalized; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_product_sub_categories_category_name_normalized ON public.product_sub_categories USING btree (lower(btrim((category)::text)), lower(btrim((name)::text)));


--
-- Name: uq_product_sub_categories_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_product_sub_categories_slug ON public.product_sub_categories USING btree (slug);


--
-- Name: uq_product_sub_category_map_primary_per_product; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_product_sub_category_map_primary_per_product ON public.product_sub_category_map USING btree (product_id) WHERE (is_primary = true);


--
-- Name: ux_credit_transactions_payment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_credit_transactions_payment_id ON public.credit_transactions USING btree (payment_id) WHERE (payment_id IS NOT NULL);


--
-- Name: ux_guest_claim_tokens_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_guest_claim_tokens_hash ON public.guest_claim_tokens USING btree (token_hash);


--
-- Name: ux_guest_identities_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_guest_identities_email ON public.guest_identities USING btree (email);


--
-- Name: ux_payment_events_provider_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_payment_events_provider_event_id ON public.payment_events USING btree (provider, event_id);


--
-- Name: ux_payments_provider_payment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_payments_provider_payment_id ON public.payments USING btree (provider, provider_payment_id);


--
-- Name: ux_subscription_renewal_cycle; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_subscription_renewal_cycle ON public.subscription_renewals USING btree (subscription_id, cycle_end_date);


--
-- Name: ux_subscriptions_order_item_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_subscriptions_order_item_id ON public.subscriptions USING btree (order_item_id) WHERE (order_item_id IS NOT NULL);


--
-- Name: ux_user_payment_methods_default; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_user_payment_methods_default ON public.user_payment_methods USING btree (user_id, provider) WHERE (is_default = true);


--
-- Name: ux_user_payment_methods_provider_payment; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_user_payment_methods_provider_payment ON public.user_payment_methods USING btree (provider, provider_payment_method_id);


--
-- Name: ux_users_stripe_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_users_stripe_customer_id ON public.users USING btree (stripe_customer_id) WHERE (stripe_customer_id IS NOT NULL);


--
-- Name: referrals trg_calendar_referral_multiplier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_calendar_referral_multiplier AFTER INSERT OR UPDATE ON public.referrals FOR EACH ROW WHEN (((new.status)::text = 'completed'::text)) EXECUTE FUNCTION public.calendar_apply_referral_multiplier();


--
-- Name: credit_transactions trg_credit_transactions_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_credit_transactions_set_updated_at BEFORE UPDATE ON public.credit_transactions FOR EACH ROW EXECUTE FUNCTION public.credit_transactions_set_updated_at();


--
-- Name: order_item_upgrade_selections trg_order_item_upgrade_selections_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_order_item_upgrade_selections_updated_at BEFORE UPDATE ON public.order_item_upgrade_selections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: order_items trg_order_items_allocation_parity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER trg_order_items_allocation_parity AFTER INSERT OR DELETE OR UPDATE OF order_id, coupon_discount_cents ON public.order_items DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.enforce_order_allocation_parity();


--
-- Name: orders trg_orders_allocation_parity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER trg_orders_allocation_parity AFTER INSERT OR UPDATE OF status, coupon_discount_cents, total_cents ON public.orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.enforce_order_allocation_parity();


--
-- Name: payment_items trg_payment_items_allocation_parity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER trg_payment_items_allocation_parity AFTER INSERT OR DELETE OR UPDATE OF order_item_id, allocated_total_cents ON public.payment_items DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.enforce_order_allocation_parity();


--
-- Name: payment_items trg_payment_items_singleton; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER trg_payment_items_singleton AFTER INSERT OR DELETE OR UPDATE ON public.payment_items DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.enforce_payment_item_singleton();


--
-- Name: payments trg_payments_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_payments_set_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.payments_set_updated_at();


--
-- Name: payments trg_payments_singleton; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER trg_payments_singleton AFTER INSERT OR UPDATE OF order_item_id ON public.payments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.enforce_payment_item_singleton();


--
-- Name: subscription_renewals trg_subscription_renewals_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_subscription_renewals_updated_at BEFORE UPDATE ON public.subscription_renewals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: subscriptions trg_subscriptions_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_subscriptions_set_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.subscriptions_set_updated_at();


--
-- Name: user_payment_methods trg_user_payment_methods_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_user_payment_methods_set_updated_at BEFORE UPDATE ON public.user_payment_methods FOR EACH ROW EXECUTE FUNCTION public.user_payment_methods_set_updated_at();


--
-- Name: referral_rewards trigger_update_referral_rewards_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_referral_rewards_updated_at BEFORE UPDATE ON public.referral_rewards FOR EACH ROW EXECUTE FUNCTION public.update_referral_rewards_updated_at();


--
-- Name: payment_refunds update_payment_refunds_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_payment_refunds_updated_at BEFORE UPDATE ON public.payment_refunds FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: admin_audit_logs admin_audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_logs
    ADD CONSTRAINT admin_audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: admin_tasks admin_tasks_assigned_admin_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_tasks
    ADD CONSTRAINT admin_tasks_assigned_admin_fkey FOREIGN KEY (assigned_admin) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: admin_tasks admin_tasks_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_tasks
    ADD CONSTRAINT admin_tasks_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: admin_tasks admin_tasks_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_tasks
    ADD CONSTRAINT admin_tasks_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id) ON DELETE CASCADE;


--
-- Name: admin_tasks admin_tasks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_tasks
    ADD CONSTRAINT admin_tasks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: calendar_achievements calendar_achievements_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_achievements
    ADD CONSTRAINT calendar_achievements_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.pre_registrations(id) ON DELETE CASCADE;


--
-- Name: calendar_raffle_entries calendar_raffle_entries_raffle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_raffle_entries
    ADD CONSTRAINT calendar_raffle_entries_raffle_id_fkey FOREIGN KEY (raffle_id) REFERENCES public.calendar_raffles(id) ON DELETE CASCADE;


--
-- Name: calendar_raffle_entries calendar_raffle_entries_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_raffle_entries
    ADD CONSTRAINT calendar_raffle_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.pre_registrations(id) ON DELETE CASCADE;


--
-- Name: calendar_raffle_entry_controls calendar_raffle_entry_controls_raffle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_raffle_entry_controls
    ADD CONSTRAINT calendar_raffle_entry_controls_raffle_id_fkey FOREIGN KEY (raffle_id) REFERENCES public.calendar_raffles(id) ON DELETE CASCADE;


--
-- Name: calendar_raffle_entry_controls calendar_raffle_entry_controls_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_raffle_entry_controls
    ADD CONSTRAINT calendar_raffle_entry_controls_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.pre_registrations(id) ON DELETE CASCADE;


--
-- Name: calendar_raffle_winners calendar_raffle_winners_raffle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_raffle_winners
    ADD CONSTRAINT calendar_raffle_winners_raffle_id_fkey FOREIGN KEY (raffle_id) REFERENCES public.calendar_raffles(id) ON DELETE CASCADE;


--
-- Name: calendar_raffle_winners calendar_raffle_winners_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_raffle_winners
    ADD CONSTRAINT calendar_raffle_winners_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.pre_registrations(id) ON DELETE CASCADE;


--
-- Name: calendar_spin_results calendar_spin_results_event_date_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_spin_results
    ADD CONSTRAINT calendar_spin_results_event_date_fkey FOREIGN KEY (event_date) REFERENCES public.calendar_events(event_date) ON DELETE CASCADE;


--
-- Name: calendar_spin_results calendar_spin_results_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_spin_results
    ADD CONSTRAINT calendar_spin_results_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.pre_registrations(id) ON DELETE CASCADE;


--
-- Name: calendar_spin_results calendar_spin_results_wheel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_spin_results
    ADD CONSTRAINT calendar_spin_results_wheel_id_fkey FOREIGN KEY (wheel_id) REFERENCES public.calendar_spin_wheels(id) ON DELETE CASCADE;


--
-- Name: calendar_streaks calendar_streaks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_streaks
    ADD CONSTRAINT calendar_streaks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.pre_registrations(id) ON DELETE CASCADE;


--
-- Name: calendar_vouchers calendar_vouchers_event_date_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_vouchers
    ADD CONSTRAINT calendar_vouchers_event_date_fkey FOREIGN KEY (event_date) REFERENCES public.calendar_events(event_date) ON DELETE CASCADE;


--
-- Name: calendar_vouchers calendar_vouchers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_vouchers
    ADD CONSTRAINT calendar_vouchers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.pre_registrations(id) ON DELETE CASCADE;


--
-- Name: coupon_redemptions coupon_redemptions_coupon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon_redemptions
    ADD CONSTRAINT coupon_redemptions_coupon_id_fkey FOREIGN KEY (coupon_id) REFERENCES public.coupons(id) ON DELETE CASCADE;


--
-- Name: coupon_redemptions coupon_redemptions_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon_redemptions
    ADD CONSTRAINT coupon_redemptions_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: coupon_redemptions coupon_redemptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon_redemptions
    ADD CONSTRAINT coupon_redemptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: coupons coupons_bound_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_bound_user_id_fkey FOREIGN KEY (bound_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: coupons coupons_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: credential_reveal_audit_logs credential_reveal_audit_logs_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credential_reveal_audit_logs
    ADD CONSTRAINT credential_reveal_audit_logs_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id) ON DELETE SET NULL;


--
-- Name: credential_reveal_audit_logs credential_reveal_audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credential_reveal_audit_logs
    ADD CONSTRAINT credential_reveal_audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: credit_transactions credit_transactions_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_transactions
    ADD CONSTRAINT credit_transactions_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: credit_transactions credit_transactions_order_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_transactions
    ADD CONSTRAINT credit_transactions_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON DELETE SET NULL;


--
-- Name: credit_transactions credit_transactions_product_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_transactions
    ADD CONSTRAINT credit_transactions_product_variant_id_fkey FOREIGN KEY (product_variant_id) REFERENCES public.product_variants(id) ON DELETE SET NULL;


--
-- Name: credit_transactions credit_transactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_transactions
    ADD CONSTRAINT credit_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: credit_transactions fk_credit_transactions_pre_launch_reward_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_transactions
    ADD CONSTRAINT fk_credit_transactions_pre_launch_reward_id FOREIGN KEY (pre_launch_reward_id) REFERENCES public.pre_launch_rewards(user_id) ON DELETE SET NULL;


--
-- Name: credit_transactions fk_credit_transactions_referral_reward_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_transactions
    ADD CONSTRAINT fk_credit_transactions_referral_reward_id FOREIGN KEY (referral_reward_id) REFERENCES public.referral_rewards(id) ON DELETE SET NULL;


--
-- Name: pre_registrations fk_pre_registrations_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pre_registrations
    ADD CONSTRAINT fk_pre_registrations_user_id FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: subscriptions fk_subscriptions_pre_launch_reward_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT fk_subscriptions_pre_launch_reward_id FOREIGN KEY (pre_launch_reward_id) REFERENCES public.pre_launch_rewards(user_id) ON DELETE SET NULL;


--
-- Name: subscriptions fk_subscriptions_referral_reward_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT fk_subscriptions_referral_reward_id FOREIGN KEY (referral_reward_id) REFERENCES public.referral_rewards(id) ON DELETE SET NULL;


--
-- Name: users fk_users_pre_registration_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT fk_users_pre_registration_id FOREIGN KEY (pre_registration_id) REFERENCES public.pre_registrations(id) ON DELETE SET NULL;


--
-- Name: fx_rate_cache fx_rate_cache_source_fetch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fx_rate_cache
    ADD CONSTRAINT fx_rate_cache_source_fetch_id_fkey FOREIGN KEY (source_fetch_id) REFERENCES public.fx_rate_fetches(id) ON DELETE SET NULL;


--
-- Name: guest_claim_tokens guest_claim_tokens_guest_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guest_claim_tokens
    ADD CONSTRAINT guest_claim_tokens_guest_identity_id_fkey FOREIGN KEY (guest_identity_id) REFERENCES public.guest_identities(id) ON DELETE CASCADE;


--
-- Name: guest_identities guest_identities_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guest_identities
    ADD CONSTRAINT guest_identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: maxmind_risk_assessments maxmind_risk_assessments_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maxmind_risk_assessments
    ADD CONSTRAINT maxmind_risk_assessments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: maxmind_risk_assessments maxmind_risk_assessments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maxmind_risk_assessments
    ADD CONSTRAINT maxmind_risk_assessments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: newsletter_subscriptions newsletter_subscriptions_coupon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newsletter_subscriptions
    ADD CONSTRAINT newsletter_subscriptions_coupon_id_fkey FOREIGN KEY (coupon_id) REFERENCES public.coupons(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: order_compliance_evidence_logs order_compliance_evidence_logs_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_compliance_evidence_logs
    ADD CONSTRAINT order_compliance_evidence_logs_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_compliance_evidence_logs order_compliance_evidence_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_compliance_evidence_logs
    ADD CONSTRAINT order_compliance_evidence_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: order_item_upgrade_selections order_item_upgrade_selections_order_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_item_upgrade_selections
    ADD CONSTRAINT order_item_upgrade_selections_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_product_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_product_variant_id_fkey FOREIGN KEY (product_variant_id) REFERENCES public.product_variants(id) ON DELETE SET NULL;


--
-- Name: orders orders_coupon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_coupon_id_fkey FOREIGN KEY (coupon_id) REFERENCES public.coupons(id) ON DELETE SET NULL;


--
-- Name: orders orders_pricing_snapshot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pricing_snapshot_id_fkey FOREIGN KEY (pricing_snapshot_id) REFERENCES public.pricing_publish_runs(snapshot_id) ON DELETE SET NULL;


--
-- Name: orders orders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: payment_events payment_events_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_events
    ADD CONSTRAINT payment_events_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: payment_events payment_events_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_events
    ADD CONSTRAINT payment_events_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE SET NULL;


--
-- Name: payment_items payment_items_order_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_items
    ADD CONSTRAINT payment_items_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON DELETE CASCADE;


--
-- Name: payment_items payment_items_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_items
    ADD CONSTRAINT payment_items_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE CASCADE;


--
-- Name: payment_refunds payment_refunds_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_refunds
    ADD CONSTRAINT payment_refunds_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);


--
-- Name: payment_refunds payment_refunds_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_refunds
    ADD CONSTRAINT payment_refunds_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: payments payments_credit_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_credit_transaction_id_fkey FOREIGN KEY (credit_transaction_id) REFERENCES public.credit_transactions(id) ON DELETE SET NULL;


--
-- Name: payments payments_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: payments payments_order_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON DELETE SET NULL;


--
-- Name: payments payments_product_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_product_variant_id_fkey FOREIGN KEY (product_variant_id) REFERENCES public.product_variants(id) ON DELETE SET NULL;


--
-- Name: payments payments_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id) ON DELETE SET NULL;


--
-- Name: payments payments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: pin_reset_requests pin_reset_requests_confirmed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pin_reset_requests
    ADD CONSTRAINT pin_reset_requests_confirmed_by_fkey FOREIGN KEY (confirmed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: pin_reset_requests pin_reset_requests_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pin_reset_requests
    ADD CONSTRAINT pin_reset_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: pin_reset_requests pin_reset_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pin_reset_requests
    ADD CONSTRAINT pin_reset_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: pre_launch_rewards pre_launch_rewards_redeemed_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pre_launch_rewards
    ADD CONSTRAINT pre_launch_rewards_redeemed_by_user_id_fkey FOREIGN KEY (redeemed_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: pre_launch_rewards pre_launch_rewards_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pre_launch_rewards
    ADD CONSTRAINT pre_launch_rewards_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.pre_registrations(id) ON DELETE CASCADE;


--
-- Name: price_history price_history_product_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_history
    ADD CONSTRAINT price_history_product_variant_id_fkey FOREIGN KEY (product_variant_id) REFERENCES public.product_variants(id) ON DELETE CASCADE;


--
-- Name: pricing_publish_runs pricing_publish_runs_fx_fetch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_publish_runs
    ADD CONSTRAINT pricing_publish_runs_fx_fetch_id_fkey FOREIGN KEY (fx_fetch_id) REFERENCES public.fx_rate_fetches(id) ON DELETE SET NULL;


--
-- Name: product_category_map product_category_map_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_category_map
    ADD CONSTRAINT product_category_map_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_fixed_price_history product_fixed_price_history_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_fixed_price_history
    ADD CONSTRAINT product_fixed_price_history_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_label_map product_label_map_label_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_label_map
    ADD CONSTRAINT product_label_map_label_id_fkey FOREIGN KEY (label_id) REFERENCES public.product_labels(id) ON DELETE CASCADE;


--
-- Name: product_label_map product_label_map_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_label_map
    ADD CONSTRAINT product_label_map_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_media product_media_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_media
    ADD CONSTRAINT product_media_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_sub_category_map product_sub_category_map_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_sub_category_map
    ADD CONSTRAINT product_sub_category_map_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_sub_category_map product_sub_category_map_sub_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_sub_category_map
    ADD CONSTRAINT product_sub_category_map_sub_category_id_fkey FOREIGN KEY (sub_category_id) REFERENCES public.product_sub_categories(id) ON DELETE CASCADE;


--
-- Name: product_variant_terms product_variant_terms_product_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variant_terms
    ADD CONSTRAINT product_variant_terms_product_variant_id_fkey FOREIGN KEY (product_variant_id) REFERENCES public.product_variants(id) ON DELETE CASCADE;


--
-- Name: product_variants product_variants_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: referral_rewards referral_rewards_redeemed_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_rewards
    ADD CONSTRAINT referral_rewards_redeemed_by_user_id_fkey FOREIGN KEY (redeemed_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: referral_rewards referral_rewards_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_rewards
    ADD CONSTRAINT referral_rewards_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.pre_registrations(id) ON DELETE CASCADE;


--
-- Name: referrals referrals_referred_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_referred_user_id_fkey FOREIGN KEY (referred_user_id) REFERENCES public.pre_registrations(id) ON DELETE SET NULL;


--
-- Name: share_events share_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_events
    ADD CONSTRAINT share_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.pre_registrations(id) ON DELETE CASCADE;


--
-- Name: subscription_reminder_events subscription_reminder_events_notification_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_reminder_events
    ADD CONSTRAINT subscription_reminder_events_notification_id_fkey FOREIGN KEY (notification_id) REFERENCES public.notifications(id) ON DELETE SET NULL;


--
-- Name: subscription_reminder_events subscription_reminder_events_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_reminder_events
    ADD CONSTRAINT subscription_reminder_events_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id) ON DELETE CASCADE;


--
-- Name: subscription_renewals subscription_renewals_invoice_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_renewals
    ADD CONSTRAINT subscription_renewals_invoice_payment_id_fkey FOREIGN KEY (invoice_payment_id) REFERENCES public.payments(id) ON DELETE SET NULL;


--
-- Name: subscription_renewals subscription_renewals_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_renewals
    ADD CONSTRAINT subscription_renewals_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id) ON DELETE CASCADE;


--
-- Name: subscription_upgrade_selections subscription_upgrade_selections_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_upgrade_selections
    ADD CONSTRAINT subscription_upgrade_selections_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: subscription_upgrade_selections subscription_upgrade_selections_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_upgrade_selections
    ADD CONSTRAINT subscription_upgrade_selections_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id) ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_billing_payment_method_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_billing_payment_method_id_fkey FOREIGN KEY (billing_payment_method_id) REFERENCES public.user_payment_methods(id) ON DELETE SET NULL;


--
-- Name: subscriptions subscriptions_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: subscriptions subscriptions_order_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON DELETE SET NULL;


--
-- Name: subscriptions subscriptions_product_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_product_variant_id_fkey FOREIGN KEY (product_variant_id) REFERENCES public.product_variants(id) ON DELETE SET NULL;


--
-- Name: subscriptions subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_calendar_claims user_calendar_claims_event_date_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_calendar_claims
    ADD CONSTRAINT user_calendar_claims_event_date_fkey FOREIGN KEY (event_date) REFERENCES public.calendar_events(event_date) ON DELETE CASCADE;


--
-- Name: user_calendar_claims user_calendar_claims_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_calendar_claims
    ADD CONSTRAINT user_calendar_claims_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.pre_registrations(id) ON DELETE CASCADE;


--
-- Name: user_payment_methods user_payment_methods_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_payment_methods
    ADD CONSTRAINT user_payment_methods_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_perks user_perks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_perks
    ADD CONSTRAINT user_perks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_raffle_entries user_raffle_entries_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_raffle_entries
    ADD CONSTRAINT user_raffle_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_status_audit user_status_audit_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_status_audit
    ADD CONSTRAINT user_status_audit_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: user_status_audit user_status_audit_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_status_audit
    ADD CONSTRAINT user_status_audit_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: user_vouchers user_vouchers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_vouchers
    ADD CONSTRAINT user_vouchers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: calendar_metrics_daily Manage calendar metrics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Manage calendar metrics" ON public.calendar_metrics_daily USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: calendar_settings Manage calendar settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Manage calendar settings" ON public.calendar_settings USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: calendar_events Public can read calendar events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can read calendar events" ON public.calendar_events FOR SELECT USING (((published = true) OR (auth.role() = 'service_role'::text)));


--
-- Name: calendar_raffles Public read raffles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read raffles" ON public.calendar_raffles FOR SELECT USING (true);


--
-- Name: calendar_referral_multipliers Public read referral multipliers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read referral multipliers" ON public.calendar_referral_multipliers FOR SELECT USING (true);


--
-- Name: calendar_spin_wheels Public read spin wheels; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read spin wheels" ON public.calendar_spin_wheels FOR SELECT USING (true);


--
-- Name: calendar_metrics_daily Read calendar metrics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Read calendar metrics" ON public.calendar_metrics_daily FOR SELECT USING ((auth.role() = 'service_role'::text));


--
-- Name: calendar_settings Read calendar settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Read calendar settings" ON public.calendar_settings FOR SELECT USING (true);


--
-- Name: calendar_events Service manage calendar events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service manage calendar events" ON public.calendar_events USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: calendar_raffle_entry_controls Service manage event controls; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service manage event controls" ON public.calendar_raffle_entry_controls USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: calendar_raffle_winners Service manage raffle winners; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service manage raffle winners" ON public.calendar_raffle_winners USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: calendar_raffles Service manage raffles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service manage raffles" ON public.calendar_raffles USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: calendar_referral_multipliers Service manage referral multipliers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service manage referral multipliers" ON public.calendar_referral_multipliers USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: calendar_spin_wheels Service manage spin wheels; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service manage spin wheels" ON public.calendar_spin_wheels USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: calendar_event_log Service read event logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service read event logs" ON public.calendar_event_log FOR SELECT USING ((auth.role() = 'service_role'::text));


--
-- Name: share_events Users can insert own share events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own share events" ON public.share_events FOR INSERT WITH CHECK (((auth.uid() IS NOT NULL) AND (user_id IN ( SELECT pre_registrations.id
   FROM public.pre_registrations
  WHERE (pre_registrations.supabase_auth_id = auth.uid())))));


--
-- Name: share_events Users can view own share events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own share events" ON public.share_events FOR SELECT USING (((auth.uid() IS NOT NULL) AND (user_id IN ( SELECT pre_registrations.id
   FROM public.pre_registrations
  WHERE (pre_registrations.supabase_auth_id = auth.uid())))));


--
-- Name: user_calendar_claims Users insert own calendar claims; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users insert own calendar claims" ON public.user_calendar_claims FOR INSERT WITH CHECK (((user_id IN ( SELECT pre_registrations.id
   FROM public.pre_registrations
  WHERE (pre_registrations.supabase_auth_id = auth.uid()))) OR (auth.role() = 'service_role'::text)));


--
-- Name: calendar_raffle_entries Users insert raffle entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users insert raffle entries" ON public.calendar_raffle_entries FOR INSERT WITH CHECK (((user_id IN ( SELECT pre_registrations.id
   FROM public.pre_registrations
  WHERE (pre_registrations.supabase_auth_id = auth.uid()))) OR (auth.role() = 'service_role'::text)));


--
-- Name: calendar_event_log Users log events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users log events" ON public.calendar_event_log FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: calendar_achievements Users manage achievements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage achievements" ON public.calendar_achievements USING (((user_id IN ( SELECT pre_registrations.id
   FROM public.pre_registrations
  WHERE (pre_registrations.supabase_auth_id = auth.uid()))) OR (auth.role() = 'service_role'::text))) WITH CHECK (((user_id IN ( SELECT pre_registrations.id
   FROM public.pre_registrations
  WHERE (pre_registrations.supabase_auth_id = auth.uid()))) OR (auth.role() = 'service_role'::text)));


--
-- Name: calendar_spin_results Users manage spin results; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage spin results" ON public.calendar_spin_results USING (((user_id IN ( SELECT pre_registrations.id
   FROM public.pre_registrations
  WHERE (pre_registrations.supabase_auth_id = auth.uid()))) OR (auth.role() = 'service_role'::text))) WITH CHECK (((user_id IN ( SELECT pre_registrations.id
   FROM public.pre_registrations
  WHERE (pre_registrations.supabase_auth_id = auth.uid()))) OR (auth.role() = 'service_role'::text)));


--
-- Name: calendar_streaks Users manage streaks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage streaks" ON public.calendar_streaks USING (((user_id IN ( SELECT pre_registrations.id
   FROM public.pre_registrations
  WHERE (pre_registrations.supabase_auth_id = auth.uid()))) OR (auth.role() = 'service_role'::text))) WITH CHECK (((user_id IN ( SELECT pre_registrations.id
   FROM public.pre_registrations
  WHERE (pre_registrations.supabase_auth_id = auth.uid()))) OR (auth.role() = 'service_role'::text)));


--
-- Name: calendar_vouchers Users manage vouchers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage vouchers" ON public.calendar_vouchers USING (((user_id IN ( SELECT pre_registrations.id
   FROM public.pre_registrations
  WHERE (pre_registrations.supabase_auth_id = auth.uid()))) OR (auth.role() = 'service_role'::text))) WITH CHECK (((user_id IN ( SELECT pre_registrations.id
   FROM public.pre_registrations
  WHERE (pre_registrations.supabase_auth_id = auth.uid()))) OR (auth.role() = 'service_role'::text)));


--
-- Name: user_calendar_claims Users update own calendar claims; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users update own calendar claims" ON public.user_calendar_claims FOR UPDATE USING (((user_id IN ( SELECT pre_registrations.id
   FROM public.pre_registrations
  WHERE (pre_registrations.supabase_auth_id = auth.uid()))) OR (auth.role() = 'service_role'::text)));


--
-- Name: calendar_raffle_entries Users update raffle entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users update raffle entries" ON public.calendar_raffle_entries FOR UPDATE USING (((user_id IN ( SELECT pre_registrations.id
   FROM public.pre_registrations
  WHERE (pre_registrations.supabase_auth_id = auth.uid()))) OR (auth.role() = 'service_role'::text)));


--
-- Name: user_calendar_claims Users view own calendar claims; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own calendar claims" ON public.user_calendar_claims FOR SELECT USING (((user_id IN ( SELECT pre_registrations.id
   FROM public.pre_registrations
  WHERE (pre_registrations.supabase_auth_id = auth.uid()))) OR (auth.role() = 'service_role'::text)));


--
-- Name: calendar_raffle_entries Users view raffle entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view raffle entries" ON public.calendar_raffle_entries FOR SELECT USING (((user_id IN ( SELECT pre_registrations.id
   FROM public.pre_registrations
  WHERE (pre_registrations.supabase_auth_id = auth.uid()))) OR (auth.role() = 'service_role'::text)));


--
-- Name: calendar_raffle_winners Users view raffle winners; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view raffle winners" ON public.calendar_raffle_winners FOR SELECT USING (true);


--
-- Name: calendar_achievements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendar_achievements ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_event_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendar_event_log ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_metrics_daily; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendar_metrics_daily ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_raffle_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendar_raffle_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_raffle_entry_controls; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendar_raffle_entry_controls ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_raffle_winners; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendar_raffle_winners ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_raffles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendar_raffles ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_referral_multipliers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendar_referral_multipliers ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendar_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_spin_results; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendar_spin_results ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_spin_wheels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendar_spin_wheels ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_streaks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendar_streaks ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_vouchers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendar_vouchers ENABLE ROW LEVEL SECURITY;

--
-- Name: order_compliance_evidence_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_compliance_evidence_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: share_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.share_events ENABLE ROW LEVEL SECURITY;

--
-- Name: user_calendar_claims; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_calendar_claims ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict COa1THJgQrv9Z5ewM53OQhHnrZC8tusVX2HVwmyFFRxR1k2CpaIGFgemjrjhZEW

