import fs from 'node:fs';
import { createHmac } from 'node:crypto';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { Client } from 'pg';

dotenv.config({ path: '.env', quiet: true });
const dir = 'qa-artifacts/run-a-completion2-20260711-072533';
const statePath = `${dir}/state.json`;
const summaryPath = `${dir}/running-summary.md`;
const dbLogPath = `${dir}/db-write-log.md`;
const backendLogPath = `${dir}/backend.log`;
const base = 'http://127.0.0.1:3104/api/v1';
const probe = process.argv[2];
const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : {};
const out = { probe, started_at: new Date().toISOString(), steps: {} };

const adminToken = jwt.sign(
  { userId: 'c0dac6b4-c082-4fb6-9cd2-b6bc154160e2', email: 'qa-admin-1768522228@example.test', role: 'admin' },
  process.env.JWT_SECRET,
  { algorithm: process.env.JWT_ALGORITHM || 'HS256', expiresIn: '30m', issuer: 'subscription-platform', audience: 'subscription-platform-users' },
);
const userToken = user => jwt.sign(
  { userId: user.id, email: user.email, role: 'user' },
  process.env.JWT_SECRET,
  { algorithm: process.env.JWT_ALGORITHM || 'HS256', expiresIn: '30m', issuer: 'subscription-platform', audience: 'subscription-platform-users' },
);
const data = response => response.json?.data ?? response.json;
const requireStatus = (response, statuses, label) => {
  if (!statuses.includes(response.status)) throw new Error(`${label}: expected ${statuses.join('/')}, got ${response.status}: ${response.text}`);
  return response;
};
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const step = (name, response) => {
  out.steps[name] = { status: response.status, body: response.json ?? response.text };
  return response;
};
async function request(path, { method = 'GET', body, token, headers = {} } = {}) {
  const rawBody = body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body));
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(rawBody !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { cookie: `auth_token=${token}; csrf_token=qa`, 'x-csrf-token': 'qa' } : {}),
      ...headers,
    },
    ...(rawBody !== undefined ? { body: rawBody } : {}),
  });
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch {}
  return { status: response.status, json, text };
}
async function db(sql, values = []) {
  const client = new Client({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432), database: process.env.DB_DATABASE, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
  await client.connect();
  try { return (await client.query(sql, values)).rows; } finally { await client.end(); }
}
async function register(email, lastName) {
  const response = step(`register-${lastName}`, await request('/auth/register', { method: 'POST', body: { email, password: 'QaPassword!123', firstName: 'QA', lastName } }));
  requireStatus(response, [200, 201, 202], `register ${email}`);
  const user = data(response)?.user;
  assert(user?.id, `register ${email}: user missing`);
  return { ...user, email };
}
async function guestDraft(email, couponCode) {
  const identityResponse = step(`identity-${email}`, await request('/checkout/identity', { method: 'POST', body: { email } }));
  requireStatus(identityResponse, [200], `identity ${email}`);
  const identity = data(identityResponse);
  const draftResponse = step(`draft-${email}`, await request('/checkout/draft', { method: 'POST', body: {
    guest_identity_id: identity.guest_identity_id,
    contact_email: email,
    currency: 'USD',
    items: [{ variant_id: state.variant_id, term_months: 6, auto_renew: false }],
    ...(couponCode ? { coupon_code: couponCode } : {}),
  } }));
  requireStatus(draftResponse, [200], `draft ${email}`);
  return data(draftResponse);
}
async function signedWebhook(orderId, label) {
  const detailResponse = await request(`/admin/next/orders/${orderId}`, { token: adminToken });
  requireStatus(detailResponse, [200], `admin order ${orderId}`);
  const amount = data(detailResponse)?.order?.total_cents;
  assert(Number.isInteger(amount), `order ${orderId}: total missing`);
  const event = JSON.stringify({ id: `evt_QA_A3_${label}_${Date.now()}`, object: 'event', type: 'checkout.session.completed', data: { object: { id: `cs_QA_A3_${label}_${Date.now()}`, object: 'checkout.session', payment_intent: `pi_QA_A3_${label}_${Date.now()}`, amount_total: amount, currency: 'usd', metadata: { order_id: orderId } } } });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET).update(`${timestamp}.${event}`).digest('hex');
  const response = step(`signed-webhook-${label}`, await request('/payments/stripe/webhook', { method: 'POST', body: event, headers: { 'stripe-signature': `t=${timestamp},v1=${signature}` } }));
  requireStatus(response, [200], `signed webhook ${label}`);
  return response;
}
function saveState() { fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n'); }
function appendDb(text) { fs.appendFileSync(dbLogPath, `- ${new Date().toISOString()}: ${text}\n`); }
function appendSummary(result, detail) { fs.appendFileSync(summaryPath, `## ${probe}\n\n**${result}** — ${detail}\n\nEvidence: \`${probe}.json\`\n\n`); }

async function inverseClaim() {
  const tag = `QA-A3-${Date.now()}`;
  state.tag = tag;
  const productResponse = step('create-strict-product', await request('/admin/products', { method: 'POST', token: adminToken, body: { name: `${tag} strict`, slug: `${tag.toLowerCase()}-strict`, service_type: 'qa_a3', default_currency: 'USD', status: 'inactive', metadata: { upgrade_options: { strict_rules: true, strict_rules_version: 1, strict_rules_text: `${tag} rules`, activation_link_handshake: true, activation_instructions_template: `${tag} instructions` } } } }));
  requireStatus(productResponse, [201], 'create product');
  state.product_id = data(productResponse).id;
  const variantResponse = step('create-variant', await request('/admin/product-variants', { method: 'POST', token: adminToken, body: { product_id: state.product_id, name: `${tag} variant`, variant_code: `${tag}-V`, service_plan: 'qa', is_active: true } }));
  requireStatus(variantResponse, [201], 'create variant');
  state.variant_id = data(variantResponse).id;
  requireStatus(step('create-term', await request('/admin/product-variant-terms', { method: 'POST', token: adminToken, body: { product_variant_id: state.variant_id, months: 6, discount_percent: 0, is_active: true } })), [201], 'create term');
  requireStatus(step('publish-price', await request('/admin/price-history/current', { method: 'POST', token: adminToken, body: { product_variant_id: state.variant_id, price_cents: 1000, currency: 'USD', end_previous: true } })), [200, 201], 'publish price');
  requireStatus(step('activate-product', await request(`/admin/products/${state.product_id}`, { method: 'PATCH', token: adminToken, body: { status: 'active' } })), [200], 'activate product');
  const email = `${tag.toLowerCase()}-inverse@example.test`;
  const draft = await guestDraft(email);
  state.inverse_order_id = draft.order_id;
  await signedWebhook(state.inverse_order_id, 'inverse');
  const detailResponse = step('paid-order-detail', await request(`/admin/next/orders/${state.inverse_order_id}`, { token: adminToken }));
  requireStatus(detailResponse, [200], 'paid order detail');
  state.inverse_subscription_id = data(detailResponse)?.items?.[0]?.subscription_id;
  assert(state.inverse_subscription_id, 'inverse subscription missing');
  requireStatus(step('save-credentials', await request(`/admin/subscriptions/${state.inverse_subscription_id}/credentials`, { method: 'POST', token: adminToken, body: { credentials: `${tag}-secret`, reason: 'QA-A3 inverse claim' } })), [200], 'save credentials');
  requireStatus(step('deliver', await request(`/admin/orders/${state.inverse_order_id}/items/${state.inverse_subscription_id}/deliver`, { method: 'POST', token: adminToken, body: { reason: 'QA-A3 inverse claim delivery' } })), [200], 'deliver');
  const log = fs.readFileSync(backendLogPath, 'utf8');
  const claimToken = [...log.matchAll(/checkout\/claim\?token=([a-f0-9]{64})/g)].at(-1)?.[1];
  assert(claimToken?.length === 64, 'full 64-character claim token absent from console email');
  out.claim_email_evidence = { full_console_email_retained_in: 'backend.log', token_length: claimToken.length };
  const user = await register(email, 'Inverse');
  state.inverse_user = { id: user.id, email: user.email };
  const token = userToken(user);
  const claimResponse = step('claim', await request('/checkout/claim', { method: 'POST', token, body: { token: claimToken } }));
  requireStatus(claimResponse, [200], 'claim');
  assert(data(claimResponse)?.reassigned === true, `claim was not reassigned: ${claimResponse.text}`);
  const ordersResponse = step('dashboard-orders-list', await request('/orders?include_items=true&include_unpaid=true&limit=100', { token }));
  requireStatus(ordersResponse, [200], 'dashboard orders list');
  const orders = data(ordersResponse)?.orders ?? [];
  assert(orders.some(order => order.id === state.inverse_order_id), 'claimed order absent from dashboard orders list');
  const subscriptionsResponse = step('dashboard-order-subscriptions', await request(`/orders/${state.inverse_order_id}/subscriptions`, { token }));
  requireStatus(subscriptionsResponse, [200], 'dashboard order subscriptions');
  assert(JSON.stringify(data(subscriptionsResponse)).includes(state.inverse_subscription_id), 'claimed subscription absent from dashboard order subscriptions');
  out.db_state = await db(`SELECT o.id AS order_id,o.user_id,u.email,u.is_guest,s.id AS subscription_id,s.user_id AS subscription_user_id FROM orders o JOIN users u ON u.id=o.user_id JOIN subscriptions s ON s.order_id=o.id WHERE o.id=$1`, [state.inverse_order_id]);
  assert(out.db_state[0]?.user_id === user.id && out.db_state[0]?.subscription_user_id === user.id && out.db_state[0]?.is_guest === false, 'post-claim DB ownership is inconsistent');
  appendDb(`inverse claim setup via supported APIs/webhook created QA-A3 catalog, guest order, payment/subscription, credentials/delivery, registration, and claim reassignment; no direct SQL writes.`);
  saveState();
  return `200/reassigned; order ${state.inverse_order_id} and subscription ${state.inverse_subscription_id} visible through supported dashboard reads.`;
}

async function registeredCoupon() {
  const completed = await db(`SELECT cr.order_id,cr.status AS redemption_status,o.status AS order_status,p.status AS payment_status,u.is_guest,c.code FROM coupon_redemptions cr JOIN coupons c ON c.id=cr.coupon_id JOIN orders o ON o.id=cr.order_id JOIN users u ON u.id=o.user_id LEFT JOIN LATERAL (SELECT status FROM payments WHERE order_id=o.id ORDER BY created_at DESC LIMIT 1) p ON true WHERE c.code_normalized='qa-a3-reg' AND cr.status='redeemed' ORDER BY cr.redeemed_at DESC NULLS LAST LIMIT 1`);
  if (completed.length === 1 && completed[0].is_guest === false && completed[0].payment_status === 'succeeded') {
    out.steps['reverify-completed-attempt'] = { status: 200, body: completed[0] };
    state.registered_coupon_order_id = completed[0].order_id;
    appendDb(`reverified completed QA-A3-REG signed-webhook lifecycle from the preserved retry: non-guest order, redeemed coupon, succeeded payment; DB read only.`);
    saveState();
    return `non-guest checkout reserved exactly one QA-A3-REG redemption, then signed webhook changed it to redeemed (reverified after evidence-query alias correction).`;
  }
  const existingCoupon = await db(`SELECT id FROM coupons WHERE code_normalized='qa-a3-reg'`);
  if (existingCoupon.length === 0) {
    const couponResponse = step('create-coupon-QA-A3-REG', await request('/admin/coupons', { method: 'POST', token: adminToken, body: { code: 'QA-A3-REG', percent_off: 10, scope: 'global', apply_scope: 'highest_eligible_item', status: 'active', max_redemptions: 1 } }));
    requireStatus(couponResponse, [201], 'create QA-A3-REG');
  } else {
    out.steps['reuse-coupon-from-preserved-first-attempt'] = { status: 200, body: { coupon_id: existingCoupon[0].id } };
  }
  const user = await register(`qa-a3-reg-${Date.now()}@example.test`, 'RegisteredCoupon');
  const checkoutResponse = step('logged-in-checkout', await request('/payments/checkout', { method: 'POST', token: userToken(user), body: { variant_id: state.variant_id, duration_months: 6, payment_method: 'card', auto_renew: false, currency: 'USD', coupon_code: 'QA-A3-REG' } }));
  requireStatus(checkoutResponse, [201], 'logged-in checkout');
  state.registered_coupon_order_id = data(checkoutResponse)?.order_id;
  assert(state.registered_coupon_order_id, 'logged-in checkout order missing');
  out.reserved = await db(`SELECT cr.status,o.user_id,u.is_guest,c.code FROM coupon_redemptions cr JOIN orders o ON o.id=cr.order_id JOIN users u ON u.id=o.user_id JOIN coupons c ON c.id=cr.coupon_id WHERE cr.order_id=$1`, [state.registered_coupon_order_id]);
  assert(out.reserved.length === 1 && out.reserved[0].status === 'reserved' && out.reserved[0].user_id === user.id && out.reserved[0].is_guest === false, 'registered coupon reservation state invalid');
  await signedWebhook(state.registered_coupon_order_id, 'registered-coupon');
  out.redeemed = await db(`SELECT cr.status AS redemption_status,o.status AS order_status,p.status AS payment_status,c.code FROM coupon_redemptions cr JOIN orders o ON o.id=cr.order_id JOIN coupons c ON c.id=cr.coupon_id LEFT JOIN LATERAL (SELECT status FROM payments WHERE order_id=o.id ORDER BY created_at DESC LIMIT 1) p ON true WHERE cr.order_id=$1`, [state.registered_coupon_order_id]);
  assert(out.redeemed[0].redemption_status === 'redeemed' && out.redeemed[0].code === 'QA-A3-REG', 'registered coupon redemption mismatch');
  appendDb(`QA-A3-REG coupon, registered user, logged-in order/payment, reserved redemption, and webhook redemption created through supported APIs; DB reads only.`);
  saveState();
  return `non-guest checkout reserved exactly one QA-A3-REG redemption, then signed webhook changed it to redeemed.`;
}

async function expiryReleaseReuse() {
  const completedRel = await db(`SELECT cr.order_id,cr.status AS redemption_status,o.status AS order_status,p.status AS payment_status FROM coupon_redemptions cr JOIN coupons c ON c.id=cr.coupon_id JOIN orders o ON o.id=cr.order_id LEFT JOIN LATERAL (SELECT status FROM payments WHERE order_id=o.id ORDER BY created_at DESC LIMIT 1) p ON true WHERE c.code_normalized='qa-a3-rel' ORDER BY cr.created_at ASC`);
  const releasedRow = completedRel.find(row => row.redemption_status === 'voided' && row.order_status === 'cancelled' && row.payment_status === 'expired');
  const reusedRow = completedRel.find(row => row.redemption_status === 'reserved' && row.order_id !== releasedRow?.order_id);
  if (releasedRow && reusedRow) {
    out.steps['reverify-completed-attempt'] = { status: 200, body: { released: releasedRow, reused: reusedRow } };
    state.expiry_order_id = releasedRow.order_id;
    state.reused_order_id = reusedRow.order_id;
    appendDb(`reverified completed QA-A3-REL sweep/reuse from preserved attempt after normalized-code assertion correction; DB read only.`);
    saveState();
    return `stale pending payment swept to expired, order cancelled, reservation voided, and QA-A3-REL reused by new draft ${state.reused_order_id} (reverified).`;
  }
  const existingRel = await db(`SELECT id FROM coupons WHERE code_normalized='qa-a3-rel'`);
  let draft;
  if (existingRel.length === 0) {
    requireStatus(step('create-coupon-QA-A3-REL', await request('/admin/coupons', { method: 'POST', token: adminToken, body: { code: 'QA-A3-REL', percent_off: 15, scope: 'global', apply_scope: 'highest_eligible_item', status: 'active', max_redemptions: 1 } })), [201], 'create QA-A3-REL');
    draft = await guestDraft(`qa-a3-rel-a-${Date.now()}@example.test`, 'QA-A3-REL');
  } else {
    const preserved = await db(`SELECT o.id AS order_id,o.checkout_session_key FROM coupon_redemptions cr JOIN orders o ON o.id=cr.order_id WHERE cr.coupon_id=$1 AND cr.status='reserved' ORDER BY cr.created_at DESC LIMIT 1`, [existingRel[0].id]);
    assert(preserved.length === 1, 'preserved QA-A3-REL reservation missing');
    draft = preserved[0];
    out.steps['reuse-reserved-draft-from-preserved-first-attempt'] = { status: 200, body: draft };
  }
  state.expiry_order_id = draft.order_id;
  out.reserved_before_session = await db(`SELECT status FROM coupon_redemptions WHERE order_id=$1`, [state.expiry_order_id]);
  assert(out.reserved_before_session.length === 1 && out.reserved_before_session[0].status === 'reserved', 'QA-A3-REL not reserved');
  let pending = await db(`SELECT o.payment_provider,o.payment_reference,p.id,p.status,p.created_at FROM orders o JOIN payments p ON p.order_id=o.id WHERE o.id=$1 AND p.status IN ('pending','requires_action','processing') ORDER BY p.created_at DESC LIMIT 1`, [state.expiry_order_id]);
  if (pending.length === 0) {
    const consentTimestamp = new Date().toISOString();
    const sessionResponse = step('paypal-session', await request('/checkout/paypal/session', { method: 'POST', body: { checkout_session_key: draft.checkout_session_key, funding_preference: 'card', legal_consent: { immediate_fulfillment_consent: true, terms_policy_consent: true, consent_timestamp: consentTimestamp, checkout_session_key_snapshot: draft.checkout_session_key, consent_source: 'qa_a3' } } }));
    requireStatus(sessionResponse, [200, 201], 'PayPal session');
    pending = await db(`SELECT o.payment_provider,o.payment_reference,p.id,p.status,p.created_at FROM orders o JOIN payments p ON p.order_id=o.id WHERE o.id=$1 AND p.status IN ('pending','requires_action','processing') ORDER BY p.created_at DESC LIMIT 1`, [state.expiry_order_id]);
  } else {
    out.steps['reuse-supported-pending-payment-from-preserved-attempt'] = { status: 200, body: { payment_id: pending[0].id, provider: pending[0].payment_provider } };
  }
  assert(pending.length === 1 && pending[0].payment_provider === 'paypal', 'supported PayPal session did not create a pending payment');
  out.backdate_sql = `UPDATE payments SET created_at = NOW() - INTERVAL '73 hours', updated_at = NOW() - INTERVAL '73 hours' WHERE id = $1`;
  await db(out.backdate_sql, [pending[0].id]);
  appendDb(`documented permitted SQL: backdated only payments.created_at and payments.updated_at by 73 hours for payment ${pending[0].id}; no order/subscription/task dates or states directly changed.`);
  const { env } = await import('../../dist/config/environment.js');
  const { createDatabasePool } = await import('../../dist/config/database.js');
  createDatabasePool(env);
  const { paymentService } = await import('../../dist/services/paymentService.js');
  out.sweep = await paymentService.sweepStaleCheckoutSessions({ batchSize: 50 });
  out.released = await db(`SELECT cr.status,o.status AS order_status,p.status AS payment_status FROM coupon_redemptions cr JOIN orders o ON o.id=cr.order_id JOIN payments p ON p.order_id=o.id WHERE o.id=$1 ORDER BY p.created_at DESC LIMIT 1`, [state.expiry_order_id]);
  assert(out.released.length === 1 && out.released[0].status === 'voided' && out.released[0].order_status === 'cancelled' && out.released[0].payment_status === 'expired', 'sweep did not cancel/expire/release');
  const reused = await guestDraft(`qa-a3-rel-b-${Date.now()}@example.test`, 'QA-A3-REL');
  state.reused_order_id = reused.order_id;
  assert(reused.order_id && reused.pricing?.normalized_coupon_code?.toUpperCase() === 'QA-A3-REL', 'QA-A3-REL was not reusable');
  appendDb(`sweep changed stale QA-A3-REL order/payment/redemption through production service; second guest draft reserved reused coupon via supported API.`);
  saveState();
  return `stale pending payment swept to expired, order cancelled, reservation voided, and QA-A3-REL reused by new draft ${state.reused_order_id}.`;
}

async function legacyReveal() {
  const response = step('legacy-order-level-reveal-without-acceptance', await request(`/orders/${state.inverse_order_id}/credentials/reveal`, { method: 'POST', token: userToken(state.inverse_user), body: {} }));
  requireStatus(response, [400], 'legacy reveal strict-rules refusal');
  assert(JSON.stringify(response.json).toLowerCase().includes('strict rules'), 'legacy reveal refusal did not identify strict-rules acceptance');
  appendDb(`legacy order-level reveal refusal was read/audit-only; no fixture state mutation expected.`);
  return `legacy order-level reveal returned 400 and refused credentials because strict rules were unaccepted.`;
}

async function cancelledMarkPaid() {
  const before = await db(`SELECT status FROM orders WHERE id=$1`, [state.expiry_order_id]);
  assert(before[0]?.status === 'cancelled', 'expiry order is not cancelled');
  const response = step('cancelled-order-mark-paid', await request(`/admin/orders/${state.expiry_order_id}/mark-paid`, { method: 'POST', token: adminToken, body: { note: 'QA-A3 cancelled order must remain unpaid' } }));
  requireStatus(response, [409], 'cancelled order mark-paid refusal');
  out.after = await db(`SELECT status,(SELECT count(*)::int FROM payments p WHERE p.order_id=o.id AND p.status='succeeded') AS succeeded_payments FROM orders o WHERE o.id=$1`, [state.expiry_order_id]);
  assert(out.after[0]?.status === 'cancelled' && out.after[0]?.succeeded_payments === 0, 'cancelled mark-paid caused side effects');
  appendDb(`cancelled-order mark-paid refusal produced no succeeded payment and left order cancelled; DB reads only.`);
  return `mark-paid returned 409; order stayed cancelled with zero succeeded payments.`;
}

async function activationAuthz() {
  const token = userToken(state.inverse_user);
  requireStatus(step('admin-set-instructions-precondition', await request(`/admin/orders/${state.inverse_order_id}/items/${state.inverse_subscription_id}/activation-instructions`, { method: 'POST', token: adminToken, body: { instructions: 'QA-A3 activation instructions' } })), [200], 'set activation instructions');
  requireStatus(step('customer-ready-precondition', await request(`/orders/${state.inverse_order_id}/items/${state.inverse_subscription_id}/activation-ready`, { method: 'POST', token, body: { confirmed: true } })), [200], 'customer ready');
  const path = `/admin/orders/${state.inverse_order_id}/items/${state.inverse_subscription_id}/activation-link`;
  const payload = { activation_link: 'https://activate.example/qa-a3-valid' };
  requireStatus(step('activation-link-unauthenticated', await request(path, { method: 'POST', body: payload })), [401], 'activation link unauthenticated');
  requireStatus(step('activation-link-customer', await request(path, { method: 'POST', token, body: payload })), [403], 'activation link customer');
  requireStatus(step('activation-link-admin', await request(path, { method: 'POST', token: adminToken, body: payload })), [200], 'activation link admin');
  out.after = await db(`SELECT activation_handshake_state,status FROM subscriptions WHERE id=$1`, [state.inverse_subscription_id]);
  assert(out.after[0]?.activation_handshake_state === 'link_delivered', 'admin activation-link success did not deliver link');
  appendDb(`activation instructions, customer-ready transition, and admin activation-link delivery used supported APIs; unauth/customer AuthZ probes had no side effects.`);
  return `valid payload returned 401 unauthenticated, 403 customer, and 200 admin; state became link_delivered.`;
}

const handlers = { '01-inverse-claim-visibility': inverseClaim, '02-registered-coupon': registeredCoupon, '03-expiry-release-reuse': expiryReleaseReuse, '04-legacy-reveal-bypass': legacyReveal, '05-cancelled-mark-paid': cancelledMarkPaid, '06-activation-link-authz': activationAuthz };

try {
  assert(handlers[probe], `unknown probe ${probe}`);
  const detail = await handlers[probe]();
  out.finished_at = new Date().toISOString();
  out.result = 'PASS';
  fs.writeFileSync(`${dir}/${probe}.json`, JSON.stringify(out, null, 2) + '\n');
  appendSummary('PASS', detail);
  console.log(JSON.stringify({ probe, result: 'PASS', detail }, null, 2));
} catch (error) {
  out.finished_at = new Date().toISOString();
  out.result = 'FAIL';
  out.error = error instanceof Error ? error.stack : String(error);
  fs.writeFileSync(`${dir}/${probe}.json`, JSON.stringify(out, null, 2) + '\n');
  appendSummary('FAIL', error instanceof Error ? error.message : String(error));
  console.log(JSON.stringify({ probe, result: 'FAIL', error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exitCode = 1;
}
