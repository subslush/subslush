-- =====================================================
-- MIGRATION 014: Calendar updates for Dec 2-12
-- Adds raffle entries and clarifies voucher copy/labels
-- =====================================================

BEGIN;

-- Day 2: add raffle ticket base reward while keeping AI boosts
UPDATE calendar_events
SET config = jsonb_set(
      config,
      '{base_rewards}',
      jsonb_build_object(
        'vouchers', coalesce((config->'base_rewards'->'vouchers'), '[]'::jsonb),
        'raffle_entries', jsonb_build_array(
          jsonb_build_object('raffle_id', 'mega_25', 'count', 1, 'source', 'claim_base')
        )
      ),
      true
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-02';

-- Day 3: clarify Duolingo reward labelling
UPDATE calendar_events
SET config = jsonb_set(
      config,
      '{base_rewards}',
      jsonb_build_object(
        'vouchers', jsonb_build_array(
          jsonb_build_object(
            'voucher_type', 'free_months',
            'scope', 'Duolingo Super',
            'amount', 3,
            'metadata', jsonb_build_object(
              'paid_months_required', 9,
              'message', 'Buy 9 months, get 3 free (12 months total)',
              'term_months', 12,
              'display_title', '3 Free Months - Duolingo Super (1YR Subscription)',
              'claim_label', '3 Free Months',
              'display_note', '1YR Subscription'
            )
          )
        )
      ),
      true
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-03';

-- Day 4: add 2 raffle tickets
UPDATE calendar_events
SET config = jsonb_set(
      config,
      '{base_rewards}',
      jsonb_build_object(
        'vouchers', coalesce((config->'base_rewards'->'vouchers'), '[]'::jsonb),
        'raffle_entries', jsonb_build_array(
          jsonb_build_object('raffle_id', 'mega_25', 'count', 2, 'source', 'claim_base')
        )
      ),
      true
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-04';

-- Day 5: add raffle ticket and clean streaming vouchers
UPDATE calendar_events
SET config = jsonb_set(
      jsonb_set(
        config,
        '{base_rewards}',
        jsonb_build_object(
          'vouchers', coalesce((config->'base_rewards'->'vouchers'), '[]'::jsonb),
          'raffle_entries', jsonb_build_array(
            jsonb_build_object('raffle_id', 'mega_25', 'count', 1, 'source', 'claim_base')
          )
        ),
        true
      ),
      '{choices}',
      jsonb_build_array(
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
              jsonb_build_object(
                'voucher_type', 'percent_off',
                'scope', 'Netflix 4K',
                'amount', 10,
                'metadata', jsonb_build_object('stackable', true, 'display_note', 'Stackable')
              )
            )
          )
        )
      ),
      true
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-05';

-- Day 6: double raffle tickets
UPDATE calendar_events
SET config = jsonb_set(
      jsonb_set(
        config,
        '{base_rewards}',
        jsonb_build_object(
          'vouchers', coalesce((config->'base_rewards'->'vouchers'), '[]'::jsonb),
          'raffle_entries', jsonb_build_array(
            jsonb_build_object('raffle_id', 'mega_25', 'count', 2, 'source', 'claim_base', 'metadata', jsonb_build_object('prize', 'Pro AI Year Pack'))
          )
        ),
        true
      ),
      '{raffle}',
      jsonb_build_object(
        'raffle_id', 'mega_25',
        'entries_on_claim', 2,
        'bonus_per_referral_today', 1
      ),
      true
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-06';

-- Day 7: add raffle ticket and keep creator choices
UPDATE calendar_events
SET config = jsonb_set(
      config,
      '{base_rewards}',
      jsonb_build_object(
        'vouchers', coalesce((config->'base_rewards'->'vouchers'), '[]'::jsonb),
        'raffle_entries', jsonb_build_array(
          jsonb_build_object('raffle_id', 'mega_25', 'count', 1, 'source', 'claim_base')
        )
      ),
      true
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-07';

-- Day 8: clarify Entertainment stackable reward
UPDATE calendar_events
SET config = jsonb_set(
      config,
      '{base_rewards}',
      jsonb_build_object(
        'vouchers', jsonb_build_array(
          jsonb_build_object(
            'voucher_type', 'percent_off',
            'scope', 'Entertainment Lane',
            'amount', 5,
            'metadata', jsonb_build_object(
              'stackable', true,
              'label', 'Warm-up booster',
              'display_note', 'Entertainment group - Stackable'
            )
          )
        )
      ),
      true
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-08';

-- Day 11: add raffle ticket and clarify ChatGPT choices
UPDATE calendar_events
SET config = jsonb_set(
      jsonb_set(
        config,
        '{base_rewards}',
        jsonb_build_object(
          'vouchers', coalesce((config->'base_rewards'->'vouchers'), '[]'::jsonb),
          'raffle_entries', jsonb_build_array(
            jsonb_build_object('raffle_id', 'mega_25', 'count', 1, 'source', 'claim_base')
          )
        ),
        true
      ),
      '{choices}',
      jsonb_build_array(
        jsonb_build_object(
          'key', 'chatgpt_bonus_month',
          'title', 'Bonus month when you buy 3',
          'rewards', jsonb_build_object(
            'vouchers', jsonb_build_array(
              jsonb_build_object(
                'voucher_type', 'free_months',
                'scope', 'ChatGPT Plus',
                'amount', 1,
                'metadata', jsonb_build_object(
                  'requires_paid_months', 3,
                  'display_note', 'Buy 3 months, get 1 month free',
                  'claim_label', '1 Free Month (buy 3 months)'
                )
              )
            )
          )
        ),
        jsonb_build_object(
          'key', 'chatgpt_annual_discount',
          'title', '20% off ChatGPT 1 year',
          'rewards', jsonb_build_object(
            'vouchers', jsonb_build_array(
              jsonb_build_object(
                'voucher_type', 'percent_off',
                'scope', 'ChatGPT Plus',
                'amount', 20,
                'metadata', jsonb_build_object('term_months', 12, 'display_title', '20% OFF - ChatGPT Plus (annual)')
              )
            )
          )
        )
      ),
      true
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-11';

-- Day 12: 3 raffle tickets and remove spin mechanic
UPDATE calendar_events
SET config = jsonb_set(
      (config - 'spin'),
      '{base_rewards}',
      jsonb_build_object(
        'vouchers', coalesce((config->'base_rewards'->'vouchers'), '[]'::jsonb),
        'raffle_entries', jsonb_build_array(
          jsonb_build_object('raffle_id', 'mega_25', 'count', 3, 'source', 'claim_base')
        )
      ),
      true
    ),
    types = ARRAY['R'],
    updated_at = NOW()
WHERE event_date = DATE '2025-12-12';

COMMIT;
