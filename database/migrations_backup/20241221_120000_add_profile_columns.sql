-- Migration: Add Profile Columns to Users Table
-- Created: 2024-12-21T12:00:00.000Z
-- Description: Separate profile preferences from Supabase Auth metadata into PostgreSQL

-- Up Migration
BEGIN;

-- =====================================================
-- ADD PROFILE COLUMNS TO USERS TABLE
-- =====================================================

-- Add profile preference columns
ALTER TABLE users ADD COLUMN
  display_name VARCHAR(100),
  user_timezone VARCHAR(50),
  language_preference VARCHAR(10),
  notification_preferences JSONB DEFAULT '{}',
  profile_updated_at TIMESTAMP DEFAULT NOW();

-- Add profile indexes for performance
CREATE INDEX idx_users_display_name ON users(display_name) WHERE display_name IS NOT NULL;
CREATE INDEX idx_users_timezone ON users(timezone) WHERE timezone IS NOT NULL;
CREATE INDEX idx_users_language_preference ON users(language_preference) WHERE language_preference IS NOT NULL;
CREATE INDEX idx_users_profile_updated_at ON users(profile_updated_at);

-- Add constraints for data validation
ALTER TABLE users ADD CONSTRAINT users_timezone_check CHECK (
  timezone IS NULL OR
  timezone ~ '^[A-Za-z0-9_/+-]+$'
);

ALTER TABLE users ADD CONSTRAINT users_language_preference_check CHECK (
  language_preference IS NULL OR
  language_preference ~ '^[a-z]{2}(-[A-Z]{2})?$'
);

ALTER TABLE users ADD CONSTRAINT users_display_name_check CHECK (
  display_name IS NULL OR
  (LENGTH(TRIM(display_name)) >= 1 AND LENGTH(display_name) <= 100)
);

-- Add comments for the new columns
COMMENT ON COLUMN users.display_name IS 'User preferred display name (separate from authentication firstName/lastName)';
COMMENT ON COLUMN users.timezone IS 'User timezone preference for UI display (e.g., America/New_York)';
COMMENT ON COLUMN users.language_preference IS 'User language preference for UI (e.g., en-US, es-ES)';
COMMENT ON COLUMN users.notification_preferences IS 'JSON object containing notification settings';
COMMENT ON COLUMN users.profile_updated_at IS 'Timestamp of last profile update';

-- =====================================================
-- CREATE USER STATUS AUDIT TABLE
-- =====================================================
-- This table is referenced in the UserService but doesn't exist yet

CREATE TABLE user_status_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    old_status VARCHAR(20) NOT NULL,
    new_status VARCHAR(20) NOT NULL,
    reason TEXT NOT NULL,
    changed_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    changed_at TIMESTAMP DEFAULT NOW(),
    ip_address INET,

    -- Constraints
    CONSTRAINT user_status_audit_old_status_check CHECK (old_status IN ('active', 'inactive', 'suspended', 'deleted')),
    CONSTRAINT user_status_audit_new_status_check CHECK (new_status IN ('active', 'inactive', 'suspended', 'deleted')),
    CONSTRAINT user_status_audit_reason_check CHECK (LENGTH(TRIM(reason)) >= 1)
);

-- Add indexes for user status audit table
CREATE INDEX idx_user_status_audit_user_id ON user_status_audit(user_id);
CREATE INDEX idx_user_status_audit_changed_by ON user_status_audit(changed_by);
CREATE INDEX idx_user_status_audit_changed_at ON user_status_audit(changed_at);
CREATE INDEX idx_user_status_audit_new_status ON user_status_audit(new_status);

-- Add comments
COMMENT ON TABLE user_status_audit IS 'Audit log for user status changes';
COMMENT ON COLUMN user_status_audit.old_status IS 'Previous user status';
COMMENT ON COLUMN user_status_audit.new_status IS 'New user status';
COMMENT ON COLUMN user_status_audit.reason IS 'Reason for status change';
COMMENT ON COLUMN user_status_audit.changed_by IS 'User ID who made the change';
COMMENT ON COLUMN user_status_audit.ip_address IS 'IP address of the user making the change';

COMMIT;

-- Down Migration
-- To rollback this migration, run:
/*
BEGIN;

-- Drop the user status audit table
DROP TABLE IF EXISTS user_status_audit CASCADE;

-- Remove profile columns from users table
ALTER TABLE users DROP COLUMN IF EXISTS display_name CASCADE;
ALTER TABLE users DROP COLUMN IF EXISTS timezone CASCADE;
ALTER TABLE users DROP COLUMN IF EXISTS language_preference CASCADE;
ALTER TABLE users DROP COLUMN IF EXISTS notification_preferences CASCADE;
ALTER TABLE users DROP COLUMN IF EXISTS profile_updated_at CASCADE;

-- Drop indexes (they will be automatically dropped with the columns)
-- No need to explicitly drop the indexes as they're tied to the columns

COMMIT;
*/

-- Verification Queries
-- After running this migration, you can verify with:
/*
-- Check that columns were added
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'users'
  AND column_name IN ('display_name', 'timezone', 'language_preference', 'notification_preferences', 'profile_updated_at');

-- Check that user_status_audit table was created
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'user_status_audit'
ORDER BY ordinal_position;

-- Check indexes were created
SELECT indexname, tablename
FROM pg_indexes
WHERE tablename IN ('users', 'user_status_audit')
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
*/