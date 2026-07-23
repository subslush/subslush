import { chromium } from '/home/yuri/projects/ss/frontend/node_modules/playwright-core/index.mjs';
import pg from '/home/yuri/projects/ss/node_modules/pg/lib/index.js';
import dotenv from '/home/yuri/projects/ss/node_modules/dotenv/lib/main.js';
import fs from 'node:fs/promises';
dotenv.config({ path: '/home/yuri/projects/ss/.env', quiet: true });
const { Client } = pg;
const a = '/home/yuri/projects/ss/qa-artifacts/run-b-20260711-095147',
  b = 'http://127.0.0.1:3000',
  o = 'b4c15ca5-c4ec-4970-8467-2acd1963da6d',
  s = 'e3242e25-add1-4f3c-9c6a-bdd70126f393',
  email = 'qa-b1-final-1783757806872@example.test',
  pw = 'QA-B1-Claim!123',
  link = 'https://activation.qa-b1.test/token-SECOND-SECRET',
  token = (await fs.readFile(`${a}/admin-token.txt`, 'utf8')).trim();
const db = new Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_DATABASE,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});
await db.connect();
const rec = x =>
  fs.appendFile(
    `${a}/phase3-steps.jsonl`,
    `${JSON.stringify({ phase: 3, ...x })}\n`
  );
const br = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const cus = await br.newContext({
    viewport: { width: 1440, height: 1000 },
    userAgent: 'QA-B1-Chromium-UA/1.0',
  }),
  cp = await cus.newPage();
cp.setDefaultTimeout(30000);
const adm = await br.newContext({ viewport: { width: 1440, height: 1000 } });
await adm.addCookies([
  { name: 'auth_token', value: token, url: `${b}/` },
  { name: 'csrf_token', value: 'qa-b1-csrf', url: `${b}/` },
]);
const ap = await adm.newPage();
ap.setDefaultTimeout(30000);
try {
  await cp.goto(`${b}/auth/login`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  const c = cp.getByRole('button', { name: 'Reject non-essential' });
  if (await c.isVisible({ timeout: 3000 }).catch(() => false)) await c.click();
  await cp.getByLabel('Email address').fill(email);
  await cp.getByLabel('Password', { exact: true }).fill(pw);
  const lp = cp.waitForResponse(
    r => new URL(r.url()).pathname === '/api/v1/auth/login'
  );
  await cp.getByRole('button', { name: /Sign in/i }).click();
  if (!(await lp).ok()) throw new Error('login failed');
  await cp.waitForURL(/\/dashboard/, { timeout: 60000 }).catch(() => {});
  if (!cp.url().includes('/dashboard/orders')) {
    await cp.goto(`${b}/dashboard/orders`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
  }
  const card = cp
    .getByText('Qa B1 Link Product Qa B1 Link Annual (12 months)', {
      exact: true,
    })
    .last()
    .locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');
  await card.getByRole('checkbox').check();
  const ready = cp.waitForResponse(
    r =>
      new URL(r.url()).pathname ===
      `/api/v1/orders/${o}/items/${s}/activation-ready`
  );
  await card.getByRole('button', { name: "I'm ready to activate" }).click();
  const rr = await ready;
  await cp.screenshot({
    path: `${a}/screenshots/045-phase3-second-ready.png`,
    fullPage: true,
  });
  await ap.goto(`${b}/admin-next/fulfillment/orders/${o}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  const ac = ap.getByRole('button', { name: 'Reject non-essential' });
  if (await ac.isVisible({ timeout: 3000 }).catch(() => false))
    await ac.click();
  const ca = ap.locator(`[id="${s}"]`);
  await ca.getByPlaceholder('Activation link').fill(link);
  const del = ap.waitForResponse(
    r =>
      new URL(r.url()).pathname ===
      `/api/v1/admin/orders/${o}/items/${s}/activation-link`
  );
  await ca.getByRole('button', { name: 'Deliver link' }).click();
  const dr = await del;
  const fin = (
    await db.query(
      'SELECT o.status order_status,s.status,activation_handshake_state FROM subscriptions s JOIN orders o ON o.id=s.order_id WHERE s.id=$1',
      [s]
    )
  ).rows[0];
  await ap.screenshot({
    path: `${a}/screenshots/046-phase3-second-link.png`,
    fullPage: true,
  });
  await rec({
    action: 'Second readiness and link delivery in browser',
    expected: 'Customer ready then second link delivered; order delivered',
    actual: `ready HTTP ${rr.status()}; deliver HTTP ${dr.status()}; DB=${JSON.stringify(fin)}`,
    result:
      rr.ok() && dr.ok() && fin.order_status === 'delivered' ? 'PASS' : 'FAIL',
    evidence:
      'screenshots/045-phase3-second-ready.png; screenshots/046-phase3-second-link.png',
  });
  await cus.storageState({ path: `${a}/phase3-customer-storage.json` });
} finally {
  await cus.close();
  await adm.close();
  await br.close();
  await db.end();
}
