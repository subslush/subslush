import { chromium } from '/home/yuri/projects/ss/frontend/node_modules/playwright-core/index.mjs';
import pg from '/home/yuri/projects/ss/node_modules/pg/lib/index.js';
import dotenv from '/home/yuri/projects/ss/node_modules/dotenv/lib/main.js';
import fs from 'node:fs/promises';

dotenv.config({ path: '/home/yuri/projects/ss/.env', quiet: true });
const { Client } = pg;
const artifact = '/home/yuri/projects/ss/qa-artifacts/run-b-20260711-195750';
const orderId = 'f1a571a5-64e7-48ad-891e-ff2ded33696c';
const p3Id = '3d147a02-f654-40dc-9c88-661d8a483ca7';
const token = (await fs.readFile(`${artifact}/admin-token.txt`, 'utf8')).trim();
const db = new Client({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432), database: process.env.DB_DATABASE, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
await db.connect();
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addCookies([{ name: 'auth_token', value: token, url: 'http://127.0.0.1:3000/' }, { name: 'csrf_token', value: 'qa-b2-csrf', url: 'http://127.0.0.1:3000/' }]);
const page = await context.newPage();
page.setDefaultTimeout(20000);
try {
  await page.goto(`http://127.0.0.1:3000/admin-next/fulfillment/orders/${orderId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const consent = page.getByRole('button', { name: 'Reject non-essential' });
  if (await consent.isVisible({ timeout: 3000 }).catch(() => false)) await consent.click();
  const p3 = page.locator(`[id="${p3Id}"]`);
  const initial = await p3.innerText();
  const responsePromise = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === `/api/v1/admin/orders/${orderId}/items/${p3Id}/activation-instructions`);
  await p3.getByRole('button', { name: 'Deliver instructions' }).click();
  const response = await responsePromise;
  await page.getByText(/Awaiting customer\. Instructions sent/).waitFor();
  const state = (await db.query('SELECT activation_handshake_state,status FROM subscriptions WHERE id=$1', [p3Id])).rows[0];
  const pass = response.ok() && initial.includes('QA-B2 custom instructions') && state.activation_handshake_state === 'awaiting_customer' && state.status !== 'active';
  await page.screenshot({ path: `${artifact}/screenshots/030-phase2-p3-awaiting.png`, fullPage: true });
  await fs.appendFile(`${artifact}/phase2-steps.jsonl`, `${JSON.stringify({ phase: 2, action: 'P3 deliver custom activation instructions', expected: 'Custom template; awaiting_customer; not delivered', actual: `HTTP ${response.status()}; template=${initial.includes('QA-B2 custom instructions')}; DB=${JSON.stringify(state)}`, result: pass ? 'PASS' : 'FAIL', evidence: 'screenshots/030-phase2-p3-awaiting.png' })}\n`);
  const finalOrder = (await db.query(`SELECT o.status,(SELECT count(*) FROM subscriptions s WHERE s.order_id=o.id AND s.delivered_at IS NOT NULL) delivered FROM orders o WHERE o.id=$1`, [orderId])).rows[0];
  await fs.writeFile(`${artifact}/phase2-db-final.json`, JSON.stringify(finalOrder, null, 2));
  if (!pass) process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
  await db.end();
}
