import { chromium } from '/home/yuri/projects/ss/frontend/node_modules/playwright-core/index.mjs';
import pg from '/home/yuri/projects/ss/node_modules/pg/lib/index.js';
import dotenv from '/home/yuri/projects/ss/node_modules/dotenv/lib/main.js';
import fs from 'node:fs/promises';

dotenv.config({ path: '/home/yuri/projects/ss/.env', quiet: true });
const { Client } = pg;
const artifact = '/home/yuri/projects/ss/qa-artifacts/run-b-20260711-195750';
const baseUrl = 'http://127.0.0.1:3000';
const orderId = 'f1a571a5-64e7-48ad-891e-ff2ded33696c';
const pendingOrderId = '42066d1e-be37-4fe9-97b7-7237017e7697';
const subs = { p1: 'e8618e2c-37a0-4661-bfe1-995125820b7b', p2: 'e869bdd6-d17e-49a2-a602-964dbec01785', p3: '3d147a02-f654-40dc-9c88-661d8a483ca7' };
const token = (await fs.readFile(`${artifact}/admin-token.txt`, 'utf8')).trim();
let shot = 23;
const record = async (action, expected, actual, result, evidence = '') => fs.appendFile(`${artifact}/phase2-steps.jsonl`, `${JSON.stringify({ phase: 2, action, expected, actual, result, evidence })}\n`);
const snap = async (page, name) => { const p = `screenshots/${String(++shot).padStart(3, '0')}-phase2-${name}.png`; await page.screenshot({ path: `${artifact}/${p}`, fullPage: true }); return p; };
const db = new Client({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432), database: process.env.DB_DATABASE, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
await db.connect();
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, recordHar: { path: `${artifact}/network/phase2.har`, mode: 'full', content: 'embed' } });
await context.addCookies([{ name: 'auth_token', value: token, url: `${baseUrl}/` }, { name: 'csrf_token', value: 'qa-b2-csrf', url: `${baseUrl}/` }]);
const page = await context.newPage();
page.setDefaultTimeout(20000);
try {
  await page.goto(`${baseUrl}/admin-next`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const consent = page.getByRole('button', { name: 'Reject non-essential' });
  if (await consent.isVisible({ timeout: 3000 }).catch(() => false)) await consent.click();
  const overview = await page.locator('body').innerText();
  const overviewPass = overview.includes(orderId.slice(0, 8)) && !overview.includes(pendingOrderId.slice(0, 8)) && /Needs fulfillment/i.test(overview);
  await record('Overview KPI and feeds', 'Paid order shown, pending order absent, Needs fulfillment present', overviewPass ? 'Paid QA-B2 order visible; pending ID absent' : 'Expected overview state mismatch', overviewPass ? 'PASS' : 'FAIL', await snap(page, 'overview'));

  await page.goto(`${baseUrl}/admin-next/fulfillment`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const queue = await page.locator('body').innerText();
  const queuePass = queue.includes(orderId.slice(0, 8)) && !queue.includes(pendingOrderId.slice(0, 8)) && queue.includes('0 of 3') && queue.includes('Own account') && queue.includes('Strict rules') && queue.includes('Activation link');
  await record('Fulfillment queue grouped multi-item order', 'One grouped order, 3 method rows, guest/paid, 0 of 3; unpaid absent', queuePass ? 'All required queue text visible and pending order absent' : 'Queue fields missing', queuePass ? 'PASS' : 'FAIL', await snap(page, 'queue'));

  await page.goto(`${baseUrl}/admin-next/fulfillment/orders/${orderId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const detailText = await page.locator('body').innerText();
  await record('Fulfillment detail payment banner', 'Green auto-verified Stripe webhook banner', detailText.includes('Payment verified automatically via stripe webhook') ? 'Verified Stripe banner visible' : 'Banner absent', detailText.includes('Payment verified automatically via stripe webhook') ? 'PASS' : 'FAIL', await snap(page, 'detail-initial'));

  const p1 = page.locator(`#${subs.p1}`);
  const p1Deliver = p1.getByRole('button', { name: 'Confirm delivery' });
  const initiallyDisabled = await p1Deliver.isDisabled();
  const auditBefore = Number((await db.query(`SELECT count(*) FROM admin_audit_logs WHERE entity_id=$1 AND action='subscriptions.selection_credentials.view'`, [subs.p1])).rows[0].count);
  await p1.getByRole('button', { name: 'Show' }).click();
  await p1.locator('pre', { hasText: 'QA-B2-Own-Pass!123' }).waitFor();
  const auditAfter = Number((await db.query(`SELECT count(*) FROM admin_audit_logs WHERE entity_id=$1 AND action='subscriptions.selection_credentials.view'`, [subs.p1])).rows[0].count);
  await record('P1 audited Show submitted own-account credentials', 'Correct submitted credentials and exactly one audit row per click', `Credentials visible; audit ${auditBefore}→${auditAfter}`, auditAfter === auditBefore + 1 ? 'PASS' : 'FAIL', await snap(page, 'p1-own-show'));
  await p1.getByPlaceholder('Credentials / notes to save on the subscription').fill('QA-B2 P1 fulfilled access: stream-user / StreamPass!123');
  const saveP1 = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === `/api/v1/admin/subscriptions/${subs.p1}/credentials`);
  await p1.getByRole('button', { name: 'Save', exact: true }).click();
  if (!(await saveP1).ok()) throw new Error('P1 save failed');
  await page.getByText('Credentials saved ✓', { exact: true }).waitFor();
  const deliverP1 = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === `/api/v1/admin/orders/${orderId}/items/${subs.p1}/deliver`);
  await page.locator(`#${subs.p1}`).getByRole('button', { name: 'Confirm delivery' }).click();
  if (!(await deliverP1).ok()) throw new Error('P1 delivery failed');
  const p1State = (await db.query(`SELECT s.status,o.status order_status,t.completed_at FROM subscriptions s JOIN orders o ON o.id=s.order_id LEFT JOIN admin_tasks t ON t.subscription_id=s.id WHERE s.id=$1 ORDER BY t.created_at DESC LIMIT 1`, [subs.p1])).rows[0];
  await record('P1 save then per-item deliver', 'Button gated until save; only P1 active, order in_process, task complete', `initiallyDisabled=${initiallyDisabled}; DB=${JSON.stringify(p1State)}`, initiallyDisabled && p1State.status === 'active' && p1State.order_status === 'in_process' && p1State.completed_at ? 'PASS' : 'FAIL', await snap(page, 'p1-delivered'));

  const p2 = page.locator(`#${subs.p2}`);
  const p2Text = await p2.innerText();
  const rulesStrip = p2Text.includes('Strict rules product') && !p2Text.includes('QA-B2 DISTINCTIVE RULES:');
  await p2.getByPlaceholder('Credentials / notes to save on the subscription').fill('QA-B2 P2 fulfilled access: ai-user / AiPass!123');
  const saveP2 = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === `/api/v1/admin/subscriptions/${subs.p2}/credentials`);
  await p2.getByRole('button', { name: 'Save', exact: true }).click();
  if (!(await saveP2).ok()) throw new Error('P2 save failed');
  const deliverP2 = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === `/api/v1/admin/orders/${orderId}/items/${subs.p2}/deliver`);
  await page.locator(`#${subs.p2}`).getByRole('button', { name: 'Confirm delivery' }).click();
  if (!(await deliverP2).ok()) throw new Error('P2 deliver failed');
  const orderAfterP2 = (await db.query('SELECT status FROM orders WHERE id=$1', [orderId])).rows[0].status;
  await record('P2 strict-rules save and per-item deliver', 'Rules strip separate from credential field; item delivered; order remains in_process', `rulesStrip=${rulesStrip}; order=${orderAfterP2}`, rulesStrip && orderAfterP2 === 'in_process' ? 'PASS' : 'FAIL', await snap(page, 'p2-delivered'));

  const p3 = page.locator(`#${subs.p3}`);
  const p3Initial = await p3.innerText();
  const instructionResponse = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === `/api/v1/admin/orders/${orderId}/items/${subs.p3}/activation-instructions`);
  await p3.getByRole('button', { name: 'Deliver instructions' }).click();
  if (!(await instructionResponse).ok()) throw new Error('P3 instruction delivery failed');
  await page.getByText(/Awaiting customer\. Instructions sent/).waitFor();
  const p3Db = (await db.query('SELECT activation_handshake_state,status FROM subscriptions WHERE id=$1', [subs.p3])).rows[0];
  await record('P3 deliver custom activation instructions', 'Stepper starts at 1 with custom template; becomes awaiting_customer and not delivered', `templatePresent=${p3Initial.includes('QA-B2 custom instructions')}; DB=${JSON.stringify(p3Db)}`, p3Initial.includes('QA-B2 custom instructions') && p3Db.activation_handshake_state === 'awaiting_customer' && p3Db.status !== 'active' ? 'PASS' : 'FAIL', await snap(page, 'p3-awaiting'));

  const finalOrder = (await db.query(`SELECT o.status,(SELECT count(*) FROM subscriptions s WHERE s.order_id=o.id AND s.delivered_at IS NOT NULL) delivered FROM orders o WHERE o.id=$1`, [orderId])).rows[0];
  await fs.writeFile(`${artifact}/phase2-db-final.json`, JSON.stringify(finalOrder, null, 2));
} finally {
  await context.close();
  await browser.close();
  await db.end();
}
