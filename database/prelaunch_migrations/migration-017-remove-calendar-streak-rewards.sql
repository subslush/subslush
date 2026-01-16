-- =====================================================
-- MIGRATION 017: Remove streak reward grants
-- Keeps streak tracking but removes streak-based rewards/badges from events
-- =====================================================

BEGIN;

-- Remove streak milestones and S badge from Dec 8
UPDATE calendar_events
SET config = config - 'streak',
    types = array_remove(types, 'S'),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-08';

-- Remove streak milestones and S badge from Dec 15
UPDATE calendar_events
SET config = config - 'streak',
    types = array_remove(types, 'S'),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-15';

-- Remove streak milestones and S badge from Dec 21
UPDATE calendar_events
SET config = config - 'streak',
    types = array_remove(types, 'S'),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-21';

-- Remove streak milestones and S badge from Dec 24
UPDATE calendar_events
SET config = config - 'streak',
    types = array_remove(types, 'S'),
    updated_at = NOW()
WHERE event_date = DATE '2025-12-24';

COMMIT;
