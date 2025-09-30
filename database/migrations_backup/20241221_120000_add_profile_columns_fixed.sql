-- Migration: Add Profile Columns to Users Table
-- Created: 2024-12-21T12:00:00.000Z
-- Description: Separate profile preferences from Supabase Auth metadata into PostgreSQL

-- Up Migration
BEGIN;

-- =====================================================
-- ADD PROFILE COLUMNS TO USERS TABLE
-- =====================================================

-- Add profile preference columns (one at a time)
ALTER TABLE users ADD COLUMN display_name VARCHAR(100);
ALTER TABLE users ADD COLUMN user_timezone VARCHAR(50);
ALTER TABLE users ADD COLUMN language_preference VARCHAR(10);
ALTER TABLE users ADD COLUMN notification_preferences JSONB DEFAULT '{}';
ALTER TABLE users ADD COLUMN profile_updated_at TIMESTAMP DEFAULT NOW();

-- Add profile indexes for performance
CREATE INDEX idx_users_display_name ON users(display_name) WHERE display_name IS NOT NULL;
CREATE INDEX idx_users_user_timezone ON users(user_timezone) WHERE user_timezone IS NOT NULL;
CREATE INDEX idx_users_language_preference ON users(language_preference) WHERE language_preference IS NOT NULL;
CREATE INDEX idx_users_profile_updated_at ON users(profile_updated_at);

-- Add comments for documentation
COMMENT ON COLUMN users.display_name IS 'User preferred display name for UI';
COMMENT ON COLUMN users.user_timezone IS 'User timezone preference for date/time display';
COMMENT ON COLUMN users.language_preference IS 'User language preference for UI';
COMMENT ON COLUMN users.notification_preferences IS 'User notification settings in JSON format';
COMMENT ON COLUMN users.profile_updated_at IS 'Timestamp of last profile update';

COMMIT;
