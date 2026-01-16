-- Migration: Add newsletter subscriptions
-- Created: 2026-01-15T12:00:00.000Z
-- Description: Stores newsletter subscribers and issued coupon metadata.

-- Up Migration
BEGIN;

CREATE TABLE IF NOT EXISTS newsletter_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    email_normalized VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'subscribed',
    source VARCHAR(60),
    coupon_id UUID REFERENCES coupons(id) ON DELETE SET NULL,
    coupon_code VARCHAR(64),
    coupon_sent_at TIMESTAMP,
    subscribed_at TIMESTAMP NOT NULL DEFAULT NOW(),
    unsubscribed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT newsletter_status_check CHECK (status IN ('subscribed', 'unsubscribed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_email_normalized
  ON newsletter_subscriptions(email_normalized);
CREATE INDEX IF NOT EXISTS idx_newsletter_status
  ON newsletter_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_newsletter_coupon_id
  ON newsletter_subscriptions(coupon_id) WHERE coupon_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribed_at
  ON newsletter_subscriptions(subscribed_at);

COMMIT;

-- Down Migration
BEGIN;

-- Additive migration - no rollback included.

COMMIT;
