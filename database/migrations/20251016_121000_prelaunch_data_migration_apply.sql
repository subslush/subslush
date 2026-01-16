-- Apply: Prelaunch data migration (users + rewards)
-- Created: 2025-10-16T12:10:00.000Z
-- Purpose: Link pre_registrations to users and convert rewards to user_perks.

BEGIN;

-- =====================================================
-- USER_PERKS TABLE (NORMALIZED REWARD ENTITLEMENTS)
-- =====================================================

CREATE TABLE IF NOT EXISTS user_perks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type VARCHAR(30) NOT NULL,
  source_id UUID NOT NULL,
  reward_type VARCHAR(50) NOT NULL,
  tier VARCHAR(50),
  applies_to VARCHAR(50),
  free_months INTEGER,
  founder_status BOOLEAN,
  prize_won VARCHAR(100),
  notes TEXT,
  awarded_at TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT user_perks_source_type_check
    CHECK (source_type IN ('pre_launch_reward', 'referral_reward')),
  CONSTRAINT user_perks_reward_type_check
    CHECK (reward_type IN ('pre_launch', 'email_reward', 'purchase_reward'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_perks_source_unique
  ON user_perks(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_user_perks_user_id ON user_perks(user_id);
CREATE INDEX IF NOT EXISTS idx_user_perks_reward_type ON user_perks(reward_type);

-- =====================================================
-- USER_VOUCHERS + USER_RAFFLE_ENTRIES (CALENDAR REWARDS)
-- =====================================================

CREATE TABLE IF NOT EXISTS user_vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type VARCHAR(30) NOT NULL,
  source_id UUID,
  event_date DATE,
  voucher_type TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'global',
  amount NUMERIC(10,2),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'issued',
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  redeemed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_vouchers_source_unique
  ON user_vouchers(source_type, source_id)
  WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_vouchers_user_id
  ON user_vouchers(user_id);
CREATE INDEX IF NOT EXISTS idx_user_vouchers_status
  ON user_vouchers(status);
CREATE INDEX IF NOT EXISTS idx_user_vouchers_event_date
  ON user_vouchers(event_date);

CREATE TABLE IF NOT EXISTS user_raffle_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  raffle_id TEXT NOT NULL,
  source TEXT NOT NULL,
  event_date DATE NOT NULL,
  count INT NOT NULL DEFAULT 0 CHECK (count >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_raffle_entries_unique UNIQUE (raffle_id, user_id, source, event_date)
);

CREATE INDEX IF NOT EXISTS idx_user_raffle_entries_user_id
  ON user_raffle_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_user_raffle_entries_raffle_id
  ON user_raffle_entries(raffle_id);

-- =====================================================
-- BUILD SAFE MATCHES (CASE-INSENSITIVE, NO DUPLICATES)
-- =====================================================

CREATE TEMP TABLE tmp_prelaunch_user_matches AS
WITH pre AS (
  SELECT id, email, lower(email) AS email_norm
  FROM pre_registrations
),
usr AS (
  SELECT id, email, lower(email) AS email_norm
  FROM users
),
pre_dupes AS (
  SELECT email_norm
  FROM pre
  GROUP BY email_norm
  HAVING COUNT(*) > 1
),
usr_dupes AS (
  SELECT email_norm
  FROM usr
  GROUP BY email_norm
  HAVING COUNT(*) > 1
)
SELECT pre.id AS pre_registration_id, usr.id AS user_id
FROM pre
JOIN usr USING (email_norm)
WHERE email_norm NOT IN (SELECT email_norm FROM pre_dupes)
  AND email_norm NOT IN (SELECT email_norm FROM usr_dupes);

-- =====================================================
-- LINK PRE_REGISTRATIONS <-> USERS (IDEMPOTENT)
-- =====================================================

UPDATE users u
SET pre_registration_id = m.pre_registration_id
FROM tmp_prelaunch_user_matches m
WHERE u.id = m.user_id
  AND u.pre_registration_id IS NULL;

UPDATE pre_registrations p
SET user_id = m.user_id
FROM tmp_prelaunch_user_matches m
WHERE p.id = m.pre_registration_id
  AND p.user_id IS NULL;

-- =====================================================
-- BACKFILL REDEEMED_BY_USER_ID FOR ALREADY REDEEMED REWARDS
-- =====================================================

UPDATE referral_rewards rr
SET redeemed_by_user_id = pr.user_id
FROM pre_registrations pr
WHERE rr.user_id = pr.id
  AND pr.user_id IS NOT NULL
  AND rr.is_redeemed = TRUE
  AND rr.redeemed_by_user_id IS NULL;

-- =====================================================
-- CONVERT PRE-LAUNCH REWARDS -> USER_PERKS
-- =====================================================

INSERT INTO user_perks (
  user_id,
  source_type,
  source_id,
  reward_type,
  free_months,
  founder_status,
  prize_won,
  notes,
  awarded_at,
  metadata
)
SELECT
  pr.user_id,
  'pre_launch_reward',
  pl.user_id,
  'pre_launch',
  pl.free_months,
  pl.founder_status,
  pl.prize_won,
  pl.notes,
  pl.awarded_at,
  jsonb_build_object(
    'migration_key', '20251016_prelaunch_sync_v1',
    'referral_count_at_award', pl.referral_count_at_award
  )
FROM pre_launch_rewards pl
JOIN pre_registrations pr ON pr.id = pl.user_id
WHERE pr.user_id IS NOT NULL
ON CONFLICT (source_type, source_id) DO NOTHING;

-- =====================================================
-- CONVERT REFERRAL REWARDS -> USER_PERKS
-- =====================================================

INSERT INTO user_perks (
  user_id,
  source_type,
  source_id,
  reward_type,
  tier,
  applies_to,
  free_months,
  awarded_at,
  metadata
)
SELECT
  pr.user_id,
  'referral_reward',
  rr.id,
  rr.reward_type,
  rr.tier,
  rr.applies_to,
  rr.free_months,
  rr.earned_at,
  jsonb_build_object(
    'migration_key', '20251016_prelaunch_sync_v1',
    'is_redeemed', rr.is_redeemed
  )
FROM referral_rewards rr
JOIN pre_registrations pr ON pr.id = rr.user_id
WHERE pr.user_id IS NOT NULL
ON CONFLICT (source_type, source_id) DO NOTHING;

-- =====================================================
-- CONVERT CALENDAR VOUCHERS -> USER_VOUCHERS
-- =====================================================

INSERT INTO user_vouchers (
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
  redeemed_at,
  created_at
)
SELECT
  pr.user_id,
  'calendar_voucher',
  cv.id,
  cv.event_date,
  cv.voucher_type,
  cv.scope,
  cv.amount,
  COALESCE(cv.metadata, '{}'::jsonb) || jsonb_build_object(
    'migration_key', '20251016_prelaunch_sync_v1',
    'source_table', 'calendar_vouchers'
  ),
  cv.status,
  cv.issued_at,
  cv.redeemed_at,
  cv.issued_at
FROM calendar_vouchers cv
JOIN pre_registrations pr ON pr.id = cv.user_id
WHERE pr.user_id IS NOT NULL
ON CONFLICT (source_type, source_id) WHERE source_id IS NOT NULL DO NOTHING;

-- =====================================================
-- CONVERT CALENDAR RAFFLE ENTRIES -> USER_RAFFLE_ENTRIES
-- =====================================================

INSERT INTO user_raffle_entries (
  user_id,
  raffle_id,
  source,
  event_date,
  count,
  metadata,
  created_at,
  updated_at
)
SELECT
  pr.user_id,
  cre.raffle_id,
  cre.source,
  cre.event_date,
  cre.count,
  COALESCE(cre.metadata, '{}'::jsonb) || jsonb_build_object(
    'migration_key', '20251016_prelaunch_sync_v1',
    'source_table', 'calendar_raffle_entries'
  ),
  cre.created_at,
  cre.updated_at
FROM calendar_raffle_entries cre
JOIN pre_registrations pr ON pr.id = cre.user_id
WHERE pr.user_id IS NOT NULL
ON CONFLICT (raffle_id, user_id, source, event_date) DO NOTHING;

-- =====================================================
-- SUMMARY OUTPUTS
-- =====================================================

SELECT COUNT(*) AS user_perks_total FROM user_perks;

SELECT source_type, COUNT(*) AS perks_count
FROM user_perks
GROUP BY source_type
ORDER BY source_type;

SELECT
  COUNT(*) AS pre_launch_rewards_mappable,
  (SELECT COUNT(*) FROM user_perks WHERE source_type = 'pre_launch_reward') AS pre_launch_rewards_in_user_perks
FROM pre_launch_rewards pl
JOIN pre_registrations pr ON pr.id = pl.user_id
WHERE pr.user_id IS NOT NULL;

SELECT
  COUNT(*) AS referral_rewards_mappable,
  (SELECT COUNT(*) FROM user_perks WHERE source_type = 'referral_reward') AS referral_rewards_in_user_perks
FROM referral_rewards rr
JOIN pre_registrations pr ON pr.id = rr.user_id
WHERE pr.user_id IS NOT NULL;

SELECT COUNT(*) AS user_vouchers_total FROM user_vouchers;

SELECT
  COUNT(*) AS calendar_vouchers_mappable,
  (SELECT COUNT(*) FROM user_vouchers WHERE source_type = 'calendar_voucher') AS calendar_vouchers_in_user_vouchers
FROM calendar_vouchers cv
JOIN pre_registrations pr ON pr.id = cv.user_id
WHERE pr.user_id IS NOT NULL;

SELECT
  COUNT(*) AS user_raffle_entries_total,
  COALESCE(SUM(count), 0) AS user_raffle_entries_count
FROM user_raffle_entries;

SELECT
  COUNT(*) AS calendar_raffle_entries_mappable,
  COALESCE(SUM(cre.count), 0) AS calendar_raffle_entries_mappable_count
FROM calendar_raffle_entries cre
JOIN pre_registrations pr ON pr.id = cre.user_id
WHERE pr.user_id IS NOT NULL;

COMMIT;
