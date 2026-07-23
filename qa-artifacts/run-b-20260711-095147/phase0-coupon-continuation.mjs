import { chromium } from '/home/yuri/projects/ss/frontend/node_modules/playwright-core/index.mjs';
import fs from 'node:fs/promises';

const artifact = '/home/yuri/projects/ss/qa-artifacts/run-b-20260711-095147';
const baseUrl = 'http://127.0.0.1:3000';
const token = (await fs.readFile(`${artifact}/admin-token.txt`, 'utf8')).trim();
const failure = {
  phase: 0,
  action: 'Create QA-B1-TEST15 with UI start/end window',
  expected: '15%, global, highest eligible item, max 5, active date window saves and lists',
  actual: 'Browser emitted POST /api/v1/admin/coupons; HTTP 400: body/starts_at must match format date-time because datetime-local omitted timezone',
  result: 'FAIL',
  evidence: 'network/phase0-requests.jsonl and backend.log req-kj',
};
await fs.appendFile(`${artifact}/phase0-steps.jsonl`, `${JSON.stringify(failure)}\n`);
await fs.appendFile(`${artifact}/defects.jsonl`, `${JSON.stringify({ id: 'QA-B1-D01', severity: 'High', title: 'Coupons UI cannot create a date-bounded coupon', repro: ['Open /admin-next/coupons', 'Enter valid Start and End via datetime-local controls', 'Click Create coupon'], expected: 'Coupon saves', actual: failure.actual, suspected: 'frontend/src/routes/admin-next/coupons/+page.svelte saveCoupon payload; POST /api/v1/admin/coupons date-time schema' })}\n`);

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addCookies([{ name: 'auth_token', value: token, url: `${baseUrl}/` }, { name: 'csrf_token', value: 'qa-b1-csrf', url: `${baseUrl}/` }]);
const page = await context.newPage();
page.setDefaultTimeout(15000);
try {
  await page.goto(`${baseUrl}/admin-next/coupons`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const consent = page.getByRole('button', { name: 'Reject non-essential' });
  if (await consent.isVisible({ timeout: 3000 }).catch(() => false)) await consent.click();
  await page.getByLabel('Code').fill('QA-B1-TEST15');
  await page.getByLabel('Percent off').fill('15');
  await page.getByLabel('Scope').selectOption('global');
  await page.getByLabel('Apply to').selectOption('highest_eligible_item');
  await page.getByLabel('Max redemptions').fill('5');
  const requestPromise = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname === '/api/v1/admin/coupons');
  await page.getByRole('button', { name: 'Create coupon' }).click();
  const request = await requestPromise;
  const response = await request.response();
  if (!response?.ok()) throw new Error(`Coupon workaround returned ${response?.status()}`);
  await page.locator('.row .mono', { hasText: 'QA-B1-TEST15' }).waitFor();
  const screenshot = `${artifact}/screenshots/013-phase0-coupon-workaround.png`;
  await page.screenshot({ path: screenshot, fullPage: true });
  const pass = { phase: 0, action: 'Create QA-B1-TEST15 with blank optional window (workaround)', expected: 'Active coupon covering today saves and lists', actual: `HTTP ${response.status()}, coupon listed as 15%, global, highest item, 0 / 5`, result: 'PASS', evidence: 'screenshots/013-phase0-coupon-workaround.png' };
  await fs.appendFile(`${artifact}/phase0-steps.jsonl`, `${JSON.stringify(pass)}\n`);
  await fs.writeFile(`${artifact}/running-summary.md`, `# QA Run B running summary\n\n## Pre-flight\n\nPASS — admin-next smoke exited 0.\n\n## Phase 0 — Test catalog setup\n\nFAIL with workaround — P1–P3 browser creation, distinct succeeded snapshots, MMU divisibility rejection, snapshot-less activation refusal, and coupon listing passed. QA-B1-D01: datetime-local coupon windows are rejected as non-RFC3339; blank optional window allowed continuation.\n`);
} finally {
  await context.close();
  await browser.close();
}
