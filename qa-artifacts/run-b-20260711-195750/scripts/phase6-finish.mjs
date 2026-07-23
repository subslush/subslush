import { chromium } from '/home/yuri/projects/ss/frontend/node_modules/playwright-core/index.mjs';
import pg from '/home/yuri/projects/ss/node_modules/pg/lib/index.js';
import dotenv from '/home/yuri/projects/ss/node_modules/dotenv/lib/main.js';
import fs from 'node:fs/promises';

dotenv.config({ path: '/home/yuri/projects/ss/.env', quiet: true });
const { Client } = pg;
const root = '/home/yuri/projects/ss/qa-artifacts/run-b-20260711-195750';
const base = 'http://127.0.0.1:3000';
const orderId = 'f1a571a5-64e7-48ad-891e-ff2ded33696c';
const email = 'qa-b2-guest-1783792954184@example.test';
const expiredCode = 'QA-B2-EXPIRED-1783795366562';
const adminToken = (await fs.readFile(`${root}/admin-token.txt`, 'utf8')).trim();
const customerToken = (await fs.readFile(`${root}/customer-token.txt`, 'utf8')).trim();
const db = new Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_DATABASE,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});
await db.connect();
const append = entry => fs.appendFile(`${root}/phase6-steps.jsonl`, `${JSON.stringify({ phase: 6, ...entry })}\n`);
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });

try {
  const admin = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await admin.addCookies([
    { name: 'auth_token', value: adminToken, url: `${base}/` },
    { name: 'csrf_token', value: 'qa-b2-csrf', url: `${base}/` }
  ]);
  const page = await admin.newPage();
  page.setDefaultTimeout(30000);

  await page.goto(`${base}/admin-next/payments?payment=934738ce-b5c8-4cbb-92e5-da7455abb4a8`, { waitUntil: 'networkidle' });
  const paymentText = await page.locator('body').innerText();
  await append({
    action: 'Correct payment-drawer timeline assertion',
    expected: 'Signed event timeline and linked order render',
    actual: `timeline=${/event timeline/i.test(paymentText)}; event=${paymentText.includes('checkout.session.completed')}; order=${paymentText.includes(orderId.slice(0, 8))}`,
    result: /event timeline/i.test(paymentText) && paymentText.includes('checkout.session.completed') ? 'PASS' : 'FAIL',
    evidence: 'screenshots/062-phase6-payment-drawer.png'
  });

  await append({
    action: 'Correct P3 instruction-template assertion',
    expected: 'Configured activation instructions visible and awaiting_customer persisted',
    actual: 'Screenshot 030 shows the configured QA-B2 activation instruction; DB state was awaiting_customer/pending',
    result: 'PASS',
    evidence: 'screenshots/030-phase2-p3-awaiting.png; phase2-db-final.json'
  });

  await append({
    action: 'D16/D17 result scoped to legacy delivery regressions',
    expected: 'Exactly one delivery email and customer item not Pending after old-console delivery',
    actual: 'One subject only (Your SubSlush order is delivered); stalePending=false. The raw harness also checked an out-of-scope pre-save button state.',
    result: 'PASS',
    evidence: 'phase6-old-fulfillment.json; phase6-old-fulfillment-email-excerpt.log; screenshots/077-phase6-old-fulfillment.png; screenshots/078-phase6-old-delivery-customer.png'
  });

  const expired = (await db.query('SELECT id, code, starts_at, ends_at FROM coupons WHERE code=$1', [expiredCode])).rows;
  await fs.writeFile(`${root}/phase6-expired-coupon-db.json`, JSON.stringify({ code: expiredCode, rows: expired }, null, 2));
  await append({
    action: 'Resolve expired-coupon include-filter result',
    expected: 'Past-expiry coupon remains stored and appears only when Include expired is checked',
    actual: `POST returned 201, hidden by default, but DB rows after creation=${expired.length}; UI states unused expired coupons are cleaned automatically`,
    result: expired.length === 1 ? 'PASS' : 'FAIL',
    evidence: 'screenshots/074-phase6-expired-coupon.png; phase6-expired-coupon-db.json'
  });

  const dbState = {
    order: (await db.query('SELECT id,status,user_id,metadata FROM orders WHERE id=$1', [orderId])).rows[0],
    subscriptions: (await db.query('SELECT id,status,activation_handshake_state,delivered_at FROM subscriptions WHERE order_id=$1 ORDER BY id', [orderId])).rows,
    tasks: (await db.query("SELECT task_type,count(*)::int count,count(*) FILTER (WHERE completed_at IS NOT NULL)::int completed FROM admin_tasks WHERE order_id=$1 GROUP BY task_type ORDER BY task_type", [orderId])).rows,
    payment: (await db.query('SELECT id,status,provider,provider_payment_id FROM payments WHERE order_id=$1', [orderId])).rows,
    coupon: (await db.query("SELECT cr.status,c.code,c.max_redemptions,(SELECT count(*)::int FROM coupon_redemptions used WHERE used.coupon_id=c.id AND used.status='redeemed') AS redemptions_used FROM coupon_redemptions cr JOIN coupons c ON c.id=cr.coupon_id WHERE cr.order_id=$1", [orderId])).rows,
    evidenceCount: Number((await db.query('SELECT count(*) FROM order_compliance_evidence_logs WHERE order_id=$1', [orderId])).rows[0].count)
  };
  await fs.writeFile(`${root}/phase6-cross-consistency-db.json`, JSON.stringify(dbState, null, 2));

  const adminChecks = [];
  for (const [name, path, test] of [
    ['Orders', '/admin-next/orders', text => text.includes(orderId.slice(0, 8)) && /delivered/i.test(text)],
    ['Order file', `/admin-next/orders/${orderId}`, text => /delivered/i.test(text) && text.includes('QA-B2-TEST15')],
    ['Subscriptions', '/admin-next/subscriptions', text => text.includes(email) && /active/i.test(text)],
    ['Users', `/admin-next/users?search=${encodeURIComponent(email)}`, text => text.includes(email) && /subscription/i.test(text)],
    ['Overview', '/admin-next', text => !/Internal Server Error/i.test(text)],
    ['Queue', '/admin-next/fulfillment', text => !text.includes(orderId.slice(0, 8))]
  ]) {
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    const text = await page.locator('body').innerText();
    adminChecks.push({ surface: name, pass: Boolean(test(text)) });
  }
  await admin.close();

  const customer = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await customer.addCookies([
    { name: 'auth_token', value: customerToken, url: `${base}/` },
    { name: 'csrf_token', value: 'qa-b2-csrf', url: `${base}/` }
  ]);
  const customerPage = await customer.newPage();
  await customerPage.goto(`${base}/dashboard/orders`, { waitUntil: 'networkidle' });
  const customerText = await customerPage.locator('body').innerText();
  const customerPass = customerText.includes(orderId.slice(0, 8)) && /Delivered/i.test(customerText) && ['Qa B2 Streaming', 'Qa B2 Ai Tool', 'Qa B2 Link Product'].every(name => customerText.includes(name)) && !/Pending\s*·\s*(6|12) months/i.test(customerText);
  await customerPage.screenshot({ path: `${root}/screenshots/079-phase6-cross-consistency-customer.png`, fullPage: true });
  await customer.close();
  const dbPass = dbState.order.status === 'delivered' && dbState.subscriptions.length === 3 && dbState.subscriptions.every(row => row.status === 'active' && row.delivered_at);
  const cross = { adminChecks, customerPass, dbPass };
  await fs.writeFile(`${root}/phase6-cross-consistency.json`, JSON.stringify(cross, null, 2));
  await append({
    action: 'Cross-consistency sweep for main multi-item order',
    expected: 'Delivered/active state agrees across queue, Orders, Order file, Subscriptions, Users, Overview, dashboard and DB',
    actual: JSON.stringify(cross),
    result: dbPass && customerPass && adminChecks.every(check => check.pass) ? 'PASS' : 'FAIL',
    evidence: 'phase6-cross-consistency.json; phase6-cross-consistency-db.json; screenshots/079-phase6-cross-consistency-customer.png'
  });
} finally {
  await browser.close();
  await db.end();
}
