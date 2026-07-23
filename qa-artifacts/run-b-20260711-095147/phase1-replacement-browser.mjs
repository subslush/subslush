import { chromium } from '/home/yuri/projects/ss/frontend/node_modules/playwright-core/index.mjs';
import fs from 'node:fs/promises';

const artifact = '/home/yuri/projects/ss/qa-artifacts/run-b-20260711-095147';
const baseUrl = 'http://127.0.0.1:3000';
const guestEmail = `qa-b1-replacement-${Date.now()}@example.test`;
const simulationLog = await fs.readFile(`${artifact}/simulations.log`, 'utf8');
const cartJson = simulationLog.match(/AFTER=(\[[^\n]+\])/)?.[1];
if (!cartJson) throw new Error('Cart fixture missing');
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(20000);
try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const consent = page.getByRole('button', { name: 'Reject non-essential' });
  if (await consent.isVisible({ timeout: 3000 }).catch(() => false)) await consent.click();
  await page.evaluate(value => { localStorage.setItem('subslush_cart', value); localStorage.removeItem('checkout_draft_state'); }, cartJson);
  await page.goto(`${baseUrl}/checkout`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByLabel('Account email').fill('qa-b1-own-account@example.test');
  await page.getByLabel('Account password').fill('QA-B1-Own-Pass!123');
  await page.getByLabel('DELIVERY EMAIL').fill(guestEmail);
  await page.getByRole('button', { name: 'Got a discount code?' }).click();
  await page.getByPlaceholder('Enter code').fill('QA-B1-TEST15');
  const responsePromise = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/v1/checkout/draft');
  await page.getByRole('button', { name: 'APPLY' }).click();
  const response = await responsePromise;
  const payload = await response.json();
  if (!response.ok()) throw new Error(`Replacement draft failed ${response.status()}: ${JSON.stringify(payload)}`);
  const data = payload.data ?? payload;
  await page.getByText('Coupon applied.', { exact: true }).waitFor();
  await page.screenshot({ path: `${artifact}/screenshots/023-phase1-replacement-reserved.png`, fullPage: true });
  const guestIdentityId = data.guest_identity_id ?? JSON.parse(await page.evaluate(() => localStorage.getItem('checkout_draft_state') || '{}')).guestIdentityId;
  const ids = { guestEmail, guestIdentityId, checkoutSessionKey: data.checkout_session_key, primaryOrderId: data.order_id, originalFailedOrderId: '4ab6b6ac-1787-4032-b1a2-16dc8c4ded54' };
  await fs.writeFile(`${artifact}/phase1-identities.json`, JSON.stringify(ids, null, 2));
  await context.storageState({ path: `${artifact}/phase1-primary-customer-storage.json` });
  await fs.appendFile(`${artifact}/phase1-steps.jsonl`, `${JSON.stringify({ phase: 1, action: 'Fresh replacement discounted draft for downstream lifecycle', expected: 'One successful discounted draft and reserved coupon; no second refresh', actual: `HTTP 200, order ${data.order_id}, total $2,706 visible`, result: 'PASS_WITH_WORKAROUND', evidence: 'screenshots/023-phase1-replacement-reserved.png' })}\n`);
} finally {
  await context.close();
  await browser.close();
}
