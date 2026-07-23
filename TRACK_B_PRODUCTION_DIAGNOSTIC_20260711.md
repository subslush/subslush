# Track B — Production Data & Security Diagnostic

## Classification and verdict

**CONFIDENTIAL — contains production customer identifiers.**

The diagnostic was read-only against a disposable local copy of the Supabase
production public schema. No production rows were changed. No remediation was
executed.

| Priority | Result |
|---|---|
| P0 secret-logging exposure | **No demonstrated production credential or activation-secret exposure through S01. Ops log confirmation still required.** |
| P1 MMU anchor corruption | **BLOCKED by production schema level:** `subscriptions.delivered_at` is missing; 3 active MMU candidates remain unclassified. |
| P2 succeeded orders with zero subscriptions | **0** |
| P3 succeeded coupon orders with no redemption row | **17 orders / 17 customers** |
| P4 stranded guest orders | **2 orders / 1 customer** |
| P5 hand-marked-paid without allocation | **0**; five paymentless delivered orders were legitimate credit purchases with matching debit transactions. |

## Snapshot and method

| Item | Evidence |
|---|---|
| Repository commit | `754588dc5881c0df3a132d934d5977afe94d4a88` |
| Production endpoint | Supabase PostgreSQL 17.6 session pooler, TLS connection |
| Dump scope | Exact `public` schema pre-data and table data; 65 tables |
| Copy size | 448 orders, 106 subscriptions, 259 payments, 645 users |
| Freshness indicators | latest order `2026-07-10 01:15:23`; latest subscription update `2026-07-08 16:09:42`; latest admin audit `2026-07-08 20:50:31` |
| Restore compatibility | PostgreSQL 17 `transaction_timeout` SET removed for the older local server |
| Deliberately omitted | Supabase-managed `auth` schema and public post-data RLS policies/indexes; these are not needed by the read-only diagnostic queries |
| Production schema limitation | `schema_migrations` and `subscriptions.delivered_at` are absent |

The raw dump, SQL restore files, and customer CSV extracts were kept in a
permission-restricted temporary directory and deleted during teardown. Only
this findings report and the unexecuted repair proposal are retained.

## P0 — S01 secret-logging exposure

### Provenance correction

The whole-`updates` logger in `updateSubscriptionForAdmin` is pre-existing:
`cf72f550`, authored `2026-01-16 05:37:29 +0100`, and present on
`origin/main`. Git contains no deployment tags or deployment-SHA ledger, so an
exact production deployment date cannot be established from repository history
alone. The earliest possible code date is January 16; the first related admin
audit activity was `2026-01-16 21:17:30`.

However, the earlier conclusion that this necessarily logged production
credentials for six months is not supported:

1. The production credential endpoint calls
   `updateSubscriptionCredentialsForAdmin`, which encrypts/stores credentials
   and does **not** call the unsafe whole-update logger.
2. Production recorded 117 `subscriptions.credentials.update` audit events
   from January 16 through July 8, but those requests used the separate path.
3. The generic endpoint that does call the logger excludes credentials and
   activation fields from its request schema. Its 10 production
   `subscriptions.update` audit events changed `metadata.auto_renew` only.
4. The secret-bearing activation-link caller was introduced on the feature
   branch. Production has no `activation_*` subscription columns and no
   activation-delivery evidence, demonstrating that this caller is not present
   in the copied production schema.

### Scale estimate

| Operation | Production events | Events shown to traverse S01 with a secret |
|---|---:|---:|
| Credential updates | 117 | 0 |
| Activation-link deliveries | 0 | 0 |
| Generic subscription updates through the unsafe logger | 10 | 0 secret-bearing fields observed |

There are 99 current subscriptions containing encrypted credentials. This is
the population that would matter if ops finds a different deployed caller or
older build that passed credentials into the unsafe logger; it is not evidence
that plaintext was logged.

### Rotation recommendation

**Do not order mass credential/token rotation based on S01 alone.** The DB and
repository evidence shows a dangerous sink but no deployed production caller
that supplied it a credential or activation secret. This materially lowers the
incident assessment from “confirmed six-month credential leak” to
“code-level exposure requiring log confirmation.”

If ops finds any plaintext secret-bearing `Admin updating subscription` entry,
rotate every affected credential/token immediately and reassess notification
and acquiring/compliance obligations.

### Required ops incident-response checklist

- Establish the exact deployed SHA timeline from January 16 onward; Git alone
  does not record deployments.
- Search application stdout/stderr, systemd/journald, Docker/PM2 logs and
  support bundles for `Admin updating subscription` without copying values into
  tickets or chat.
- Identify log aggregators, error trackers, observability vendors and any
  third-party forwarding destinations.
- Record retention/logrotate windows plus retained backups, exports, snapshots
  and disaster-recovery copies.
- Review access/audit history for every affected sink and exported bundle.
- Search separately for the other pre-existing logging findings fixed in
  `754588d`: webhook signatures/full POST bodies, provider response bodies,
  session identifiers and raw failure metadata.
- If a hit exists, record subscription ID, timestamp and deployed SHA while
  keeping the secret itself out of the incident worksheet.
- Decide purge versus legal hold, credential/token rotation, customer notice,
  PSP/acquirer notice and regulator advice with security/legal owners.
- Deploy the redaction fix or a minimal backport promptly even if no historical
  hit is found.

## P1 — MMU anchor corruption

The corrected `database/diagnose-mmu-anchors.js` was executed unchanged against
the copy and failed safely:

```text
MMU anchor diagnostic failed: column s.delivered_at does not exist
```

`subscription_upgrade_selections`, `subscriptions.term_start_at`, and
`admin_tasks.mmu_cycle_index` exist. Only `subscriptions.delivered_at` is
missing from the diagnostic contract. There are **3 active MMU candidates**,
but classifying them with `start_date` or another substitute would violate the
brief's no-improvisation rule and could generate false repair targets.

Therefore:

- Flagged subscriptions: not determinable at this schema level.
- Realized excess months: not determinable.
- Projected excess months: not determinable.
- Affected customer list: withheld because no customer is yet classified as a
  finding.
- Required next step: apply/reconcile the pending schema migrations, take a new
  read-only copy, and run the corrected diagnostic unchanged.

An unexecuted, transactionally guarded, dry-run-by-default proposal is retained
at
`qa-artifacts/track-b-20260711/PROPOSED_DO_NOT_RUN_mmu_anchor_repair.sql`.
Its target table is intentionally empty until the diagnostic can run and each
anchor is verified from delivery evidence. It also records the required
`9b619566…`, `a84c8871…`, and `abb2499c…` fixture assertions.

## P2 — Succeeded orders with zero fulfillment

**No findings.** Every order with a succeeded payment has at least one
subscription.

- Orders: 0
- Money banked without a subscription: 0
- Affected customers: none

## P3 — Coupon leakage

There are **17 succeeded-payment orders with a coupon/discount and no
`coupon_redemptions` row at all**. Thirteen are delivered and four are marked
cancelled despite a succeeded payment.

Discount must be reported per currency; adding minor units across currencies
would be invalid.

| Currency | Orders | Unrecorded discount |
|---|---:|---:|
| CAD | 5 | CAD 58.03 |
| EUR | 3 | EUR 10.92 |
| GBP | 3 | GBP 27.43 |
| USD | 6 | USD 45.41 |

Affected orders/customers:

| Order | Customer | Created | Status | Provider | Coupon | Discount |
|---|---|---|---|---|---|---:|
| `b69ef068-1ead-467f-93a5-04c81d3fc64d` | `amber@flourish.ch` | 2026-01-22 | delivered | Stripe | `NEW15` | EUR 1.30 |
| `33145fbb-f1ef-4ff5-b537-5705bc74e12e` | `persaddillon@gmail.com` | 2026-01-22 | delivered | Stripe | `NEW15` | USD 8.98 |
| `0c95e0f8-ac49-4c58-b58f-931aa9f87563` | `redfiveb@hotmail.com` | 2026-01-22 | delivered | Stripe | `NEW15` | CAD 1.04 |
| `0c3bad23-5b4e-490b-802b-85b887a58e57` | `mich46@hotmail.com` | 2026-01-22 | cancelled | Stripe | `NEW15` | CAD 1.04 |
| `7f144244-d4e7-4d5a-93a6-cff7e7f1ee2c` | `will.360@outlook.com` | 2026-01-25 | cancelled | Stripe | `NEW15` | GBP 16.18 |
| `404f02f7-f4f5-4f7c-9830-715fe0c49ba0` | `thomas.nardelli@gmail.com` | 2026-01-25 | cancelled | Stripe | `NEW15` | CAD 22.50 |
| `4e40823f-b28d-4f9d-a12b-6b6df5327fb1` | `yashwanthmudhiraj@gmail.com` | 2026-01-26 | delivered | Stripe | `NEW15` | USD 9.71 |
| `66013b90-e4e2-44af-ac1f-accfb05c1a25` | `olivierb.net@gmail.com` | 2026-01-27 | delivered | Stripe | `NEW15` | CAD 2.50 |
| `743d2cd6-2bdb-42f5-a2ee-a2a584a8a6ba` | `nguyen.mimosa@gmail.com` | 2026-01-28 | delivered | Stripe | `NEW15` | USD 0.75 |
| `a7b2632c-de15-4bfa-b046-f752fccc9606` | `subslush.knelt738@passmail.net` | 2026-01-30 | delivered | Stripe | `NEW15` | USD 8.98 |
| `3093e67e-966d-4ef9-8938-4390ba9950a9` | `benellison1@protonmail.com` | 2026-01-31 | delivered | Stripe | `NEW15` | GBP 9.45 |
| `f79c4d7c-a188-4d3d-91e4-b62c6772d830` | `subslush@ssh.33m.co` | 2026-01-31 | delivered | Stripe | `NEW15` | USD 10.49 |
| `d9521136-bcea-409f-a6d0-da46135476bf` | `hvj7dq0js4o@mailbaby.biz` | 2026-02-17 | delivered | Stripe | `ALLTO30` | EUR 4.65 |
| `13d87b0a-5513-410c-aeaa-7fbaa8d6bded` | `rapidphantom27@gmail.com` | 2026-02-20 | cancelled | Stripe | `NEWSLETTER12-3EC1DD15` | GBP 1.80 |
| `c991072a-b2bb-4bb1-b667-442ee70c60cb` | `naayahs11@gmail.com` | 2026-02-24 | delivered | Stripe | `286-XKS-896` | CAD 30.95 |
| `e12dd42f-f329-4b52-8cb2-28108320e9f1` | `bogdannicolescu10@gmail.com` | 2026-03-01 | delivered | Stripe | `NEWSLETTER12-CD6E256E` | EUR 4.97 |
| `cfd97981-1026-42d8-b369-9ba907f7fc98` | `y2k2afazur@yahoo.com` | 2026-05-08 | delivered | PayPal | `PAYBACK10` | USD 6.50 |

This is realized cap/accounting leakage, not necessarily additional customer
harm: the discounts were intentionally granted, but redemption accounting did
not record them. The four cancelled orders with succeeded payments should also
be reviewed independently for payment/refund state.

## P4 — Stranded guest orders

Two delivered PayPal orders remain owned by the same unclaimed guest identity
even though a registered account with the checkout email already existed. Both
subscriptions are now expired but remain guest-owned.

| Order | Registered customer | Created | Amount |
|---|---|---|---:|
| `adaf7f83-54a5-4de8-a5bb-d976c92b9c49` | `hkgoal94@gmail.com` | 2026-04-28 | SEK 64.36 |
| `db151fb2-3bbf-485a-8ca7-4c9f20fb19d7` | `hkgoal94@gmail.com` | 2026-04-30 | SEK 64.36 |

Totals: 2 orders, 1 customer, SEK 128.72.

## P5 — Hand-marked-paid without allocation

There are no non-credit delivered/in-process orders lacking a succeeded payment
or equivalent allocation.

Five delivered orders have no `payments` row, but all five are explicitly
`paid_with_credits=true`, use provider `credits`, and have matching
`credit_transactions` purchase debits tied to their order IDs. They are valid
credit purchases and are not findings.

## Read-only and teardown audit

- Production interaction: `pg_dump` plus read-only metadata checks only.
- Copy interaction: restore followed exclusively by `BEGIN READ ONLY` queries
  and the read-only diagnostic.
- Remediation: none executed.
- Application source: unchanged.
- Disposable database and raw temporary files: removed after report assembly.
