-- =====================================================
-- MIGRATION 015: Calendar updates for Dec 13-25
-- Adds raffle entries, refreshes voucher copy, and clarifies rewards
-- =====================================================

BEGIN;

-- Day 13: add 2 raffle tickets + clarify streaming vouchers
UPDATE calendar_events
SET config = jsonb_set(
      jsonb_set(
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
      '{choices}',
      jsonb_build_array(
        jsonb_build_object(
          'key', 'youtube_premium',
          'title', '15% off YouTube Premium 1Y',
          'rewards', jsonb_build_object(
            'vouchers', jsonb_build_array(
              jsonb_build_object(
                'voucher_type', 'percent_off',
                'scope', 'YouTube Premium',
                'amount', 15,
                'metadata', jsonb_build_object(
                  'term_months', 12,
                  'claim_label', '15% OFF YouTube Premium (1Y)',
                  'display_note', 'Annual plan'
                )
              )
            )
          )
        ),
        jsonb_build_object(
          'key', 'hbo_max',
          'title', '10% off HBO Max Premium 1Y',
          'rewards', jsonb_build_object(
            'vouchers', jsonb_build_array(
              jsonb_build_object(
                'voucher_type', 'percent_off',
                'scope', 'HBO Max Premium',
                'amount', 10,
                'metadata', jsonb_build_object(
                  'term_months', 12,
                  'claim_label', '10% OFF HBO Max Premium (1Y)',
                  'display_note', 'Annual plan'
                )
              )
            )
          )
        )
      ),
      true
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-13';

-- Day 14: add 2 raffle tickets + clean TradingView labels
UPDATE calendar_events
SET config = jsonb_set(
      jsonb_set(
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
      '{choices}',
      jsonb_build_array(
        jsonb_build_object(
          'key', 'tradingview_discount',
          'title', '15% off TradingView 1Y',
          'rewards', jsonb_build_object(
            'vouchers', jsonb_build_array(
              jsonb_build_object(
                'voucher_type', 'percent_off',
                'scope', 'TradingView',
                'amount', 15,
                'metadata', jsonb_build_object(
                  'term_months', 12,
                  'claim_label', '15% OFF TradingView (1Y)',
                  'display_note', 'Annual plan'
                )
              )
            )
          )
        ),
        jsonb_build_object(
          'key', 'tradingview_bonus_month',
          'title', 'Buy 6 get 1 free',
          'rewards', jsonb_build_object(
            'vouchers', jsonb_build_array(
              jsonb_build_object(
                'voucher_type', 'free_months',
                'scope', 'TradingView',
                'amount', 1,
                'metadata', jsonb_build_object(
                  'requires_paid_months', 6,
                  'claim_label', '1 Free Month (buy 6 months)',
                  'display_note', 'Buy 6 months, get 1 free'
                )
              )
            )
          )
        )
      ),
      true
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-14';

-- Day 15: make base raffle 3x tickets
UPDATE calendar_events
SET config = jsonb_set(
      config,
      '{base_rewards}',
      jsonb_build_object(
        'vouchers', coalesce((config->'base_rewards'->'vouchers'), '[]'::jsonb),
        'raffle_entries', jsonb_build_array(
          jsonb_build_object('raffle_id', 'mega_25', 'count', 3, 'source', 'claim_base')
        )
      ),
      true
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-15';

-- Day 17: add 2 raffle tickets and swap bonus to Disney+
UPDATE calendar_events
SET config = jsonb_set(
      jsonb_set(
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
      '{choices}',
      jsonb_build_array(
        jsonb_build_object(
          'key', 'xbox_percent',
          'title', '15% off Game Pass Ultimate (13 mo)',
          'rewards', jsonb_build_object(
            'vouchers', jsonb_build_array(
              jsonb_build_object(
                'voucher_type', 'percent_off',
                'scope', 'Xbox Game Pass Ultimate',
                'amount', 15,
                'metadata', jsonb_build_object(
                  'term_months', 13,
                  'claim_label', '15% OFF Game Pass Ultimate (13 mo)',
                  'display_note', '13-month bundle'
                )
              )
            )
          )
        ),
        jsonb_build_object(
          'key', 'disney_plus_percent',
          'title', '15% off Disney+ Premium 1Y',
          'rewards', jsonb_build_object(
            'vouchers', jsonb_build_array(
              jsonb_build_object(
                'voucher_type', 'percent_off',
                'scope', 'Disney+ Premium',
                'amount', 15,
                'metadata', jsonb_build_object(
                  'term_months', 12,
                  'claim_label', '15% OFF Disney+ Premium (1Y)',
                  'display_note', 'Annual plan'
                )
              )
            )
          )
        )
      ),
      true
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-17';

-- Day 18: add 2 raffle tickets + tidy video bundle labels
UPDATE calendar_events
SET config = jsonb_set(
      jsonb_set(
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
      '{choices}',
      jsonb_build_array(
        jsonb_build_object(
          'key', 'netflix_choice',
          'title', '15% off Netflix 4K',
          'rewards', jsonb_build_object(
            'vouchers', jsonb_build_array(
              jsonb_build_object(
                'voucher_type','percent_off',
                'scope','Netflix 4K',
                'amount',15,
                'metadata',jsonb_build_object(
                  'term_months', jsonb_build_array(6,12),
                  'claim_label', '15% OFF Netflix 4K',
                  'display_note', '6 or 12 month plan'
                )
              )
            )
          )
        ),
        jsonb_build_object(
          'key', 'hbo_choice',
          'title', '10% off HBO Max Premium',
          'rewards', jsonb_build_object(
            'vouchers', jsonb_build_array(
              jsonb_build_object(
                'voucher_type','percent_off',
                'scope','HBO Max Premium',
                'amount',10,
                'metadata',jsonb_build_object(
                  'term_months',12,
                  'claim_label', '10% OFF HBO Max Premium (1Y)',
                  'display_note', 'Annual plan'
                )
              )
            )
          )
        ),
        jsonb_build_object(
          'key', 'paramount_choice',
          'title', '15% off Paramount+ w/ Showtime',
          'rewards', jsonb_build_object(
            'vouchers', jsonb_build_array(
              jsonb_build_object(
                'voucher_type','percent_off',
                'scope','Paramount+ with Showtime',
                'amount',15,
                'metadata',jsonb_build_object(
                  'term_months',12,
                  'claim_label', '15% OFF Paramount+ with Showtime',
                  'display_note', 'Annual plan'
                )
              )
            )
          )
        ),
        jsonb_build_object(
          'key', 'prime_choice',
          'title', '10% off Amazon Prime Video 1Y',
          'rewards', jsonb_build_object(
            'vouchers', jsonb_build_array(
              jsonb_build_object(
                'voucher_type','percent_off',
                'scope','Amazon Prime Video',
                'amount',10,
                'metadata',jsonb_build_object(
                  'term_months',12,
                  'claim_label', '10% OFF Amazon Prime Video (1Y)',
                  'display_note', 'Annual plan'
                )
              )
            )
          )
        )
      ),
      true
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-18';

-- Day 19: raise base raffle to 3 tickets
UPDATE calendar_events
SET config = jsonb_set(
      jsonb_set(
        config,
        '{base_rewards}',
        jsonb_build_object(
          'vouchers', coalesce((config->'base_rewards'->'vouchers'), '[]'::jsonb),
          'raffle_entries', jsonb_build_array(
            jsonb_build_object('raffle_id', 'mega_25', 'count', 3, 'source', 'creator_jackpot', 'metadata', jsonb_build_object('bundle', 'Creator Pack'))
          )
        ),
        true
      ),
      '{raffle}',
      jsonb_build_object(
        'raffle_id', 'mega_25',
        'entries_on_claim', 3,
        'bonus_per_referral_today', 2
      ),
      true
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-19';

-- Day 20: add 2 raffle tickets + clarify toolkit labels
UPDATE calendar_events
SET config = jsonb_set(
      jsonb_set(
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
      '{choices}',
      jsonb_build_array(
        jsonb_build_object(
          'key','linear_toolkit',
          'title','15% off Linear Business',
          'rewards',jsonb_build_object('vouchers',jsonb_build_array(
            jsonb_build_object(
              'voucher_type','percent_off',
              'scope','Linear Business',
              'amount',15,
              'metadata',jsonb_build_object(
                'term_months',12,
                'claim_label','15% OFF Linear Business (1Y)',
                'display_note','Annual plan'
              )
            )
          ))
        ),
        jsonb_build_object(
          'key','chatprd_toolkit',
          'title','15% off ChatPRD 1Y',
          'rewards',jsonb_build_object('vouchers',jsonb_build_array(
            jsonb_build_object(
              'voucher_type','percent_off',
              'scope','ChatPRD',
              'amount',15,
              'metadata',jsonb_build_object(
                'term_months',12,
                'claim_label','15% OFF ChatPRD (1Y)',
                'display_note','Annual plan'
              )
            )
          ))
        ),
        jsonb_build_object(
          'key','linkedin_toolkit',
          'title','15% off LinkedIn Business 12 mo',
          'rewards',jsonb_build_object('vouchers',jsonb_build_array(
            jsonb_build_object(
              'voucher_type','percent_off',
              'scope','LinkedIn Business Premium',
              'amount',15,
              'metadata',jsonb_build_object(
                'term_months',12,
                'claim_label','15% OFF LinkedIn Business Premium (1Y)',
                'display_note','Annual plan'
              )
            )
          ))
        )
      ),
      true
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-20';

-- Day 21: make 5% entertainment voucher stackable
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
              'audience', 'non-streak fallbacks',
              'stackable', true,
              'display_note', 'Entertainment group - Stackable'
            )
          )
        )
      ),
      true
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-21';

-- Day 22: add 2 raffle tickets + tidy AI combo labels
UPDATE calendar_events
SET config = jsonb_set(
      jsonb_set(
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
      '{choices}',
      jsonb_build_array(
        jsonb_build_object(
          'key','chatgpt_combo',
          'title','10% off ChatGPT 1Y',
          'rewards',jsonb_build_object('vouchers',jsonb_build_array(
            jsonb_build_object(
              'voucher_type','percent_off',
              'scope','ChatGPT Plus',
              'amount',10,
              'metadata',jsonb_build_object(
                'term_months',12,
                'bonus','+1 mo Duolingo if paired',
                'claim_label','10% OFF ChatGPT Plus (1Y)',
                'display_note','Includes +1 mo Duolingo if bundled'
              )
            )
          ))
        ),
        jsonb_build_object(
          'key','googleai_combo',
          'title','15% off Google AI Pro 1Y',
          'rewards',jsonb_build_object('vouchers',jsonb_build_array(
            jsonb_build_object(
              'voucher_type','percent_off',
              'scope','Google AI Pro',
              'amount',15,
              'metadata',jsonb_build_object(
                'term_months',12,
                'bonus','+1 mo Duolingo if bundle purchased',
                'claim_label','15% OFF Google AI Pro (1Y)',
                'display_note','Includes +1 mo Duolingo if bundled'
              )
            )
          ))
        )
      ),
      true
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-22';

-- Day 23: keep raffle tickets only (remove bonus voucher)
UPDATE calendar_events
SET config = jsonb_set(
      (config - 'conditional_upgrades'),
      '{base_rewards}',
      jsonb_build_object(
        'vouchers', '[]'::jsonb,
        'raffle_entries', jsonb_build_array(
          jsonb_build_object('raffle_id', 'mega_25', 'count', 3, 'source', 'last_minute_boost')
        )
      ),
      true
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-23';

-- Day 24: clarify any-plan annual voucher
UPDATE calendar_events
SET config = jsonb_set(
      config,
      '{base_rewards}',
      jsonb_build_object(
        'vouchers', jsonb_build_array(
          jsonb_build_object(
            'voucher_type', 'percent_off',
            'scope', 'Any annual subscription',
            'amount', 15,
            'metadata', jsonb_build_object(
              'notes', 'Christmas Eve fallback',
              'display_title', '15% OFF - Any annual subscription',
              'claim_label', '15% OFF Any annual subscription',
              'display_note', 'Apply to any 1-year subscription you choose'
            )
          )
        )
      ),
      true
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-24';

-- Day 25: clarify global 25% voucher, keep 5x tickets
UPDATE calendar_events
SET config = jsonb_set(
      config,
      '{base_rewards}',
      jsonb_build_object(
        'vouchers', jsonb_build_array(
          jsonb_build_object(
            'voucher_type', 'percent_off',
            'scope', 'Any subscription',
            'amount', 25,
            'metadata', jsonb_build_object(
              'display_title', '25% OFF - Any subscription',
              'claim_label', '25% OFF Any subscription',
              'display_note', 'Valid on any plan, no minimum term',
              'day', 'dec-25'
            )
          )
        ),
        'raffle_entries', jsonb_build_array(
          jsonb_build_object('raffle_id', 'mega_25', 'count', 5, 'source', 'claim')
        )
      ),
      true
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-25';

COMMIT;
