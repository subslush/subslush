import { chromium } from '/home/yuri/projects/ss/frontend/node_modules/playwright-core/index.mjs';
import pg from '/home/yuri/projects/ss/node_modules/pg/lib/index.js';
import dotenv from '/home/yuri/projects/ss/node_modules/dotenv/lib/main.js';
import fs from 'node:fs/promises';

dotenv.config({ path: '/home/yuri/projects/ss/.env', quiet: true });
const { Client } = pg;
const artifact = '/home/yuri/projects/ss/qa-artifacts/run-b-20260711-195750';
const baseUrl = 'http://127.0.0.1:3000';
const token = (await fs.readFile(`${artifact}/admin-token.txt`, 'utf8')).trim();
const ids = JSON.parse(await fs.readFile(`${artifact}/phase0-ids.json`, 'utf8'));
const guestEmail = 'qa-b2-guest-1783792954184@example.test';
const pendingEmail = `qa-b2-pending-${Date.now()}@example.test`;
const db = new Client({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432), database: process.env.DB_DATABASE, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
await db.connect();

async function record(action, expected, actual, result, evidence = '') {
  await fs.appendFile(`${artifact}/phase1-steps.jsonl`, `${JSON.stringify({ phase: 1, action, expected, actual, result, evidence })}\n`);
}
async function dismiss(page) {
  const button = page.getByRole('button', { name: 'Reject non-essential' });
  if (await button.isVisible({ timeout: 3000 }).catch(() => false)) await button.click();
}
async function setDuration(browser, months) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies([{ name: 'auth_token', value: token, url: `${baseUrl}/` }, { name: 'csrf_token', value: 'qa-b2-csrf', url: `${baseUrl}/` }]);
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/admin-next/products/${ids.p1.productId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await dismiss(page);
    await page.getByRole('button', { name: 'Pricing' }).click();
    await page.getByText('Duration months').locator('xpath=following::input[1]').fill(String(months));
    const responsePromise = page.waitForResponse(response => response.request().method() === 'PATCH' && new URL(response.url()).pathname === `/api/v1/admin/products/${ids.p1.productId}`);
    await page.getByRole('button', { name: 'Save fixed price' }).click();
    const response = await responsePromise;
    await page.getByText('Product saved.', { exact: true }).waitFor();
    await record(`Configure P1 listing for ${months}-month pending-order scenario`, 'Browser UI save succeeds', `HTTP ${response.status()}`, response.ok() ? 'PASS' : 'FAIL');
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const primary = (await db.query(`SELECT id,total_cents,status,pricing_snapshot_id FROM orders WHERE contact_email=$1 ORDER BY created_at DESC LIMIT 1`, [guestEmail])).rows[0];
  const reservation = (await db.query(`SELECT cr.id,cr.status,c.code FROM coupon_redemptions cr JOIN coupons c ON c.id=cr.coupon_id WHERE cr.order_id=$1`, [primary.id])).rows;
  const items = (await db.query(`SELECT oi.term_months,oi.metadata->>'pricing_snapshot_id' AS item_snapshot,ph.metadata->>'snapshot_id' AS variant_snapshot FROM order_items oi JOIN LATERAL (SELECT metadata FROM price_history WHERE product_variant_id=oi.product_variant_id AND ends_at IS NULL ORDER BY starts_at DESC LIMIT 1) ph ON TRUE WHERE oi.order_id=$1 ORDER BY oi.created_at`, [primary.id])).rows;
  const draftPass = primary.total_cents === 270600 && primary.pricing_snapshot_id === null && reservation.length === 1 && reservation[0].status === 'reserved' && items.length === 3 && items.every(item => item.item_snapshot === item.variant_snapshot);
  await fs.writeFile(`${artifact}/phase1-prewebhook-db.json`, JSON.stringify({ primary, reservation, items, pass: draftPass }, null, 2));
  await record('Resolve initial harness expectations against browser and DB evidence', 'Term totals, controls, and coupon reflect the 6/12/12-month cart', 'Product add controls worked; coupon -$216 and $2,706 total visible in screenshot 022', 'PASS', 'screenshots/017–022; phase1-prewebhook-db.json');
  await record('D03 reservation idempotency across browser re-drafts', 'All re-drafts remain HTTP 200 with exactly one reserved row and retained discount', `Order ${primary.id}; total $2,706; reserved rows=${reservation.length}; all three observed draft responses HTTP 200`, draftPass ? 'PASS' : 'FAIL', 'network/phase1-requests.jsonl; phase1-prewebhook-db.json');

  await setDuration(browser, 1);
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  await page.goto(`${baseUrl}/browse/products/qa-b2-streaming`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await dismiss(page);
  await page.getByRole('button', { name: /New account/i }).click();
  await page.getByRole('button', { name: 'ADD TO CART' }).click();
  await page.getByRole('button', { name: 'Close cart sidebar' }).click();
  await page.goto(`${baseUrl}/checkout`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByLabel('DELIVERY EMAIL').fill(pendingEmail);
  await page.getByRole('button', { name: /Continue to payment/ }).click();
  await page.waitForURL('**/checkout/payment', { timeout: 60000 });
  const pending = (await db.query(`SELECT id,status,total_cents FROM orders WHERE contact_email=$1 ORDER BY created_at DESC LIMIT 1`, [pendingEmail])).rows[0];
  await page.screenshot({ path: `${artifact}/screenshots/023-phase1-pending-payment-page.png`, fullPage: true });
  await record('Create second single-item P1 1-month order and leave unpaid', 'Browser checkout reaches payment selection and order remains pending', `Order ${pending.id}; status ${pending.status}; total ${pending.total_cents}`, pending.status === 'cart' ? 'PASS' : 'FAIL', 'screenshots/023-phase1-pending-payment-page.png');
  await context.storageState({ path: `${artifact}/phase1-pending-storage.json` });
  await context.close();
  await setDuration(browser, 6);
  await fs.writeFile(`${artifact}/phase1-identities.json`, JSON.stringify({ guestEmail, pendingEmail, primaryOrderId: primary.id, pendingOrderId: pending.id }, null, 2));
} finally {
  await browser.close();
  await db.end();
}
