import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import Fastify, { type FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { parse } from 'dotenv';

jest.setTimeout(120000);

const dbName = `qa_multi_item_pricing_${Date.now()}`;
const envFile = parse(
  fs.readFileSync(path.resolve(__dirname, '../../.env'), 'utf8')
);
const dbEnv = {
  ...process.env,
  ...envFile,
  DB_DATABASE: dbName,
  DB_PORT: '5432',
  PGPASSWORD: envFile.DB_PASSWORD,
  STRIPE_ENABLED: 'true',
};

const productId = '00000000-0000-4000-8000-000000010000';
const sixMonthProductId = '00000000-0000-4000-8000-000000010100';
const sixMonthVariantId = '00000000-0000-4000-8000-000000010101';
const variantIds = {
  first: '00000000-0000-4000-8000-000000010001',
  second: '00000000-0000-4000-8000-000000010002',
  third: '00000000-0000-4000-8000-000000010003',
  snapshotless: '00000000-0000-4000-8000-000000010004',
  mixedUsd: '00000000-0000-4000-8000-000000010005',
};

let app: FastifyInstance;
let closeDatabasePool: () => Promise<void>;
let databasePool: any;
let catalogService: any;
let couponService: any;
let paymentService: any;
let disconnectRateLimitRedis: () => Promise<void>;

const completeStripeCheckout = async (params: {
  orderId: string;
  paymentIntentId: string;
  sessionId: string;
  amountTotal: number;
}) => {
  const payload = JSON.stringify({
    id: `evt_${params.sessionId}`,
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: params.sessionId,
        object: 'checkout.session',
        payment_intent: params.paymentIntentId,
        amount_total: params.amountTotal,
        currency: 'usd',
        metadata: { order_id: params.orderId },
      },
    },
  });
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: envFile.STRIPE_WEBHOOK_SECRET,
  });
  return app.inject({
    method: 'POST',
    url: '/payments/stripe/webhook',
    headers: {
      'content-type': 'application/json',
      'stripe-signature': signature,
    },
    payload,
  });
};

const run = (command: string, args: string[]): void => {
  execFileSync(command, args, {
    cwd: path.resolve(__dirname, '../..'),
    env: dbEnv,
    stdio: 'pipe',
  });
};

const createGuestIdentity = async (email: string): Promise<string> => {
  const response = await app.inject({
    method: 'POST',
    url: '/checkout/identity',
    payload: { email },
  });
  expect(response.statusCode).toBe(200);
  return response.json().data.guest_identity_id as string;
};

const createDraft = async (params: {
  email: string;
  items: Array<{
    variant_id: string;
    term_months: number;
    auto_renew: boolean;
  }>;
  coupon_code?: string;
  guest_identity_id?: string;
  checkout_session_key?: string;
}) => {
  const guestIdentityId =
    params.guest_identity_id ?? (await createGuestIdentity(params.email));
  return app.inject({
    method: 'POST',
    url: '/checkout/draft',
    payload: {
      guest_identity_id: guestIdentityId,
      contact_email: params.email,
      currency: 'USD',
      items: params.items,
      ...(params.checkout_session_key
        ? { checkout_session_key: params.checkout_session_key }
        : {}),
      ...(params.coupon_code ? { coupon_code: params.coupon_code } : {}),
    },
  });
};

describe('Multi-item pricing locks (fresh PostgreSQL, real checkout route)', () => {
  beforeAll(async () => {
    run('createdb', [
      '-h',
      envFile.DB_HOST,
      '-p',
      '5432',
      '-U',
      envFile.DB_USER,
      dbName,
    ]);
    run('node', ['database/migrate.js', 'up']);
    Object.assign(process.env, dbEnv);

    const database = await import('../config/database');
    const { env } = await import('../config/environment');
    const { rateLimitRedisClient } = await import('../config/redis');
    const { checkoutRoutes } = await import('../routes/checkout');
    const { paymentRoutes } = await import('../routes/payments');
    const { subscriptionRoutes } = await import('../routes/subscriptions');
    ({ catalogService } = await import('../services/catalogService'));
    ({ couponService } = await import('../services/couponService'));
    ({ paymentService } = await import('../services/paymentService'));
    databasePool = database.createDatabasePool(env);
    closeDatabasePool = database.closeDatabasePool;
    await rateLimitRedisClient.connect();
    disconnectRateLimitRedis = () => rateLimitRedisClient.disconnect();

    await databasePool.query(
      `INSERT INTO products (id, name, slug, service_type, default_currency, status, metadata)
       VALUES ($1, 'Multi-item pricing lock', 'multi-item-pricing-lock', 'qa', 'USD', 'active', '{}'::jsonb)`,
      [productId]
    );
    await databasePool.query(
      `INSERT INTO products
        (id, name, slug, service_type, default_currency, duration_months, max_subscriptions, status, metadata)
       VALUES ($1, 'Six month listing', 'six-month-listing', 'qa', 'USD', 6, 0, 'active', '{}'::jsonb)`,
      [sixMonthProductId]
    );
    await databasePool.query(
      `INSERT INTO product_variants
        (id, product_id, name, variant_code, service_plan, is_active)
       VALUES ($1, $2, 'Six month listing variant', 'six-month-listing', 'six-month-listing', TRUE)`,
      [sixMonthVariantId, sixMonthProductId]
    );
    await databasePool.query(
      `INSERT INTO product_variant_terms
        (product_variant_id, months, is_active, sort_order, is_recommended)
       VALUES ($1, 1, TRUE, 0, TRUE), ($1, 6, TRUE, 1, FALSE)`,
      [sixMonthVariantId]
    );
    for (const [name, variantId] of Object.entries(variantIds)) {
      await databasePool.query(
        `INSERT INTO product_variants (id, product_id, name, variant_code, is_active)
         VALUES ($1, $2, $3, $4, TRUE)`,
        [variantId, productId, name, `multi-item-${name}`]
      );
      await databasePool.query(
        `INSERT INTO product_variant_terms (product_variant_id, months, is_active, sort_order)
         VALUES ($1, 1, TRUE, 0)`,
        [variantId]
      );
    }
    await databasePool.query(
      `INSERT INTO coupons
        (code, code_normalized, percent_off, scope, apply_scope, status, max_redemptions)
       VALUES ('MULTI-LOCK-15', 'multi-lock-15', 15, 'global', 'highest_eligible_item', 'active', 10)`
    );

    // This is the supported normal admin price setter. Each write deliberately
    // creates its own succeeded manual pricing publication snapshot.
    for (const [variantId, priceCents] of [
      [variantIds.first, 1000],
      [variantIds.second, 2000],
      [variantIds.third, 3000],
    ] as const) {
      const result = await catalogService.setCurrentPrice({
        product_variant_id: variantId,
        price_cents: priceCents,
        currency: 'USD',
      });
      expect(result.success).toBe(true);
    }
    expect(
      (
        await catalogService.setCurrentPrice({
          product_variant_id: sixMonthVariantId,
          price_cents: 1200,
          currency: 'USD',
        })
      ).success
    ).toBe(true);

    await databasePool.query(
      `INSERT INTO price_history
        (product_variant_id, price_cents, currency, starts_at, metadata)
       VALUES ($1, 777, 'USD', NOW(), '{}'::jsonb)`,
      [variantIds.snapshotless]
    );

    // A valid fixture for the cart-level settlement-currency refusal: the USD
    // display price and its EUR settlement counterpart share one succeeded run.
    const mixedRun = await databasePool.query(
      `INSERT INTO pricing_publish_runs (status, triggered_by, published_at, metadata)
       VALUES ('succeeded', 'manual', NOW(), '{}'::jsonb)
       RETURNING snapshot_id`
    );
    const mixedSnapshotId = mixedRun.rows[0].snapshot_id as string;
    const mixedMetadata = JSON.stringify({
      snapshot_id: mixedSnapshotId,
      settlement_currency: 'EUR',
    });
    await databasePool.query(
      `INSERT INTO price_history
        (product_variant_id, price_cents, currency, starts_at, metadata)
       VALUES ($1, 4000, 'USD', '2025-01-01 00:00:00', $2::jsonb),
              ($1, 3500, 'EUR', '2025-01-01 00:00:00', $2::jsonb)`,
      [variantIds.mixedUsd, mixedMetadata]
    );
    expect(
      await catalogService.getCurrentPriceForCurrency({
        variantId: variantIds.mixedUsd,
        currency: 'USD',
      })
    ).not.toBeNull();
    expect(
      await catalogService.getCurrentPriceForCurrency({
        variantId: variantIds.mixedUsd,
        currency: 'EUR',
      })
    ).not.toBeNull();

    app = Fastify();
    await app.register(checkoutRoutes, { prefix: '/checkout' });
    await app.register(paymentRoutes, { prefix: '/payments' });
    await app.register(subscriptionRoutes, { prefix: '/subscriptions' });
  });

  afterAll(async () => {
    await app?.close();
    await disconnectRateLimitRedis?.();
    await closeDatabasePool?.();
    run('dropdb', [
      '-h',
      envFile.DB_HOST,
      '-p',
      '5432',
      '-U',
      envFile.DB_USER,
      '--force',
      '--if-exists',
      dbName,
    ]);
  });

  it('accepts three separately saved valid locks, applies the coupon to one highest item, and persists line evidence', async () => {
    const locks = await databasePool.query(
      `SELECT product_variant_id, metadata->>'snapshot_id' AS snapshot_id
       FROM price_history
       WHERE product_variant_id = ANY($1::uuid[]) AND ends_at IS NULL
       ORDER BY product_variant_id`,
      [[variantIds.first, variantIds.second, variantIds.third]]
    );
    const expectedSnapshotIds = locks.rows.map(
      (row: { snapshot_id: string }) => row.snapshot_id
    );
    // This is the exact old failure predicate: the three normal saves have
    // distinct locks, but the new per-item invariant must accept them.
    expect(new Set(expectedSnapshotIds).size).toBe(3);

    const response = await createDraft({
      email: 'three-locks@pricing-lock.test',
      coupon_code: 'MULTI-LOCK-15',
      items: [
        { variant_id: variantIds.first, term_months: 1, auto_renew: false },
        { variant_id: variantIds.second, term_months: 1, auto_renew: false },
        { variant_id: variantIds.third, term_months: 1, auto_renew: false },
      ],
    });

    expect(response.statusCode).toBe(200);
    const draft = response.json().data;
    expect(draft.pricing.pricing_snapshot_id).toBeNull();
    expect(draft.pricing.order_subtotal_cents).toBe(6000);
    expect(draft.pricing.order_coupon_discount_cents).toBe(450);
    expect(draft.pricing.order_total_cents).toBe(5550);
    expect(
      draft.pricing.items.map((item: any) => item.coupon_discount_cents)
    ).toEqual([0, 0, 450]);
    expect(
      new Set(draft.pricing.items.map((item: any) => item.pricing_snapshot_id))
    ).toEqual(new Set(expectedSnapshotIds));

    const persisted = await databasePool.query(
      `SELECT o.pricing_snapshot_id AS order_snapshot_id,
              oi.metadata->>'pricing_snapshot_id' AS item_snapshot_id
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       WHERE o.id = $1
       ORDER BY oi.created_at ASC`,
      [draft.order_id]
    );
    expect(persisted.rows).toHaveLength(3);
    expect(
      persisted.rows.every((row: any) => row.order_snapshot_id === null)
    ).toBe(true);
    expect(
      new Set(persisted.rows.map((row: any) => row.item_snapshot_id))
    ).toEqual(new Set(expectedSnapshotIds));
  });

  it('reserves a guest coupon at draft and redeems it after a signed Stripe webhook', async () => {
    const response = await createDraft({
      email: 'guest-coupon-lifecycle@pricing-lock.test',
      coupon_code: 'MULTI-LOCK-15',
      items: [
        { variant_id: variantIds.third, term_months: 1, auto_renew: false },
      ],
    });
    expect(response.statusCode).toBe(200);
    const draft = response.json().data;

    const reserved = await databasePool.query(
      `SELECT status
       FROM coupon_redemptions
       WHERE order_id = $1`,
      [draft.order_id]
    );
    expect(reserved.rows).toEqual([{ status: 'reserved' }]);

    const webhook = await completeStripeCheckout({
      orderId: draft.order_id,
      paymentIntentId: 'pi_guest_coupon_lifecycle',
      sessionId: 'cs_guest_coupon_lifecycle',
      amountTotal: draft.pricing.order_total_cents,
    });
    expect(webhook.statusCode).toBe(200);

    const redeemed = await databasePool.query(
      `SELECT status, redeemed_at IS NOT NULL AS redeemed
       FROM coupon_redemptions
       WHERE order_id = $1`,
      [draft.order_id]
    );
    expect(redeemed.rows).toEqual([{ status: 'redeemed', redeemed: true }]);
    const coupon = (
      await couponService.listCoupons({ code: 'MULTI-LOCK-15' })
    )[0];
    expect(coupon?.redemptions_used).toBe(1);
  });

  it('reuses one coupon reservation across repeated drafts of the same checkout', async () => {
    const email = 'guest-coupon-idempotent@pricing-lock.test';
    const guestIdentityId = await createGuestIdentity(email);
    const first = await createDraft({
      email,
      guest_identity_id: guestIdentityId,
      coupon_code: 'MULTI-LOCK-15',
      items: [
        { variant_id: variantIds.second, term_months: 1, auto_renew: false },
      ],
    });
    expect(first.statusCode).toBe(200);
    const firstDraft = first.json().data;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const repeated = await createDraft({
        email,
        guest_identity_id: guestIdentityId,
        checkout_session_key: firstDraft.checkout_session_key,
        coupon_code: 'MULTI-LOCK-15',
        items: [
          {
            variant_id: variantIds.second,
            term_months: 1,
            auto_renew: false,
          },
        ],
      });
      expect(repeated.statusCode).toBe(200);
      expect(repeated.json().data.order_id).toBe(firstDraft.order_id);
      expect(repeated.json().data.pricing.order_coupon_discount_cents).toBe(
        300
      );
      expect(repeated.json().data.pricing.order_total_cents).toBe(1700);
    }

    const reservations = await databasePool.query(
      `SELECT coupon_id, status, COUNT(*) OVER ()::int AS row_count
       FROM coupon_redemptions
       WHERE order_id = $1`,
      [firstDraft.order_id]
    );
    expect(reservations.rows).toHaveLength(1);
    expect(reservations.rows[0]).toMatchObject({
      status: 'reserved',
      row_count: 1,
    });
  });

  it('uses the listing duration for a six-month variant and ignores zero capacity', async () => {
    const detail = await app.inject({
      method: 'GET',
      url: '/subscriptions/products/six-month-listing',
      headers: { 'x-currency': 'USD' },
    });
    expect(detail.statusCode).toBe(200);
    const listing = detail.json().data;
    expect(listing.variants).toHaveLength(1);
    expect(listing.variants[0].id).toBe(sixMonthVariantId);
    expect(listing.variants[0].term_options).toEqual([
      expect.objectContaining({ months: 6, total_price: 72 }),
    ]);

    const draftResponse = await createDraft({
      email: 'six-month-zero-capacity@pricing-lock.test',
      items: [
        {
          variant_id: sixMonthVariantId,
          term_months: 6,
          auto_renew: false,
        },
      ],
    });
    expect(draftResponse.statusCode).toBe(200);
    const draft = draftResponse.json().data;
    expect(draft.pricing.items).toEqual([
      expect.objectContaining({
        variant_id: sixMonthVariantId,
        term_months: 6,
        pricing_snapshot_id: expect.any(String),
        final_total_cents: 7200,
      }),
    ]);

    const webhook = await completeStripeCheckout({
      orderId: draft.order_id,
      paymentIntentId: 'pi_six_month_zero_capacity',
      sessionId: 'cs_six_month_zero_capacity',
      amountTotal: 7200,
    });
    expect(webhook.statusCode).toBe(200);
    const fulfilled = await databasePool.query(
      `SELECT o.status, s.term_months, s.product_variant_id,
              COUNT(DISTINCT s.id)::int AS subscriptions,
              COUNT(DISTINCT t.id)::int AS tasks
       FROM orders o
       JOIN subscriptions s ON s.order_id = o.id
       JOIN admin_tasks t ON t.subscription_id = s.id
       WHERE o.id = $1
       GROUP BY o.status, s.term_months, s.product_variant_id`,
      [draft.order_id]
    );
    expect(fulfilled.rows).toEqual([
      {
        status: 'in_process',
        term_months: 6,
        product_variant_id: sixMonthVariantId,
        subscriptions: 1,
        tasks: 1,
      },
    ]);
  });

  it('alerts and suppresses confirmation when paid fulfillment entities are incomplete', async () => {
    const draftResponse = await createDraft({
      email: 'fulfillment-atomicity@pricing-lock.test',
      items: [
        { variant_id: variantIds.first, term_months: 1, auto_renew: false },
      ],
    });
    expect(draftResponse.statusCode).toBe(200);
    const draft = draftResponse.json().data;

    await databasePool.query(
      `UPDATE order_items
       SET metadata = metadata - 'service_type' - 'service_plan'
       WHERE order_id = $1`,
      [draft.order_id]
    );

    const webhook = await completeStripeCheckout({
      orderId: draft.order_id,
      paymentIntentId: 'pi_fulfillment_atomicity',
      sessionId: 'cs_fulfillment_atomicity',
      amountTotal: draft.pricing.order_total_cents,
    });
    expect(webhook.statusCode).toBe(400);

    const state = await databasePool.query(
      `SELECT o.status, o.status_reason,
              o.metadata->>'payment_confirmation_email_sent_at' AS confirmation_sent_at,
              COUNT(DISTINCT s.id)::int AS subscriptions,
              COUNT(DISTINCT t.id) FILTER (
                WHERE t.task_category = 'payment_fulfillment_failure'
                  AND t.is_issue = TRUE
                  AND t.completed_at IS NULL
              )::int AS operator_issues,
              MAX(p.status) AS payment_status,
              BOOL_OR((p.metadata->>'fulfillment_failure')::boolean) AS payment_alerted
       FROM orders o
       LEFT JOIN subscriptions s ON s.order_id = o.id
       LEFT JOIN admin_tasks t ON t.order_id = o.id
       LEFT JOIN payments p ON p.order_id = o.id
       WHERE o.id = $1
       GROUP BY o.id`,
      [draft.order_id]
    );
    expect(state.rows).toEqual([
      {
        status: 'cancelled',
        status_reason: 'payment_succeeded_fulfillment_failed',
        confirmation_sent_at: null,
        subscriptions: 0,
        operator_issues: 1,
        payment_status: 'succeeded',
        payment_alerted: true,
      },
    ]);
  });

  it('leaves a guest order without a coupon free of redemption records', async () => {
    const response = await createDraft({
      email: 'guest-no-coupon@pricing-lock.test',
      items: [
        { variant_id: variantIds.first, term_months: 1, auto_renew: false },
      ],
    });
    expect(response.statusCode).toBe(200);
    const rows = await databasePool.query(
      'SELECT id FROM coupon_redemptions WHERE order_id = $1',
      [response.json().data.order_id]
    );
    expect(rows.rows).toEqual([]);
  });

  it('rejects a concurrent guest draft when a max-one coupon is already reserved', async () => {
    await databasePool.query(
      `INSERT INTO coupons
        (code, code_normalized, percent_off, scope, apply_scope, status, max_redemptions)
       VALUES ('GUEST-CAP-ONE', 'guest-cap-one', 15, 'global', 'highest_eligible_item', 'active', 1)`
    );

    const [first, second] = await Promise.all([
      createDraft({
        email: 'guest-cap-one-a@pricing-lock.test',
        coupon_code: 'GUEST-CAP-ONE',
        items: [
          { variant_id: variantIds.third, term_months: 1, auto_renew: false },
        ],
      }),
      createDraft({
        email: 'guest-cap-one-b@pricing-lock.test',
        coupon_code: 'GUEST-CAP-ONE',
        items: [
          { variant_id: variantIds.third, term_months: 1, auto_renew: false },
        ],
      }),
    ]);

    expect([first.statusCode, second.statusCode].sort()).toEqual([200, 400]);
    const active = await databasePool.query(
      `SELECT cr.status
       FROM coupon_redemptions cr
       JOIN coupons c ON c.id = cr.coupon_id
       WHERE c.code_normalized = 'guest-cap-one'
         AND cr.status IN ('reserved', 'redeemed')`
    );
    expect(active.rows).toEqual([{ status: 'reserved' }]);
  });

  it('voids a guest reservation when the Payop/Antom expiry sweep cancels the pending order', async () => {
    await databasePool.query(
      `INSERT INTO coupons
        (code, code_normalized, percent_off, scope, apply_scope, status, max_redemptions)
       VALUES ('GUEST-EXPIRY-RELEASE', 'guest-expiry-release', 15, 'global', 'highest_eligible_item', 'active', 1)`
    );
    const draftResponse = await createDraft({
      email: 'guest-expiry-release-a@pricing-lock.test',
      coupon_code: 'GUEST-EXPIRY-RELEASE',
      items: [
        { variant_id: variantIds.third, term_months: 1, auto_renew: false },
      ],
    });
    expect(draftResponse.statusCode).toBe(200);
    const draft = draftResponse.json().data;

    await databasePool.query(
      `UPDATE orders
       SET status = 'pending_payment',
           payment_provider = 'payop',
           payment_reference = 'payop-guest-expiry-release'
       WHERE id = $1`,
      [draft.order_id]
    );
    await databasePool.query(
      `INSERT INTO payments
        (user_id, order_id, provider, provider_payment_id, status, purpose, amount, currency, created_at)
       SELECT user_id, id, 'payop', 'payop-guest-expiry-release', 'pending', 'subscription',
              total_cents::numeric / 100, currency, NOW() - INTERVAL '73 hours'
       FROM orders
       WHERE id = $1`,
      [draft.order_id]
    );

    const sweep = await paymentService.sweepStaleCheckoutSessions({
      batchSize: 10,
    });
    expect(sweep.cancelled).toBeGreaterThanOrEqual(1);

    const released = await databasePool.query(
      `SELECT cr.status, o.status AS order_status, p.status AS payment_status
       FROM coupon_redemptions cr
       JOIN orders o ON o.id = cr.order_id
       JOIN payments p ON p.order_id = o.id
       WHERE o.id = $1`,
      [draft.order_id]
    );
    expect(released.rows).toEqual([
      {
        status: 'voided',
        order_status: 'cancelled',
        payment_status: 'expired',
      },
    ]);

    const usableAgain = await createDraft({
      email: 'guest-expiry-release-b@pricing-lock.test',
      coupon_code: 'GUEST-EXPIRY-RELEASE',
      items: [
        { variant_id: variantIds.third, term_months: 1, auto_renew: false },
      ],
    });
    expect(usableAgain.statusCode).toBe(200);
  });

  it('keeps single-item and same-variant-twice carts compatible with the header snapshot', async () => {
    const single = await createDraft({
      email: 'single-lock@pricing-lock.test',
      items: [
        { variant_id: variantIds.first, term_months: 1, auto_renew: false },
      ],
    });
    expect(single.statusCode).toBe(200);
    expect(single.json().data.pricing.pricing_snapshot_id).toBeTruthy();

    const duplicated = await createDraft({
      email: 'duplicate-lock@pricing-lock.test',
      items: [
        { variant_id: variantIds.first, term_months: 1, auto_renew: false },
        { variant_id: variantIds.first, term_months: 1, auto_renew: false },
      ],
    });
    expect(duplicated.statusCode).toBe(200);
    const pricing = duplicated.json().data.pricing;
    expect(pricing.pricing_snapshot_id).toBeTruthy();
    expect(
      new Set(pricing.items.map((item: any) => item.pricing_snapshot_id))
    ).toEqual(new Set([pricing.pricing_snapshot_id]));
  });

  it('still rejects a snapshot-less line before draft creation', async () => {
    const response = await createDraft({
      email: 'snapshotless@pricing-lock.test',
      items: [
        { variant_id: variantIds.first, term_months: 1, auto_renew: false },
        {
          variant_id: variantIds.snapshotless,
          term_months: 1,
          auto_renew: false,
        },
      ],
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().message).toBe('price unavailable');
  });

  it('rejects mixed settlement currencies with an explicit error', async () => {
    const response = await createDraft({
      email: 'mixed-settlement@pricing-lock.test',
      items: [
        { variant_id: variantIds.first, term_months: 1, auto_renew: false },
        { variant_id: variantIds.mixedUsd, term_months: 1, auto_renew: false },
      ],
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().message).toBe('invalid settlement');
  });
});
