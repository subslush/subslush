# Schema Alignment - Admin Catalog/Orders (2025-10-15)

This document captures the schema changes added in the Schema Alignment phase to support
admin catalog, orders, and prelaunch reward linkage without breaking existing runtime
behavior.

Migration file
- `database/migrations/20251015_120000_schema_alignment_admin.sql`
- `database/migrations/20251015_130000_add_prelaunch_fk_constraints.sql`

Goals
- Add a normalized catalog and pricing layer.
- Introduce order/order_items for payment linkage.
- Bridge prelaunch users and rewards to live accounts.
- Add linkage fields for payments, credit transactions, subscriptions, and rewards.
- Keep changes additive and safe for zero-downtime rollout.

New tables
- `products`
  - Columns: `id` (UUID), `name`, `slug`, `description`, `service_type`, `status`,
    `metadata`, `created_at`, `updated_at`
  - Status constraint: `active`, `inactive`
  - Indexes: `slug` (unique), `status`, `service_type`
- `product_variants`
  - Columns: `id`, `product_id` (FK), `name`, `variant_code`, `description`,
    `service_plan`, `is_active`, `sort_order`, `metadata`, `created_at`, `updated_at`
  - Indexes: `product_id`, `is_active`, `service_plan`
- `product_labels`
  - Columns: `id`, `name`, `slug`, `description`, `color`, `created_at`, `updated_at`
  - Index: `slug` (unique)
- `product_label_map`
  - Columns: `product_id` (FK), `label_id` (FK), `created_at`
  - Primary key: `(product_id, label_id)`
  - Index: `label_id`
- `product_media`
  - Columns: `id`, `product_id` (FK), `media_type`, `url`, `alt_text`,
    `sort_order`, `is_primary`, `metadata`, `created_at`, `updated_at`
  - Media type constraint: `image`, `video`
  - Indexes: `product_id`, `(product_id, is_primary)`, `(product_id, sort_order)`
- `price_history`
  - Columns: `id`, `product_variant_id` (FK), `price_cents`, `currency`,
    `starts_at`, `ends_at`, `metadata`, `created_at`
  - Window constraint: `ends_at` is null or `ends_at > starts_at`
  - Indexes: `product_variant_id`, `(product_variant_id, starts_at DESC)`
- `orders`
  - Columns: `id`, `user_id` (FK), `status`, `status_reason`, `currency`,
    `subtotal_cents`, `discount_cents`, `total_cents`, `paid_with_credits`,
    `auto_renew`, `payment_provider`, `payment_reference`, `metadata`,
    `created_at`, `updated_at`
  - Status constraint: `cart`, `pending_payment`, `paid`, `in_process`,
    `delivered`, `cancelled`
  - Indexes: `user_id`, `status`, `created_at`, `(payment_provider, payment_reference)`
- `order_items`
  - Columns: `id`, `order_id` (FK), `product_variant_id` (FK), `quantity`,
    `unit_price_cents`, `currency`, `total_price_cents`, `description`,
    `metadata`, `created_at`
  - Indexes: `order_id`, `product_variant_id`

Existing tables: new columns and indexes
- `users`
  - Columns: `display_name`, `user_timezone`, `language_preference`,
    `notification_preferences`, `profile_updated_at`, `pre_registration_id`
  - Defaults: `notification_preferences` default `{}`, `profile_updated_at` default `NOW()`
  - Indexes: `display_name`, `user_timezone`, `language_preference`,
    `profile_updated_at`, `pre_registration_id` (unique partial)
- `pre_registrations`
  - Column: `user_id`
  - Index: `user_id` (unique partial)
- `payments`
  - Columns: `order_id`, `product_variant_id`, `price_cents`, `auto_renew`,
    `next_billing_at`, `renewal_method`, `status_reason`
  - Indexes: `order_id`, `product_variant_id`, `next_billing_at`
- `credit_transactions`
  - Columns: `order_id`, `product_variant_id`, `price_cents`, `currency`,
    `auto_renew`, `next_billing_at`, `renewal_method`, `status_reason`,
    `referral_reward_id`, `pre_launch_reward_id`
  - Indexes: `order_id`, `product_variant_id`, `next_billing_at`,
    `referral_reward_id`, `pre_launch_reward_id`
- `subscriptions`
  - Columns: `order_id`, `product_variant_id`, `price_cents`, `currency`,
    `auto_renew`, `next_billing_at`, `renewal_method`, `status_reason`,
    `referral_reward_id`, `pre_launch_reward_id`
  - Indexes: `order_id`, `product_variant_id`, `next_billing_at`,
    `auto_renew` (partial), `renewal_method`
- `referral_rewards`
  - Columns: `redeemed_by_user_id`, `redeemed_at`, `applied_value_cents`
  - Indexes: `redeemed_by_user_id`, `redeemed_at`
- `pre_launch_rewards`
  - Columns: `redeemed_by_user_id`, `redeemed_at`, `applied_value_cents`
  - Indexes: `redeemed_by_user_id`, `redeemed_at`
- `admin_tasks`
  - Columns: `order_id`, `user_id`, `task_category`, `sla_due_at`
  - `subscription_id` now nullable
  - Indexes: `order_id`, `user_id`, `task_category`, `sla_due_at`

Zero-downtime notes
- All new columns on existing tables are nullable.
- No defaults were added for `auto_renew` in existing tables to preserve
  current behavior (metadata-based auto-renew handling).
- No destructive down migration is included; rollback should be planned
  explicitly if required.

Open decisions
- Foreign keys for prelaunch link columns and reward linkage IDs are added
  in `20251015_130000_add_prelaunch_fk_constraints.sql` using Option A:
  `pre_launch_rewards.user_id` is the referenced key for prelaunch rewards.
