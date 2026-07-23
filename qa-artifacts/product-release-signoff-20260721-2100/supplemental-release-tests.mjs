import { chromium } from '../../frontend/node_modules/playwright-core/index.mjs';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { appendFile, writeFile, readFile } from 'node:fs/promises';

const { Client } = pg;
const artifactDir = 'qa-artifacts/product-release-signoff-20260721-2100/r5';
const apiUrl = 'http://127.0.0.1:3001/api/v1';
const baseUrl = 'http://127.0.0.1:3000';
const database = 'ss_product_release_qa_20260721_2100_r5';
const jwtSecret = 'qa-release-signoff-jwt-secret-20260721-minimum-32-characters';
const adminId = '10000000-0000-4000-8000-000000000001';
const otherCustomerId = '10000000-0000-4000-8000-000000000003';
const productOne = '8a759cf1-7db1-4dba-8595-848508dce77b';
const productTwelve = 'f06881ad-156c-42c6-a068-7fdb537b565c';
const browserOrder = '8c09bec4-cf1f-4529-9293-d8181cb8547d';
const browserSubscription = '9ba16fa0-7c98-4498-adbc-b296b435af46';
const results = [];
let sequence = 0;

const dbConfig = { host: 'localhost', port: 5432, database, user: process.env.DB_USER, password: process.env.DB_PASSWORD };
const db = async (text, values = []) => {
  const client = new Client(dbConfig);
  await client.connect();
  try { return await client.query(text, values); } finally { await client.end(); }
};
const sign = (userId, email, role = 'user') => jwt.sign(
  { userId, email, role }, jwtSecret,
  { algorithm: 'HS256', expiresIn: '2h', issuer: 'subscription-platform', audience: 'subscription-platform-users' }
);
const adminToken = sign(adminId, 'qa-release-admin@example.test', 'admin');
const otherToken = sign(otherCustomerId, 'qa-release-other@example.test');
const request = async (path, { method = 'GET', token, body, headers = {}, cookie } = {}) => {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload, data: payload?.data ?? payload };
};
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const run = async (id, area, steps, expected, fn) => {
  const started = Date.now();
  try {
    const evidence = await fn();
    const row = { sequence: ++sequence, timestamp: new Date().toISOString(), id, area, steps, expected, actual: evidence.actual, status: 'PASS', duration_ms: Date.now() - started, evidence };
    results.push(row); await appendFile(`${artifactDir}/supplemental-matrix.jsonl`, `${JSON.stringify(row)}\n`);
  } catch (error) {
    const row = { sequence: ++sequence, timestamp: new Date().toISOString(), id, area, steps, expected, actual: error instanceof Error ? error.message : String(error), status: 'FAIL', duration_ms: Date.now() - started, evidence: {} };
    results.push(row); await appendFile(`${artifactDir}/supplemental-matrix.jsonl`, `${JSON.stringify(row)}\n`);
  }
};
const legalConsent = key => ({ immediate_fulfillment_consent: true, terms_policy_consent: true, consent_timestamp: new Date().toISOString(), checkout_session_key_snapshot: key, consent_source: 'qa_release_supplement' });
const createPaidGuestOrder = async ({ email, productId, selectionType, accountIdentifier, credentials, acknowledged = true }) => {
  const identity = await request('/checkout/identity', { method: 'POST', body: { email } });
  assert(identity.response.status === 200, `identity ${identity.response.status}: ${JSON.stringify(identity.payload)}`);
  const item = { product_id: productId, selection_type: selectionType, manual_monthly_acknowledged: acknowledged };
  if (accountIdentifier !== undefined) item.account_identifier = accountIdentifier;
  if (credentials !== undefined) item.credentials = credentials;
  const draft = await request('/checkout/draft', { method: 'POST', body: { guest_identity_id: identity.data.guest_identity_id, contact_email: email, currency: 'USD', items: [item] } });
  assert(draft.response.status === 200, `draft ${draft.response.status}: ${JSON.stringify(draft.payload)}`);
  const complete = await request('/checkout/qa/complete', { method: 'POST', body: { checkout_session_key: draft.data.checkout_session_key, legal_consent: legalConsent(draft.data.checkout_session_key) } });
  assert(complete.response.status === 200, `complete ${complete.response.status}: ${JSON.stringify(complete.payload)}`);
  const record = await db(`SELECT o.id order_id,o.user_id,s.id subscription_id,s.product_id,s.product_variant_id,s.term_months,s.duration_months_snapshot,s.fulfillment_config_snapshot,sel.selection_type,sel.upgrade_options_snapshot
    FROM orders o JOIN subscriptions s ON s.order_id=o.id LEFT JOIN subscription_upgrade_selections sel ON sel.subscription_id=s.id
    WHERE o.id=$1`, [draft.data.order_id]);
  assert(record.rowCount === 1, 'completed order lifecycle row missing');
  return { ...record.rows[0], checkoutSessionKey: draft.data.checkout_session_key };
};

await writeFile(`${artifactDir}/supplemental-matrix.jsonl`, '');

await run('SUP-OPS-001', 'Smoke/readiness', 'Call /health, /ready, and subscription health.', 'Health and readiness endpoints are available and dependencies are healthy.', async () => {
  const health = await fetch('http://127.0.0.1:3001/health');
  const ready = await fetch('http://127.0.0.1:3001/ready');
  const subscriptions = await request('/subscriptions/health');
  assert(health.status === 200 && subscriptions.response.status === 200, `health=${health.status} subscriptions=${subscriptions.response.status}`);
  assert(ready.status === 200, `readiness endpoint returned ${ready.status}`);
  return { actual: 'Health, readiness, and subscription health returned 200.' };
});

await run('SUP-SEC-001', 'CSRF', 'Use cookie-authenticated admin POST without and with matching CSRF header.', 'Missing token is 403; matching token reaches request validation.', async () => {
  const cookie = `auth_token=${adminToken}; csrf_token=qa-supplement-csrf`;
  const blocked = await request('/admin/coupons', { method: 'POST', cookie, body: {} });
  const allowed = await request('/admin/coupons', { method: 'POST', cookie, headers: { 'x-csrf-token': 'qa-supplement-csrf' }, body: {} });
  assert(blocked.response.status === 403, `without CSRF=${blocked.response.status}`);
  assert(allowed.response.status === 400, `with CSRF=${allowed.response.status}`);
  return { actual: 'Cookie mutation blocked at 403 without CSRF; matching CSRF proceeded to 400 schema validation.' };
});

await run('SUP-API-001', 'API validation', 'Send mismatched duration, unsupported currency, nonexistent product, and 51 cart items.', 'Each fails per item or request with a stable non-5xx response.', async () => {
  const duration = await request('/subscriptions/cart-pricing-preview', { method: 'POST', body: { currency: 'USD', items: [{ cart_item_id: 'bad-duration', product_id: productOne, term_months: 12 }] } });
  const currency = await request('/subscriptions/cart-pricing-preview', { method: 'POST', body: { currency: 'EUR', items: [{ cart_item_id: 'bad-currency', product_id: productTwelve }] } });
  const missing = await request('/subscriptions/cart-pricing-preview', { method: 'POST', body: { currency: 'USD', items: [{ cart_item_id: 'missing', product_id: '40000000-0000-4000-8000-000000000001' }] } });
  const bounds = await request('/subscriptions/cart-pricing-preview', { method: 'POST', body: { items: Array.from({ length: 51 }, (_, index) => ({ cart_item_id: `b-${index}`, product_id: productTwelve })) } });
  const durationCode = duration.data.skipped_items?.[0]?.code;
  const currencyCode = currency.data.skipped_items?.[0]?.code;
  const missingCode = missing.data.skipped_items?.[0]?.code;
  assert(durationCode === 'INVALID_DURATION', `duration accepted: ${JSON.stringify(duration.data)}`);
  assert(['UNSUPPORTED_CURRENCY', 'PRICE_UNAVAILABLE'].includes(currencyCode), `currency=${JSON.stringify(currency.data)}`);
  assert(['PRODUCT_UNAVAILABLE', 'PRODUCT_NOT_FOUND'].includes(missingCode), `missing=${JSON.stringify(missing.data)}`);
  assert(bounds.response.status === 400, `bounds=${bounds.response.status}`);
  return { actual: 'All invalid API inputs failed closed with stable codes and no 5xx.', codes: { durationCode, currencyCode, missingCode, bounds: bounds.response.status } };
});

await run('SUP-CART-001', 'Cart totals', 'Price quantity three for the active fixed 12-month product.', 'Integer-cent line total equals unit price times quantity.', async () => {
  const priced = await request('/subscriptions/cart-pricing-preview', { method: 'POST', body: { currency: 'USD', items: [{ cart_item_id: 'qty-3', product_id: productTwelve, quantity: 3 }] } });
  const item = priced.data.items?.[0];
  assert(priced.response.status === 200 && item?.line_total_cents === item?.unit_price_cents * 3, JSON.stringify(priced.data));
  return { actual: `Quantity 3 priced at ${item.line_total_cents} integer cents.`, item };
});

await run('SUP-ADMIN-001', 'Taxonomy/labels', 'Create a sub-category and label, assign both to the 12-month product, then reload detail.', 'Mappings persist and remain product-centric.', async () => {
  const sub = await request('/admin/product-sub-categories', { method: 'POST', token: adminToken, body: { category: 'QA Release', name: 'QA Streaming', slug: 'qa-streaming' } });
  assert(sub.response.status === 201, `sub=${sub.response.status} ${JSON.stringify(sub.payload)}`);
  const label = await request('/admin/product-labels', { method: 'POST', token: adminToken, body: { name: 'QA Verified', slug: 'qa-verified', color: '#663399' } });
  assert(label.response.status === 201, `label=${label.response.status} ${JSON.stringify(label.payload)}`);
  const mapped = await request(`/admin/products/${productTwelve}`, { method: 'PATCH', token: adminToken, body: { category: 'QA Release', categories: ['QA Release'], sub_category_ids: [sub.data.id] } });
  assert(mapped.response.status === 200, `map=${mapped.response.status} ${JSON.stringify(mapped.payload)}`);
  const assigned = await request(`/admin/products/${productTwelve}/labels`, { method: 'POST', token: adminToken, body: { label_id: label.data.id } });
  assert([200, 201].includes(assigned.response.status), `assign=${assigned.response.status}`);
  const detail = await request(`/admin/products/${productTwelve}`, { token: adminToken });
  assert(JSON.stringify(detail.data).includes('qa-streaming') && JSON.stringify(detail.data).includes('qa-verified'), JSON.stringify(detail.data));
  return { actual: 'Product sub-category and label mappings persisted.', sub_category_id: sub.data.id, label_id: label.data.id };
});

await run('SUP-PUB-001', 'Browse/search/category', 'Filter public API by category and browser browse page by search.', 'The active fixed product remains independently discoverable.', async () => {
  const filtered = await request('/subscriptions/products/available?category=QA%20Release');
  assert(filtered.response.status === 200 && filtered.data.products.some(p => p.product_id === productTwelve), JSON.stringify(filtered.data));
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext();
  await context.addInitScript(() => localStorage.setItem('subslush_cookie_consent', JSON.stringify({ version: '2026-02-05', updatedAt: new Date().toISOString(), decision: 'reject_non_essential', preferences: { analytics: false, marketing: false } })));
  const page = await context.newPage();
  await page.goto(`${baseUrl}/browse?search=12%20Months`, { waitUntil: 'networkidle' });
  await page.getByText('QA Brand — 12 Months', { exact: true }).first().waitFor();
  await page.screenshot({ path: `${artifactDir}/screenshots/sup-pub-search.png`, fullPage: true });
  await browser.close();
  return { actual: 'Category API and browser search both found the 12-month product.', screenshot: 'screenshots/sup-pub-search.png' };
});

await run('SUP-CART-002', 'Stale cart recovery', 'Load a browser with one variant-only saved cart record and one current product record.', 'Stale record is removed, valid record remains, and a recoverable notice is shown.', async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext();
  await context.addInitScript(({ productTwelve }) => {
    localStorage.setItem('subslush_cookie_consent', JSON.stringify({ version: '2026-02-05', updatedAt: new Date().toISOString(), decision: 'reject_non_essential', preferences: { analytics: false, marketing: false } }));
    localStorage.setItem('subslush_cart', JSON.stringify([
      { id: 'legacy-stale', serviceType: 'qa', serviceName: 'Stale variant', plan: 'legacy', price: 1, quantity: 1, variantId: '20000000-0000-4000-8000-000000000002' },
      { id: 'fixed-current', serviceType: 'qa_product', serviceName: 'QA Brand — 12 Months', plan: '12 months', price: 99.99, currency: 'USD', quantity: 1, productId: productTwelve, termMonths: 12 }
    ]));
  }, { productTwelve });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/checkout`, { waitUntil: 'networkidle' });
  await page.getByText(/saved cart item was removed because the product information was outdated/i).waitFor();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('subslush_cart') || '[]'));
  assert(stored.length === 1 && stored[0].productId === productTwelve, JSON.stringify(stored));
  await page.screenshot({ path: `${artifactDir}/screenshots/sup-stale-cart.png`, fullPage: true });
  await browser.close();
  return { actual: 'Variant-only stale cart item was removed with a recoverable notice; fixed item remained.', screenshot: 'screenshots/sup-stale-cart.png' };
});

await run('SUP-DATA-001', 'Stale price/cache', 'Capture price snapshot, publish a new price, retry draft with old snapshot, then reread listing.', 'Old snapshot is rejected as STALE_PRICE and listing immediately shows new price.', async () => {
  const before = await request('/subscriptions/cart-pricing-preview', { method: 'POST', body: { currency: 'USD', items: [{ cart_item_id: 'stale-price', product_id: productTwelve }] } });
  const item = before.data.items?.[0];
  assert(item?.pricing_snapshot_id, JSON.stringify(before.data));
  const updated = await request(`/admin/products/${productTwelve}/fixed-price/current`, { method: 'POST', token: adminToken, body: { price_cents: 10099, currency: 'USD', comparison_price_cents: 12999 } });
  assert(updated.response.status === 201, `price update=${updated.response.status}`);
  const identity = await request('/checkout/identity', { method: 'POST', body: { email: 'qa-stale-price@example.test' } });
  const draft = await request('/checkout/draft', { method: 'POST', body: { guest_identity_id: identity.data.guest_identity_id, contact_email: 'qa-stale-price@example.test', currency: 'USD', items: [{ product_id: productTwelve, pricing_snapshot_id: item.pricing_snapshot_id }] } });
  const listing = await request('/subscriptions/products/available');
  const current = listing.data.products.find(p => p.product_id === productTwelve);
  assert(draft.response.status === 400 && draft.payload.code === 'STALE_PRICE', `stale=${draft.response.status} ${JSON.stringify(draft.payload)}`);
  assert(current?.price_cents === 10099, JSON.stringify(current));
  return { actual: 'Old snapshot rejected with STALE_PRICE; listing cache reflected 10099 cents.', old_snapshot: item.pricing_snapshot_id };
});

await request(`/admin/products/${productOne}`, { method: 'PATCH', token: adminToken, body: { status: 'active' } });

await run('SUP-COUPON-001', 'Coupon/multi-item', 'Create a 10% product-and-term scoped coupon and price a two-fixed-product draft.', 'Discount applies only to the eligible 12-month item; integer totals reconcile.', async () => {
  const coupon = await request('/admin/coupons', { method: 'POST', token: adminToken, body: { code: 'QA12ONLY', percent_off: 10, scope: 'product', apply_scope: 'highest_eligible_item', status: 'active', product_id: productTwelve, term_months: 12 } });
  assert(coupon.response.status === 201, `coupon=${coupon.response.status} ${JSON.stringify(coupon.payload)}`);
  const identity = await request('/checkout/identity', { method: 'POST', body: { email: 'qa-multi-coupon@example.test' } });
  const draft = await request('/checkout/draft', { method: 'POST', body: { guest_identity_id: identity.data.guest_identity_id, contact_email: 'qa-multi-coupon@example.test', currency: 'USD', coupon_code: 'QA12ONLY', items: [{ product_id: productOne }, { product_id: productTwelve }] } });
  assert(draft.response.status === 200, `draft=${draft.response.status} ${JSON.stringify(draft.payload)}`);
  const pricing = draft.data.pricing;
  const discounted = pricing.items.find(item => item.product_id === productTwelve);
  const excluded = pricing.items.find(item => item.product_id === productOne);
  assert(discounted.coupon_discount_cents > 0 && excluded.coupon_discount_cents === 0, JSON.stringify(pricing));
  assert(pricing.total_cents === pricing.subtotal_cents - pricing.discount_cents, JSON.stringify(pricing));
  return { actual: `Two-item draft reconciled at ${pricing.total_cents} cents; coupon affected only the 12-month product.`, pricing };
});

await run('SUP-FUL-001', 'New-account fulfillment', 'Admin inspects queue, stores credentials, delivers existing browser order; customer and unrelated user attempt reveal.', 'Delivery activates durable item, completes task, sends safe email, permits owner reveal, and denies IDOR.', async () => {
  const queue = await request('/admin/fulfillment/queue?tab=new_orders&limit=200', { token: adminToken });
  assert(queue.response.status === 200 && queue.data.orders.some(o => o.id === browserOrder), JSON.stringify(queue.data));
  const beforeRevealUser = (await db('SELECT user_id FROM orders WHERE id=$1', [browserOrder])).rows[0].user_id;
  const ownerToken = sign(beforeRevealUser, 'qa-browser-guest@example.test');
  const beforeReveal = await request(`/orders/${browserOrder}/items/${browserSubscription}/reveal`, { method: 'POST', token: ownerToken });
  assert(beforeReveal.response.status === 404, `pre-reveal=${beforeReveal.response.status}`);
  const stored = await request(`/admin/subscriptions/${browserSubscription}/credentials`, { method: 'POST', token: adminToken, body: { credentials: 'qa-user@example.test\nQA-Secret-Only-In-Isolated-Test', reason: 'release sign-off' } });
  assert(stored.response.status === 200 && !JSON.stringify(stored.payload).includes('QA-Secret'), JSON.stringify(stored.payload));
  const delivered = await request(`/admin/orders/${browserOrder}/items/${browserSubscription}/deliver`, { method: 'POST', token: adminToken, body: { reason: 'release sign-off delivery' } });
  assert(delivered.response.status === 200, `${delivered.response.status} ${JSON.stringify(delivered.payload)}`);
  const owner = await request(`/orders/${browserOrder}/items/${browserSubscription}/reveal`, { method: 'POST', token: ownerToken });
  const other = await request(`/orders/${browserOrder}/items/${browserSubscription}/reveal`, { method: 'POST', token: otherToken });
  assert(owner.response.status === 200 && owner.data.credentials.includes('qa-user@example.test'), JSON.stringify(owner.payload));
  assert(other.response.status === 404, `other=${other.response.status}`);
  const evidence = await db(`SELECT o.status,s.status subscription_status,s.product_id,s.product_variant_id,s.delivered_at,t.completed_at,
    (SELECT count(*)::int FROM credential_reveal_audit_logs WHERE subscription_id=s.id AND success=TRUE) reveal_audits,
    (SELECT count(*)::int FROM order_compliance_evidence_logs WHERE order_id=o.id AND event_type='item_delivery') delivery_evidence
    FROM orders o JOIN subscriptions s ON s.order_id=o.id LEFT JOIN admin_tasks t ON t.subscription_id=s.id AND t.task_type='credential_provision'
    WHERE o.id=$1 AND s.id=$2`, [browserOrder, browserSubscription]);
  const row = evidence.rows[0];
  assert(row.status === 'delivered' && row.subscription_status === 'active' && row.product_id === productOne && row.product_variant_id === null && row.completed_at && row.reveal_audits >= 1 && row.delivery_evidence >= 1, JSON.stringify(row));
  return { actual: 'New-account fulfillment delivered; task/evidence/audit recorded; owner reveal succeeded; IDOR returned 404.', db: row };
});

let handshakeOrder;
await run('SUP-FUL-002', 'Activation/strict/MMU', 'Configure 12-month fixed product for handshake, strict rules v2, and monthly MMU; purchase and complete full handshake.', 'Snapshots drive state machine, rules gate reveal, retry conflicts, and 12-month MMU schedule is consistent.', async () => {
  const current = (await db('SELECT metadata FROM products WHERE id=$1', [productTwelve])).rows[0].metadata;
  const metadata = { ...current, upgrade_options: { allow_new_account: true, allow_own_account: true, own_account_credential_requirement: 'email_only', manual_monthly_upgrade: true, manual_monthly_upgrade_interval_months: 1, activation_link_handshake: true, activation_instructions_template: 'Acknowledge the activation expiry before continuing.', strict_rules: true, strict_rules_text: 'Do not share delivered credentials.', strict_rules_version: 2 } };
  const configured = await request(`/admin/products/${productTwelve}`, { method: 'PATCH', token: adminToken, body: { metadata } });
  assert(configured.response.status === 200, `configure=${configured.response.status} ${JSON.stringify(configured.payload)}`);
  handshakeOrder = await createPaidGuestOrder({ email: 'qa-handshake@example.test', productId: productTwelve, selectionType: 'upgrade_new_account', acknowledged: true });
  const ownerToken = sign(handshakeOrder.user_id, 'qa-handshake@example.test');
  const instructions = await request(`/admin/orders/${handshakeOrder.order_id}/items/${handshakeOrder.subscription_id}/activation-instructions`, { method: 'POST', token: adminToken, body: { instructions: 'This link expires; confirm readiness.' } });
  assert(instructions.response.status === 200, JSON.stringify(instructions.payload));
  const ready = await request(`/orders/${handshakeOrder.order_id}/items/${handshakeOrder.subscription_id}/activation-ready`, { method: 'POST', token: ownerToken, body: { confirmed: true } });
  assert(ready.response.status === 200, JSON.stringify(ready.payload));
  const link = await request(`/admin/orders/${handshakeOrder.order_id}/items/${handshakeOrder.subscription_id}/activation-link`, { method: 'POST', token: adminToken, body: { activation_link: 'https://example.test/activate/qa-safe-token' } });
  assert(link.response.status === 200, JSON.stringify(link.payload));
  const gated = await request(`/orders/${handshakeOrder.order_id}/items/${handshakeOrder.subscription_id}/reveal`, { method: 'POST', token: ownerToken });
  assert(gated.response.status === 403, `gated=${gated.response.status} ${JSON.stringify(gated.payload)}`);
  const accepted = await request(`/orders/${handshakeOrder.order_id}/items/${handshakeOrder.subscription_id}/accept-rules`, { method: 'POST', token: ownerToken, body: { confirmed: true } });
  assert(accepted.response.status === 200 && accepted.data.rules_version === 2, JSON.stringify(accepted.payload));
  const revealed = await request(`/orders/${handshakeOrder.order_id}/items/${handshakeOrder.subscription_id}/reveal`, { method: 'POST', token: ownerToken });
  assert(revealed.response.status === 200, JSON.stringify(revealed.payload));
  const retry = await request(`/admin/orders/${handshakeOrder.order_id}/items/${handshakeOrder.subscription_id}/activation-link`, { method: 'POST', token: adminToken, body: { activation_link: 'https://example.test/retry' } });
  assert(retry.response.status === 409 && retry.payload.code === 'INVALID_ACTIVATION_STATE', JSON.stringify(retry.payload));
  const state = await db(`SELECT s.status,s.term_months,s.duration_months_snapshot,s.activation_handshake_state,
    (SELECT count(*)::int FROM admin_tasks WHERE subscription_id=s.id AND task_type='manual_monthly_upgrade') mmu_tasks,
    (SELECT max(mmu_cycle_total) FROM admin_tasks WHERE subscription_id=s.id AND task_type='manual_monthly_upgrade') cycle_total,
    (SELECT count(*)::int FROM order_compliance_evidence_logs WHERE order_id=s.order_id AND event_type='strict_rules_acceptance') rules_evidence,
    (SELECT count(*)::int FROM order_compliance_evidence_logs WHERE order_id=s.order_id AND event_type='activation_customer_ready') ready_evidence
    FROM subscriptions s WHERE s.id=$1`, [handshakeOrder.subscription_id]);
  const row = state.rows[0];
  assert(row.status === 'active' && row.term_months === 12 && row.duration_months_snapshot === 12 && row.activation_handshake_state === 'link_delivered' && row.mmu_tasks >= 1 && row.cycle_total === 12 && row.rules_evidence === 1 && row.ready_evidence === 1, JSON.stringify(row));
  return { actual: 'Activation handshake, strict-rules gate/evidence, replay conflict, and 12-month MMU schedule passed.', order_id: handshakeOrder.order_id, subscription_id: handshakeOrder.subscription_id, db: row };
});

await run('SUP-FUL-003', 'Own-account validation', 'Change purchase-time requirement to email+password; attempt own-account checkout without then with credentials.', 'Missing password fails; valid credentials are encrypted and omitted from API/admin response.', async () => {
  const current = (await db('SELECT metadata FROM products WHERE id=$1', [productTwelve])).rows[0].metadata;
  const metadata = { ...current, upgrade_options: { ...current.upgrade_options, activation_link_handshake: false, strict_rules: false, manual_monthly_upgrade: false, own_account_credential_requirement: 'email_and_password' } };
  const configured = await request(`/admin/products/${productTwelve}`, { method: 'PATCH', token: adminToken, body: { metadata } });
  assert(configured.response.status === 200, JSON.stringify(configured.payload));
  const identity = await request('/checkout/identity', { method: 'POST', body: { email: 'qa-own-account@example.test' } });
  const invalid = await request('/checkout/draft', { method: 'POST', body: { guest_identity_id: identity.data.guest_identity_id, contact_email: 'qa-own-account@example.test', currency: 'USD', items: [{ product_id: productTwelve, selection_type: 'upgrade_own_account', account_identifier: 'owner@example.test' }] } });
  assert(invalid.response.status === 400, `missing credentials=${invalid.response.status} ${JSON.stringify(invalid.payload)}`);
  const paid = await createPaidGuestOrder({ email: 'qa-own-valid@example.test', productId: productTwelve, selectionType: 'upgrade_own_account', accountIdentifier: 'owner@example.test', credentials: 'QA-Own-Password' });
  const row = await db(`SELECT sel.credentials_encrypted,sel.credentials_encrypted IS NOT NULL has_credentials,s.product_id,s.product_variant_id
    FROM subscription_upgrade_selections sel JOIN subscriptions s ON s.id=sel.subscription_id WHERE sel.subscription_id=$1`, [paid.subscription_id]);
  assert(row.rows[0].has_credentials === true && !row.rows[0].credentials_encrypted.includes('QA-Own-Password') && row.rows[0].product_id === productTwelve && row.rows[0].product_variant_id === null, JSON.stringify(row.rows[0]));
  const adminDetail = await request(`/admin/fulfillment/orders/${paid.order_id}`, { token: adminToken });
  assert(adminDetail.response.status === 200 && !JSON.stringify(adminDetail.payload).includes('QA-Own-Password'), JSON.stringify(adminDetail.payload));
  return { actual: 'Email+password requirement enforced; valid secret encrypted at rest and omitted from admin API.', order_id: paid.order_id, subscription_id: paid.subscription_id };
});

await run('SUP-ORDER-001', 'Customer/admin history', 'Read delivered order through owner list/detail/entitlements and admin fulfillment detail.', 'Snapshot product identity is visible without current-catalog dependency or secrets.', async () => {
  const userId = (await db('SELECT user_id FROM orders WHERE id=$1', [browserOrder])).rows[0].user_id;
  const ownerToken = sign(userId, 'qa-browser-guest@example.test');
  const list = await request('/orders?include_items=true&include_unpaid=true', { token: ownerToken });
  const detail = await request(`/orders/${browserOrder}/subscriptions`, { token: ownerToken });
  const entitlements = await request(`/orders/${browserOrder}/entitlements`, { token: ownerToken });
  const admin = await request(`/admin/fulfillment/orders/${browserOrder}`, { token: adminToken });
  assert(list.response.status === 200 && JSON.stringify(list.data).includes('QA Brand — 1 Month'), JSON.stringify(list.payload));
  assert(detail.response.status === 200 && entitlements.response.status === 200 && admin.response.status === 200, `${detail.response.status}/${entitlements.response.status}/${admin.response.status}`);
  const combined = JSON.stringify({ detail: detail.payload, entitlements: entitlements.payload, admin: admin.payload });
  assert(combined.includes(productOne) && !combined.includes('QA-Secret-Only-In-Isolated-Test'), combined);
  return { actual: 'Owner and admin history retained product/snapshot identity; plaintext credentials were absent.' };
});

await run('SUP-ORDER-002', 'Cancellation', 'Owner cancels the delivered subscription; unrelated user attempts same operation.', 'IDOR is denied; owner cancellation preserves order item/evidence snapshots.', async () => {
  const userId = (await db('SELECT user_id FROM orders WHERE id=$1', [browserOrder])).rows[0].user_id;
  const ownerToken = sign(userId, 'qa-browser-guest@example.test');
  const other = await request(`/subscriptions/${browserSubscription}`, { method: 'DELETE', token: otherToken, body: { reason: 'unauthorized QA attempt' } });
  assert([400, 404].includes(other.response.status), `other=${other.response.status}`);
  const cancelled = await request(`/subscriptions/${browserSubscription}`, { method: 'DELETE', token: ownerToken, body: { reason: 'release sign-off cancellation' } });
  assert(cancelled.response.status === 200, `${cancelled.response.status} ${JSON.stringify(cancelled.payload)}`);
  const row = (await db(`SELECT s.status,s.product_id,s.product_name_snapshot,s.duration_months_snapshot,oi.unit_price_cents,oi.currency,
    (SELECT count(*)::int FROM order_compliance_evidence_logs WHERE order_id=s.order_id) evidence_count
    FROM subscriptions s JOIN order_items oi ON oi.id=s.order_item_id WHERE s.id=$1`, [browserSubscription])).rows[0];
  assert(row.status === 'cancelled' && row.product_id === productOne && row.product_name_snapshot === 'QA Brand — 1 Month' && row.duration_months_snapshot === 1 && row.unit_price_cents === 1099 && row.currency === 'USD' && row.evidence_count > 0, JSON.stringify(row));
  return { actual: 'Owner cancellation succeeded after IDOR denial; immutable commercial/evidence snapshots remained.', db: row };
});

await run('SUP-SEC-002', 'Rate limiting', 'Burst authenticated purchase-validation endpoint past its configured allowance.', 'A request receives stable 429 without server error.', async () => {
  const userId = handshakeOrder?.user_id || otherCustomerId;
  const token = sign(userId, 'qa-rate-limit@example.test');
  const statuses = [];
  for (let index = 0; index < 15; index += 1) {
    const response = await request('/subscriptions/validate-purchase', { method: 'POST', token, body: { product_id: productTwelve } });
    statuses.push(response.response.status);
    if (response.response.status === 429) break;
  }
  assert(statuses.includes(429), JSON.stringify(statuses));
  return { actual: `Rate limit returned 429 after ${statuses.length} requests.`, statuses };
});

await run('SUP-SEC-003', 'Sensitive-data redaction', 'Inspect isolated backend log and persisted JSON fields for known plaintext QA secrets.', 'Secrets are absent from logs and unencrypted JSON/audit metadata.', async () => {
  const log = await readFile(`${artifactDir}/backend.log`, 'utf8');
  const jsonScan = await db(`SELECT
    (SELECT count(*)::int FROM admin_audit_logs WHERE COALESCE(before_data::text,'') || COALESCE(after_data::text,'') || COALESCE(metadata::text,'') LIKE '%QA-Secret-Only-In-Isolated-Test%') admin_audit_plaintext,
    (SELECT count(*)::int FROM order_compliance_evidence_logs WHERE COALESCE(metadata::text,'') || COALESCE(access_evidence::text,'') LIKE '%QA-Secret-Only-In-Isolated-Test%') evidence_plaintext`);
  assert(!log.includes('QA-Secret-Only-In-Isolated-Test') && !log.includes('QA-Own-Password'), 'known plaintext secret found in backend log');
  assert(jsonScan.rows[0].admin_audit_plaintext === 0 && jsonScan.rows[0].evidence_plaintext === 0, JSON.stringify(jsonScan.rows[0]));
  return { actual: 'Known QA plaintext secrets absent from server log and audit/evidence JSON.', db: jsonScan.rows[0] };
});

const summary = { total: results.length, pass: results.filter(r => r.status === 'PASS').length, fail: results.filter(r => r.status === 'FAIL').length };
await writeFile(`${artifactDir}/supplemental-summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
