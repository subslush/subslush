-- Migration: Schema alignment for admin catalog/orders
-- Created: 2025-10-15T12:00:00.000Z
-- Description: Add catalog, order, identity bridge, and reward linkage fields (additive).

-- Up Migration
BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- USERS: profile preferences + prelaunch bridge
-- =====================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_timezone VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS language_preference VARCHAR(10);
ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_preferences JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_updated_at TIMESTAMP;

ALTER TABLE users ALTER COLUMN notification_preferences SET DEFAULT '{}'::jsonb;
ALTER TABLE users ALTER COLUMN profile_updated_at SET DEFAULT NOW();

ALTER TABLE users ADD COLUMN IF NOT EXISTS pre_registration_id UUID;

CREATE INDEX IF NOT EXISTS idx_users_display_name
  ON users(display_name) WHERE display_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_user_timezone
  ON users(user_timezone) WHERE user_timezone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_language_preference
  ON users(language_preference) WHERE language_preference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_profile_updated_at
  ON users(profile_updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_pre_registration_id
  ON users(pre_registration_id) WHERE pre_registration_id IS NOT NULL;

-- =====================================================
-- PRE_REGISTRATIONS: link back to users
-- =====================================================

ALTER TABLE pre_registrations ADD COLUMN IF NOT EXISTS user_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pre_registrations_user_id
  ON pre_registrations(user_id) WHERE user_id IS NOT NULL;

-- =====================================================
-- CATALOG: products, variants, labels, media, pricing
-- =====================================================

CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    slug VARCHAR(150) NOT NULL,
    description TEXT,
    service_type VARCHAR(50),
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT products_status_check CHECK (status IN ('active', 'inactive'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_service_type ON products(service_type);

CREATE TABLE IF NOT EXISTS product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    variant_code VARCHAR(50),
    description TEXT,
    service_plan VARCHAR(50),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_variants_product_id
  ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_active
  ON product_variants(is_active);
CREATE INDEX IF NOT EXISTS idx_product_variants_service_plan
  ON product_variants(service_plan);

CREATE TABLE IF NOT EXISTS product_labels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    description TEXT,
    color VARCHAR(20),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_labels_slug ON product_labels(slug);

CREATE TABLE IF NOT EXISTS product_label_map (
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    label_id UUID NOT NULL REFERENCES product_labels(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (product_id, label_id)
);

CREATE INDEX IF NOT EXISTS idx_product_label_map_label_id
  ON product_label_map(label_id);

CREATE TABLE IF NOT EXISTS product_media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    media_type VARCHAR(20) NOT NULL,
    url TEXT NOT NULL,
    alt_text VARCHAR(200),
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT product_media_type_check CHECK (media_type IN ('image', 'video'))
);

CREATE INDEX IF NOT EXISTS idx_product_media_product_id
  ON product_media(product_id);
CREATE INDEX IF NOT EXISTS idx_product_media_product_primary
  ON product_media(product_id, is_primary);
CREATE INDEX IF NOT EXISTS idx_product_media_product_sort
  ON product_media(product_id, sort_order);

CREATE TABLE IF NOT EXISTS price_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    currency VARCHAR(10) NOT NULL,
    starts_at TIMESTAMP NOT NULL DEFAULT NOW(),
    ends_at TIMESTAMP,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT price_history_window_check CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_price_history_variant_id
  ON price_history(product_variant_id);
CREATE INDEX IF NOT EXISTS idx_price_history_variant_start
  ON price_history(product_variant_id, starts_at DESC);

-- =====================================================
-- ORDERS: order header + items
-- =====================================================

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(30) NOT NULL DEFAULT 'cart',
    status_reason TEXT,
    currency VARCHAR(10),
    subtotal_cents INTEGER CHECK (subtotal_cents >= 0),
    discount_cents INTEGER DEFAULT 0 CHECK (discount_cents >= 0),
    total_cents INTEGER CHECK (total_cents >= 0),
    paid_with_credits BOOLEAN NOT NULL DEFAULT FALSE,
    auto_renew BOOLEAN NOT NULL DEFAULT FALSE,
    payment_provider VARCHAR(20),
    payment_reference VARCHAR(150),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT orders_status_check CHECK (
      status IN ('cart', 'pending_payment', 'paid', 'in_process', 'delivered', 'cancelled')
    )
);

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_payment_reference
  ON orders(payment_provider, payment_reference);

CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
    currency VARCHAR(10) NOT NULL,
    total_price_cents INTEGER NOT NULL CHECK (total_price_cents >= 0),
    description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id
  ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_variant_id
  ON order_items(product_variant_id);

-- =====================================================
-- LINKING COLUMNS: payments, credit_transactions, subscriptions
-- =====================================================

ALTER TABLE payments ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id) ON DELETE SET NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS product_variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS price_cents INTEGER;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS next_billing_at TIMESTAMP;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS renewal_method VARCHAR(20);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS status_reason TEXT;

ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id) ON DELETE SET NULL;
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS product_variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL;
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS price_cents INTEGER;
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS currency VARCHAR(10);
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN;
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS next_billing_at TIMESTAMP;
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS renewal_method VARCHAR(20);
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS status_reason TEXT;
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS referral_reward_id UUID;
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS pre_launch_reward_id UUID;

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id) ON DELETE SET NULL;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS product_variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS price_cents INTEGER;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS currency VARCHAR(10);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS next_billing_at TIMESTAMP;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS renewal_method VARCHAR(20);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS status_reason TEXT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS referral_reward_id UUID;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS pre_launch_reward_id UUID;

CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_product_variant_id ON payments(product_variant_id);
CREATE INDEX IF NOT EXISTS idx_payments_next_billing_at
  ON payments(next_billing_at) WHERE next_billing_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_credit_transactions_order_id
  ON credit_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_product_variant_id
  ON credit_transactions(product_variant_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_next_billing_at
  ON credit_transactions(next_billing_at) WHERE next_billing_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_credit_transactions_referral_reward_id
  ON credit_transactions(referral_reward_id) WHERE referral_reward_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_credit_transactions_pre_launch_reward_id
  ON credit_transactions(pre_launch_reward_id) WHERE pre_launch_reward_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_order_id
  ON subscriptions(order_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_product_variant_id
  ON subscriptions(product_variant_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_next_billing_at
  ON subscriptions(next_billing_at) WHERE next_billing_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subscriptions_auto_renew
  ON subscriptions(auto_renew) WHERE auto_renew = TRUE;
CREATE INDEX IF NOT EXISTS idx_subscriptions_renewal_method
  ON subscriptions(renewal_method) WHERE renewal_method IS NOT NULL;

-- =====================================================
-- REWARD REDEMPTION: referral_rewards + pre_launch_rewards
-- =====================================================

ALTER TABLE referral_rewards ADD COLUMN IF NOT EXISTS redeemed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE referral_rewards ADD COLUMN IF NOT EXISTS redeemed_at TIMESTAMP;
ALTER TABLE referral_rewards ADD COLUMN IF NOT EXISTS applied_value_cents INTEGER;

CREATE INDEX IF NOT EXISTS idx_referral_rewards_redeemed_by
  ON referral_rewards(redeemed_by_user_id) WHERE redeemed_by_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_referral_rewards_redeemed_at
  ON referral_rewards(redeemed_at) WHERE redeemed_at IS NOT NULL;

ALTER TABLE pre_launch_rewards ADD COLUMN IF NOT EXISTS redeemed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE pre_launch_rewards ADD COLUMN IF NOT EXISTS redeemed_at TIMESTAMP;
ALTER TABLE pre_launch_rewards ADD COLUMN IF NOT EXISTS applied_value_cents INTEGER;

CREATE INDEX IF NOT EXISTS idx_pre_launch_rewards_redeemed_by
  ON pre_launch_rewards(redeemed_by_user_id) WHERE redeemed_by_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pre_launch_rewards_redeemed_at
  ON pre_launch_rewards(redeemed_at) WHERE redeemed_at IS NOT NULL;

-- =====================================================
-- ADMIN TASKS: extend for orders and users
-- =====================================================

ALTER TABLE admin_tasks ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id) ON DELETE SET NULL;
ALTER TABLE admin_tasks ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE admin_tasks ADD COLUMN IF NOT EXISTS task_category VARCHAR(50);
ALTER TABLE admin_tasks ADD COLUMN IF NOT EXISTS sla_due_at TIMESTAMP;

ALTER TABLE admin_tasks ALTER COLUMN subscription_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_tasks_order_id ON admin_tasks(order_id);
CREATE INDEX IF NOT EXISTS idx_admin_tasks_user_id ON admin_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_tasks_task_category ON admin_tasks(task_category);
CREATE INDEX IF NOT EXISTS idx_admin_tasks_sla_due_at ON admin_tasks(sla_due_at);

COMMIT;

-- Down Migration
BEGIN;

-- This migration is additive and does not include destructive rollback steps.
-- If rollback is required, drop the new tables/columns explicitly after review.

COMMIT;
