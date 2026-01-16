-- =====================================================
-- MIGRATION 008: Refresh calendar rewards for Dec 1-7
-- Aligns daily configs with finalized campaign mechanics
-- =====================================================

BEGIN;

UPDATE calendar_events
SET types = ARRAY['D','X'],
    config = jsonb_build_object(
      'base_rewards', jsonb_build_object(
        'vouchers', '[]'::jsonb,
        'raffle_entries', jsonb_build_array(
          jsonb_build_object('raffle_id', 'mega_25', 'count', 1, 'source', 'claim_base')
        )
      ),
      'choices', jsonb_build_array(
        jsonb_build_object(
          'key', 'lane_entertainment',
          'title', 'Entertainment Lane',
          'description', 'Entertainment bundle token',
          'rewards', jsonb_build_object(
            'vouchers', jsonb_build_array(
              jsonb_build_object(
                'voucher_type', 'percent_off',
                'scope', 'entertainment_lane',
                'amount', 10,
                'metadata', jsonb_build_object('app_examples', jsonb_build_array('Netflix 3 mo', 'Spotify Premium', 'Xbox Game Pass'))
              )
            )
          )
        ),
        jsonb_build_object(
          'key', 'lane_productivity',
          'title', 'Productivity Lane',
          'description', 'Focus tools boost',
          'rewards', jsonb_build_object(
            'vouchers', jsonb_build_array(
              jsonb_build_object(
                'voucher_type', 'percent_off',
                'scope', 'productivity_lane',
                'amount', 10,
                'metadata', jsonb_build_object('app_examples', jsonb_build_array('Canva Pro', 'Notion AI', 'Adobe Express'))
              )
            )
          )
        ),
        jsonb_build_object(
          'key', 'lane_ai',
          'title', 'AI Lane',
          'description', 'AI copilots welcome pack',
          'rewards', jsonb_build_object(
            'vouchers', jsonb_build_array(
              jsonb_build_object(
                'voucher_type', 'percent_off',
                'scope', 'ai_lane',
                'amount', 10,
                'metadata', jsonb_build_object('app_examples', jsonb_build_array('ChatGPT Plus', 'Perplexity Pro', 'Google AI Premium'))
              )
            )
          )
        )
      ),
      'ui', jsonb_build_object('badges', ARRAY['D','X'], 'copy_key', 'dec01_choose_lane')
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-01';

UPDATE calendar_events
SET types = ARRAY['D'],
    config = jsonb_build_object(
      'base_rewards', jsonb_build_object('vouchers', '[]'::jsonb),
      'choices', jsonb_build_array(
        jsonb_build_object(
          'key', 'ai_perplexity',
          'title', 'Perplexity Pro Boost',
          'rewards', jsonb_build_object(
            'vouchers', jsonb_build_array(
              jsonb_build_object('voucher_type', 'percent_off', 'scope', 'Perplexity Pro', 'amount', 15, 'metadata', jsonb_build_object('term_months', 12))
            )
          )
        ),
        jsonb_build_object(
          'key', 'ai_google',
          'title', 'Google AI Pro Boost',
          'rewards', jsonb_build_object(
            'vouchers', jsonb_build_array(
              jsonb_build_object('voucher_type', 'percent_off', 'scope', 'Google AI Pro', 'amount', 15, 'metadata', jsonb_build_object('term_months', 12))
            )
          )
        )
      ),
      'ui', jsonb_build_object('badges', ARRAY['D'], 'copy_key', 'dec02_ai_boost')
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-02';

UPDATE calendar_events
SET types = ARRAY['F'],
    config = jsonb_build_object(
      'base_rewards', jsonb_build_object(
        'vouchers', jsonb_build_array(
          jsonb_build_object(
            'voucher_type', 'free_months',
            'scope', 'Duolingo Super',
            'amount', 3,
            'metadata', jsonb_build_object('paid_months_required', 9, 'message', 'Pay for 9 months, get 3 months free')
          )
        )
      ),
      'ui', jsonb_build_object('badges', ARRAY['F'], 'copy_key', 'dec03_language_power')
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-03';

UPDATE calendar_events
SET types = ARRAY['R'],
    config = jsonb_build_object(
      'base_rewards', jsonb_build_object('vouchers', '[]'::jsonb),
      'referral_bonus', jsonb_build_object('description', 'Referrals count 2x today'),
      'ui', jsonb_build_object('badges', ARRAY['R'], 'copy_key', 'dec04_referral_multiplier')
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-04';

UPDATE calendar_events
SET types = ARRAY['D','F'],
    config = jsonb_build_object(
      'base_rewards', jsonb_build_object('vouchers', '[]'::jsonb),
      'choices', jsonb_build_array(
        jsonb_build_object(
          'key', 'prime_video_percent',
          'title', 'Prime Video 10% off',
          'rewards', jsonb_build_object(
            'vouchers', jsonb_build_array(
              jsonb_build_object('voucher_type', 'percent_off', 'scope', 'Amazon Prime Video', 'amount', 10, 'metadata', jsonb_build_object('term_months', 12))
            )
          )
        ),
        jsonb_build_object(
          'key', 'netflix_stack',
          'title', 'Netflix Stackable Month',
          'rewards', jsonb_build_object(
            'vouchers', jsonb_build_array(
              jsonb_build_object('voucher_type', 'stackable', 'scope', 'Netflix 4K', 'amount', 1, 'metadata', jsonb_build_object('requires_paid_months', 3, 'free_months', 1))
            )
          )
        )
      ),
      'ui', jsonb_build_object('badges', ARRAY['D','F'], 'copy_key', 'dec05_streaming_starter')
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-05';

UPDATE calendar_events
SET types = ARRAY['X','R'],
    config = jsonb_build_object(
      'base_rewards', jsonb_build_object(
        'raffle_entries', jsonb_build_array(
          jsonb_build_object('raffle_id', 'mega_25', 'count', 1, 'source', 'claim_base', 'metadata', jsonb_build_object('prize', 'Pro AI Year Pack'))
        )
      ),
      'raffle', jsonb_build_object(
        'raffle_id', 'mega_25',
        'entries_on_claim', 1,
        'bonus_per_referral_today', 1
      ),
      'ui', jsonb_build_object('badges', ARRAY['X','R'], 'copy_key', 'dec06_mystery_ai_box')
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-06';

UPDATE calendar_referral_multipliers
SET multiplier = 1,
    notes = 'Each referral = +1 AI raffle entry',
    metadata = jsonb_build_object('raffle_id', 'mega_25', 'source', 'mystery_ai_box')
WHERE event_date = DATE '2025-12-06' AND applies_to = 'raffle_entries';

UPDATE calendar_events
SET types = ARRAY['D'],
    config = jsonb_build_object(
      'base_rewards', jsonb_build_object('vouchers', '[]'::jsonb),
      'choices', jsonb_build_array(
        jsonb_build_object(
          'key', 'canva_day',
          'title', '15% off Canva Pro 1 yr',
          'rewards', jsonb_build_object(
            'vouchers', jsonb_build_array(
              jsonb_build_object('voucher_type', 'percent_off', 'scope', 'Canva Pro', 'amount', 15, 'metadata', jsonb_build_object('term_months', 12))
            )
          )
        ),
        jsonb_build_object(
          'key', 'adobe_day',
          'title', '10% off Adobe CC All Apps',
          'rewards', jsonb_build_object(
            'vouchers', jsonb_build_array(
              jsonb_build_object('voucher_type', 'percent_off', 'scope', 'Adobe Creative Cloud All Apps', 'amount', 10, 'metadata', jsonb_build_object('term_months', 12))
            )
          )
        )
      ),
      'ui', jsonb_build_object('badges', ARRAY['D'], 'copy_key', 'dec07_creator_day')
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-07';

COMMIT;
