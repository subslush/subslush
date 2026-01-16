-- Dry Run: Prelaunch data migration (users + rewards)
-- Created: 2025-10-16T12:00:00.000Z
-- Purpose: Preview mapping counts, conflicts, and reward coverage before apply.

-- =====================================================
-- BASIC COUNTS
-- =====================================================

SELECT
  (SELECT COUNT(*) FROM users) AS users_total,
  (SELECT COUNT(*) FROM pre_registrations) AS pre_registrations_total,
  (SELECT COUNT(*) FROM referral_rewards) AS referral_rewards_total,
  (SELECT COUNT(*) FROM pre_launch_rewards) AS pre_launch_rewards_total;

-- =====================================================
-- EMAIL DUPLICATES (CASE-INSENSITIVE)
-- =====================================================

SELECT lower(email) AS email_norm, COUNT(*) AS user_count
FROM users
GROUP BY lower(email)
HAVING COUNT(*) > 1
ORDER BY user_count DESC, email_norm ASC;

SELECT lower(email) AS email_norm, COUNT(*) AS pre_reg_count
FROM pre_registrations
GROUP BY lower(email)
HAVING COUNT(*) > 1
ORDER BY pre_reg_count DESC, email_norm ASC;

-- =====================================================
-- ELIGIBLE MATCHES (UNIQUE CASE-INSENSITIVE EMAILS)
-- =====================================================

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
SELECT COUNT(*) AS eligible_matches
FROM pre
JOIN usr USING (email_norm)
WHERE email_norm NOT IN (SELECT email_norm FROM pre_dupes)
  AND email_norm NOT IN (SELECT email_norm FROM usr_dupes);

-- =====================================================
-- UNMATCHED PRE-REGISTRATIONS
-- =====================================================

SELECT COUNT(*) AS pre_registrations_without_user
FROM pre_registrations pr
LEFT JOIN users u ON lower(u.email) = lower(pr.email)
WHERE u.id IS NULL;

SELECT pr.id, pr.email, pr.created_at, pr.referral_code
FROM pre_registrations pr
LEFT JOIN users u ON lower(u.email) = lower(pr.email)
WHERE u.id IS NULL
ORDER BY pr.created_at ASC
LIMIT 50;

-- =====================================================
-- EXISTING LINK CONSISTENCY CHECKS
-- =====================================================

SELECT COUNT(*) AS pre_reg_user_link_mismatches
FROM pre_registrations pr
JOIN users u ON u.id = pr.user_id
WHERE u.pre_registration_id IS DISTINCT FROM pr.id;

SELECT COUNT(*) AS user_pre_reg_link_mismatches
FROM users u
JOIN pre_registrations pr ON pr.id = u.pre_registration_id
WHERE pr.user_id IS DISTINCT FROM u.id;

-- =====================================================
-- REWARD COVERAGE (MAPPABLE VS UNMAPPED)
-- =====================================================

SELECT
  COUNT(*) AS pre_launch_rewards_total,
  COUNT(*) FILTER (WHERE pr.user_id IS NOT NULL) AS pre_launch_rewards_mappable,
  COUNT(*) FILTER (WHERE pr.user_id IS NULL) AS pre_launch_rewards_unmapped
FROM pre_launch_rewards pl
JOIN pre_registrations pr ON pr.id = pl.user_id;

SELECT
  COUNT(*) AS referral_rewards_total,
  COUNT(*) FILTER (WHERE pr.user_id IS NOT NULL) AS referral_rewards_mappable,
  COUNT(*) FILTER (WHERE pr.user_id IS NULL) AS referral_rewards_unmapped
FROM referral_rewards rr
JOIN pre_registrations pr ON pr.id = rr.user_id;

-- =====================================================
-- CALENDAR VOUCHERS (MAPPABLE VS UNMAPPED)
-- =====================================================

SELECT
  COUNT(*) AS calendar_vouchers_total,
  COUNT(*) FILTER (WHERE pr.user_id IS NOT NULL) AS calendar_vouchers_mappable,
  COUNT(*) FILTER (WHERE pr.user_id IS NULL) AS calendar_vouchers_unmapped
FROM calendar_vouchers cv
JOIN pre_registrations pr ON pr.id = cv.user_id;

-- =====================================================
-- CALENDAR RAFFLE ENTRIES (MAPPABLE VS UNMAPPED)
-- =====================================================

SELECT
  COUNT(*) AS calendar_raffle_entries_total,
  COALESCE(SUM(cre.count), 0) AS calendar_raffle_entries_count,
  COUNT(*) FILTER (WHERE pr.user_id IS NOT NULL) AS calendar_raffle_entries_mappable,
  COALESCE(SUM(cre.count) FILTER (WHERE pr.user_id IS NOT NULL), 0) AS calendar_raffle_entries_mappable_count,
  COUNT(*) FILTER (WHERE pr.user_id IS NULL) AS calendar_raffle_entries_unmapped,
  COALESCE(SUM(cre.count) FILTER (WHERE pr.user_id IS NULL), 0) AS calendar_raffle_entries_unmapped_count
FROM calendar_raffle_entries cre
JOIN pre_registrations pr ON pr.id = cre.user_id;
