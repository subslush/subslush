import { chromium } from '/home/yuri/projects/ss/frontend/node_modules/playwright-core/index.mjs';
import pg from '/home/yuri/projects/ss/node_modules/pg/lib/index.js';
import dotenv from '/home/yuri/projects/ss/node_modules/dotenv/lib/main.js';
import fs from 'node:fs/promises';
dotenv.config({ path: '/home/yuri/projects/ss/.env', quiet: true });
const { Client } = pg;
const root = '/home/yuri/projects/ss/qa-artifacts/run-b-20260711-195750';
const token = (await fs.readFile(`${root}/admin-token.txt`, 'utf8')).trim();
const newsletterEmail = 'qa-b2-newsletter-1783795328754@example.test';
const expiryOrder = 'bcc2a101-e19d-4ba3-927d-a727d2f96435';
const expiryPayment = '4c1d0dc4-1a9e-438e-ae3b-3613edc63c02';
const mainOrder = 'f1a571a5-64e7-48ad-891e-ff2ded33696c';
const db = new Client({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432), database: process.env.DB_DATABASE, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
await db.connect();
const newsletter = (await db.query(`SELECT ns.email,c.code,c.starts_at,c.ends_at,(SELECT count(*)::int FROM coupon_redemptions cr WHERE cr.coupon_id=c.id AND cr.status='redeemed') redeemed FROM newsletter_subscriptions ns LEFT JOIN coupons c ON c.id=ns.coupon_id WHERE ns.email=$1 ORDER BY c.created_at DESC NULLS LAST LIMIT 1`, [newsletterEmail])).rows[0] ?? null;
const expiry = {
  order: (await db.query('SELECT id,status FROM orders WHERE id=$1', [expiryOrder])).rows[0],
  payment: (await db.query('SELECT id,status,provider,created_at FROM payments WHERE id=$1', [expiryPayment])).rows[0],
  redemption: (await db.query('SELECT status FROM coupon_redemptions WHERE order_id=$1', [expiryOrder])).rows[0] ?? null,
  succeededControl: (await db.query('SELECT o.status order_status,p.status payment_status FROM orders o JOIN payments p ON p.order_id=o.id WHERE o.id=$1 AND p.status=$2', [mainOrder, 'succeeded'])).rows[0]
};
await fs.writeFile(`${root}/phase6-expiry-results.json`, JSON.stringify(expiry, null, 2));
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies([{ name: 'auth_token', value: token, url: 'http://127.0.0.1:3000/' }, { name: 'csrf_token', value: 'qa-b2-csrf', url: 'http://127.0.0.1:3000/' }]);
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:3000/admin-next/coupons', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Newsletter coupons' }).click();
  const text = await page.locator('body').innerText();
  await page.screenshot({ path: `${root}/screenshots/080-phase6-newsletter-admin.png`, fullPage: true });
  const newsletterPass = Boolean(newsletter?.code) && text.includes(newsletter.code);
  await fs.writeFile(`${root}/phase6-newsletter-admin.json`, JSON.stringify({ newsletter, visible: newsletterPass }, null, 2));
  await fs.appendFile(`${root}/phase6-steps.jsonl`, `${JSON.stringify({ phase: 6, action: 'Newsletter public subscription and admin statistics', expected: 'HTTP 200, generated coupon/email, and row visible in newsletter tab', actual: `email=${newsletterEmail}; coupon=${newsletter?.code ?? null}; visible=${newsletterPass}`, result: newsletterPass ? 'PASS' : 'FAIL', evidence: 'phase6-newsletter.json; phase6-newsletter-admin.json; screenshots/080-phase6-newsletter-admin.png; email-inventory-lines.log' })}\n`);
  const expiryPass = expiry.order?.status === 'cancelled' && expiry.payment?.status === 'expired' && expiry.redemption?.status === 'voided' && expiry.succeededControl?.payment_status === 'succeeded';
  await fs.appendFile(`${root}/phase6-steps.jsonl`, `${JSON.stringify({ phase: 6, action: 'Antom expiry sweep and succeeded-payment control', expected: 'Pending >72h expires/cancels/voids reservation; succeeded payment untouched', actual: JSON.stringify(expiry), result: expiryPass ? 'PASS' : 'FAIL', evidence: 'logs/phase6-expiry-sweep.log; phase6-expiry-results.json; db-manipulations.log' })}\n`);
  await fs.appendFile(`${root}/phase6-steps.jsonl`, `${JSON.stringify({ phase: 6, action: 'D15 Payop quote enablement and provider attempt', expected: 'Supported FX publication followed by multi-line and legacy quote calls', actual: 'FX fetch/publish succeeded (191 rates, 1460 prices), but Payop rejected the configured external JWT with HTTP 401 Authorization token invalid before a provider-backed quote/session could complete', result: 'BLOCKED_ENVIRONMENT', evidence: 'logs/payop-fx-enablement-initialized.log; backend.log lines 34765–34783 and 35713–35722; simulations.log' })}\n`);
  await context.close();
} finally {
  await browser.close();
  await db.end();
}
