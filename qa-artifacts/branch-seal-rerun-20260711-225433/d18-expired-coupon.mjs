import fs from 'node:fs/promises';
import { chromium } from '/home/yuri/projects/ss/frontend/node_modules/playwright-core/index.mjs';
import pg from '/home/yuri/projects/ss/node_modules/pg/lib/index.js';
import dotenv from '/home/yuri/projects/ss/node_modules/dotenv/lib/main.js';

dotenv.config({ path: '/home/yuri/projects/ss/.env', quiet: true });
const { Client } = pg;
const token = (await fs.readFile('/home/yuri/projects/ss/qa-artifacts/branch-seal-rerun-20260711-225433/admin-token.txt', 'utf8')).trim();
const code = `SEAL-EXPIRED-${Date.now()}`;
const api = 'http://127.0.0.1:3001/api/v1';
const headers = { 'content-type': 'application/json', cookie: `auth_token=${token}; csrf_token=seal`, 'x-csrf-token': 'seal' };
const response = await fetch(`${api}/admin/coupons`, {
  method: 'POST', headers,
  body: JSON.stringify({ code, percent_off: 13, scope: 'global', apply_scope: 'highest_eligible_item', status: 'active', max_redemptions: 1, ends_at: '2026-01-01T00:00:00.000Z' }),
});
const created = await response.json();
if (response.status !== 201) throw new Error(`Expired coupon create returned ${response.status}: ${JSON.stringify(created)}`);
const db = new Client({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), database: process.env.DB_DATABASE, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
await db.connect();
const row = (await db.query('SELECT id, code, ends_at FROM coupons WHERE code=$1', [code])).rows[0];
await db.end();
if (!row || row.code !== code) throw new Error('Expired coupon DB row missing.');
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
try {
  const context = await browser.newContext();
  await context.addCookies([{ name: 'auth_token', value: token, url: 'http://127.0.0.1:3000/' }, { name: 'csrf_token', value: 'seal', url: 'http://127.0.0.1:3000/' }]);
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:3000/admin-next/coupons', { waitUntil: 'domcontentloaded', timeout: 60000 });
  const coupon = page.getByText(code, { exact: true });
  if (await coupon.isVisible().catch(() => false)) throw new Error('Expired coupon visible by default.');
  await page.getByLabel('Include expired').check();
  await coupon.waitFor({ state: 'visible' });
  await page.screenshot({ path: '/home/yuri/projects/ss/qa-artifacts/branch-seal-rerun-20260711-225433/d18-expired-visible.png', fullPage: true });
  console.log(JSON.stringify({ pass: true, code, createStatus: response.status, dbRow: row, hiddenByDefault: true, visibleWithToggle: true }, null, 2));
} finally {
  await browser.close();
}
