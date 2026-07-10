/* global process, console, URL, performance, fetch */
/* eslint-disable no-console, no-inner-declarations, svelte/no-inner-declarations */

import { chromium } from 'playwright-core';
import { Client } from 'pg';
import { createHmac } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env', quiet: true });

const baseUrl = process.env.SMOKE_ADMIN_NEXT_URL || 'http://127.0.0.1:3000';
const apiUrl = process.env.SMOKE_ADMIN_NEXT_API_URL || 'http://127.0.0.1:3001/api/v1';
const adminToken = process.env.SMOKE_ADMIN_TOKEN;
const chromePath = process.env.SMOKE_CHROME_PATH || '/usr/bin/google-chrome';

if (!adminToken) {
  throw new Error('SMOKE_ADMIN_TOKEN must contain a local admin JWT.');
}

const runId = `SMOKE-${Date.now()}`;
const productName = `${runId} Product`;
const productSlug = `${runId.toLowerCase()}-product`;
const variantName = `${runId} Variant`;
const runCommand = promisify(execFile);

const unwrap = payload => payload?.data ?? payload;

async function apiRequest(path, { method = 'GET', body, rawBody, headers = {}, token = adminToken } = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      ...(body || rawBody ? { 'content-type': 'application/json' } : {}),
      ...(token ? { cookie: `auth_token=${token}; csrf_token=smoke-csrf-token` } : {}),
      ...(token ? { 'x-csrf-token': 'smoke-csrf-token' } : {}),
      ...headers,
    },
    ...(rawBody ? { body: rawBody } : body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${method} ${path} returned ${response.status}: ${payload.message || payload.error || 'unknown error'}`);
  }
  return unwrap(payload);
}

async function registerSmokeCustomer(email) {
  const response = await fetch(`${apiUrl}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email,
      password: 'SmokePassword!123',
      firstName: 'Smoke',
      lastName: 'Customer',
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Customer registration returned ${response.status}`);
  const cookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie') || ''];
  const token = cookies.map(value => /(?:^|;)\s*auth_token=([^;]+)/.exec(value)?.[1]).find(Boolean);
  const customerToken = token || jwt.sign(
    { userId: payload.user?.id, email: payload.user?.email, role: payload.user?.role || 'user' },
    process.env.JWT_SECRET,
    {
      algorithm: process.env.JWT_ALGORITHM || 'HS256',
      expiresIn: '30m',
      issuer: 'subscription-platform',
      audience: 'subscription-platform-users',
    }
  );
  if (!payload.user?.id) throw new Error(`Customer registration returned no user: ${JSON.stringify(payload)}`);
  return { token: customerToken, user: payload.user };
}

async function createFixtureCatalog({ name, options, months = 1 }) {
  const product = await apiRequest('/admin/products', {
    method: 'POST',
    body: {
      name,
      slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Date.now()}`,
      service_type: 'smoke_fixture',
      default_currency: 'USD',
      status: 'inactive',
      metadata: { upgrade_options: options },
    },
  });
  const variant = await apiRequest('/admin/product-variants', {
    method: 'POST',
    body: {
      product_id: product.id,
      name: `${name} Variant`,
      variant_code: `${runId}-${months}-${Math.random().toString(36).slice(2, 8)}`,
      service_plan: 'smoke',
      is_active: true,
    },
  });
  await apiRequest('/admin/product-variant-terms', {
    method: 'POST',
    body: { product_variant_id: variant.id, months, discount_percent: 0, is_active: true },
  });
  await apiRequest('/admin/price-history/current', {
    method: 'POST',
    body: { product_variant_id: variant.id, price_cents: 1234, currency: 'USD', end_previous: true },
  });
  await apiRequest(`/admin/products/${product.id}`, { method: 'PATCH', body: { status: 'active' } });
  return { product, variant, months };
}

async function createFixtureOrder({ email, token, variantId, months, manualMonthlyAcknowledged = false }) {
  const identity = await apiRequest('/checkout/identity', {
    method: 'POST',
    token,
    body: { email },
  });
  const draft = await apiRequest('/checkout/draft', {
    method: 'POST',
    token,
    body: {
      guest_identity_id: identity.guest_identity_id,
      contact_email: email,
      currency: 'USD',
      items: [{
        variant_id: variantId,
        term_months: months,
        auto_renew: false,
        ...(manualMonthlyAcknowledged ? { manual_monthly_acknowledged: true } : {}),
      }],
    },
  });
  return draft.order_id;
}

async function createPendingFixtureOrder({ email, variantId, months }) {
  const customer = await registerSmokeCustomer(email);
  const response = await fetch(`${apiUrl}/payments/checkout`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `auth_token=${customer.token}; csrf_token=smoke-csrf-token`,
      'x-csrf-token': 'smoke-csrf-token',
    },
    body: JSON.stringify({
      variant_id: variantId,
      duration_months: months,
      payment_method: 'card',
      auto_renew: false,
      currency: 'USD',
    }),
  });
  const payload = unwrap(await response.json().catch(() => ({})));
  const orderId = payload?.order_id;
  if (orderId) return orderId;

  // A locally unavailable payment provider can return an error after the
  // supported checkout route has persisted its pending order. Read it back
  // rather than writing around that real checkout behavior.
  const pending = await readOne(
    `SELECT o.id
       FROM orders o
       JOIN users u ON u.id = o.user_id
      WHERE u.email = $1 AND o.status = 'pending_payment'
      ORDER BY o.created_at DESC
      LIMIT 1`,
    [email]
  );
  if (pending?.id) return pending.id;
  throw new Error(`Pending fixture checkout returned ${response.status} without creating a pending order.`);
}

async function completeFixtureStripeOrder(orderId) {
  const orderFile = await apiRequest(`/admin/next/orders/${orderId}`);
  const amountTotal = orderFile.order?.total_cents || orderFile.total_cents || 1234;
  const eventId = `evt_${runId}_${orderId.replace(/-/g, '')}`;
  const payload = JSON.stringify({
    id: eventId,
    object: 'event',
    type: 'checkout.session.completed',
    data: { object: { id: `cs_${eventId}`, object: 'checkout.session', payment_intent: `pi_${eventId}`, amount_total: amountTotal, currency: 'usd', metadata: { order_id: orderId } } },
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET)
    .update(`${timestamp}.${payload}`)
    .digest('hex');
  await apiRequest('/payments/stripe/webhook', {
    method: 'POST',
    token: null,
    rawBody: payload,
    headers: { 'stripe-signature': `t=${timestamp},v1=${signature}` },
  });
}

async function readOne(query, values) {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_DATABASE,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });
  await client.connect();
  try {
    const result = await client.query(query, values);
    return result.rows[0] || null;
  } finally {
    await client.end();
  }
}

async function cleanupSmokeFixtures() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_DATABASE,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(`CREATE TEMP TABLE smoke_products ON COMMIT DROP AS
      SELECT id FROM products WHERE name LIKE 'SMOKE-%'`);
    await client.query(`CREATE TEMP TABLE smoke_orders ON COMMIT DROP AS
      SELECT DISTINCT o.id, o.user_id
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        JOIN product_variants pv ON pv.id = oi.product_variant_id
        JOIN smoke_products sp ON sp.id = pv.product_id`);
    await client.query(`CREATE TEMP TABLE smoke_subscriptions ON COMMIT DROP AS
      SELECT id FROM subscriptions WHERE order_id IN (SELECT id FROM smoke_orders)`);
    await client.query(`CREATE TEMP TABLE smoke_items ON COMMIT DROP AS
      SELECT id FROM order_items WHERE order_id IN (SELECT id FROM smoke_orders)`);
    await client.query(`CREATE TEMP TABLE smoke_tasks ON COMMIT DROP AS
      SELECT id FROM admin_tasks
       WHERE order_id IN (SELECT id FROM smoke_orders)
          OR subscription_id IN (SELECT id FROM smoke_subscriptions)`);
    await client.query(`CREATE TEMP TABLE smoke_payments ON COMMIT DROP AS
      SELECT id FROM payments WHERE order_id IN (SELECT id FROM smoke_orders)`);
    await client.query(`CREATE TEMP TABLE smoke_snapshot_runs ON COMMIT DROP AS
      SELECT DISTINCT (ph.metadata->>'snapshot_id')::uuid AS snapshot_id
        FROM price_history ph
        JOIN product_variants pv ON pv.id = ph.product_variant_id
        JOIN smoke_products sp ON sp.id = pv.product_id
       WHERE ph.metadata ? 'snapshot_id'`);
    const counts = (await client.query(`SELECT
      (SELECT count(*) FROM smoke_products)::int AS products,
      (SELECT count(*) FROM smoke_orders)::int AS orders,
      (SELECT count(*) FROM smoke_subscriptions)::int AS subscriptions,
      (SELECT count(*) FROM smoke_tasks)::int AS tasks,
      (SELECT count(*) FROM smoke_payments)::int AS payments,
      (SELECT count(*) FROM smoke_snapshot_runs)::int AS pricing_runs`)).rows[0];
    await client.query(`DELETE FROM notifications
      WHERE title LIKE 'SMOKE-%' OR user_id IN (SELECT user_id FROM smoke_orders WHERE user_id IS NOT NULL)`);
    await client.query(`DELETE FROM admin_audit_logs
      WHERE entity_id IN (SELECT id FROM smoke_products)
         OR entity_id IN (SELECT id FROM smoke_orders)
         OR entity_id IN (SELECT id FROM smoke_subscriptions)
         OR entity_id IN (SELECT id FROM smoke_items)
         OR entity_id IN (SELECT id FROM smoke_tasks)
         OR entity_id IN (SELECT id FROM smoke_payments)`);
    await client.query(`DELETE FROM credential_reveal_audit_logs
      WHERE subscription_id IN (SELECT id FROM smoke_subscriptions)`);
    await client.query(`DELETE FROM guest_identities
      WHERE user_id IN (SELECT user_id FROM smoke_orders WHERE user_id IS NOT NULL)`);
    await client.query(`DELETE FROM coupon_redemptions
      WHERE order_id IN (SELECT id FROM smoke_orders)`);
    await client.query(`DELETE FROM payment_events
      WHERE order_id IN (SELECT id FROM smoke_orders)
         OR payment_id IN (SELECT id FROM smoke_payments)`);
    await client.query(`DELETE FROM users
      WHERE id IN (SELECT user_id FROM smoke_orders WHERE user_id IS NOT NULL)`);
    await client.query(`DELETE FROM pricing_publish_runs
      WHERE snapshot_id IN (SELECT snapshot_id FROM smoke_snapshot_runs)`);
    await client.query(`DELETE FROM coupons WHERE code LIKE 'SMOKE-%'`);
    await client.query(`DELETE FROM products WHERE id IN (SELECT id FROM smoke_products)`);
    await client.query('COMMIT');
    console.log(`SMOKE cleanup: ${JSON.stringify(counts)}`);
    return counts;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

async function runMmuSweepAt(reference) {
  await runCommand('node', ['scripts/admin-next-smoke-mmu-sweep.cjs', reference.toISOString()], {
    cwd: process.cwd(),
    env: process.env,
  });
}

await cleanupSmokeFixtures();

const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  const context = await browser.newContext();
  await context.addCookies([
    { name: 'auth_token', value: adminToken, url: `${baseUrl}/` },
    { name: 'csrf_token', value: 'smoke-csrf-token', url: `${baseUrl}/` },
  ]);
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);

  async function dismissConsent(targetPage) {
    await targetPage
      .getByRole('button', { name: 'Reject non-essential' })
      .click({ timeout: 3_000 })
      .catch(() => {});
  }

  async function submitAndAssert({ targetPage = page, requestPath, requestMethod = 'POST', click, visible }) {
    const response = targetPage.waitForResponse(response =>
      response.request().method() === requestMethod &&
      new URL(response.url()).pathname === requestPath
    );
    await click();
    const surfacedError = targetPage.locator('.error-banner').waitFor().then(async () => {
      throw new Error(`Visible admin error: ${await targetPage.locator('.error-banner').innerText()}`);
    });
    const matched = await Promise.race([response, surfacedError]);
    if (!matched.ok()) {
      throw new Error(`${requestPath} returned ${matched.status()}`);
    }
    await visible();
  }

  async function assertSucceededCurrentPriceSnapshot(variantId) {
    const client = new Client({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_DATABASE,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });
    await client.connect();
    try {
      const result = await client.query(
        `SELECT ph.metadata->>'snapshot_id' AS snapshot_id, ppr.status
           FROM price_history ph
           JOIN pricing_publish_runs ppr
             ON ppr.snapshot_id::text = ph.metadata->>'snapshot_id'
          WHERE ph.product_variant_id = $1
            AND ph.ends_at IS NULL
          ORDER BY ph.starts_at DESC
          LIMIT 1`,
        [variantId]
      );
      const row = result.rows[0];
      if (!row?.snapshot_id || row.status !== 'succeeded') {
        throw new Error('Current price is missing a succeeded pricing snapshot.');
      }
    } finally {
      await client.end();
    }
  }

  const productsNavigationStartedAt = performance.now();
  await page.goto(`${baseUrl}/admin-next/products`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  const newProductButton = page.getByRole('button', { name: '+ New product' });
  await newProductButton.waitFor({ state: 'visible' });
  if (!(await newProductButton.isEnabled())) {
    throw new Error('New product control did not become enabled after hydration.');
  }
  await dismissConsent(page);
  console.log(
    `products-page-interactive-ms=${Math.round(performance.now() - productsNavigationStartedAt)}`
  );
  await newProductButton.click();
  await page.getByLabel('Name').fill(productName);
  await page.getByLabel('Slug').fill(productSlug);
  await page.getByLabel('Service type').fill('smoke');
  await submitAndAssert({
    requestPath: '/api/v1/admin/products',
    click: () => page.getByRole('button', { name: 'Create inactive product' }).click(),
    visible: () => page.getByText(productName, { exact: true }).waitFor(),
  });

  await page.getByText(productName, { exact: true }).click();
  await page.getByRole('button', { name: 'Variants & Terms' }).click();
  await page.getByPlaceholder('Name').fill(variantName);
  await page.getByPlaceholder('Code').fill(`${runId}-variant`);
  await submitAndAssert({
    requestPath: '/api/v1/admin/product-variants',
    click: () => page.getByRole('button', { name: 'Add variant' }).click(),
    visible: () => page.locator('.list b', { hasText: variantName }).waitFor(),
  });

  const productId = page.url().split('/').pop();
  const termsForm = page.locator('form').filter({
    has: page.getByRole('button', { name: 'Add term' }),
  });
  await termsForm.getByLabel('Variant for term').selectOption({ label: variantName });
  await termsForm.getByLabel('Term months').fill('6');
  await submitAndAssert({
    requestPath: '/api/v1/admin/product-variant-terms',
    click: () => termsForm.getByRole('button', { name: 'Add term' }).click(),
    visible: () => page.locator('.list p', { hasText: '6 months' }).waitFor(),
  });

  await page.getByRole('button', { name: 'Pricing' }).click();
  const priceForm = page.locator('form').filter({
    has: page.getByRole('button', { name: 'Set current price' }),
  });
  await priceForm.getByLabel('Variant for price').selectOption({ label: variantName });
  await priceForm.getByLabel('Price cents').fill('1234');
  await submitAndAssert({
    requestPath: '/api/v1/admin/price-history/current',
    click: () => priceForm.getByRole('button', { name: 'Set current price' }).click(),
    visible: () => page.locator('.list p', { hasText: '$12.34' }).waitFor(),
  });
  await assertSucceededCurrentPriceSnapshot(
    await priceForm.getByLabel('Variant for price').inputValue()
  );

  await page.getByRole('button', { name: 'Fulfillment settings' }).click();
  await page.getByText('Manual monthly upgrade (MMU)', { exact: true }).click();
  await page.getByLabel('Interval (months)').fill('1');
  await page.getByText('Activation-link handshake', { exact: true }).click();
  await page.getByLabel('Default instruction template').fill('SMOKE handshake instructions');
  await page.getByText('Strict rules', { exact: true }).click();
  await page.getByLabel('Rules text').fill('SMOKE strict rules');
  await submitAndAssert({
    requestPath: `/api/v1/admin/products/${productId}`,
    requestMethod: 'PATCH',
    click: () => page.getByRole('button', { name: 'Save fulfillment settings' }).click(),
    visible: () => page.getByText('Product saved.', { exact: true }).waitFor(),
  });
  if ((await page.getByLabel('Interval (months)').inputValue()) !== '1') {
    throw new Error('MMU interval did not persist after fulfillment save.');
  }
  if ((await page.getByLabel('Default instruction template').inputValue()) !== 'SMOKE handshake instructions') {
    throw new Error('Activation-link handshake template did not persist after fulfillment save.');
  }
  if ((await page.getByLabel('Rules text').inputValue()) !== 'SMOKE strict rules') {
    throw new Error('Strict-rules text did not persist after fulfillment save.');
  }

  await page.getByLabel('Interval (months)').fill('4');
  const rejectedSave = page.waitForResponse(response =>
    response.request().method() === 'PATCH' &&
    new URL(response.url()).pathname === `/api/v1/admin/products/${productId}`
  );
  await page.getByRole('button', { name: 'Save fulfillment settings' }).click();
  if ((await rejectedSave).ok()) throw new Error('MMU divisibility rejection unexpectedly saved.');
  await page.getByText('Term length must be divisible by the MMU interval.', { exact: true }).waitFor();
  await page.getByLabel('Interval (months)').fill('1');

  await page.getByRole('button', { name: 'Basics' }).click();
  await page.getByLabel('Status').selectOption('active');
  await submitAndAssert({
    requestPath: `/api/v1/admin/products/${productId}`,
    requestMethod: 'PATCH',
    click: () => page.getByRole('button', { name: 'Save basics' }).click(),
    visible: () => page.locator('header .status-chip', { hasText: 'Active' }).waitFor(),
  });

  const couponCode = `${runId}-COUPON`;
  await page.goto(`${baseUrl}/admin-next/coupons`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.getByLabel('Code').fill(couponCode);
  await page.getByLabel('Percent off').fill('15');
  await page.getByLabel('Max redemptions').fill('3');
  await submitAndAssert({
    requestPath: '/api/v1/admin/coupons',
    click: () => page.getByRole('button', { name: 'Create coupon' }).click(),
    visible: () => page.locator('.row .mono', { hasText: couponCode }).waitFor(),
  });

  const announcementTitle = `${runId} announcement`;
  page.once('dialog', dialog => dialog.accept());
  await page.goto(`${baseUrl}/admin-next/announcements`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.getByLabel('Title').fill(announcementTitle);
  await page.getByLabel('Message').fill('SMOKE announcement message');
  await submitAndAssert({
    requestPath: '/api/v1/admin/notifications/announcements',
    click: () => page.getByRole('button', { name: 'Publish to all users' }).click(),
    visible: () => page.locator('.row span', { hasText: announcementTitle }).waitFor(),
  });

  const standardFixture = await createFixtureCatalog({
    name: `${runId} Standard fixture`,
    options: { allow_new_account: true, allow_own_account: false },
  });
  const handshakeFixture = await createFixtureCatalog({
    name: `${runId} Handshake fixture`,
    options: {
      allow_new_account: true,
      allow_own_account: false,
      activation_link_handshake: true,
      activation_instructions_template: 'SMOKE fixture activation instructions',
    },
  });
  const strictFixture = await createFixtureCatalog({
    name: `${runId} Strict fixture`,
    options: {
      allow_new_account: true,
      allow_own_account: false,
      strict_rules: true,
      strict_rules_version: 1,
      strict_rules_text: 'SMOKE fixture strict rules',
    },
  });
  const mmuFixture = await createFixtureCatalog({
    name: `${runId} MMU fixture`,
    months: 6,
    options: {
      allow_new_account: true,
      allow_own_account: false,
      manual_monthly_upgrade: true,
      manual_monthly_upgrade_interval_months: 1,
    },
  });

  const fixtureEmail = `${runId.toLowerCase()}-customer@example.test`;
  const pendingOrderId = await createPendingFixtureOrder({
    email: `${runId.toLowerCase()}-pending@example.test`,
    variantId: standardFixture.variant.id,
    months: 1,
  });
  const paidOrderId = await createFixtureOrder({
    email: `${runId.toLowerCase()}-paid@example.test`,
    variantId: standardFixture.variant.id,
    months: 1,
  });
  await completeFixtureStripeOrder(paidOrderId);
  const handshakeOrderId = await createFixtureOrder({
    email: `${runId.toLowerCase()}-handshake@example.test`,
    variantId: handshakeFixture.variant.id,
    months: 1,
  });
  await completeFixtureStripeOrder(handshakeOrderId);
  const strictOrderId = await createFixtureOrder({
    email: fixtureEmail,
    variantId: strictFixture.variant.id,
    months: 1,
  });
  await completeFixtureStripeOrder(strictOrderId);
  const readyOrderId = await createFixtureOrder({
    email: fixtureEmail,
    variantId: handshakeFixture.variant.id,
    months: 1,
  });
  await completeFixtureStripeOrder(readyOrderId);
  const mmuOrderId = await createFixtureOrder({
    email: `${runId.toLowerCase()}-mmu@example.test`,
    variantId: mmuFixture.variant.id,
    months: 6,
    manualMonthlyAcknowledged: true,
  });
  await completeFixtureStripeOrder(mmuOrderId);

  const customerOwner = await readOne(
    `SELECT u.id, u.email
       FROM guest_identities gi
       JOIN users u ON u.id = gi.user_id
      WHERE gi.email = $1`,
    [fixtureEmail]
  );
  if (!customerOwner?.id || !customerOwner?.email) throw new Error('Customer fixture guest owner was not created.');
  const customerToken = jwt.sign(
    { userId: customerOwner.id, email: customerOwner.email, role: 'user' },
    process.env.JWT_SECRET,
    {
      algorithm: process.env.JWT_ALGORITHM || 'HS256',
      expiresIn: '30m',
      issuer: 'subscription-platform',
      audience: 'subscription-platform-users',
    }
  );

  const paidAggregate = await apiRequest(`/admin/fulfillment/orders/${paidOrderId}`);
  const paidSubscriptionId = paidAggregate.items?.[0]?.subscription_id;
  const handshakeAggregate = await apiRequest(`/admin/fulfillment/orders/${handshakeOrderId}`);
  const handshakeSubscriptionId = handshakeAggregate.items?.[0]?.subscription_id;
  const strictAggregate = await apiRequest(`/admin/fulfillment/orders/${strictOrderId}`);
  const strictSubscriptionId = strictAggregate.items?.[0]?.subscription_id;
  const readyAggregate = await apiRequest(`/admin/fulfillment/orders/${readyOrderId}`);
  const readySubscriptionId = readyAggregate.items?.[0]?.subscription_id;
  const mmuAggregate = await apiRequest(`/admin/fulfillment/orders/${mmuOrderId}`);
  const mmuSubscriptionId = mmuAggregate.items?.[0]?.subscription_id;
  if (![paidSubscriptionId, handshakeSubscriptionId, strictSubscriptionId, readySubscriptionId, mmuSubscriptionId].every(Boolean)) {
    throw new Error('Fixture payment did not create the expected subscription.');
  }
  await apiRequest(`/admin/subscriptions/${strictSubscriptionId}/credentials`, {
    method: 'POST', body: { credentials: 'SMOKE strict credentials', reason: 'smoke fixture setup' },
  });
  await apiRequest(`/admin/orders/${strictOrderId}/items/${strictSubscriptionId}/deliver`, {
    method: 'POST', body: { reason: 'smoke fixture setup' },
  });
  await apiRequest(`/admin/orders/${readyOrderId}/items/${readySubscriptionId}/activation-instructions`, {
    method: 'POST', body: { instructions: 'SMOKE ready fixture instructions' },
  });
  await apiRequest(`/admin/subscriptions/${mmuSubscriptionId}/credentials`, {
    method: 'POST', body: { credentials: 'SMOKE mmu credentials', reason: 'smoke fixture setup' },
  });
  await apiRequest(`/admin/orders/${mmuOrderId}/items/${mmuSubscriptionId}/deliver`, {
    method: 'POST', body: { reason: 'smoke fixture setup' },
  });

  const mmuSubscription = await readOne(
    `SELECT id, term_start_at FROM subscriptions WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [mmuOrderId]
  );
  if (!mmuSubscription?.id || !mmuSubscription.term_start_at) throw new Error('MMU fixture subscription is missing its term anchor.');
  const mmuReference = new Date(mmuSubscription.term_start_at);
  mmuReference.setUTCMonth(mmuReference.getUTCMonth() + 1);
  mmuReference.setUTCDate(mmuReference.getUTCDate() - 1);
  await runMmuSweepAt(mmuReference);
  const mmuTask = await readOne(
    `SELECT id FROM admin_tasks WHERE subscription_id = $1 AND task_type = 'manual_monthly_upgrade' AND completed_at IS NULL ORDER BY created_at DESC LIMIT 1`,
    [mmuSubscription.id]
  );
  if (!mmuTask?.id) throw new Error('Explicit-reference MMU sweep did not create a task.');

  await page.goto(`${baseUrl}/admin-next/fulfillment/orders/${paidOrderId}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  const deliverButton = page.getByRole('button', { name: 'Confirm delivery' });
  if (!(await deliverButton.isDisabled())) throw new Error('Delivery is not gated until credentials are saved.');
  await page.getByPlaceholder('Credentials / notes to save on the subscription').fill('SMOKE paid credentials');
  await submitAndAssert({
    requestPath: `/api/v1/admin/subscriptions/${paidSubscriptionId}/credentials`,
    click: () => page.getByRole('button', { name: 'Save' }).click(),
    visible: () => page.getByText('Credentials saved ✓', { exact: true }).waitFor(),
  });
  await submitAndAssert({
    requestPath: `/api/v1/admin/orders/${paidOrderId}/items/${paidSubscriptionId}/deliver`,
    click: () => deliverButton.click(),
    visible: async () => {
      await page.getByText('Item delivered.', { exact: true }).waitFor();
      await page.getByText(/^Delivered /).waitFor();
    },
  });

  await page.goto(`${baseUrl}/admin-next/fulfillment/orders/${handshakeOrderId}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.locator('textarea').fill('SMOKE browser activation instructions');
  await submitAndAssert({
    requestPath: `/api/v1/admin/orders/${handshakeOrderId}/items/${handshakeSubscriptionId}/activation-instructions`,
    click: () => page.getByRole('button', { name: 'Deliver instructions' }).click(),
    visible: () => page.getByText('Awaiting customer.', { exact: false }).waitFor(),
  });

  await page.goto(`${baseUrl}/admin-next/fulfillment/mmu/${mmuTask.id}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await submitAndAssert({
    requestPath: `/api/v1/admin/tasks/${mmuTask.id}/renewal/confirm`,
    click: () => page.getByRole('button', { name: 'Mark renewal completed' }).click(),
    visible: () => page.getByText('marked renewed.', { exact: false }).waitFor(),
  });
  const nextMmuReference = new Date(mmuReference);
  nextMmuReference.setUTCMonth(nextMmuReference.getUTCMonth() + 1);
  await runMmuSweepAt(nextMmuReference);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.locator('.timeline').getByText('Month 3', { exact: true }).waitFor();

  const customerContext = await browser.newContext();
  await customerContext.addCookies([
    { name: 'auth_token', value: customerToken, url: `${baseUrl}/` },
    { name: 'csrf_token', value: 'smoke-csrf-token', url: `${baseUrl}/` },
  ]);
  const customerPage = await customerContext.newPage();
  customerPage.setDefaultTimeout(15_000);
  await customerPage.goto(`${baseUrl}/dashboard/orders`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await dismissConsent(customerPage);
  const strictCard = customerPage.getByText(/Strict Fixture Variant/i).locator('xpath=ancestor::div[contains(@class, "rounded-lg")][1]');
  await strictCard.getByRole('button', { name: 'Reveal' }).click();
  const rulesDialog = customerPage.getByRole('heading', { name: 'Rules acknowledgement' }).locator('xpath=..');
  const acceptRules = rulesDialog.getByRole('button', { name: 'Accept' });
  if (!(await acceptRules.isDisabled())) throw new Error('Strict-rules acceptance is not gated by its checkbox.');
  await rulesDialog.getByRole('checkbox').check();
  const acceptResponse = customerPage.waitForResponse(response => new URL(response.url()).pathname === `/api/v1/orders/${strictOrderId}/items/${strictSubscriptionId}/accept-rules`);
  const revealResponse = customerPage.waitForResponse(response => new URL(response.url()).pathname === `/api/v1/orders/${strictOrderId}/items/${strictSubscriptionId}/reveal`);
  await acceptRules.click();
  if (!(await acceptResponse).ok() || !(await revealResponse).ok()) throw new Error('Strict-rules acceptance or follow-on reveal failed.');
  await customerPage.getByText('SMOKE strict credentials', { exact: true }).waitFor();

  const readyCard = customerPage.getByText(/Handshake Fixture Variant/i).locator('xpath=ancestor::div[contains(@class, "rounded-lg")][1]');
  const readyButton = readyCard.getByRole('button', { name: "I'm ready to activate" });
  if (!(await readyButton.isDisabled())) throw new Error('Activation readiness is not gated by its checkbox.');
  await readyCard.getByRole('checkbox').check();
  await submitAndAssert({
    targetPage: customerPage,
    requestPath: `/api/v1/orders/${readyOrderId}/items/${readySubscriptionId}/activation-ready`,
    click: () => readyButton.click(),
    visible: () => readyCard.getByText('Activation readiness sent.', { exact: true }).waitFor(),
  });
  await customerContext.close();

  await page.goto(`${baseUrl}/admin-next/orders/${pendingOrderId}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await dismissConsent(page);
  const markPaidButton = page.getByRole('button', { name: 'Mark as paid manually' });
  if (!(await markPaidButton.isDisabled())) throw new Error('Mark-paid submit is not gated by its verification note.');
  await page.getByLabel('Verification note').fill('SMOKE provider verification');
  page.once('dialog', dialog => dialog.accept());
  await submitAndAssert({
    requestPath: `/api/v1/admin/orders/${pendingOrderId}/mark-paid`,
    click: () => markPaidButton.click(),
    visible: () => page.getByText('Order marked paid. Fulfillment work is now available in the queue.', { exact: true }).waitFor(),
  });
  await page.getByRole('link', { name: 'Open in Fulfillment queue →' }).waitFor();

  console.log(`PASS admin-next smoke: ${productName} -> ${variantName} -> catalog/coupon/announcement`);
} finally {
  await browser.close();
  await cleanupSmokeFixtures();
}
