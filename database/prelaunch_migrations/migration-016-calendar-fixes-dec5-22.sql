-- =====================================================
-- MIGRATION 016: Cleanup adjustments for Dec 5-22
-- Fixes labeling, stackable messaging, and raffle tweaks
-- =====================================================

BEGIN;

-- Day 5: clarify Netflix stackable percent voucher
UPDATE calendar_events
SET config = jsonb_set(
      config,
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
          'title', '10% off Netflix 4K · Stackable',
          'rewards', jsonb_build_object(
            'vouchers', jsonb_build_array(
              jsonb_build_object(
                'voucher_type', 'percent_off',
                'scope', 'Netflix 4K',
                'amount', 10,
                'metadata', jsonb_build_object(
                  'stackable', true,
                  'display_title', '10% OFF · Netflix 4K · Stackable',
                  'claim_label', '10% OFF Stackable · Netflix 4K',
                  'display_note', 'Stackable'
                )
              )
            )
          )
        )
      ),
      true
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-05';

-- Day 7: include annual context on Canva/Adobe vouchers
UPDATE calendar_events
SET config = jsonb_set(
      config,
      '{choices}',
      jsonb_build_array(
        jsonb_build_object(
          'key', 'canva_day',
          'title', '15% off Canva Pro 1 yr',
          'rewards', jsonb_build_object(
            'vouchers', jsonb_build_array(
              jsonb_build_object(
                'voucher_type', 'percent_off',
                'scope', 'Canva Pro',
                'amount', 15,
                'metadata', jsonb_build_object(
                  'term_months', 12,
                  'claim_label', '15% OFF Canva Pro (1Y)',
                  'display_note', 'Annual subscription'
                )
              )
            )
          )
        ),
        jsonb_build_object(
          'key', 'adobe_day',
          'title', '10% off Adobe CC All Apps',
          'rewards', jsonb_build_object(
            'vouchers', jsonb_build_array(
              jsonb_build_object(
                'voucher_type', 'percent_off',
                'scope', 'Adobe Creative Cloud All Apps',
                'amount', 10,
                'metadata', jsonb_build_object(
                  'term_months', 12,
                  'claim_label', '10% OFF Adobe CC All Apps (1Y)',
                  'display_note', 'Annual subscription'
                )
              )
            )
          )
        )
      ),
      true
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-07';

-- Day 8: simplify entertainment stackable messaging
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
              'display_title', '5% OFF · Entertainment · Stackable',
              'display_note', null
            )
          )
        )
      ),
      true
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-08';

-- Day 10: simplify Crunchyroll label
UPDATE calendar_events
SET config = jsonb_set(
      jsonb_set(
        config,
        '{base_rewards,vouchers,0,scope}',
        '"Crunchyroll"'::jsonb,
        false
      ),
      '{base_rewards,vouchers,0,metadata}',
      jsonb_build_object('base_reward', true, 'claim_label', '10% OFF Crunchyroll'),
      true
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-10';

-- Day 13: remove (1Y) wording
UPDATE calendar_events
SET config = jsonb_set(
      config,
      '{choices}',
      jsonb_build_array(
        jsonb_build_object(
          'key', 'youtube_premium',
          'title', '15% off YouTube Premium',
          'rewards', jsonb_build_object(
            'vouchers', jsonb_build_array(
              jsonb_build_object(
                'voucher_type', 'percent_off',
                'scope', 'YouTube Premium',
                'amount', 15,
                'metadata', jsonb_build_object(
                  'term_months', 12,
                  'claim_label', '15% OFF YouTube Premium'
                )
              )
            )
          )
        ),
        jsonb_build_object(
          'key', 'hbo_max',
          'title', '10% off HBO Max Premium',
          'rewards', jsonb_build_object(
            'vouchers', jsonb_build_array(
              jsonb_build_object(
                'voucher_type', 'percent_off',
                'scope', 'HBO Max Premium',
                'amount', 10,
                'metadata', jsonb_build_object(
                  'term_months', 12,
                  'claim_label', '10% OFF HBO Max Premium'
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

-- Day 14: remove (1Y) wording
UPDATE calendar_events
SET config = jsonb_set(
      config,
      '{choices}',
      jsonb_build_array(
        jsonb_build_object(
          'key', 'tradingview_discount',
          'title', '15% off TradingView',
          'rewards', jsonb_build_object(
            'vouchers', jsonb_build_array(
              jsonb_build_object(
                'voucher_type', 'percent_off',
                'scope', 'TradingView',
                'amount', 15,
                'metadata', jsonb_build_object(
                  'term_months', 12,
                  'claim_label', '15% OFF TradingView'
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
                  'claim_label', '1 Free Month (buy 6 months)'
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

-- Day 17: remove (1Y) wording for Disney+
UPDATE calendar_events
SET config = jsonb_set(
      config,
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
          'title', '15% off Disney+ Premium',
          'rewards', jsonb_build_object(
            'vouchers', jsonb_build_array(
              jsonb_build_object(
                'voucher_type', 'percent_off',
                'scope', 'Disney+ Premium',
                'amount', 15,
                'metadata', jsonb_build_object(
                  'term_months', 12,
                  'claim_label', '15% OFF Disney+ Premium'
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

-- Day 18: change Netflix to 10% annual, remove 1Y wording
UPDATE calendar_events
SET config = jsonb_set(
      config,
      '{choices}',
      jsonb_build_array(
        jsonb_build_object(
          'key', 'netflix_choice',
          'title', '10% off Netflix 4K',
          'rewards', jsonb_build_object(
            'vouchers', jsonb_build_array(
              jsonb_build_object(
                'voucher_type','percent_off',
                'scope','Netflix 4K',
                'amount',10,
                'metadata',jsonb_build_object(
                  'term_months',12,
                  'claim_label', '10% OFF Netflix 4K',
                  'display_note', 'Annual plan'
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
                  'claim_label', '10% OFF HBO Max Premium',
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
          'title', '10% off Amazon Prime Video',
          'rewards', jsonb_build_object(
            'vouchers', jsonb_build_array(
              jsonb_build_object(
                'voucher_type','percent_off',
                'scope','Amazon Prime Video',
                'amount',10,
                'metadata',jsonb_build_object(
                  'term_months',12,
                  'claim_label', '10% OFF Amazon Prime Video',
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

-- Day 20: remove "Annual plan"/1Y/12 mo wording from toolkit
UPDATE calendar_events
SET config = jsonb_set(
      config,
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
                'claim_label','15% OFF Linear Business'
              )
            )
          ))
        ),
        jsonb_build_object(
          'key','chatprd_toolkit',
          'title','15% off ChatPRD',
          'rewards',jsonb_build_object('vouchers',jsonb_build_array(
            jsonb_build_object(
              'voucher_type','percent_off',
              'scope','ChatPRD',
              'amount',15,
              'metadata',jsonb_build_object(
                'term_months',12,
                'claim_label','15% OFF ChatPRD'
              )
            )
          ))
        ),
        jsonb_build_object(
          'key','linkedin_toolkit',
          'title','15% off LinkedIn Business',
          'rewards',jsonb_build_object('vouchers',jsonb_build_array(
            jsonb_build_object(
              'voucher_type','percent_off',
              'scope','LinkedIn Business Premium',
              'amount',15,
              'metadata',jsonb_build_object(
                'term_months',12,
                'claim_label','15% OFF LinkedIn Business Premium'
              )
            )
          ))
        )
      ),
      true
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-20';

-- Day 21: simplify entertainment stackable messaging
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
              'display_title', '5% OFF · Entertainment · Stackable',
              'display_note', null
            )
          )
        )
      ),
      true
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-21';

-- Day 22: remove 1Y wording and extra bonus text
UPDATE calendar_events
SET config = jsonb_set(
      config,
      '{choices}',
      jsonb_build_array(
        jsonb_build_object(
          'key','chatgpt_combo',
          'title','10% off ChatGPT',
          'rewards',jsonb_build_object('vouchers',jsonb_build_array(
            jsonb_build_object(
              'voucher_type','percent_off',
              'scope','ChatGPT Plus',
              'amount',10,
              'metadata',jsonb_build_object(
                'term_months',12,
                'claim_label','10% OFF ChatGPT Plus'
              )
            )
          ))
        ),
        jsonb_build_object(
          'key','googleai_combo',
          'title','15% off Google AI Pro',
          'rewards',jsonb_build_object('vouchers',jsonb_build_array(
            jsonb_build_object(
              'voucher_type','percent_off',
              'scope','Google AI Pro',
              'amount',15,
              'metadata',jsonb_build_object(
                'term_months',12,
                'claim_label','15% OFF Google AI Pro'
              )
            )
          ))
        )
      ),
      true
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-22';

COMMIT;
