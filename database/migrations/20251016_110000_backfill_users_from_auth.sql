-- Apply: Backfill public.users from auth.users and link pre_registrations
-- Created: 2025-10-16T11:00:00.000Z
-- Purpose: Ensure live users exist in public.users for reward linkage.

BEGIN;

-- =====================================================
-- INSERT MISSING USERS FROM AUTH
-- =====================================================

INSERT INTO users (id, email, first_name, last_name, created_at, last_login, status)
SELECT
  au.id,
  au.email,
  au.raw_user_meta_data->>'first_name',
  au.raw_user_meta_data->>'last_name',
  au.created_at,
  au.last_sign_in_at,
  'active'
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM users u WHERE u.id = au.id
);

-- =====================================================
-- LINK PRE_REGISTRATIONS -> USERS (PREFER AUTH ID)
-- =====================================================

DO $$
DECLARE
  auth_col TEXT;
BEGIN
  SELECT column_name INTO auth_col
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'pre_registrations'
    AND column_name IN ('supabase_auth_id', 'supabase_user_id', 'auth_user_id')
  ORDER BY CASE
    WHEN column_name = 'supabase_auth_id' THEN 1
    WHEN column_name = 'supabase_user_id' THEN 2
    WHEN column_name = 'auth_user_id' THEN 3
    ELSE 4
  END
  LIMIT 1;

  IF auth_col IS NOT NULL THEN
    EXECUTE format(
      'UPDATE pre_registrations pr
       SET user_id = u.id
       FROM users u
       WHERE pr.user_id IS NULL
         AND pr.%I IS NOT NULL
         AND u.id::text = pr.%I::text',
      auth_col, auth_col
    );
  END IF;
END $$;

-- Fallback: link by email where still unmapped
UPDATE pre_registrations pr
SET user_id = u.id
FROM users u
WHERE pr.user_id IS NULL
  AND lower(u.email) = lower(pr.email);

-- Backfill the reverse link (users.pre_registration_id)
UPDATE users u
SET pre_registration_id = pr.id
FROM pre_registrations pr
WHERE pr.user_id = u.id
  AND u.pre_registration_id IS NULL;

-- =====================================================
-- SUMMARY OUTPUTS
-- =====================================================

SELECT COUNT(*) AS users_total FROM users;

SELECT COUNT(*) AS users_from_auth
FROM users u
JOIN auth.users au ON au.id = u.id;

SELECT COUNT(*) AS pre_registrations_linked
FROM pre_registrations
WHERE user_id IS NOT NULL;

COMMIT;
