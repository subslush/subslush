-- Seed data for pre-launch + minimal linked main users/subscriptions
-- Safe to re-run (uses ON CONFLICT DO NOTHING).

BEGIN;

-- =====================================================
-- CORE USERS (main app)
-- =====================================================
INSERT INTO users (id, email, first_name, last_name, status, created_at, last_login)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'alice@example.com', 'Alice', 'Tester', 'active', NOW() - INTERVAL '30 days', NOW() - INTERVAL '2 days'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.com', 'Bob', 'Seeder', 'active', NOW() - INTERVAL '28 days', NOW() - INTERVAL '5 days'),
  ('33333333-3333-3333-3333-333333333333', 'charlie@example.com', 'Charlie', 'Demo', 'active', NOW() - INTERVAL '15 days', NOW() - INTERVAL '1 day')
ON CONFLICT DO NOTHING;

-- =====================================================
-- PRE-REGISTRATIONS (pre-launch users)
-- =====================================================
INSERT INTO pre_registrations (
  id,
  email,
  created_at,
  last_login,
  referral_code,
  referred_by_code,
  ip_address,
  user_agent,
  source,
  status,
  email_verified,
  verification_token,
  verification_sent_at,
  username,
  password_hash,
  supabase_auth_id,
  user_id
)
VALUES
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'alice@example.com',
    NOW() - INTERVAL '30 days',
    NOW() - INTERVAL '2 days',
    'ALICE123',
    'BOB123',
    '10.0.0.10',
    'seed-script',
    'referral',
    'active',
    TRUE,
    'verify-alice-001',
    NOW() - INTERVAL '29 days',
    'alice1',
    'hashed_pw_alice',
    '11111111-1111-1111-1111-111111111111',
    '11111111-1111-1111-1111-111111111111'
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'bob@example.com',
    NOW() - INTERVAL '28 days',
    NOW() - INTERVAL '5 days',
    'BOB123',
    NULL,
    '10.0.0.11',
    'seed-script',
    'organic',
    'active',
    TRUE,
    'verify-bob-001',
    NOW() - INTERVAL '27 days',
    'bob2',
    'hashed_pw_bob',
    '22222222-2222-2222-2222-222222222222',
    '22222222-2222-2222-2222-222222222222'
  ),
  (
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'charlie@example.com',
    NOW() - INTERVAL '15 days',
    NOW() - INTERVAL '1 day',
    'CHARLIE123',
    'ALICE123',
    '10.0.0.12',
    'seed-script',
    'referral',
    'active',
    TRUE,
    'verify-charlie-001',
    NOW() - INTERVAL '14 days',
    'charlie3',
    'hashed_pw_charlie',
    '33333333-3333-3333-3333-333333333333',
    '33333333-3333-3333-3333-333333333333'
  )
ON CONFLICT DO NOTHING;

-- Link users back to pre_registrations if column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'pre_registration_id'
  ) THEN
    UPDATE users SET pre_registration_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    WHERE id = '11111111-1111-1111-1111-111111111111'
      AND (pre_registration_id IS DISTINCT FROM 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

    UPDATE users SET pre_registration_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    WHERE id = '22222222-2222-2222-2222-222222222222'
      AND (pre_registration_id IS DISTINCT FROM 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

    UPDATE users SET pre_registration_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
    WHERE id = '33333333-3333-3333-3333-333333333333'
      AND (pre_registration_id IS DISTINCT FROM 'cccccccc-cccc-cccc-cccc-cccccccccccc');
  END IF;
END $$;

-- =====================================================
-- REFERRALS + LEADERBOARD
-- =====================================================
INSERT INTO referrals (
  referrer_code,
  referred_email,
  referred_user_id,
  status,
  created_at,
  completed_at,
  ip_address
)
VALUES
  (
    'BOB123',
    'alice@example.com',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'rewarded',
    NOW() - INTERVAL '29 days',
    NOW() - INTERVAL '28 days',
    '10.0.0.11'
  ),
  (
    'ALICE123',
    'charlie@example.com',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'completed',
    NOW() - INTERVAL '10 days',
    NOW() - INTERVAL '9 days',
    '10.0.0.12'
  ),
  (
    'ALICE123',
    'delta@example.com',
    NULL,
    'pending',
    NOW() - INTERVAL '2 days',
    NULL,
    '10.0.0.13'
  )
ON CONFLICT (referrer_code, referred_email) DO NOTHING;

INSERT INTO leaderboard (
  user_id,
  referral_count,
  verified_referral_count,
  rank,
  reward_tier,
  prize_eligibility,
  last_updated
)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 4, 3, 2, '1_month', 'top_100_giftcard', NOW() - INTERVAL '1 day'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 10, 9, 1, '3_months', 'top_2_macbook', NOW() - INTERVAL '1 day'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 1, 1, 5, '1_month', NULL, NOW() - INTERVAL '1 day')
ON CONFLICT (user_id) DO NOTHING;

-- =====================================================
-- REWARDS (pre-launch + referral)
-- =====================================================
INSERT INTO pre_launch_rewards (
  user_id,
  free_months,
  founder_status,
  prize_won,
  referral_count_at_award,
  awarded_at,
  notes,
  redeemed_by_user_id,
  redeemed_at,
  applied_value_cents
)
VALUES
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    1,
    TRUE,
    NULL,
    3,
    NOW() - INTERVAL '20 days',
    'Seed: 1 free month + founder badge',
    NULL,
    NULL,
    NULL
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    3,
    FALSE,
    'top_2_macbook',
    12,
    NOW() - INTERVAL '18 days',
    'Seed: 3 months + prize',
    '22222222-2222-2222-2222-222222222222',
    NOW() - INTERVAL '1 day',
    1200
  ),
  (
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    12,
    FALSE,
    'top_1_iphone',
    25,
    NOW() - INTERVAL '12 days',
    'Seed: 12 months + prize',
    NULL,
    NULL,
    NULL
  )
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO referral_rewards (
  id,
  user_id,
  reward_type,
  tier,
  free_months,
  applies_to,
  is_redeemed,
  earned_at,
  redeemed_by_user_id,
  redeemed_at,
  applied_value_cents,
  subscription_id
)
VALUES
  (
    'e1111111-1111-1111-1111-111111111111',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'email_reward',
    '1_friend',
    1,
    'first_purchase',
    FALSE,
    NOW() - INTERVAL '25 days',
    NULL,
    NULL,
    NULL,
    NULL
  ),
  (
    'e2222222-2222-2222-2222-222222222222',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'purchase_reward',
    '10_friends',
    3,
    'min_1_year',
    TRUE,
    NOW() - INTERVAL '21 days',
    '22222222-2222-2222-2222-222222222222',
    NOW() - INTERVAL '2 days',
    1500,
    NULL
  ),
  (
    'e3333333-3333-3333-3333-333333333333',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'purchase_reward',
    '25_friends',
    6,
    'min_2_years',
    FALSE,
    NOW() - INTERVAL '8 days',
    NULL,
    NULL,
    NULL,
    NULL
  )
ON CONFLICT (user_id, reward_type, tier) DO NOTHING;

-- =====================================================
-- CALENDAR EVENTS + VOUCHERS + RAFFLES
-- =====================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'calendar_events'
  ) THEN
INSERT INTO calendar_events (
  id,
  event_date,
  slug,
  types,
  config,
  claim_window_start,
  claim_window_end,
  published,
  created_at,
  updated_at
)
VALUES
  (
    'f1111111-1111-1111-1111-111111111111',
    DATE '2025-12-01',
    'day-1-seed',
    ARRAY['voucher'],
    '{}'::jsonb,
    TIMESTAMPTZ '2025-11-30 00:00:00+00',
    TIMESTAMPTZ '2025-12-02 00:00:00+00',
    TRUE,
    NOW() - INTERVAL '5 days',
    NOW() - INTERVAL '5 days'
  ),
  (
    'f2222222-2222-2222-2222-222222222222',
    DATE '2025-12-02',
    'day-2-seed',
    ARRAY['voucher', 'raffle'],
    '{}'::jsonb,
    TIMESTAMPTZ '2025-12-01 00:00:00+00',
    TIMESTAMPTZ '2025-12-03 00:00:00+00',
    TRUE,
    NOW() - INTERVAL '4 days',
    NOW() - INTERVAL '4 days'
  )
ON CONFLICT DO NOTHING;

INSERT INTO calendar_vouchers (
  id,
  user_id,
  event_date,
  voucher_type,
  scope,
  amount,
  metadata,
  status,
  issued_at,
  redeemed_at
)
VALUES
  (
    'd1111111-1111-1111-1111-111111111111',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    DATE '2025-12-01',
    'credit',
    'global',
    5.00,
    jsonb_build_object('source', 'seed'),
    'issued',
    NOW() - INTERVAL '3 days',
    NULL
  ),
  (
    'd2222222-2222-2222-2222-222222222222',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    DATE '2025-12-02',
    'free_month',
    'global',
    NULL,
    jsonb_build_object('source', 'seed'),
    'redeemed',
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '1 day'
  )
ON CONFLICT (user_id, event_date, voucher_type, scope) DO NOTHING;

INSERT INTO calendar_raffles (
  id,
  name,
  start_at,
  end_at,
  draw_at,
  rules,
  status,
  created_at,
  updated_at
)
VALUES
  (
    'raffle_seed_1',
    'Seed Raffle 1',
    TIMESTAMPTZ '2025-12-01 00:00:00+00',
    TIMESTAMPTZ '2025-12-05 00:00:00+00',
    TIMESTAMPTZ '2025-12-06 00:00:00+00',
    jsonb_build_object('min_entries', 1, 'max_entries', 10),
    'active',
    NOW() - INTERVAL '5 days',
    NOW() - INTERVAL '5 days'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO calendar_raffle_entries (
  raffle_id,
  user_id,
  source,
  event_date,
  count,
  metadata,
  created_at,
  updated_at
)
VALUES
  (
    'raffle_seed_1',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'calendar',
    DATE '2025-12-01',
    2,
    jsonb_build_object('source', 'seed'),
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '2 days'
  ),
  (
    'raffle_seed_1',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'calendar',
    DATE '2025-12-02',
    1,
    jsonb_build_object('source', 'seed'),
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '2 days'
  )
ON CONFLICT (raffle_id, user_id, source, event_date) DO NOTHING;
  ELSE
    RAISE NOTICE 'Skipping calendar seed data; calendar tables not present.';
  END IF;
END $$;

-- =====================================================
-- SUBSCRIPTIONS (for reward redemption tests)
-- =====================================================
INSERT INTO subscriptions (
  id,
  user_id,
  service_type,
  service_plan,
  start_date,
  end_date,
  renewal_date,
  status,
  auto_renew,
  next_billing_at,
  price_cents,
  currency,
  created_at
)
VALUES
  (
    '51111111-1111-1111-1111-111111111111',
    '11111111-1111-1111-1111-111111111111',
    'netflix',
    'standard',
    NOW() - INTERVAL '20 days',
    NOW() + INTERVAL '10 days',
    NOW() + INTERVAL '10 days',
    'active',
    TRUE,
    NOW() + INTERVAL '10 days',
    1299,
    'USD',
    NOW() - INTERVAL '20 days'
  ),
  (
    '52222222-2222-2222-2222-222222222222',
    '22222222-2222-2222-2222-222222222222',
    'spotify',
    'premium',
    NOW() - INTERVAL '50 days',
    NOW() - INTERVAL '5 days',
    NOW() - INTERVAL '5 days',
    'expired',
    FALSE,
    NULL,
    999,
    'USD',
    NOW() - INTERVAL '50 days'
  )
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- PRELAUNCH USER MOCK DATA (for dashboard display)
-- =====================================================
INSERT INTO users (id, email, first_name, last_name, status, created_at, last_login)
VALUES
  ('c04c4459-2948-4367-a306-ba8e1bd4907d', 'prelaunch-viewer@example.com', 'Prelaunch', 'Viewer', 'active', NOW() - INTERVAL '7 days', NOW() - INTERVAL '1 day')
ON CONFLICT DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'user_perks'
  ) THEN
    INSERT INTO user_perks (
      id,
      user_id,
      source_type,
      source_id,
      reward_type,
      tier,
      applies_to,
      free_months,
      founder_status,
      prize_won,
      notes,
      awarded_at,
      metadata
    )
    VALUES
      (
        'a1111111-aaaa-4aaa-8aaa-111111111111',
        'c04c4459-2948-4367-a306-ba8e1bd4907d',
        'pre_launch_reward',
        'a1111111-aaaa-4aaa-8aaa-111111111111',
        'pre_launch',
        NULL,
        NULL,
        1,
        TRUE,
        NULL,
        'Seed: early supporter bonus',
        NOW() - INTERVAL '12 days',
        jsonb_build_object('source', 'seed')
      ),
      (
        'b2222222-bbbb-4bbb-8bbb-222222222222',
        'c04c4459-2948-4367-a306-ba8e1bd4907d',
        'referral_reward',
        'b2222222-bbbb-4bbb-8bbb-222222222222',
        'email_reward',
        '1_friend',
        'first_purchase',
        1,
        FALSE,
        NULL,
        'Seed: referral email reward',
        NOW() - INTERVAL '10 days',
        jsonb_build_object('source', 'seed')
      ),
      (
        'c3333333-cccc-4ccc-8ccc-333333333333',
        'c04c4459-2948-4367-a306-ba8e1bd4907d',
        'referral_reward',
        'c3333333-cccc-4ccc-8ccc-333333333333',
        'purchase_reward',
        '10_friends',
        'min_1_year',
        3,
        FALSE,
        NULL,
        'Seed: referral purchase reward',
        NOW() - INTERVAL '8 days',
        jsonb_build_object('source', 'seed')
      ),
      (
        'd4444444-dddd-4ddd-8ddd-444444444444',
        'c04c4459-2948-4367-a306-ba8e1bd4907d',
        'pre_launch_reward',
        'd4444444-dddd-4ddd-8ddd-444444444444',
        'pre_launch',
        NULL,
        NULL,
        12,
        FALSE,
        'raffle_prize_pack',
        'Seed: raffle prize winner',
        NOW() - INTERVAL '6 days',
        jsonb_build_object('source', 'seed', 'badge', 'raffle_winner')
      )
    ON CONFLICT DO NOTHING;
  ELSE
    RAISE NOTICE 'Skipping user_perks seed data; table not present.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'user_vouchers'
  ) THEN
    INSERT INTO user_vouchers (
      id,
      user_id,
      source_type,
      source_id,
      event_date,
      voucher_type,
      scope,
      amount,
      metadata,
      status,
      issued_at,
      redeemed_at
    )
    VALUES
      (
        'e1111111-aaaa-4aaa-8aaa-111111111111',
        'c04c4459-2948-4367-a306-ba8e1bd4907d',
        'calendar_voucher',
        'e1111111-aaaa-4aaa-8aaa-111111111111',
        CURRENT_DATE - INTERVAL '5 days',
        'credit',
        'global',
        5.00,
        jsonb_build_object('source', 'seed'),
        'issued',
        NOW() - INTERVAL '5 days',
        NULL
      ),
      (
        'e2222222-bbbb-4bbb-8bbb-222222222222',
        'c04c4459-2948-4367-a306-ba8e1bd4907d',
        'calendar_voucher',
        'e2222222-bbbb-4bbb-8bbb-222222222222',
        CURRENT_DATE - INTERVAL '4 days',
        'free_month',
        'global',
        NULL,
        jsonb_build_object('source', 'seed'),
        'redeemed',
        NOW() - INTERVAL '4 days',
        NOW() - INTERVAL '2 days'
      ),
      (
        'e3333333-cccc-4ccc-8ccc-333333333333',
        'c04c4459-2948-4367-a306-ba8e1bd4907d',
        'calendar_voucher',
        'e3333333-cccc-4ccc-8ccc-333333333333',
        CURRENT_DATE - INTERVAL '3 days',
        'discount',
        'global',
        10.00,
        jsonb_build_object('source', 'seed'),
        'issued',
        NOW() - INTERVAL '3 days',
        NULL
      ),
      (
        'e4444444-dddd-4ddd-8ddd-444444444444',
        'c04c4459-2948-4367-a306-ba8e1bd4907d',
        'calendar_voucher',
        'e4444444-dddd-4ddd-8ddd-444444444444',
        CURRENT_DATE - INTERVAL '2 days',
        'credit',
        'global',
        3.50,
        jsonb_build_object('source', 'seed'),
        'issued',
        NOW() - INTERVAL '2 days',
        NULL
      )
    ON CONFLICT DO NOTHING;
  ELSE
    RAISE NOTICE 'Skipping user_vouchers seed data; table not present.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'user_raffle_entries'
  ) THEN
    INSERT INTO user_raffle_entries (
      id,
      user_id,
      raffle_id,
      source,
      event_date,
      count,
      metadata,
      created_at,
      updated_at
    )
    VALUES
      (
        'f1111111-aaaa-4aaa-8aaa-111111111111',
        'c04c4459-2948-4367-a306-ba8e1bd4907d',
        'raffle_seed_alpha',
        'calendar',
        CURRENT_DATE - INTERVAL '5 days',
        2,
        jsonb_build_object('source', 'seed'),
        NOW() - INTERVAL '5 days',
        NOW() - INTERVAL '5 days'
      ),
      (
        'f2222222-bbbb-4bbb-8bbb-222222222222',
        'c04c4459-2948-4367-a306-ba8e1bd4907d',
        'raffle_seed_beta',
        'calendar',
        CURRENT_DATE - INTERVAL '4 days',
        1,
        jsonb_build_object('source', 'seed'),
        NOW() - INTERVAL '4 days',
        NOW() - INTERVAL '4 days'
      ),
      (
        'f3333333-cccc-4ccc-8ccc-333333333333',
        'c04c4459-2948-4367-a306-ba8e1bd4907d',
        'raffle_seed_gamma',
        'referral',
        CURRENT_DATE - INTERVAL '3 days',
        4,
        jsonb_build_object('source', 'seed'),
        NOW() - INTERVAL '3 days',
        NOW() - INTERVAL '3 days'
      ),
      (
        'f4444444-dddd-4ddd-8ddd-444444444444',
        'c04c4459-2948-4367-a306-ba8e1bd4907d',
        'raffle_seed_delta',
        'calendar',
        CURRENT_DATE - INTERVAL '2 days',
        3,
        jsonb_build_object('source', 'seed'),
        NOW() - INTERVAL '2 days',
        NOW() - INTERVAL '2 days'
      )
    ON CONFLICT DO NOTHING;
  ELSE
    RAISE NOTICE 'Skipping user_raffle_entries seed data; table not present.';
  END IF;
END $$;

COMMIT;
