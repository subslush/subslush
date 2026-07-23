import { chromium } from '/home/yuri/projects/ss/frontend/node_modules/playwright-core/index.mjs';
import fs from 'node:fs/promises';

const artifact = '/home/yuri/projects/ss/qa-artifacts/run-b-20260711-195750';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, storageState: `${artifact}/phase1-pending-storage.json` });
const page = await context.newPage();
page.setDefaultTimeout(60000);
try {
  await page.goto('http://127.0.0.1:3000/checkout/payment', { waitUntil: 'domcontentloaded', timeout: 60000 });
  const consent = page.getByRole('button', { name: 'Reject non-essential' });
  if (await consent.isVisible({ timeout: 3000 }).catch(() => false)) await consent.click();
  await page.getByRole('button', { name: /Cards/i }).first().waitFor();
  const responsePromise = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/v1/checkout/antom/session');
  await page.getByRole('button', { name: 'PAY', exact: true }).click();
  const response = await responsePromise;
  const payload = await response.json().catch(() => ({}));
  await page.screenshot({ path: `${artifact}/screenshots/047-phase4-pending-antom-session.png`, fullPage: true });
  await fs.appendFile(`${artifact}/phase4-steps.jsonl`, `${JSON.stringify({ phase: 4, action: 'Create native unpaid Antom session for pending P1 order', expected: 'Payment session persists pending order without completing payment', actual: `HTTP ${response.status()}; ${JSON.stringify(payload)}`, result: response.ok() ? 'PASS' : 'FAIL', evidence: 'screenshots/047-phase4-pending-antom-session.png' })}\n`);
  if (!response.ok()) process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
}
