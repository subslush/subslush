import { createHmac } from 'node:crypto';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { Client } from 'pg';

dotenv.config({ path: '.env', quiet: true });
const base = 'http://127.0.0.1:3104/api/v1';
const run = `QA-A1-${Date.now()}`;
const out = { run, steps: [], statuses: {}, ids: {} };
const adminToken = jwt.sign({ userId: 'c0dac6b4-c082-4fb6-9cd2-b6bc154160e2', email: 'qa-admin-1768522228@example.test', role: 'admin' }, process.env.JWT_SECRET, { algorithm: process.env.JWT_ALGORITHM || 'HS256', expiresIn: '30m', issuer: 'subscription-platform', audience: 'subscription-platform-users' });
const tokenFor = user => jwt.sign({ userId: user.id, email: user.email, role: user.role || 'user' }, process.env.JWT_SECRET, { algorithm: process.env.JWT_ALGORITHM || 'HS256', expiresIn: '30m', issuer: 'subscription-platform', audience: 'subscription-platform-users' });
async function req(path, { method = 'GET', body, token = null, headers = {} } = {}) {
  const response = await fetch(`${base}${path}`, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { cookie: `auth_token=${token}; csrf_token=qa-csrf`, 'x-csrf-token': 'qa-csrf' } : {}), ...headers }, ...(body ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) });
  const text = await response.text(); let json; try { json = JSON.parse(text); } catch { json = null; }
  return { status: response.status, text, json, headers: Object.fromEntries(response.headers.entries()) };
}
const data = r => r.json?.data ?? r.json;
function record(name, r) { out.statuses[name] = { status: r.status, body: r.json }; return r; }
async function db(sql, values = []) { const c = new Client({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432), database: process.env.DB_DATABASE, user: process.env.DB_USER, password: process.env.DB_PASSWORD }); await c.connect(); try { return (await c.query(sql, values)).rows; } finally { await c.end(); } }
async function register(label) { const email = `${run.toLowerCase()}-${label}@example.test`; const r = record(`register-${label}`, await req('/auth/register', { method: 'POST', body: { email, password: 'QaPassword!123', firstName: 'QA', lastName: label } })); if (![200, 201, 202].includes(r.status)) throw new Error(`register ${label}: ${r.status}`); return { ...data(r).user, email, role: 'user' }; }
async function main() {
  const a = await register('a'); const b = await register('b'); const tokenA = tokenFor(a), tokenB = tokenFor(b); out.ids.user_a = a.id; out.ids.user_b = b.id;
  const product = data(record('product', await req('/admin/products', { method: 'POST', token: adminToken, body: { name: `${run} Strict Product`, slug: `${run.toLowerCase()}-strict-product`, service_type: 'qa_a1', default_currency: 'USD', status: 'inactive', metadata: { upgrade_options: { strict_rules_text: `${run} rules`, manual_monthly_upgrade: false, activation_handshake: true, activation_instructions_template: `${run} instructions` } } } }))); out.ids.product = product.id;
  const variant = data(record('variant', await req('/admin/product-variants', { method: 'POST', token: adminToken, body: { product_id: product.id, name: `${run} Variant`, variant_code: `${run}-V`, service_plan: 'qa', is_active: true } }))); out.ids.variant = variant.id;
  record('term', await req('/admin/product-variant-terms', { method: 'POST', token: adminToken, body: { product_variant_id: variant.id, months: 6, discount_percent: 0, is_active: true } }));
  const price = data(record('price', await req('/admin/price-history/current', { method: 'POST', token: adminToken, body: { product_variant_id: variant.id, price_cents: 1000, currency: 'USD', end_previous: true } }))); out.ids.price = price.id ?? price.price_history_id;
  record('activate-product', await req(`/admin/products/${product.id}`, { method: 'PATCH', token: adminToken, body: { status: 'active' } }));
  out.price_snapshot = await db(`SELECT ph.id, ph.metadata->>'snapshot_id' AS snapshot_id, ppr.status AS publish_status FROM price_history ph LEFT JOIN pricing_publish_runs ppr ON ppr.id = (ph.metadata->>'snapshot_id')::uuid WHERE ph.product_variant_id=$1 ORDER BY ph.starts_at DESC LIMIT 1`, [variant.id]);
  const registeredIdentity = record('identity-registered-email', await req('/checkout/identity', { method: 'POST', body: { email: a.email } }));
  const unregisteredEmail = `${run.toLowerCase()}-unregistered@example.test`;
  const unregisteredIdentity = record('identity-unregistered-email', await req('/checkout/identity', { method: 'POST', body: { email: unregisteredEmail } }));
  out.enumeration = { raw_byte_equal: registeredIdentity.text === unregisteredIdentity.text, normalized_shape_equal: registeredIdentity.text.replace(/[0-9a-f-]{36}/gi, '<uuid>') === unregisteredIdentity.text.replace(/[0-9a-f-]{36}/gi, '<uuid>') };
  const guestIdentityId = data(registeredIdentity).guest_identity_id; out.ids.guest_identity = guestIdentityId;
  const draft = data(record('guest-draft', await req('/checkout/draft', { method: 'POST', body: { guest_identity_id: guestIdentityId, contact_email: a.email, currency: 'USD', items: [{ variant_id: variant.id, term_months: 6, auto_renew: false }] } }))); out.ids.order = draft.order_id;
  const webhook = JSON.stringify({ id: `evt_${run}`, object: 'event', type: 'checkout.session.completed', data: { object: { id: `cs_${run}`, object: 'checkout.session', payment_intent: `pi_${run}`, amount_total: draft.pricing.order_total_cents, currency: 'usd', metadata: { order_id: draft.order_id } } } });
  const t = Math.floor(Date.now()/1000); const sig = createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET).update(`${t}.${webhook}`).digest('hex');
  record('stripe-webhook', await req('/payments/stripe/webhook', { method: 'POST', body: webhook, headers: { 'content-type': 'application/json', 'stripe-signature': `t=${t},v1=${sig}` } }));
  const orderFile = data(record('admin-order-file', await req(`/admin/next/orders/${draft.order_id}`, { token: adminToken }))); const item = orderFile.items?.[0] ?? orderFile.order?.items?.[0]; const subId = item?.subscription_id ?? item?.subscriptionId; if (!subId) throw new Error('paid fixture lacks subscription'); out.ids.subscription = subId;
  record('credentials-save', await req(`/admin/subscriptions/${subId}/credentials`, { method: 'POST', token: adminToken, body: { credentials: `${run}-PLAINTEXT-CREDENTIAL`, reason: 'QA fixture' } }));
  record('deliver', await req(`/admin/orders/${draft.order_id}/items/${subId}/deliver`, { method: 'POST', token: adminToken, body: { reason: 'QA fixture delivery' } }));
  out.after_delivery = await db(`SELECT o.status AS order_status, s.status AS subscription_status, s.credentials_encrypted, gi.user_id AS guest_user_id FROM orders o JOIN subscriptions s ON s.order_id=o.id LEFT JOIN guest_identities gi ON gi.id=o.guest_identity_id WHERE o.id=$1`, [draft.order_id]);
  const counts = await db(`SELECT (SELECT count(*) FROM credential_reveal_audit_logs WHERE subscription_id=$1) AS reveal_audit, (SELECT count(*) FROM order_compliance_evidence_logs WHERE order_id=$2) AS evidence`, [subId, draft.order_id]); out.before_idor_counts = counts[0];
  record('idor-reveal-b', await req(`/orders/${draft.order_id}/items/${subId}/reveal`, { method: 'POST', token: tokenB, body: {} }));
  record('idor-accept-b', await req(`/orders/${draft.orderId || draft.order_id}/items/${subId}/accept-rules`, { method: 'POST', token: tokenB, body: { confirmed: true } }));
  record('idor-ready-b', await req(`/orders/${draft.order_id}/items/${subId}/activation-ready`, { method: 'POST', token: tokenB, body: { confirmed: true } }));
  out.after_idor_counts = (await db(`SELECT (SELECT count(*) FROM credential_reveal_audit_logs WHERE subscription_id=$1) AS reveal_audit, (SELECT count(*) FROM order_compliance_evidence_logs WHERE order_id=$2) AS evidence`, [subId, draft.order_id]))[0];
  for (const [name,path] of Object.entries({ unauth_admin_next:'/admin/next/orders', customer_admin_next:'/admin/next/orders', unauth_deliver:`/admin/orders/${draft.order_id}/items/${subId}/deliver`, customer_deliver:`/admin/orders/${draft.order_id}/items/${subId}/deliver`, customer_instructions:`/admin/orders/${draft.order_id}/items/${subId}/activation-instructions`, customer_link:`/admin/orders/${draft.order_id}/items/${subId}/activation-link`, customer_restart:`/admin/orders/${draft.order_id}/items/${subId}/activation-restart` })) { const customer = name.startsWith('customer_'); record(name, await req(path, { method: path.includes('/deliver') || path.includes('activation-') ? 'POST' : 'GET', token: customer ? tokenB : null, body: path.includes('/deliver') ? { reason:'x' } : path.includes('instructions') ? { instructions:'x' } : undefined })); }
}
main().then(() => console.log(JSON.stringify(out, null, 2))).catch(error => { out.error = error.stack || String(error); console.log(JSON.stringify(out, null, 2)); process.exitCode = 1; });
