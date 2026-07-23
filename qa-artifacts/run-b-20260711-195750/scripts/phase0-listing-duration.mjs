import { chromium } from '/home/yuri/projects/ss/frontend/node_modules/playwright-core/index.mjs';
import fs from 'node:fs/promises';

const artifact = '/home/yuri/projects/ss/qa-artifacts/run-b-20260711-195750';
const ids = JSON.parse(await fs.readFile(`${artifact}/phase0-ids.json`, 'utf8'));
const token = (await fs.readFile(`${artifact}/admin-token.txt`, 'utf8')).trim();
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addCookies([
  { name: 'auth_token', value: token, url: 'http://127.0.0.1:3000/' },
  { name: 'csrf_token', value: 'qa-b2-csrf', url: 'http://127.0.0.1:3000/' },
]);
const page = await context.newPage();
try {
  await page.goto(`http://127.0.0.1:3000/admin-next/products/${ids.p1.productId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const consent = page.getByRole('button', { name: 'Reject non-essential' });
  if (await consent.isVisible({ timeout: 3000 }).catch(() => false)) await consent.click();
  await page.getByRole('button', { name: 'Pricing' }).click();
  await page.getByText('Fixed product pricing').waitFor();
  await page.getByText('Fixed product pricing').locator('xpath=ancestor::div[contains(@class,"card") or contains(@class,"admin-card")][1]').getByText('Duration months').locator('xpath=following::input[1]').fill('6').catch(async () => {
    await page.getByText('Duration months').locator('xpath=following::input[1]').fill('6');
  });
  const requestPromise = page.waitForResponse(response => response.request().method() === 'PATCH' && new URL(response.url()).pathname === `/api/v1/admin/products/${ids.p1.productId}`);
  await page.getByRole('button', { name: 'Save fixed price' }).click();
  const response = await requestPromise;
  await page.getByText('Product saved.', { exact: true }).waitFor();
  await page.screenshot({ path: `${artifact}/screenshots/014-phase0-p1-listing-duration.png`, fullPage: true });
  const row = { phase: 0, action: 'Bind P1 public listing to its supported 6-month term', expected: 'Duration saved through admin-next UI', actual: `HTTP ${response.status()}, duration 6 saved`, result: response.ok() ? 'PASS' : 'FAIL', evidence: 'screenshots/014-phase0-p1-listing-duration.png' };
  await fs.appendFile(`${artifact}/phase0-steps.jsonl`, `${JSON.stringify(row)}\n`);
  if (!response.ok()) process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
}
