# Phase 0 - Dashboard Product/IA/Design Spec

Date: 2026-01-05
Owner: Product + Design + Tech Lead
Scope: /dashboard redesign + IA alignment with /browse

This document defines the product goals, information architecture, UX rules,
and layout expectations for the dashboard rebuild. It does not contain
implementation details; it is the blueprint for Phase 1+ work.

---

## 1) Goals and Non-Goals

### Goals
- Align dashboard UI with main site tone: clean, professional, minimal.
- Remove duplicate actions, repeated sections, and conflicting navigation.
- Make key user info obvious: active subscriptions, upcoming renewals, credits,
  order history, and important alerts.
- Ensure all displayed values are dynamic and sourced from APIs.
- Keep the dashboard lightweight: no unnecessary modules or animations.

### Non-Goals
- Rebuild /browse (it is already the primary subscription marketplace).
- Add new product lines, marketing banners, or social proof inside dashboard.
- Add notifications for non-critical events.

---

## 2) Visual Direction (High-Level)

- Base palette: black/white/gray; brand gradient only for primary CTA.
- Icons: monochrome line icons; no emoji usage.
- Typography: reuse existing site typography; no new font introduction unless
  approved as part of a brand update.
- Layout: simple single-column sections, consistent spacing, max width 1200.
- Motion: minimal; no animated badges unless they signal critical alerts.

---

## 3) Information Architecture (IA)

### Primary Routes
- `/dashboard` - Overview
- `/dashboard/subscriptions` (single list for all statuses)
- `/dashboard/orders`
- `/dashboard/credits`
- `/dashboard/settings`

### Related Routes
- `/browse` - primary place to find/add subscriptions
- `/help` - support contact + PIN reset guidance

### Navigation Rules
- "Browse Subscriptions" in dashboard nav links to `/browse`.
- Remove `/dashboard/browse` and any internal flows pointing to it.
- Subscriptions appear in exactly one place: `/dashboard/subscriptions`.
- Remove duplicate CTAs (one top-up action only when needed).
- Replace `/profile` with `/dashboard/settings` everywhere in dashboard UI.

---

## 4) Dashboard Overview Spec

### Intent
Give the user immediate clarity on their active subscriptions, upcoming
renewals, and credit balance, plus important alerts if required.

### Required Sections
1) Summary Cards (compact)
   - Active Subscriptions (count)
   - Upcoming Renewals (count within defined window)
   - Available Credits (currency + amount)

2) Alerts (conditional)
   - Only show if there are unread important notifications.
   - Examples: renewal due soon, payment failed, low credits for upcoming
     renewals.

3) Optional: Upcoming Renewals (compact list)
   - Show top 3 items, then "View all" to subscriptions page.

4) Optional: Recent Orders (compact list)
   - Show top 3 orders, then "View all orders".

### Exclusions
- No "Quick Actions" section.
- No social proof/testimonials.
- No duplicate top-up or add subscription buttons.

---

## 5) Subscriptions Page Spec

### Intent
Single, authoritative view of a user's subscriptions. No duplicates elsewhere.

### Required UI Elements
- Filters: status (active, pending, cancelled, expired)
- List layout (rows or cards) with:
  - Service name + plan
  - Status
  - Renewal date / end date
  - Auto-renew state
  - Price and currency
  - "Manage" action opens inline panel (list-only view; no separate details page)

### CTAs
- Primary CTA: "Browse subscriptions" -> `/browse`
- No "Add subscription" button inside dashboard.

### Credentials
Credentials are not displayed in the list. Access is via secure flow that
requires a user PIN every time credentials are revealed.

---

## 6) Secure Credentials Flow (PIN-Gated)

### Flow Requirements
- On-site only; no email delivery.
- After the user's first successful paid order (Stripe or credits), prompt them
  to set a 4-digit PIN. This PIN is required to reveal credentials for any
  subscription that supports credential access.
- If a user has no PIN set, prompt them to set one before revealing.
- If a user forgets the PIN, direct them to `/help` to contact support.

### UX Rules
- PIN is requested every time credentials are revealed.
- 5 failed PIN attempts trigger a 10-minute cooldown.
- Mask credentials by default; explicit "Show" action required.
- Time-limited reveal (5-10 minutes) per session.
- Audit log each reveal attempt (success/failure) with user, subscription, and
  request metadata.
- No auto-copy; allow manual copy with a warning banner.

### Trigger Definition
- First successful order is defined as `orders.status = 'paid'` regardless of
  payment method (Stripe or credits).

---

## 7) Credits Page Spec

### Intent
Show credits balance and history with one clear top-up action.

### Required UI Elements
- Available Balance (primary)
- Pending Balance (if applicable)
- Credit history list (latest 10-20, paginated)
- Single primary CTA: "Top Up Credits"

### Exclusions
- No emojis or decorative gradient blocks outside primary CTA.

---

## 8) Orders Page Spec

### Intent
Unified order history with payment method indicator.

### Required UI Elements
- List of orders with:
  - Date
  - Amount
  - Status
  - Payment method badge (Stripe / Credits)
  - Service summary or order item
  - "View receipt" or details action

### Filters (Optional)
- Status
- Payment method (Stripe/Credits)

---

## 9) Notifications Strategy

### Principles
- Only important events; no "success" notifications for routine actions.
- Minimal badge count; do not display "0".

### Supported Events (Initial)
- Renewal due soon (T-7, T-3, T-1 days)
- Payment failed (Stripe or credits allocation failure)
- Payment pending beyond threshold (manual action suggested)
- Subscription expired (if auto-renew disabled or failed)
- Low credits when upcoming renewals exist

### Delivery
- In-app bell with unread count.
- Notifications list grouped by severity (Critical/Warning/Info).
- Dismiss on view or explicit mark-as-read.
- Retention 30 days.

---

## 10) Data Requirements (Phase 3 Target)

### Dashboard Overview API (Proposed)
`GET /api/v1/dashboard/overview`
Returns:
- counts: active_subscriptions, upcoming_renewals
- credits: available_balance, pending_balance
- alerts: list of important events
- upcoming_renewals: top 3 list
- recent_orders: optional top 3 list

### Subscriptions List
`GET /api/v1/subscriptions/my-subscriptions`
- Include true totals and derived fields: renewal_state, days_until_renewal.

### Orders
`GET /api/v1/orders?limit=&offset=`
- Unified list with payment provider and status.

### Credits
`GET /api/v1/credits/balance/:userId`
`GET /api/v1/credits/history/:userId`

---

## 11) Settings Page Spec

### Intent
Account management replaces `/profile` and lives under `/dashboard/settings`.

### Required UI Elements
- Username (read/write)
- Email (read/write)
- Password change (current + new)
- Support link for PIN reset -> `/help`

### Exclusions
- No first/last name fields
- No account statistics section

### Registration Change (Requirement)
- Replace "Full Name" with "Username" in registration flow.
- First/last name not required or stored for dashboard use.

---

## 12) Content and UX Standards

- No emojis in dashboard copy.
- Use plain, factual language.
- Avoid repeated CTAs for same action.
- Empty states must include a single, relevant CTA.

---

## 13) Wireframe Schemas (ASCII)

### Dashboard Overview
```
---------------------------------------------------------
| Dashboard                                             |
| "Good afternoon, {Name}"                              |
---------------------------------------------------------
| [Active Subs] [Upcoming Renewals] [Credits Available] |
---------------------------------------------------------
| Alerts (only if any)                                  |
| - Renewal due in 3 days for Netflix                   |
| - Payment failed for TradingView                      |
---------------------------------------------------------
| Upcoming Renewals (top 3)                             |
| Service      Renewal Date    Amount   Status          |
| Netflix      Jan 08          EUR 6.99 Due soon        |
| Spotify      Jan 10          EUR 4.99 Scheduled       |
| TradingView  Jan 12          EUR 12.99 Pending        |
| [View all subscriptions]                              |
---------------------------------------------------------
| Recent Orders (top 3)                                 |
| Date     Service      Amount   Status   Method        |
| Jan 02   Netflix Std  6.99     Paid     Stripe        |
| Dec 28   Spotify Fam  4.99     Paid     Credits       |
| [View all orders]                                     |
---------------------------------------------------------
```

### Subscriptions List
```
---------------------------------------------------------
| My Subscriptions                                      |
| [Status Filter] [Search optional]                     |
---------------------------------------------------------
| Service   Plan   Status   Renewal   Auto   Price      |
| Netflix   Std    Active   Jan 08    On     EUR 6.99    |
| Spotify   Fam    Active   Jan 10    Off    EUR 4.99    |
| [Manage]                                            > |
---------------------------------------------------------
| CTA: Browse subscriptions -> /browse                  |
---------------------------------------------------------
```

### Inline Manage Panel (list-only)
```
---------------------------------------------------------
| Manage: Netflix Standard                              |
| Auto-renew: [On/Off]                                  |
| Renewal date: Jan 08                                  |
| Price: EUR 6.99                                       |
| Credentials: [Reveal] (PIN required)                  |
| Support: /help for PIN reset                          |
---------------------------------------------------------
```

### Orders
```
---------------------------------------------------------
| Order History                                         |
| [Status Filter] [Payment Method Filter]               |
---------------------------------------------------------
| Date     Service      Amount   Status   Method        |
| Jan 02   Netflix Std  6.99     Paid     Stripe        |
| Dec 28   Spotify Fam  4.99     Paid     Credits       |
| [View receipt]                                      > |
---------------------------------------------------------
```

### Credits
```
---------------------------------------------------------
| Credits                                               |
| Available: EUR 28.50   Pending: EUR 0.00              |
| [Top Up Credits]                                      |
---------------------------------------------------------
| Recent Transactions                                   |
| Date     Type        Amount   Status                  |
| Jan 01   Top Up      +10.00   Completed               |
| Dec 20   Purchase    -6.99    Completed               |
---------------------------------------------------------
```

### Notifications (dropdown)
```
---------------------------------------------------------
| Notifications (2)                                     |
| CRITICAL - Payment failed for TradingView             |
| WARNING  - Renewal due in 3 days (Netflix)            |
| [Mark all as read]                                    |
---------------------------------------------------------
```

---

## 14) Confirmed Decisions

- Credentials are revealed on-site only and require a 4-digit PIN.
- PIN is set after the first successful paid order.
- Subscriptions are list-only (no separate details page).
- `/profile` is removed; `/dashboard/settings` is the account page.
- Overview includes a small recent orders list.
