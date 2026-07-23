import fs from 'node:fs';
import { createHmac } from 'node:crypto';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { Client } from 'pg';
dotenv.config({ path: '.env', quiet: true });
const prev = JSON.parse(fs.readFileSync('qa-artifacts/run-a-final-20260711-000239/live-probes.json'));
const base = 'http://127.0.0.1:3104/api/v1'; const tag = `${prev.tag}-R`; const out = { tag, steps: {} };
const admin = jwt.sign({ userId: 'c0dac6b4-c082-4fb6-9cd2-b6bc154160e2', email: 'qa-admin-1768522228@example.test', role: 'admin' }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '30m', issuer: 'subscription-platform', audience: 'subscription-platform-users' });
const userToken = user => jwt.sign({ userId: user.id, email: user.email, role: 'user' }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '30m', issuer: 'subscription-platform', audience: 'subscription-platform-users' });
async function request(path, { method = 'GET', body, token, headers = {} } = {}) { const r = await fetch(base + path, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { cookie: `auth_token=${token}; csrf_token=qa`, 'x-csrf-token': 'qa' } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) }); const text = await r.text(); let json; try { json = JSON.parse(text); } catch {} return { status: r.status, json }; }
const data = r => r.json?.data ?? r.json; const step = (name, r) => (out.steps[name] = { status: r.status, body: r.json }, r);
async function db(sql, values = []) { const c = new Client({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432), database: process.env.DB_DATABASE, user: process.env.DB_USER, password: process.env.DB_PASSWORD }); await c.connect(); try { return (await c.query(sql, values)).rows; } finally { await c.end(); } }
async function register(email) { const r = step(`register-${email}`, await request('/auth/register', { method: 'POST', body: { email, password: 'QaPassword!123', firstName: 'QA', lastName: 'A1' } })); return data(r).user; }
async function draft(email, couponCode) { const identity = data(step(`identity-${email}`, await request('/checkout/identity', { method: 'POST', body: { email } }))); return data(step(`draft-${email}`, await request('/checkout/draft', { method: 'POST', body: { guest_identity_id: identity.guest_identity_id, contact_email: email, currency: 'USD', items: [{ variant_id: prev.ids.variant, term_months: 6, auto_renew: false }], ...(couponCode ? { coupon_code: couponCode } : {}) } }))); }
async function webhook(orderId) { const file = data(await request(`/admin/next/orders/${orderId}`, { token: admin })); const amount = file.order.total_cents; const raw = JSON.stringify({ id: `evt_${orderId}`, object: 'event', type: 'checkout.session.completed', data: { object: { id: `cs_${orderId}`, object: 'checkout.session', payment_intent: `pi_${orderId}`, amount_total: amount, currency: 'usd', metadata: { order_id: orderId } } } }); const ts = Math.floor(Date.now() / 1000); const sig = createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET).update(`${ts}.${raw}`).digest('hex'); return step(`webhook-${orderId}`, await request('/payments/stripe/webhook', { method: 'POST', body: JSON.parse(raw), headers: { 'stripe-signature': `t=${ts},v1=${sig}` } })); }
async function main() {
  const user = await register(`${tag.toLowerCase()}-manual@example.test`);
  const checkout = step('pending-checkout', await request('/payments/checkout', { method: 'POST', token: userToken(user), body: { variant_id: prev.ids.variant, duration_months: 6, payment_method: 'card', auto_renew: false, currency: 'USD' } }));
  let orderId = data(checkout).order_id; if (!orderId) orderId = (await db("SELECT o.id FROM orders o JOIN users u ON u.id=o.user_id WHERE u.email=$1 AND o.status='pending_payment' ORDER BY o.created_at DESC LIMIT 1", [user.email]))[0]?.id;
  out.manual_order = orderId;
  step('mark-paid-empty', await request(`/admin/orders/${orderId}/mark-paid`, { method: 'POST', token: admin, body: { note: '' } }));
  step('mark-paid-success', await request(`/admin/orders/${orderId}/mark-paid`, { method: 'POST', token: admin, body: { note: 'QA-A1 provider verification' } }));
  step('mark-paid-again', await request(`/admin/orders/${orderId}/mark-paid`, { method: 'POST', token: admin, body: { note: 'again' } }));
  out.manual_state = await db("SELECT o.status,(SELECT count(*) FROM admin_tasks t WHERE t.order_id=o.id)::int tasks FROM orders o WHERE o.id=$1", [orderId]);
  const coupon = `${tag}-CAP1`; step('coupon-create', await request('/admin/coupons', { method: 'POST', token: admin, body: { code: coupon, percent_off: 10, scope: 'global', apply_scope: 'highest_eligible_item', status: 'active', max_redemptions: 1 } }));
  const one = await draft(`${tag.toLowerCase()}-coupon@example.test`, coupon); const two = await draft(`${tag.toLowerCase()}-coupon-2@example.test`, coupon); out.coupon_drafts = { one, two };
  out.coupon_before = await db('SELECT status,count(*)::int n FROM coupon_redemptions WHERE order_id=$1 GROUP BY status', [one.order_id]); await webhook(one.order_id); out.coupon_after = await db('SELECT status,count(*)::int n FROM coupon_redemptions WHERE order_id=$1 GROUP BY status', [one.order_id]);
  console.log(JSON.stringify(out, null, 2));
}
main().catch(error => { out.error = error.stack; console.log(JSON.stringify(out, null, 2)); process.exitCode = 1; });
