-- Migration: Add Authentication Columns
-- Run this after initial setup-prelaunch-schema.sql

BEGIN;

-- Add new columns
ALTER TABLE pre_registrations
ADD COLUMN IF NOT EXISTS username VARCHAR(15) UNIQUE,
ADD COLUMN IF NOT EXISTS password_hash TEXT,
ADD COLUMN IF NOT EXISTS supabase_auth_id UUID UNIQUE,
ADD COLUMN IF NOT EXISTS verification_token VARCHAR(100),
ADD COLUMN IF NOT EXISTS verification_sent_at TIMESTAMP WITH TIME ZONE;

-- Remove old column if it exists
ALTER TABLE pre_registrations DROP COLUMN IF EXISTS first_name;

-- Add constraints
ALTER TABLE pre_registrations
ADD CONSTRAINT username_length_check CHECK (char_length(username) >= 3 AND char_length(username) <= 15),
ADD CONSTRAINT username_format_check CHECK (username ~* '^[a-zA-Z0-9_]+$');

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_pre_reg_username ON pre_registrations(username);
CREATE INDEX IF NOT EXISTS idx_pre_reg_auth_id ON pre_registrations(supabase_auth_id);
CREATE INDEX IF NOT EXISTS idx_pre_reg_verification_token ON pre_registrations(verification_token);

COMMIT;

-- Verify changes
SELECT column_name, data_type, character_maximum_length, is_nullable
FROM information_schema.columns
WHERE table_name = 'pre_registrations'
ORDER BY ordinal_position;
