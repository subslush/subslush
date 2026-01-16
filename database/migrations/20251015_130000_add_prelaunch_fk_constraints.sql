-- Migration: Add prelaunch FK constraints
-- Created: 2025-10-15T13:00:00.000Z
-- Description: Add FKs for prelaunch linkage and reward references (Option A).

-- Up Migration
BEGIN;

-- Add constraints as NOT VALID to avoid long validation locks on creation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_pre_registration_id'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT fk_users_pre_registration_id
      FOREIGN KEY (pre_registration_id)
      REFERENCES pre_registrations(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_pre_registrations_user_id'
  ) THEN
    ALTER TABLE pre_registrations
      ADD CONSTRAINT fk_pre_registrations_user_id
      FOREIGN KEY (user_id)
      REFERENCES users(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_credit_transactions_referral_reward_id'
  ) THEN
    ALTER TABLE credit_transactions
      ADD CONSTRAINT fk_credit_transactions_referral_reward_id
      FOREIGN KEY (referral_reward_id)
      REFERENCES referral_rewards(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_subscriptions_referral_reward_id'
  ) THEN
    ALTER TABLE subscriptions
      ADD CONSTRAINT fk_subscriptions_referral_reward_id
      FOREIGN KEY (referral_reward_id)
      REFERENCES referral_rewards(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_credit_transactions_pre_launch_reward_id'
  ) THEN
    ALTER TABLE credit_transactions
      ADD CONSTRAINT fk_credit_transactions_pre_launch_reward_id
      FOREIGN KEY (pre_launch_reward_id)
      REFERENCES pre_launch_rewards(user_id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_subscriptions_pre_launch_reward_id'
  ) THEN
    ALTER TABLE subscriptions
      ADD CONSTRAINT fk_subscriptions_pre_launch_reward_id
      FOREIGN KEY (pre_launch_reward_id)
      REFERENCES pre_launch_rewards(user_id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END $$;

-- Validate constraints once created
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_users_pre_registration_id'
      AND NOT convalidated
  ) THEN
    ALTER TABLE users VALIDATE CONSTRAINT fk_users_pre_registration_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_pre_registrations_user_id'
      AND NOT convalidated
  ) THEN
    ALTER TABLE pre_registrations VALIDATE CONSTRAINT fk_pre_registrations_user_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_credit_transactions_referral_reward_id'
      AND NOT convalidated
  ) THEN
    ALTER TABLE credit_transactions VALIDATE CONSTRAINT fk_credit_transactions_referral_reward_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_subscriptions_referral_reward_id'
      AND NOT convalidated
  ) THEN
    ALTER TABLE subscriptions VALIDATE CONSTRAINT fk_subscriptions_referral_reward_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_credit_transactions_pre_launch_reward_id'
      AND NOT convalidated
  ) THEN
    ALTER TABLE credit_transactions VALIDATE CONSTRAINT fk_credit_transactions_pre_launch_reward_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_subscriptions_pre_launch_reward_id'
      AND NOT convalidated
  ) THEN
    ALTER TABLE subscriptions VALIDATE CONSTRAINT fk_subscriptions_pre_launch_reward_id;
  END IF;
END $$;

COMMIT;

-- Down Migration
BEGIN;

ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS fk_subscriptions_pre_launch_reward_id;
ALTER TABLE credit_transactions
  DROP CONSTRAINT IF EXISTS fk_credit_transactions_pre_launch_reward_id;
ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS fk_subscriptions_referral_reward_id;
ALTER TABLE credit_transactions
  DROP CONSTRAINT IF EXISTS fk_credit_transactions_referral_reward_id;
ALTER TABLE pre_registrations
  DROP CONSTRAINT IF EXISTS fk_pre_registrations_user_id;
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS fk_users_pre_registration_id;

COMMIT;
