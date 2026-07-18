# Admin UI branch deploy and post-deploy runbook

This runbook is for shipping `Admin-UI-and-Logic-implementation`. It is an
operator checklist, not authorization to execute production changes. The
certified application commit is
`754588dc5881c0df3a132d934d5977afe94d4a88`; verify the eventual merge/deploy
commit contains that commit before proceeding.

The production findings referenced below are confidential. Do not copy
customer emails or identifiers from
`TRACK_B_PRODUCTION_DIAGNOSTIC_20260711.md` into tickets, chat, or this runbook.

## Pre-deploy

- Confirm the final branch-seal report is `BRANCH SEALED` and its automated
  gate evidence is retained.
- Confirm `754588dc5881c0df3a132d934d5977afe94d4a88` is an ancestor of the exact
  merge/deploy SHA. Record both SHAs in the change record.
- Confirm the deploy worktree is clean and the release contains no unreviewed
  application or migration changes.
- Back up production and record a tested restore point before applying schema
  changes.
- Reconcile the production schema against the repository immediately before
  deploy. The Track B copy lacked the following five pending/unverified
  migrations; apply them in this order:

  1. `database/migrations/20260121_120000_add_subscription_cancellation_fields.sql`
  2. `database/migrations/20260121_130000_add_prelaunch_reward_tasks.sql`
  3. `database/migrations/20260204_220000_add_catalog_terms_unavailable_dedupe_index.sql`
  4. `database/migrations/20260312_120000_add_order_entitlements_and_fixed_catalog_fields.sql`
  5. `database/migrations/20260709_120000_add_item_fulfillment_handshake.sql`

  This list comes from the tracked migration files compared with
  `database/supabase_schema_migrations_backfill_20260709.sql`, which records
  migrations verified in the Supabase schema snapshot. The final migration
  adds `subscriptions.delivered_at` and the other item-delivery/activation
  columns absent from the Track B production copy. Do not blindly mark a
  migration applied: inspect current schema state and execute through the
  approved Supabase migration procedure.
- Confirm application configuration/secrets and rollback ownership, and notify
  the release, database, security, support, and finance/ops owners.
- Stripe and PayPal decommissioning is a separate later backlog item. It is not
  part of this deploy and must not be bundled into this change.

## Deploy

1. Put the approved backup/restore point and rollback owner on the change
   record.
2. Apply the five Supabase migrations above, in order, using the approved
   migration channel. Stop on any error or unexpected schema difference.
3. Verify all five schema changes, especially
   `subscriptions.delivered_at`, and record the migration output.
4. Deploy the release containing the certified commit. Record the exact
   deployed SHA and deployment timestamp.
5. Smoke-check the live admin console: authentication, product and fulfillment
   detail loading, order/task queues, coupon list including the explicit
   expired-coupon toggle, and a read-only subscription detail.
6. Run one approved low-value test checkout end to end. Confirm payment state,
   order/subscription creation, fulfillment visibility, customer access, email
   delivery, and sanitized application logs. Clean up only through an approved
   operational path.
7. If a smoke check fails, stop further cleanup, preserve evidence, and follow
   the release rollback decision.

## Post-deploy: classify the MMU anchors

The new schema unblocks the question that Track B could not answer. This work
remains read-only until a corrupt anchor has been confirmed.

1. Take a new read-only Supabase copy using the session pooler, TLS, and a
   PostgreSQL 17 client, following the Track B method. Keep the dump and any
   customer extracts permission-restricted and delete them after the review.
2. Run `node database/diagnose-mmu-anchors.js` unchanged against the disposable
   copy.
3. Classify the three active MMU candidates from delivery evidence. Do not
   substitute `start_date` or another field for `delivered_at`.
4. If no candidate is confirmed corrupt, retain the diagnostic output and do
   not run a repair.
5. Only for a confirmed corrupt anchor, use
   `qa-artifacts/track-b-20260711/PROPOSED_DO_NOT_RUN_mmu_anchor_repair.sql`:

   - take and verify a fresh backup first;
   - re-run the unchanged diagnostic immediately before repair;
   - populate only independently verified targets;
   - run the script in its dry-run/default mode first and review every row;
   - require the `9b619566…`, `a84c8871…`, and `abb2499c…` fixture
     assertions to pass;
   - obtain the required production-change approval before enabling apply;
   - run the unchanged diagnostic after apply and retain before/after evidence.

## Post-deploy: settled low-stakes cleanup

These are separate operational decisions, not release blockers and not part of
the migration/deploy transaction.

### Coupon redemption accounting

Track B found 17 succeeded-payment coupon orders with no
`coupon_redemptions` row. Decide with product/finance whether to backfill them
for cap/accounting accuracy or accept the historical gap and move on. The exact
17 order IDs are the rows in **P3 — Coupon leakage** of the confidential
`TRACK_B_PRODUCTION_DIAGNOSTIC_20260711.md`; use that table as the controlled
source of scope and do not copy its customer emails elsewhere.

Four of those orders are cancelled despite a succeeded payment. Treat them as
a separate payment/refund review for possible unreversed charges, owned by
finance/ops; this is not a coupon-remediation question. The controlled scope is
the four P3 rows whose status is `cancelled` in the confidential Track B
report.

### Stranded guest history

Track B found two delivered guest orders belonging to one customer. Both
subscriptions are already expired, so there is no live-access issue. Operations
may attach the historical orders/subscriptions to the existing registered
account or deliberately leave them as historical guest records. The two order
IDs and registered account are listed in **P4 — Stranded guest orders** of the
confidential Track B report; do not reproduce the customer identity here.

## Ops: confirm historical S01 log state

This is low-urgency confirmation, not a declared incident. Track B found no
deployed secret-bearing caller to the unsafe logger, and mass rotation is not
indicated unless a plaintext hit is found.

- Establish the deployed SHA timeline from January 16 onward.
- Search application stdout/stderr, systemd/journald, Docker/PM2 logs, support
  bundles, aggregators, error trackers, observability vendors, forwarding
  destinations, backups, exports, snapshots, and disaster-recovery copies for
  `Admin updating subscription`. Do not copy secret values into tickets/chat.
- Record retention/logrotate windows and review access/audit history for every
  affected sink and exported bundle.
- Search separately for the other logging classes fixed in `754588d`: webhook
  signatures/full POST bodies, provider response bodies, session identifiers,
  and raw failure metadata.
- If there is a hit, record only subscription ID, timestamp, sink, and deployed
  SHA in the incident worksheet. Keep the secret itself out of the worksheet.
- With security/legal owners, decide purge versus legal hold, affected
  credential/token rotation, customer notice, PSP/acquirer notice, and
  regulator advice. Rotate every affected credential/token immediately.
- If there is no hit, retain the search scope/result and close the confirmation
  without mass rotation.

## Completion record

Record migration output, deployed SHA, smoke evidence, rollback decision,
post-deploy diagnostic result, cleanup decisions/owners, and the S01 log-search
result in access-controlled operational records. Do not attach the confidential
Track B customer table to the general release ticket.
