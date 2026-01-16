-- =====================================================
-- MIGRATION 018: Cleanup Dec 7 titles/labels and ensure single Dec 25 voucher
-- =====================================================

BEGIN;

-- Day 7: remove 1Y wording and extra display notes for Canva/Adobe
UPDATE calendar_events
SET config = jsonb_set(
      config,
      '{choices}',
      jsonb_build_array(
        jsonb_build_object(
          'key', 'canva_day',
          'title', '15% off Canva Pro',
          'rewards', jsonb_build_object(
            'vouchers', jsonb_build_array(
              jsonb_build_object(
                'voucher_type', 'percent_off',
                'scope', 'Canva Pro',
                'amount', 15,
                'metadata', jsonb_build_object(
                  'term_months', 12,
                  'claim_label', '15% OFF Canva Pro'
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
                  'claim_label', '10% OFF Adobe CC All Apps'
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

-- Day 25: ensure a single voucher for "Any subscription" and keep 5x raffle entries
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
