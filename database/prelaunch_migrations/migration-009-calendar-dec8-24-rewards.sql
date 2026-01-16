-- =====================================================
-- MIGRATION 009: Update calendar rewards for Dec 8-24
-- Aligns remaining doors with finalized campaign plan
-- =====================================================

BEGIN;

UPDATE calendar_events
SET types = ARRAY['S','F'],
    config = jsonb_build_object(
      'base_rewards', jsonb_build_object(
        'vouchers', jsonb_build_array(
          jsonb_build_object(
            'voucher_type', 'percent_off',
            'scope', 'Entertainment Lane',
            'amount', 5,
            'metadata', jsonb_build_object('stackable', true, 'label', 'Warm-up booster')
          )
        )
      ),
      'streak', jsonb_build_object(
        'milestones', jsonb_build_array(
          jsonb_build_object(
            'key', 'streak_8_reward',
            'threshold', 8,
            'rewards', jsonb_build_object(
              'vouchers', jsonb_build_array(
                jsonb_build_object(
                  'voucher_type', 'free_months',
                  'scope', 'Spotify Premium',
                  'amount', 1,
                  'metadata', jsonb_build_object(
                    'requires_paid_months', 6,
                    'alternate_option', '5% stackable entertainment token'
                  )
                )
              )
            )
          )
        )
      ),
      'ui', jsonb_build_object('badges', ARRAY['S','F'], 'copy_key', 'dec08_streak_reward')
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-08';

UPDATE calendar_events
SET types = ARRAY['D'],
    config = jsonb_build_object(
      'base_rewards', jsonb_build_object(
        'vouchers', jsonb_build_array(
          jsonb_build_object(
            'voucher_type', 'percent_off',
            'scope', 'LinkedIn Business Premium',
            'amount', 15,
            'metadata', jsonb_build_object('term_months', jsonb_build_array(3, 12))
          )
        )
      ),
      'ui', jsonb_build_object('badges', ARRAY['D'], 'copy_key', 'dec09_career_day')
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-09';

UPDATE calendar_events
SET types = ARRAY['D','R'],
    config = jsonb_build_object(
      'base_rewards', jsonb_build_object(
        'vouchers', jsonb_build_array(
          jsonb_build_object(
            'voucher_type', 'percent_off',
            'scope', 'Crunchyroll 1Y',
            'amount', 10,
            'metadata', jsonb_build_object('base_reward', true)
          )
        )
      ),
      'conditional_upgrades', jsonb_build_array(
        jsonb_build_object(
          'target', jsonb_build_object('voucher_type', 'percent_off', 'scope', 'Crunchyroll 1Y'),
          'condition', jsonb_build_object('referrals_today_gte', 1),
          'replace', jsonb_build_object('amount', 20, 'metadata', jsonb_build_object('upgrade_reason', 'Referral unlock'))
        )
      ),
      'ui', jsonb_build_object('badges', ARRAY['D','R'], 'copy_key', 'dec10_crunchyroll_double')
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-10';

UPDATE calendar_events
SET types = ARRAY['F'],
    config = jsonb_build_object(
      'choices', jsonb_build_array(
        jsonb_build_object(
          'key', 'chatgpt_bonus_month',
          'title', '1 extra month (buy 3)',
          'rewards', jsonb_build_object(
            'vouchers', jsonb_build_array(
              jsonb_build_object('voucher_type', 'free_months', 'scope', 'ChatGPT Plus', 'amount', 1, 'metadata', jsonb_build_object('requires_paid_months', 3))
            )
          )
        ),
        jsonb_build_object(
          'key', 'chatgpt_annual_discount',
          'title', '20% off ChatGPT 1 year',
          'rewards', jsonb_build_object(
            'vouchers', jsonb_build_array(
              jsonb_build_object('voucher_type', 'percent_off', 'scope', 'ChatGPT Plus', 'amount', 20, 'metadata', jsonb_build_object('term_months', 12))
            )
          )
        )
      ),
      'ui', jsonb_build_object('badges', ARRAY['F'], 'copy_key', 'dec11_chatgpt_focus')
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-11';

UPDATE calendar_events
SET types = ARRAY['X'],
    config = jsonb_build_object(
      'base_rewards', jsonb_build_object(
        'raffle_entries', jsonb_build_array(
          jsonb_build_object('raffle_id', 'mega_25', 'count', 1, 'source', 'spin_unlock')
        )
      ),
      'spin', jsonb_build_object('wheel', 'dec12_holly', 'description', 'Premium Rewards Wheel'),
      'ui', jsonb_build_object('badges', ARRAY['X'], 'copy_key', 'dec12_premium_wheel')
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-12';

UPDATE calendar_events
SET types = ARRAY['D'],
    config = jsonb_build_object(
      'choices', jsonb_build_array(
        jsonb_build_object(
          'key', 'youtube_premium',
          'title', '15% off YouTube Premium 1Y',
          'rewards', jsonb_build_object('vouchers', jsonb_build_array(jsonb_build_object('voucher_type', 'percent_off', 'scope', 'YouTube Premium', 'amount', 15, 'metadata', jsonb_build_object('term_months', 12)))))
        ,
        jsonb_build_object(
          'key', 'hbo_max',
          'title', '10% off HBO Max Premium 1Y',
          'rewards', jsonb_build_object('vouchers', jsonb_build_array(jsonb_build_object('voucher_type', 'percent_off', 'scope', 'HBO Max Premium', 'amount', 10, 'metadata', jsonb_build_object('term_months', 12)))))
      ),
      'ui', jsonb_build_object('badges', ARRAY['D'], 'copy_key', 'dec13_video_everywhere')
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-13';

UPDATE calendar_events
SET types = ARRAY['D','F'],
    config = jsonb_build_object(
      'choices', jsonb_build_array(
        jsonb_build_object(
          'key', 'tradingview_discount',
          'title', '15% off TradingView 1Y',
          'rewards', jsonb_build_object('vouchers', jsonb_build_array(jsonb_build_object('voucher_type', 'percent_off', 'scope', 'TradingView', 'amount', 15, 'metadata', jsonb_build_object('term_months', 12)))))
        ,
        jsonb_build_object(
          'key', 'tradingview_bonus_month',
          'title', 'Buy 6 get 1 free',
          'rewards', jsonb_build_object('vouchers', jsonb_build_array(jsonb_build_object('voucher_type', 'free_months', 'scope', 'TradingView', 'amount', 1, 'metadata', jsonb_build_object('requires_paid_months', 6)))))
      ),
      'ui', jsonb_build_object('badges', ARRAY['D','F'], 'copy_key', 'dec14_trading_tools')
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-14';

UPDATE calendar_events
SET types = ARRAY['R','S'],
    config = jsonb_build_object(
      'base_rewards', jsonb_build_object(
        'raffle_entries', jsonb_build_array(
          jsonb_build_object('raffle_id', 'mega_25', 'count', 2, 'source', 'claim_base')
        )
      ),
      'streak', jsonb_build_object(
        'milestones', jsonb_build_array(
          jsonb_build_object(
            'key', 'streak_10_golden_ticket',
            'threshold', 10,
            'rewards', jsonb_build_object(
              'vouchers', jsonb_build_array(
                jsonb_build_object('voucher_type', 'stackable', 'scope', 'High Ticket Any', 'amount', 3, 'metadata', jsonb_build_object('label', 'Golden Ticket (base)'))
              )
            )
          )
        )
      ),
      'conditional_upgrades', jsonb_build_array(
        jsonb_build_object(
          'target', jsonb_build_object('voucher_type', 'stackable', 'scope', 'High Ticket Any'),
          'condition', jsonb_build_object('referrals_today_gte', 2),
          'replace', jsonb_build_object('amount', 5, 'metadata', jsonb_build_object('label', 'Golden Ticket', 'upgrade_reason', 'Invited 2 friends'))
        )
      ),
      'ui', jsonb_build_object('badges', ARRAY['R','S'], 'copy_key', 'dec15_referral_streak')
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-15';

UPDATE calendar_events
SET types = ARRAY['D'],
    config = jsonb_build_object(
      'base_rewards', jsonb_build_object(
        'vouchers', jsonb_build_array(
          jsonb_build_object('voucher_type', 'percent_off', 'scope', 'Linear Business', 'amount', 20, 'metadata', jsonb_build_object('term_months', 12))
        )
      ),
      'ui', jsonb_build_object('badges', ARRAY['D'], 'copy_key', 'dec16_linear_day')
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-16';

UPDATE calendar_events
SET types = ARRAY['D','F'],
    config = jsonb_build_object(
      'choices', jsonb_build_array(
        jsonb_build_object(
          'key', 'xbox_percent',
          'title', '15% off Game Pass Ultimate (13 mo)',
          'rewards', jsonb_build_object('vouchers', jsonb_build_array(jsonb_build_object('voucher_type', 'percent_off', 'scope', 'Xbox Game Pass Ultimate', 'amount', 15, 'metadata', jsonb_build_object('term_months', 13)))))
        ,
        jsonb_build_object(
          'key', 'xbox_extra_month',
          'title', '14 months for price of 13',
          'rewards', jsonb_build_object('vouchers', jsonb_build_array(jsonb_build_object('voucher_type', 'free_months', 'scope', 'Xbox Game Pass Ultimate', 'amount', 1, 'metadata', jsonb_build_object('requires_paid_months', 13)))))
      ),
      'ui', jsonb_build_object('badges', ARRAY['D','F'], 'copy_key', 'dec17_gaming_day')
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-17';

UPDATE calendar_events
SET types = ARRAY['D'],
    config = jsonb_build_object(
      'choices', jsonb_build_array(
        jsonb_build_object(
          'key', 'netflix_choice',
          'title', '15% off Netflix 4K',
          'rewards', jsonb_build_object('vouchers', jsonb_build_array(
            jsonb_build_object('voucher_type','percent_off','scope','Netflix 4K','amount',15,'metadata',jsonb_build_object('term_months', jsonb_build_array(6,12)))
          ))
        ),
        jsonb_build_object(
          'key', 'hbo_choice',
          'title', '10% off HBO Max Premium',
          'rewards', jsonb_build_object('vouchers', jsonb_build_array(
            jsonb_build_object('voucher_type','percent_off','scope','HBO Max Premium','amount',10,'metadata',jsonb_build_object('term_months',12))
          ))
        ),
        jsonb_build_object(
          'key', 'paramount_choice',
          'title', '15% off Paramount+ w/ Showtime',
          'rewards', jsonb_build_object('vouchers', jsonb_build_array(
            jsonb_build_object('voucher_type','percent_off','scope','Paramount+ with Showtime','amount',15,'metadata',jsonb_build_object('term_months',12))
          ))
        ),
        jsonb_build_object(
          'key', 'prime_choice',
          'title', '10% off Amazon Prime Video 1Y',
          'rewards', jsonb_build_object('vouchers', jsonb_build_array(
            jsonb_build_object('voucher_type','percent_off','scope','Amazon Prime Video','amount',10,'metadata',jsonb_build_object('term_months',12))
          ))
        )
      ),
      'ui', jsonb_build_object('badges', ARRAY['D'], 'copy_key', 'dec18_video_bundle')
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-18';

UPDATE calendar_events
SET types = ARRAY['X','R'],
    config = jsonb_build_object(
      'base_rewards', jsonb_build_object(
        'raffle_entries', jsonb_build_array(
          jsonb_build_object('raffle_id', 'mega_25', 'count', 1, 'source', 'creator_jackpot', 'metadata', jsonb_build_object('bundle', 'Creator Pack'))
        )
      ),
      'raffle', jsonb_build_object('raffle_id', 'mega_25', 'entries_on_claim', 1, 'bonus_per_referral_today', 2),
      'ui', jsonb_build_object('badges', ARRAY['X','R'], 'copy_key', 'dec19_creator_jackpot')
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-19';

UPDATE calendar_referral_multipliers
SET multiplier = 2,
    notes = 'Each referral adds 2 creator bundle entries',
    metadata = jsonb_build_object('raffle_id', 'mega_25', 'source', 'creator_jackpot')
WHERE event_date = DATE '2025-12-19' AND applies_to = 'raffle_entries';

UPDATE calendar_events
SET types = ARRAY['D'],
    config = jsonb_build_object(
      'choices', jsonb_build_array(
        jsonb_build_object(
          'key','linear_toolkit',
          'title','15% off Linear Business',
          'rewards',jsonb_build_object('vouchers',jsonb_build_array(
            jsonb_build_object('voucher_type','percent_off','scope','Linear Business','amount',15,'metadata',jsonb_build_object('term_months',12))
          ))
        ),
        jsonb_build_object(
          'key','chatprd_toolkit',
          'title','15% off ChatPRD 1Y',
          'rewards',jsonb_build_object('vouchers',jsonb_build_array(
            jsonb_build_object('voucher_type','percent_off','scope','ChatPRD','amount',15,'metadata',jsonb_build_object('term_months',12))
          ))
        ),
        jsonb_build_object(
          'key','linkedin_toolkit',
          'title','15% off LinkedIn Business 12 mo',
          'rewards',jsonb_build_object('vouchers',jsonb_build_array(
            jsonb_build_object('voucher_type','percent_off','scope','LinkedIn Business Premium','amount',15,'metadata',jsonb_build_object('term_months',12))
          ))
        )
      ),
      'ui', jsonb_build_object('badges', ARRAY['D'], 'copy_key', 'dec20_pro_toolkit')
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-20';

UPDATE calendar_events
SET types = ARRAY['F','S'],
    config = jsonb_build_object(
      'base_rewards', jsonb_build_object(
        'vouchers', jsonb_build_array(
          jsonb_build_object('voucher_type', 'percent_off', 'scope', 'Entertainment Lane', 'amount', 5, 'metadata', jsonb_build_object('audience', 'non-streak fallbacks'))
        )
      ),
      'streak', jsonb_build_object(
        'milestones', jsonb_build_array(
          jsonb_build_object(
            'key', 'streak_15_reward',
            'threshold', 15,
            'rewards', jsonb_build_object(
              'vouchers', jsonb_build_array(
                jsonb_build_object('voucher_type', 'free_months', 'scope', 'Premium Entertainment', 'amount', 3, 'metadata', jsonb_build_object('notes', 'Choose Spotify/Crunchyroll/Netflix 4K'))
              )
            )
          )
        )
      ),
      'ui', jsonb_build_object('badges', ARRAY['F','S'], 'copy_key', 'dec21_almost_finishers')
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-21';

UPDATE calendar_events
SET types = ARRAY['D'],
    config = jsonb_build_object(
      'choices', jsonb_build_array(
        jsonb_build_object(
          'key','chatgpt_combo',
          'title','10% off ChatGPT 1Y',
          'rewards',jsonb_build_object('vouchers',jsonb_build_array(
            jsonb_build_object('voucher_type','percent_off','scope','ChatGPT Plus','amount',10,'metadata',jsonb_build_object('term_months',12,'bonus','+1 mo Duolingo if paired'))
          ))
        ),
        jsonb_build_object(
          'key','googleai_combo',
          'title','15% off Google AI Pro 1Y',
          'rewards',jsonb_build_object('vouchers',jsonb_build_array(
            jsonb_build_object('voucher_type','percent_off','scope','Google AI Pro','amount',15,'metadata',jsonb_build_object('term_months',12,'bonus','+1 mo Duolingo if bundle purchased'))
          ))
        )
      ),
      'ui', jsonb_build_object('badges', ARRAY['D'], 'copy_key', 'dec22_ai_combo')
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-22';

UPDATE calendar_events
SET types = ARRAY['X','R','S'],
    config = jsonb_build_object(
      'base_rewards', jsonb_build_object(
        'raffle_entries', jsonb_build_array(
          jsonb_build_object('raffle_id', 'mega_25', 'count', 3, 'source', 'last_minute_boost')
        ),
        'vouchers', jsonb_build_array(
          jsonb_build_object('voucher_type', 'free_months', 'scope', 'Entertainment Lane Bonus', 'amount', 0, 'metadata', jsonb_build_object('status', 'locked'))
        )
      ),
      'conditional_upgrades', jsonb_build_array(
        jsonb_build_object(
          'target', jsonb_build_object('voucher_type', 'free_months', 'scope', 'Entertainment Lane Bonus'),
          'condition', jsonb_build_object('referrals_today_gte', 3),
          'replace', jsonb_build_object('amount', 1, 'metadata', jsonb_build_object('requires_paid_months', 3, 'notes', 'Unlocked extra perk'))
        )
      ),
      'ui', jsonb_build_object('badges', ARRAY['X','R','S'], 'copy_key', 'dec23_last_minute')
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-23';

UPDATE calendar_referral_multipliers
SET multiplier = 3,
    notes = 'Final sprint: each referral adds 3 contest entries',
    metadata = jsonb_build_object('raffle_id', 'mega_25', 'source', 'last_minute_boost')
WHERE event_date = DATE '2025-12-23' AND applies_to = 'raffle_entries';

UPDATE calendar_events
SET types = ARRAY['D','F','S'],
    config = jsonb_build_object(
      'base_rewards', jsonb_build_object(
        'vouchers', jsonb_build_array(
          jsonb_build_object('voucher_type', 'percent_off', 'scope', 'Any 1Y Plan', 'amount', 15, 'metadata', jsonb_build_object('notes', 'Christmas Eve fallback'))
        )
      ),
      'streak', jsonb_build_object(
        'milestones', jsonb_build_array(
          jsonb_build_object(
            'key', 'streak_10_eve_upgrade',
            'threshold', 10,
            'rewards', jsonb_build_object(
              'vouchers', jsonb_build_array(
                jsonb_build_object('voucher_type', 'free_months', 'scope', 'Premium Annual Choice', 'amount', 3, 'metadata', jsonb_build_object('eligible_services', jsonb_build_array('Perplexity Pro','CapCut Pro','ChatPRD','Duolingo','Crunchyroll','Google AI Pro','Linear','Adobe All Apps','Paramount+ with Showtime')))
              )
            )
          )
        )
      ),
      'ui', jsonb_build_object('badges', ARRAY['D','F','S'], 'copy_key', 'dec24_eve_upgrade')
    ),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-24';

COMMIT;
