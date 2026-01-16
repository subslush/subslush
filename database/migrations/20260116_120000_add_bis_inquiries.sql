-- Migration: Add BIS inquiries
-- Created: 2026-01-16T12:00:00.000Z
-- Description: Stores beta issue/suggestion submissions from users.

-- Up Migration
BEGIN;

CREATE TABLE IF NOT EXISTS bis_inquiries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    email_normalized VARCHAR(255) NOT NULL,
    topic VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT bis_inquiries_topic_check CHECK (topic IN ('bug', 'issue', 'suggestion')),
    CONSTRAINT bis_inquiries_status_check CHECK (status IN ('active', 'issue', 'cancelled', 'solved'))
);

CREATE INDEX IF NOT EXISTS idx_bis_inquiries_status_created_at
  ON bis_inquiries(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bis_inquiries_email_normalized
  ON bis_inquiries(email_normalized);
CREATE INDEX IF NOT EXISTS idx_bis_inquiries_created_at
  ON bis_inquiries(created_at);

COMMIT;

-- Down Migration
BEGIN;

-- Additive migration - no rollback included.

COMMIT;
