-- Migration: Add firstName and lastName columns to users table
-- Date: 2025-09-30
-- Purpose: Store user names in PostgreSQL instead of relying on Supabase Auth metadata

-- Add first_name and last_name columns to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS first_name TEXT,
ADD COLUMN IF NOT EXISTS last_name TEXT;

-- Create an index for faster name-based queries (optional but recommended)
CREATE INDEX IF NOT EXISTS idx_users_name ON users(first_name, last_name);

-- Verify the migration
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'users'
  AND column_name IN ('first_name', 'last_name');
