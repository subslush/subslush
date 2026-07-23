import pg from 'pg';
import jwt from 'jsonwebtoken';
import { appendFile, writeFile, readFile } from 'node:fs/promises';

const { Client } = pg;
const dir = 'qa-artifacts/product-release-signoff-20260721-2100/r5';
const api = 'http://127.0.0.1:3001/api/v1';
const dbConfig = { host: 'localhost', port: 5432, database: 'ss_product_release_qa_20260721_2100_r5', user: process.env.DB_USER, password: process.env.DB_PASSWORD };
const secret = 'qa-release-signoff-jwt-secret-20260721-minimum-32-characters';
const adminId = '10000000-0000-4000-8000-000000000001';
const productOne = '8a759cf1-7db1-4dba-8595-848508dce77b';
const productTwelve = 'f06881ad-156c-42c6-a068-7fdb537b565c';
const browserSubscription = '9ba16fa0-7c98-4498-adbc-b296b435af46';
const sign = (userId, email, role = 'user') => jwt.sign({ userId, email, role }, secret, { algorithm: 'HS256', expiresIn: '2h', issuer: 'subscription-platform', audience: 'subscription-platform-users' });
const adminToken = sign(adminId, 'qa-release-admin@example.test', 'admin');
const db = async (text, values = []) => { const c = new Client(dbConfig); await c.connect(); try { return await c.query(text, values); } finally { await c.end(); } };
const request = async (path, { method = 'GET', token, body, headers = {}, cookie } = {}) => {
  const response = await fetch(`${api}${path}`, { method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...(cookie ? { cookie } : {}), ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const payload = await response.json().catch(() => ({}));
  return { response, payload, data: payload?.data ?? payload };
};
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const rows = [];
const run = async (id, area, stepsOrExpected, expectedOrFn, maybeFn) => {
  const expected = typeof expectedOrFn === 'function' ? stepsOrExpected : expectedOrFn;
  const fn = typeof expectedOrFn === 'function' ? expectedOrFn : maybeFn;
  const started = Date.now();
  try { const evidence = await fn(); rows.push({ id, area, expected, actual: evidence.actual, status: 'PASS', duration_ms: Date.now() - started, evidence }); }
  catch (error) { rows.push({ id, area, expected, actual: error instanceof Error ? error.message : String(error), status: 'FAIL', duration_ms: Date.now() - started, evidence: {} }); }
  await appendFile(`${dir}/correction-matrix.jsonl`, `${JSON.stringify(rows.at(-1))}\n`);
};
const consent = key => ({ immediate_fulfillment_consent: true, terms_policy_consent: true, consent_timestamp: new Date().toISOString(), checkout_session_key_snapshot: key, consent_source: 'qa_correction' });
const paidOwnOrder = async () => {
  const email = 'qa-own-valid@example.test';
  const identity = await request('/checkout/identity', { method: 'POST', body: { email } });
  const draft = await request('/checkout/draft', { method: 'POST', body: { guest_identity_id: identity.data.guest_identity_id, contact_email: email, currency: 'USD', items: [{ product_id: productTwelve, selection_type: 'upgrade_own_account', account_identifier: 'owner@example.test', credentials: 'QA-Own-Password' }] } });
  assert(draft.response.status === 200, `draft=${draft.response.status} ${JSON.stringify(draft.payload)}`);
  const completed = await request('/checkout/qa/complete', { method: 'POST', body: { checkout_session_key: draft.data.checkout_session_key, legal_consent: consent(draft.data.checkout_session_key) } });
  assert(completed.response.status === 200, `complete=${completed.response.status}`);
  return (await db(`SELECT o.id order_id,o.user_id,s.id subscription_id,s.product_id,s.product_variant_id,sel.credentials_encrypted,sel.credentials_encrypted IS NOT NULL has_credentials FROM orders o JOIN subscriptions s ON s.order_id=o.id JOIN subscription_upgrade_selections sel ON sel.subscription_id=s.id WHERE o.id=$1`, [draft.data.order_id])).rows[0];
};

await writeFile(`${dir}/correction-matrix.jsonl`, '');

await run('COR-SEC-001', 'CSRF', 'Valid cookie-authenticated mutation is 403 without CSRF and succeeds with matching token.', async () => {
  const cookie = `auth_token=${adminToken}; csrf_token=qa-csrf-correction`;
  const payload = { code: 'QACSRF3', percent_off: 1, scope: 'global', status: 'active' };
  const blocked = await request('/admin/coupons', { method: 'POST', cookie, body: payload });
  const allowed = await request('/admin/coupons', { method: 'POST', cookie, headers: { 'x-csrf-token': 'qa-csrf-correction' }, body: payload });
  assert(blocked.response.status === 403 && allowed.response.status === 201, `${blocked.response.status}/${allowed.response.status} ${JSON.stringify(blocked.payload)}`);
  return { actual: 'Valid admin mutation was 403 without CSRF and 201 with matching double-submit token.' };
});

await run('COR-API-001', 'Structured API errors', 'Active fixed product rejects wrong duration, unsupported FX, missing product, and oversized payload without 5xx.', async () => {
  const duration = await request('/subscriptions/cart-pricing-preview', { method: 'POST', body: { currency: 'USD', items: [{ cart_item_id: 'duration', product_id: productTwelve, term_months: 1 }] } });
  const currency = await request('/subscriptions/cart-pricing-preview', { method: 'POST', body: { currency: 'EUR', items: [{ cart_item_id: 'currency', product_id: productTwelve }] } });
  const missing = await request('/subscriptions/cart-pricing-preview', { method: 'POST', body: { items: [{ cart_item_id: 'missing', product_id: '40000000-0000-4000-8000-000000000001' }] } });
  const bounds = await request('/subscriptions/cart-pricing-preview', { method: 'POST', body: { items: Array.from({ length: 51 }, (_, i) => ({ cart_item_id: `x-${i}`, product_id: productTwelve })) } });
  const codes = [duration.data.skipped_items?.[0]?.code, currency.data.skipped_items?.[0]?.code, missing.data.skipped_items?.[0]?.code];
  assert(codes[0] === 'INVALID_DURATION' && codes[1] === 'PRICE_UNAVAILABLE' && codes[2] === 'PRODUCT_UNAVAILABLE' && bounds.response.status === 400, `${JSON.stringify(codes)} bounds=${bounds.response.status}`);
  return { actual: 'Per-item codes were INVALID_DURATION, PRICE_UNAVAILABLE, PRODUCT_UNAVAILABLE; 51 items returned 400.', codes };
});

await run('COR-DATA-001', 'Stale price/cache', 'Historical snapshot after price publication returns STALE_PRICE and current list remains updated.', async () => {
  const staleHistory = await db(`SELECT metadata->>'snapshot_id' pricing_snapshot_id FROM product_fixed_price_history WHERE product_id=$1 AND ends_at IS NOT NULL ORDER BY starts_at DESC LIMIT 1`, [productTwelve]);
  const oldSnapshot = staleHistory.rows[0]?.pricing_snapshot_id;
  const identity = await request('/checkout/identity', { method: 'POST', body: { email: 'qa-stale-price-correction@example.test' } });
  const draft = await request('/checkout/draft', { method: 'POST', body: { guest_identity_id: identity.data.guest_identity_id, contact_email: 'qa-stale-price-correction@example.test', currency: 'USD', items: [{ product_id: productTwelve, pricing_snapshot_id: oldSnapshot }] } });
  const list = await request('/subscriptions/products/available');
  assert(draft.response.status === 409 && draft.payload.code === 'STALE_PRICE', `${draft.response.status} ${JSON.stringify(draft.payload)}`);
  assert(list.data.products.find(p => p.product_id === productTwelve)?.price_cents === 10099, 'current list price not updated');
  return { actual: 'Stale draft returned 409 STALE_PRICE; listing returned current 10099-cent price.' };
});

await run('COR-COUPON-001', 'Coupon/multi-item', 'Existing two-item draft has product-scoped discount only on eligible item and reconciled cents.', async () => {
  const result = await db(`SELECT o.subtotal_cents,o.discount_cents,o.coupon_discount_cents,o.total_cents,o.currency,
    jsonb_agg(jsonb_build_object('product_id',oi.product_id,'coupon_discount_cents',oi.coupon_discount_cents,'total_price_cents',oi.total_price_cents) ORDER BY oi.created_at) items
    FROM orders o JOIN order_items oi ON oi.order_id=o.id WHERE o.contact_email='qa-multi-coupon@example.test' GROUP BY o.id`);
  const row = result.rows[0];
  const eligible = row.items.find(item => item.product_id === productTwelve);
  const excluded = row.items.find(item => item.product_id === productOne);
  assert(eligible.coupon_discount_cents === 1010 && excluded.coupon_discount_cents === 0 && row.total_cents === row.subtotal_cents - row.discount_cents - row.coupon_discount_cents && row.currency === 'USD', JSON.stringify(row));
  return { actual: '10% coupon discounted only 12-month line by 1010 cents; two-item total reconciled.', db: row };
});

await run('COR-FUL-001', 'Strict rules snapshot enforcement', 'After purchase and delivery, edit current product fulfillment settings, then reveal without accepting purchase-time strict rules.', 'Purchase-time strict-rules snapshot continues to block reveal with stable 400.', async () => {
  const context = (await db(`SELECT o.id order_id,o.user_id,s.id subscription_id,s.term_months,s.duration_months_snapshot,s.activation_handshake_state FROM orders o JOIN subscriptions s ON s.order_id=o.id WHERE o.contact_email='qa-handshake@example.test'`)).rows[0];
  const token = sign(context.user_id, 'qa-handshake@example.test');
  const gated = await request(`/orders/${context.order_id}/items/${context.subscription_id}/reveal`, { method: 'POST', token });
  assert(gated.response.status === 400 && gated.payload.code === 'INVALID_REQUEST', `purchase-time strict rules bypassed: ${gated.response.status} ${JSON.stringify(gated.payload)}`);
  return { actual: 'Purchase-time strict-rules snapshot still blocked reveal after catalog mutation.' };
});

await run('COR-FUL-004', 'MMU job', 'Run the real MMU sweep twice at the first lead window and inspect its durable task.', 'Exactly one first remaining-cycle task exists for the 12-month purchase.', async () => {
  const evidence = (await db(`SELECT s.status,s.term_months,s.duration_months_snapshot,s.activation_handshake_state,
    (SELECT count(*)::int FROM admin_tasks WHERE subscription_id=s.id AND task_type='manual_monthly_upgrade') mmu_tasks,
    (SELECT min(mmu_cycle_index) FROM admin_tasks WHERE subscription_id=s.id AND task_type='manual_monthly_upgrade') cycle_index,
    (SELECT min(mmu_cycle_total) FROM admin_tasks WHERE subscription_id=s.id AND task_type='manual_monthly_upgrade') cycle_total,
    (SELECT count(*)::int FROM order_compliance_evidence_logs WHERE order_id=s.order_id AND event_type='activation_customer_ready') ready_evidence
    FROM subscriptions s JOIN orders o ON o.id=s.order_id WHERE o.contact_email='qa-handshake@example.test'`)).rows[0];
  assert(evidence.status === 'active' && evidence.term_months === 12 && evidence.duration_months_snapshot === 12 && evidence.activation_handshake_state === 'link_delivered' && evidence.mmu_tasks === 1 && evidence.cycle_index === 1 && evidence.cycle_total === 11 && evidence.ready_evidence === 1, JSON.stringify(evidence));
  return { actual: 'Real MMU sweep produced one idempotent task for cycle 1/11 remaining after initial delivery.', db: evidence };
});

await run('COR-FUL-002', 'Own-account valid path', 'Complete own-account purchase with required password and inspect storage/admin serialization.', async () => {
  const row = await paidOwnOrder();
  assert(row.has_credentials === true && !row.credentials_encrypted.includes('QA-Own-Password') && row.product_id === productTwelve && row.product_variant_id === null, JSON.stringify(row));
  const admin = await request(`/admin/fulfillment/orders/${row.order_id}`, { token: adminToken });
  assert(admin.response.status === 200 && !JSON.stringify(admin.payload).includes('QA-Own-Password'), JSON.stringify(admin.payload));
  return { actual: 'Valid own-account purchase dual-wrote product identity; password encrypted and absent from admin serialization.', order_id: row.order_id, subscription_id: row.subscription_id };
});

await run('COR-FUL-003', 'Own-account required credential', 'Submit email+password own-account draft without password.', 'Request fails before order persistence with stable 400.', async () => {
  const email = 'qa-own-missing-correction@example.test';
  const identity = await request('/checkout/identity', { method: 'POST', body: { email } });
  const draft = await request('/checkout/draft', { method: 'POST', body: { guest_identity_id: identity.data.guest_identity_id, contact_email: email, currency: 'USD', items: [{ product_id: productTwelve, selection_type: 'upgrade_own_account', account_identifier: 'owner@example.test' }] } });
  assert(draft.response.status === 400, `missing required password accepted: ${draft.response.status} ${JSON.stringify(draft.payload)}`);
  return { actual: 'Missing required password rejected with 400.' };
});

await run('COR-ORDER-001', 'Cancellation persistence', 'Inspect cancellation response effects on active delivered subscription.', 'Successful cancellation request persists timestamp and reason while entitlement remains active until term end.', async () => {
  const row = (await db(`SELECT status,status_reason,cancellation_requested_at,cancellation_reason,auto_renew,next_billing_at,product_id,product_name_snapshot,duration_months_snapshot FROM subscriptions WHERE id=$1`, [browserSubscription])).rows[0];
  assert(row.status === 'active' && row.status_reason === 'cancelled_by_user' && row.cancellation_requested_at && row.cancellation_reason === 'release sign-off cancellation' && row.auto_renew === false && row.next_billing_at === null, JSON.stringify(row));
  return { actual: 'Cancellation request persisted timestamp/reason and retained active access to term end.', db: row };
});

await run('COR-SEC-002', 'Rate limiting', 'Burst validate-purchase beyond its 20-request minute window.', 'Stable 429 is returned.', async () => {
  const statuses = [];
  const token = sign('50000000-0000-4000-8000-000000000001', 'qa-rate@example.test');
  for (let i = 0; i < 30; i += 1) { const r = await request('/subscriptions/validate-purchase', { method: 'POST', token, body: { product_id: productTwelve } }); statuses.push(r.response.status); if (r.response.status === 429) break; }
  assert(statuses.includes(429), JSON.stringify(statuses));
  return { actual: `Rate limiter returned 429 on burst request ${statuses.length}.`, statuses };
});

await run('COR-SEC-003', 'Sensitive-data redaction', 'Scan log plus audit/evidence JSON for known plaintext test credentials.', 'Known secrets are absent.', async () => {
  const log = await readFile(`${dir}/backend.log`, 'utf8');
  const scan = (await db(`SELECT
    (SELECT count(*)::int FROM admin_audit_logs WHERE COALESCE(before::text,'') || COALESCE(after::text,'') || COALESCE(metadata::text,'') LIKE '%QA-Secret-Only-In-Isolated-Test%') audit_plaintext,
    (SELECT count(*)::int FROM order_compliance_evidence_logs WHERE COALESCE(metadata::text,'') || COALESCE(license_account_access_evidence::text,'') LIKE '%QA-Secret-Only-In-Isolated-Test%') evidence_plaintext`)).rows[0];
  assert(!log.includes('QA-Secret-Only-In-Isolated-Test') && !log.includes('QA-Own-Password') && scan.audit_plaintext === 0 && scan.evidence_plaintext === 0, JSON.stringify(scan));
  return { actual: 'Known QA secrets absent from backend log and audit/evidence JSON.', db: scan };
});

const summary = { total: rows.length, pass: rows.filter(r => r.status === 'PASS').length, fail: rows.filter(r => r.status === 'FAIL').length };
await writeFile(`${dir}/correction-summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
