# Data Migration Phase - Prelaunch Sync (2025-10-16)

This phase links pre-launch registrations to existing users, converts
pre-launch rewards into normalized `user_perks` entries, and migrates
calendar vouchers and raffle entries into user-scoped tables.

Files
- `database/migrations/20251016_110000_backfill_users_from_auth.sql`
- `database/migrations/20251016_120000_prelaunch_data_migration_dry_run.sql`
- `database/migrations/20251016_121000_prelaunch_data_migration_apply.sql`

Goals
- Backfill `users` from `auth.users` so live accounts are available in the app DB.
- Map `pre_registrations` to `users` (case-insensitive email match).
- Backfill link columns (`users.pre_registration_id`, `pre_registrations.user_id`).
- Convert `pre_launch_rewards` and `referral_rewards` into `user_perks`.
- Migrate calendar vouchers into `user_vouchers`.
- Migrate calendar raffle entries into `user_raffle_entries` (permanent ledger).
- Keep the process idempotent and safe to re-run.

Notes and constraints
- This does not create new users in `users`. It only links existing accounts
  by matching email. Unmatched pre-registrations remain unmapped.
- Reward conversion is non-destructive. Source tables remain intact.
- `user_perks` uses a unique `(source_type, source_id)` constraint to prevent
  duplicates on re-run. A `migration_key` is stored in `metadata`.
- `user_vouchers` uses a unique `(source_type, source_id)` constraint for
  idempotent calendar voucher inserts.
- `user_raffle_entries` uses a unique `(raffle_id, user_id, source, event_date)`
  constraint to prevent duplicate entry rows on re-run.

Runbook (Supabase SQL editor)
1) Backfill users from auth:
   - Run `database/migrations/20251016_110000_backfill_users_from_auth.sql`
2) Dry run (no changes):
   - Run `database/migrations/20251016_120000_prelaunch_data_migration_dry_run.sql`
   - Review duplicate emails and unmatched counts.
3) Apply:
   - Run `database/migrations/20251016_121000_prelaunch_data_migration_apply.sql`
   - Review summary output at the end of the script.

Idempotency markers
- Link updates only apply when the target column is `NULL`.
- `user_perks` inserts are protected by a unique constraint and
  `ON CONFLICT DO NOTHING`.
- `metadata.migration_key = '20251016_prelaunch_sync_v1'` is written on insert.

Post-apply verification (optional)
- Confirm no link mismatches:
  - `pre_registrations.user_id` matches `users.pre_registration_id`
- Confirm `user_perks` counts align with mappable rewards.
- Confirm `user_vouchers` and `user_raffle_entries` counts align with mappable
  calendar vouchers and raffle entries.

Next phase (not executed here)
- Services and admin endpoints to surface and redeem `user_perks`.
