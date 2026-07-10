import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import Fastify, { type FastifyInstance } from 'fastify';
import { parse } from 'dotenv';

jest.mock('../middleware/authMiddleware', () => ({
  authPreHandler: jest.fn(async (request: any) => {
    request.user = {
      userId: '00000000-0000-4000-8000-000000000001',
      email: 'admin@schema-smoke.test',
      role: 'admin',
      isAdmin: true,
    };
  }),
  optionalAuthPreHandler: jest.fn(async (request: any) => {
    request.user = {
      userId: '00000000-0000-4000-8000-000000000001',
      email: 'admin@schema-smoke.test',
      role: 'admin',
      isAdmin: true,
    };
  }),
}));
jest.mock('../middleware/adminMiddleware', () => ({
  adminPreHandler: jest.fn(async () => {}),
}));
jest.mock('../services/paymentFailureService', () => ({
  paymentFailureService: { getFailedPayments: jest.fn().mockResolvedValue([]) },
}));
jest.mock('../middleware/rateLimitMiddleware', () => ({
  createRateLimitHandler: jest.fn(() => async () => {}),
}));

jest.setTimeout(120000);

const dbName = `qa_schema_smoke_${Date.now()}`;
const envFile = parse(
  fs.readFileSync(path.resolve(__dirname, '../../.env'), 'utf8')
);
const dbEnv = {
  ...process.env,
  ...envFile,
  DB_DATABASE: dbName,
  DB_PORT: '5432',
  PGPASSWORD: envFile.DB_PASSWORD,
};

let app: FastifyInstance;
let closeDatabasePool: () => Promise<void>;
let databasePool: any;
let runManualMonthlyUpgradeSweep: (referenceNow?: Date) => Promise<void>;
let catalogService: any;
let subscriptionService: any;

const run = (command: string, args: string[], env = dbEnv): void => {
  execFileSync(command, args, {
    cwd: path.resolve(__dirname, '../..'),
    env,
    stdio: 'pipe',
  });
};

const seed = async (
  query: (sql: string, values?: unknown[]) => Promise<unknown>
) => {
  await query('BEGIN');
  try {
    await query(
      `INSERT INTO users (id, email, status, is_guest) VALUES
       ('00000000-0000-4000-8000-000000000001', 'admin@schema-smoke.test', 'active', FALSE),
       ('00000000-0000-4000-8000-000000000002', 'customer@schema-smoke.test', 'active', FALSE)`
    );
    await query(
      `INSERT INTO products (id, name, slug, service_type, default_currency, status, metadata)
       VALUES ('00000000-0000-4000-8000-000000000010', 'Schema smoke product', 'schema-smoke-product', 'schema_smoke', 'USD', 'active', '{}'::jsonb)`
    );
    await query(
      `INSERT INTO product_variants (id, product_id, name, variant_code, is_active)
       VALUES ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000010', 'Schema smoke variant', 'schema-smoke', TRUE)`
    );
    await query(
      `INSERT INTO product_variants (id, product_id, name, variant_code, is_active)
       SELECT
         ('00000000-0000-4000-8000-' || LPAD(value::text, 12, '0'))::uuid,
         '00000000-0000-4000-8000-000000000010',
         'Schema smoke variant ' || value,
         'schema-smoke-' || value,
         TRUE
       FROM generate_series(100, 300) AS value`
    );
    await query(
      `INSERT INTO coupons (id, code, code_normalized, percent_off, scope, apply_scope, status, max_redemptions)
       VALUES ('00000000-0000-4000-8000-000000000012', 'SCHEMA-SMOKE', 'schema-smoke', 15, 'global', 'highest_eligible_item', 'active', 5)`
    );
    await query(
      `INSERT INTO orders (id, user_id, status, currency, subtotal_cents, discount_cents, total_cents, payment_provider, payment_reference, contact_email)
       VALUES ('00000000-0000-4000-8000-000000000020', '00000000-0000-4000-8000-000000000002', 'in_process', 'USD', 300, 0, 300, 'stripe', 'schema-smoke-payment', 'customer@schema-smoke.test')`
    );
    await query(
      `INSERT INTO order_items (id, order_id, product_variant_id, quantity, unit_price_cents, total_price_cents, currency, term_months, metadata)
       VALUES
       ('00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000020', '00000000-0000-4000-8000-000000000011', 1, 100, 100, 'USD', 6, '{"product_name":"Schema smoke product","variant_name":"Schema smoke variant"}'::jsonb),
       ('00000000-0000-4000-8000-000000000022', '00000000-0000-4000-8000-000000000020', '00000000-0000-4000-8000-000000000011', 1, 100, 100, 'USD', 6, '{}'::jsonb),
       ('00000000-0000-4000-8000-000000000023', '00000000-0000-4000-8000-000000000020', '00000000-0000-4000-8000-000000000011', 1, 100, 100, 'USD', 6, '{}'::jsonb)`
    );
    await query(
      `INSERT INTO subscriptions (id, user_id, order_id, order_item_id, product_variant_id, service_type, service_plan, start_date, end_date, renewal_date, term_start_at, term_months, status, credentials_encrypted)
       VALUES ('00000000-0000-4000-8000-000000000030', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000020', '00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000011', 'schema_smoke', 'standard', NOW() - INTERVAL '30 days', NOW() + INTERVAL '150 days', NOW() + INTERVAL '150 days', NOW() - INTERVAL '30 days', 6, 'active', '{"version":1,"ciphertext":"not-a-secret"}')`
    );
    await query(
      `INSERT INTO subscription_upgrade_selections (subscription_id, order_id, selection_type, submitted_at, upgrade_options_snapshot)
       VALUES ('00000000-0000-4000-8000-000000000030', '00000000-0000-4000-8000-000000000020', 'upgrade_own_account', NOW(), '{"manual_monthly_upgrade":true,"manual_monthly_upgrade_interval_months":1}'::jsonb)`
    );
    await query(
      `INSERT INTO admin_tasks (id, subscription_id, user_id, order_id, task_type, task_category, due_date, completed_at, is_issue, mmu_cycle_index, mmu_cycle_total, created_at)
       VALUES
       ('00000000-0000-4000-8000-000000000040', '00000000-0000-4000-8000-000000000030', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000020', 'manual_monthly_upgrade', 'manual_monthly_upgrade', NOW() - INTERVAL '10 days', NOW() - INTERVAL '9 days', TRUE, 1, 5, NOW() - INTERVAL '11 days'),
       ('00000000-0000-4000-8000-000000000041', '00000000-0000-4000-8000-000000000030', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000020', 'manual_monthly_upgrade', 'manual_monthly_upgrade', NOW() + INTERVAL '1 day', NULL, FALSE, 2, 5, NOW() - INTERVAL '1 day')`
    );
    await query(
      `INSERT INTO payments (id, user_id, order_id, provider, provider_payment_id, status, purpose, amount, currency)
       VALUES ('00000000-0000-4000-8000-000000000050', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000020', 'stripe', 'schema-smoke-payment', 'succeeded', 'subscription', 3, 'USD')`
    );
    await query(
      `INSERT INTO newsletter_subscriptions (email, email_normalized, coupon_id, coupon_code, coupon_sent_at)
       VALUES ('newsletter@schema-smoke.test', 'newsletter@schema-smoke.test', '00000000-0000-4000-8000-000000000012', 'SCHEMA-SMOKE', NOW())`
    );
    await query('COMMIT');
  } catch (error) {
    await query('ROLLBACK');
    throw error;
  }
};

describe('Admin schema compatibility smoke (fresh PostgreSQL)', () => {
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
    const { adminFulfillmentRoutes } = await import(
      '../routes/admin/fulfillment'
    );
    const { adminNextRoutes } = await import('../routes/admin/next');
    const { adminCouponRoutes } = await import('../routes/admin/coupons');
    const { adminCatalogRoutes } = await import('../routes/admin/catalog');
    const { adminTaskRoutes } = await import('../routes/admin/tasks');
    const { checkoutRoutes } = await import('../routes/checkout');
    const { orderRoutes } = await import('../routes/orders');
    ({ runManualMonthlyUpgradeSweep } = await import(
      '../services/jobs/subscriptionJobs'
    ));
    ({ catalogService } = await import('../services/catalogService'));
    ({ subscriptionService } = await import('../services/subscriptionService'));
    databasePool = database.createDatabasePool(env);
    closeDatabasePool = database.closeDatabasePool;
    await seed(databasePool.query.bind(databasePool));

    app = Fastify();
    app.addHook('onRequest', (request, _reply, done) => {
      if (request.headers['x-schema-smoke-strip-user-agent'] === 'true') {
        delete request.headers['user-agent'];
      }
      done();
    });
    await app.register(adminFulfillmentRoutes, {
      prefix: '/admin/fulfillment',
    });
    await app.register(adminNextRoutes, { prefix: '/admin/next' });
    await app.register(adminCouponRoutes, { prefix: '/admin/coupons' });
    await app.register(adminCatalogRoutes, { prefix: '/admin' });
    await app.register(adminTaskRoutes, { prefix: '/admin/tasks' });
    await app.register(checkoutRoutes, { prefix: '/checkout' });
    await app.register(orderRoutes, { prefix: '/orders' });
  });

  afterAll(async () => {
    await app?.close();
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

  it('executes every new aggregate endpoint against the migrated schema without serializing credentials', async () => {
    const urls = [
      '/admin/fulfillment/queue?tab=new_orders',
      '/admin/fulfillment/queue?tab=mmu',
      '/admin/fulfillment/queue?tab=awaiting_customer',
      '/admin/fulfillment/queue?tab=issues',
      '/admin/fulfillment/queue?tab=completed',
      '/admin/fulfillment/orders/00000000-0000-4000-8000-000000000020',
      '/admin/fulfillment/mmu-tasks/00000000-0000-4000-8000-000000000041',
      '/admin/fulfillment/overview',
      '/admin/next/orders',
      '/admin/next/orders/00000000-0000-4000-8000-000000000020',
      '/admin/next/subscriptions',
      '/admin/next/subscriptions/00000000-0000-4000-8000-000000000030',
      '/admin/next/users/slim?search=customer%40schema-smoke.test',
      '/admin/next/search?q=schema-smoke',
      '/admin/next/payments',
      '/admin/coupons',
      '/admin/next/coupons/newsletter',
    ];

    for (const url of urls) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toHaveProperty('data');
      expect(response.body).not.toContain('credentials_encrypted');
      expect(response.body).not.toContain('not-a-secret');
    }

    const mmu = await app.inject({
      method: 'GET',
      url: '/admin/fulfillment/mmu-tasks/00000000-0000-4000-8000-000000000041',
    });
    expect(mmu.json().data.task).toMatchObject({
      month_label: 'Month 3 of 6',
      credentials_on_file: true,
    });

    const variantPage = await app.inject({
      method: 'GET',
      url: '/admin/product-variants?limit=200&offset=200',
    });
    expect(variantPage.statusCode).toBe(200);
    expect(variantPage.json().data.variants).toHaveLength(2);
  });

  it('creates a valid checkout lock for normal catalog price writes and hides snapshot-less prices', async () => {
    const draftVariantId = '00000000-0000-4000-8000-000000000011';
    const directPriceVariantId = '00000000-0000-4000-8000-000000000100';
    const snapshotlessVariantId = '00000000-0000-4000-8000-000000000101';
    await databasePool.query(
      `INSERT INTO product_variant_terms (product_variant_id, months, is_active, sort_order)
       VALUES ($1, 1, TRUE, 0), ($2, 1, TRUE, 0), ($3, 1, TRUE, 0)`,
      [draftVariantId, directPriceVariantId, snapshotlessVariantId]
    );

    const standardPrice = await catalogService.setCurrentPrice({
      product_variant_id: draftVariantId,
      price_cents: 1999,
      currency: 'USD',
    });
    expect(standardPrice.success).toBe(true);
    const directPrice = await catalogService.createPriceHistory({
      product_variant_id: directPriceVariantId,
      price_cents: 2099,
      currency: 'USD',
    });
    expect(directPrice.success).toBe(true);
    const resolvedDraftPrice = await catalogService.getCurrentPriceForCurrency({
      variantId: draftVariantId,
      currency: 'USD',
    });
    expect(resolvedDraftPrice).not.toBeNull();

    const locks = await databasePool.query(
      `SELECT ph.product_variant_id, ppr.status
       FROM price_history ph
       JOIN pricing_publish_runs ppr
         ON ppr.snapshot_id::text = ph.metadata->>'snapshot_id'
       WHERE ph.product_variant_id = ANY($1::uuid[])
         AND ppr.status = 'succeeded'`,
      [[draftVariantId, directPriceVariantId]]
    );
    expect(
      locks.rows.map(
        (row: { product_variant_id: string }) => row.product_variant_id
      )
    ).toEqual(expect.arrayContaining([draftVariantId, directPriceVariantId]));

    const identity = await app.inject({
      method: 'POST',
      url: '/checkout/identity',
      payload: { email: 'pricing-lock-guest@schema-smoke.test' },
    });
    expect(identity.statusCode).toBe(200);
    const guestIdentityId = identity.json().data.guest_identity_id;
    const draft = await app.inject({
      method: 'POST',
      url: '/checkout/draft',
      payload: {
        guest_identity_id: guestIdentityId,
        contact_email: 'pricing-lock-guest@schema-smoke.test',
        currency: 'USD',
        items: [
          { variant_id: draftVariantId, term_months: 1, auto_renew: false },
        ],
      },
    });
    expect(draft.statusCode).toBe(200);
    expect(draft.json().data.pricing?.pricing_snapshot_id).toBeTruthy();

    const fixedProduct = await catalogService.createProduct({
      name: 'Fixed-price schema smoke product',
      slug: 'fixed-price-schema-smoke-product',
      service_type: 'schema_smoke',
      default_currency: 'USD',
      duration_months: 1,
      fixed_price_cents: 3199,
      fixed_price_currency: 'USD',
      status: 'active',
    });
    expect(fixedProduct.success).toBe(true);
    const fixedProductId = fixedProduct.data.id;
    const fixedUpdated = await catalogService.updateProduct(fixedProductId, {
      fixed_price_cents: 3299,
      fixed_price_currency: 'USD',
    });
    expect(fixedUpdated.success).toBe(true);
    const fixedLock = await databasePool.query(
      `SELECT 1
       FROM product_fixed_price_history pfp
       JOIN pricing_publish_runs ppr
         ON ppr.snapshot_id::text = pfp.metadata->>'snapshot_id'
       WHERE pfp.product_id = $1
         AND ppr.status = 'succeeded'`,
      [fixedProductId]
    );
    expect(fixedLock.rows).not.toHaveLength(0);

    await databasePool.query(
      `INSERT INTO price_history
        (product_variant_id, price_cents, currency, starts_at, metadata)
       VALUES ($1, 2999, 'USD', NOW(), '{}'::jsonb)`,
      [snapshotlessVariantId]
    );
    const publicPrices = await catalogService.listCurrentPricesForCurrency({
      variantIds: [draftVariantId, snapshotlessVariantId],
      currency: 'USD',
    });
    expect(publicPrices.has(draftVariantId)).toBe(true);
    expect(publicPrices.has(snapshotlessVariantId)).toBe(false);
  });

  it('sets the MMU anchor at initial delivery and never overwrites it later', async () => {
    const subscriptionId = '00000000-0000-4000-8000-000000000091';
    const orderItemId = '00000000-0000-4000-8000-000000000092';
    const initialDelivery = new Date('2026-03-10T12:00:00.000Z');
    await databasePool.query(
      `INSERT INTO order_items
        (id, order_id, product_variant_id, quantity, unit_price_cents, total_price_cents, currency, term_months, metadata)
       VALUES ($1, '00000000-0000-4000-8000-000000000020', '00000000-0000-4000-8000-000000000011', 1, 100, 100, 'USD', 6, '{}'::jsonb)`,
      [orderItemId]
    );
    await databasePool.query(
      `INSERT INTO subscriptions
        (id, user_id, order_id, order_item_id, product_variant_id, service_type, service_plan, start_date, end_date, renewal_date, term_start_at, term_months, status, credentials_encrypted)
       VALUES ($1, '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000020', $2, '00000000-0000-4000-8000-000000000011', 'schema_smoke', 'standard', '2026-03-01', '2026-09-01', '2026-09-01', NULL, 6, 'pending', 'credential-secret')`,
      [subscriptionId, orderItemId]
    );

    const activated =
      await subscriptionService.activateSubscriptionForOrderItem(
        '00000000-0000-4000-8000-000000000020',
        subscriptionId,
        '00000000-0000-4000-8000-000000000001',
        { deliveredAt: initialDelivery }
      );
    expect(activated.updated).toBe(true);
    await subscriptionService.updateSubscriptionForAdmin(subscriptionId, {
      term_start_at: new Date('2026-04-10T12:00:00.000Z'),
    });

    const subscription = await databasePool.query(
      'SELECT term_start_at, delivered_at FROM subscriptions WHERE id = $1',
      [subscriptionId]
    );
    expect(new Date(subscription.rows[0].term_start_at).toISOString()).toBe(
      initialDelivery.toISOString()
    );
    expect(new Date(subscription.rows[0].delivered_at).toISOString()).toBe(
      initialDelivery.toISOString()
    );
  });

  it('records matching user-agent evidence for each successful customer credential reveal', async () => {
    const withUserAgent = {
      orderId: '00000000-0000-4000-8000-000000000093',
      orderItemId: '00000000-0000-4000-8000-000000000094',
      subscriptionId: '00000000-0000-4000-8000-000000000095',
    };
    const withoutUserAgent = {
      orderId: '00000000-0000-4000-8000-000000000096',
      orderItemId: '00000000-0000-4000-8000-000000000097',
      subscriptionId: '00000000-0000-4000-8000-000000000098',
    };

    const seedRevealFixture = async (fixture: typeof withUserAgent) => {
      await databasePool.query(
        `INSERT INTO orders
          (id, user_id, status, currency, subtotal_cents, discount_cents, total_cents, payment_provider, payment_reference, contact_email)
         VALUES ($1, '00000000-0000-4000-8000-000000000001', 'delivered', 'USD', 100, 0, 100, 'manual', $2, 'admin@schema-smoke.test')`,
        [fixture.orderId, `reveal-${fixture.subscriptionId}`]
      );
      await databasePool.query(
        `INSERT INTO order_items
          (id, order_id, product_variant_id, quantity, unit_price_cents, total_price_cents, currency, term_months, metadata)
         VALUES ($1, $2, '00000000-0000-4000-8000-000000000011', 1, 100, 100, 'USD', 1, '{}'::jsonb)`,
        [fixture.orderItemId, fixture.orderId]
      );
      await databasePool.query(
        `INSERT INTO subscriptions
          (id, user_id, order_id, order_item_id, product_variant_id, service_type, service_plan, start_date, end_date, renewal_date, term_start_at, term_months, status, credentials_encrypted, delivered_at)
         VALUES ($1, '00000000-0000-4000-8000-000000000001', $2, $3, '00000000-0000-4000-8000-000000000011', 'schema_smoke', 'reveal', NOW(), NOW() + INTERVAL '1 month', NOW() + INTERVAL '1 month', NOW(), 1, 'active', 'schema-smoke credentials', NOW())`,
        [fixture.subscriptionId, fixture.orderId, fixture.orderItemId]
      );
    };

    await seedRevealFixture(withUserAgent);
    await seedRevealFixture(withoutUserAgent);

    const withAgentResponse = await app.inject({
      method: 'POST',
      url: `/orders/${withUserAgent.orderId}/items/${withUserAgent.subscriptionId}/reveal`,
      headers: { 'user-agent': 'schema-smoke-reveal-agent/1.0' },
    });
    expect(withAgentResponse.statusCode).toBe(200);

    const withoutAgentResponse = await app.inject({
      method: 'POST',
      url: `/orders/${withoutUserAgent.orderId}/items/${withoutUserAgent.subscriptionId}/reveal`,
      headers: { 'x-schema-smoke-strip-user-agent': 'true' },
    });
    expect(withoutAgentResponse.statusCode).toBe(200);

    const auditRows = await databasePool.query(
      `SELECT subscription_id, success, ip_address, user_agent, created_at
       FROM credential_reveal_audit_logs
       WHERE subscription_id = ANY($1::uuid[])
       ORDER BY subscription_id`,
      [[withUserAgent.subscriptionId, withoutUserAgent.subscriptionId]]
    );
    expect(auditRows.rows).toHaveLength(2);
    expect(auditRows.rows[0]).toMatchObject({
      subscription_id: withUserAgent.subscriptionId,
      success: true,
      user_agent: 'schema-smoke-reveal-agent/1.0',
    });
    expect(auditRows.rows[0].ip_address).toBeTruthy();
    expect(auditRows.rows[0].created_at).toBeTruthy();
    expect(auditRows.rows[1]).toMatchObject({
      subscription_id: withoutUserAgent.subscriptionId,
      success: true,
      user_agent: null,
    });

    const evidenceRows = await databasePool.query(
      `SELECT order_id, event_type, ip_address, created_at,
              license_account_access_evidence
       FROM order_compliance_evidence_logs
       WHERE order_id = ANY($1::uuid[])
         AND event_type = 'credential_reveal'
       ORDER BY order_id`,
      [[withUserAgent.orderId, withoutUserAgent.orderId]]
    );
    expect(evidenceRows.rows).toHaveLength(2);
    expect(evidenceRows.rows[0]).toMatchObject({
      order_id: withUserAgent.orderId,
      event_type: 'credential_reveal',
    });
    expect(evidenceRows.rows[0].ip_address).toBeTruthy();
    expect(evidenceRows.rows[0].created_at).toBeTruthy();
    expect(
      evidenceRows.rows[0].license_account_access_evidence.user_agent
    ).toBe(auditRows.rows[0].user_agent);
    expect(
      evidenceRows.rows[1].license_account_access_evidence.user_agent
    ).toBe(auditRows.rows[1].user_agent);
  });

  it('keeps the MMU term anchor immutable across every real sweep and renewal confirmation', async () => {
    const seedMmu = async (params: {
      subscriptionId: string;
      orderItemId: string;
      termMonths: number;
      intervalMonths: number;
      termStart: Date;
    }) => {
      await databasePool.query(
        `INSERT INTO order_items
          (id, order_id, product_variant_id, quantity, unit_price_cents, total_price_cents, currency, term_months, metadata)
         VALUES ($1, '00000000-0000-4000-8000-000000000020', '00000000-0000-4000-8000-000000000011', 1, 100, 100, 'USD', $2, '{}'::jsonb)`,
        [params.orderItemId, params.termMonths]
      );
      await databasePool.query(
        `INSERT INTO subscriptions
          (id, user_id, order_id, order_item_id, product_variant_id, service_type, service_plan, start_date, end_date, renewal_date, term_start_at, term_months, status, credentials_encrypted, delivered_at)
         VALUES ($1, '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000020', $2, '00000000-0000-4000-8000-000000000011', 'schema_smoke', 'standard', $3::timestamp, $3::timestamp + ($4::int || ' months')::interval, $3::timestamp + ($4::int || ' months')::interval, $3::timestamp, $4::int, 'active', '{"version":1,"ciphertext":"not-a-secret"}', $3::timestamp)`,
        [
          params.subscriptionId,
          params.orderItemId,
          params.termStart,
          params.termMonths,
        ]
      );
      await databasePool.query(
        `INSERT INTO subscription_upgrade_selections
          (subscription_id, order_id, selection_type, submitted_at, upgrade_options_snapshot)
         VALUES ($1, '00000000-0000-4000-8000-000000000020', 'upgrade_own_account', NOW(), $2::jsonb)`,
        [
          params.subscriptionId,
          JSON.stringify({
            manual_monthly_upgrade: true,
            manual_monthly_upgrade_interval_months: params.intervalMonths,
          }),
        ]
      );
    };

    const completeCycle = async (
      subscriptionId: string,
      expectedCycle: number,
      expectedLabel: string,
      referenceNow: Date
    ) => {
      await runManualMonthlyUpgradeSweep(referenceNow);
      const taskResult = await databasePool.query(
        `SELECT id FROM admin_tasks
         WHERE subscription_id = $1
           AND task_type = 'manual_monthly_upgrade'
           AND mmu_cycle_index = $2
         ORDER BY created_at DESC
         LIMIT 1`,
        [subscriptionId, expectedCycle]
      );
      expect(taskResult.rows).toHaveLength(1);
      const taskId = taskResult.rows[0].id as string;
      const detail = await app.inject({
        method: 'GET',
        url: `/admin/fulfillment/mmu-tasks/${taskId}`,
      });
      expect(detail.statusCode).toBe(200);
      expect(detail.json().data.task.month_label).toBe(expectedLabel);

      const confirmation = await app.inject({
        method: 'POST',
        url: `/admin/tasks/${taskId}/renewal/confirm`,
        payload: { note: 'migration-backed MMU regression' },
      });
      expect(confirmation.statusCode).toBe(200);
    };

    const addMonthsMinusOneDay = (anchor: Date, months: number) => {
      const value = new Date(anchor);
      value.setUTCMonth(value.getUTCMonth() + months);
      value.setUTCDate(value.getUTCDate() - 1);
      return value;
    };

    const sixMonthId = '00000000-0000-4000-8000-000000000061';
    const twelveMonthId = '00000000-0000-4000-8000-000000000071';
    const sixMonthAnchor = new Date('2026-01-15T00:00:00.000Z');
    const twelveMonthAnchor = new Date('2026-01-20T00:00:00.000Z');
    await seedMmu({
      subscriptionId: sixMonthId,
      orderItemId: '00000000-0000-4000-8000-000000000062',
      termMonths: 6,
      intervalMonths: 1,
      termStart: sixMonthAnchor,
    });
    await seedMmu({
      subscriptionId: twelveMonthId,
      orderItemId: '00000000-0000-4000-8000-000000000072',
      termMonths: 12,
      intervalMonths: 2,
      termStart: twelveMonthAnchor,
    });

    for (let cycle = 1; cycle <= 5; cycle += 1) {
      const referenceNow = addMonthsMinusOneDay(sixMonthAnchor, cycle);
      await completeCycle(
        sixMonthId,
        cycle,
        `Month ${cycle + 1} of 6`,
        referenceNow
      );
    }
    for (const cycle of [2, 4, 6, 8, 10]) {
      const referenceNow = addMonthsMinusOneDay(twelveMonthAnchor, cycle);
      await completeCycle(
        twelveMonthId,
        cycle,
        `Months ${cycle + 1}-${cycle + 2} of 12`,
        referenceNow
      );
    }
    await runManualMonthlyUpgradeSweep(addMonthsMinusOneDay(sixMonthAnchor, 7));
    await runManualMonthlyUpgradeSweep(
      addMonthsMinusOneDay(twelveMonthAnchor, 13)
    );

    for (const [
      subscriptionId,
      anchor,
      completedCycles,
      intervalMonths,
      purchasedMonths,
    ] of [
      [sixMonthId, sixMonthAnchor, 5, 1, 6],
      [twelveMonthId, twelveMonthAnchor, 5, 2, 12],
    ] as const) {
      const subscription = await databasePool.query(
        'SELECT term_start_at FROM subscriptions WHERE id = $1',
        [subscriptionId]
      );
      expect(new Date(subscription.rows[0].term_start_at).toISOString()).toBe(
        anchor.toISOString()
      );
      const tasks = await databasePool.query(
        `SELECT COUNT(*)::int AS count
         FROM admin_tasks
         WHERE subscription_id = $1
           AND task_type = 'manual_monthly_upgrade'
           AND completed_at IS NOT NULL`,
        [subscriptionId]
      );
      expect(tasks.rows[0].count).toBe(completedCycles);
      expect((1 + Number(tasks.rows[0].count)) * intervalMonths).toBe(
        purchasedMonths
      );
    }
  });
});
