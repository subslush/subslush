import { chromium } from '/home/yuri/projects/ss/frontend/node_modules/playwright-core/index.mjs';
import fs from 'node:fs/promises';

const artifact = '/home/yuri/projects/ss/qa-artifacts/run-b-20260711-095147';
const baseUrl = 'http://127.0.0.1:3000';
const guestEmail = 'qa-b1-guest-1783757258439@example.test';
const guestIdentityId = 'c8d65610-2349-4765-97a9-b71bddd63c44';
const checkoutSessionKey = 'd4da288d013c7abb1c7e8353c7641de19571aafccf990a41';
const primaryOrderId = '4ab6b6ac-1787-4032-b1a2-16dc8c4ded54';

for (const row of [
  { phase: 1, action: 'Correct P2 product-page price assertion', expected: '12 × $120 monthly base = $1,440', actual: '$1,440.00, 12 months, New account, and ADD TO CART visible', result: 'PASS', evidence: 'screenshots/017-phase1-qa-b1-ai-tool-page.png' },
  { phase: 1, action: 'Correct P3 product-page price assertion', expected: '12 × $99 monthly base = $1,188', actual: '$1,188.00, 12 months, activation-link product and ADD TO CART visible', result: 'PASS', evidence: 'screenshots/018-phase1-qa-b1-link-product-page.png' },
  { phase: 1, action: 'Correct coupon arithmetic assertion', expected: '15% of highest $1,440 line = $216; $2,922 subtotal → $2,706', actual: 'Coupon discount -$216.00 and total $2,706.00 visible', result: 'PASS', evidence: 'screenshots/021-phase1-coupon-applied.png' },
  { phase: 1, action: 'Continue discounted checkout to payment', expected: 'Same-session draft refresh remains discounted and reservation stays reserved', actual: 'Second POST /checkout/draft returned 400 already redeemed; frontend retried without coupon, voided redemption, and overwrote order at full price', result: 'FAIL', evidence: 'network/phase1.har draft responses and coupon_redemptions DB row' },
]) await fs.appendFile(`${artifact}/phase1-steps.jsonl`, `${JSON.stringify(row)}\n`);

await fs.appendFile(`${artifact}/defects.jsonl`, `${JSON.stringify({ id: 'QA-B1-D03', severity: 'Critical', title: 'Coupon reservation is not idempotent across checkout draft refresh', repro: ['Apply QA-B1-TEST15 on a guest cart', 'Observe discounted draft succeeds and reservation is reserved', 'Click Continue to payment'], expected: 'Same session refresh reuses reservation and keeps discount', actual: 'Second draft returns 400 already redeemed; UI silently retries couponless, voids reservation, and reprices order at full amount', suspected: 'POST /api/v1/checkout/draft coupon reservation path and frontend/src/routes/checkout/+page.svelte refreshDraft error fallback around lines 1190-1210' })}\n`);

const simulationLog = await fs.readFile(`${artifact}/simulations.log`, 'utf8');
const afterMatch = simulationLog.match(/AFTER=(\[[^\n]+\])/);
if (!afterMatch) throw new Error('Simulated three-item cart was not found');
const cartJson = afterMatch[1];
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(20000);
try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const consent = page.getByRole('button', { name: 'Reject non-essential' });
  if (await consent.isVisible({ timeout: 3000 }).catch(() => false)) await consent.click();
  await page.evaluate(({ cartJson, draft }) => {
    localStorage.setItem('subslush_cart', cartJson);
    localStorage.setItem('checkout_draft_state', JSON.stringify(draft));
  }, { cartJson, draft: { email: guestEmail, guestIdentityId, checkoutSessionKey, orderId: primaryOrderId, appliedCouponCode: null, selectedPaymentCountry: null, legalConsent: { immediateFulfillmentConsent: true, termsPolicyConsent: true } } });
  await page.goto(`${baseUrl}/checkout`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByLabel('Account email').fill('qa-b1-own-account@example.test');
  await page.getByLabel('Account password').fill('QA-B1-Own-Pass!123');
  await page.getByRole('button', { name: 'Got a discount code?' }).click();
  await page.getByPlaceholder('Enter code').fill('QA-B1-TEST15');
  const draftRequest = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname === '/api/v1/checkout/draft' && request.postData()?.includes('QA-B1-TEST15'));
  await page.getByRole('button', { name: 'APPLY' }).click();
  const request = await draftRequest;
  const response = await request.response();
  if (!response?.ok()) throw new Error(`Coupon reapply workaround returned ${response?.status()}: ${await response?.text()}`);
  await page.getByText('Coupon applied.', { exact: true }).waitFor();
  const screenshot = `${artifact}/screenshots/022-phase1-coupon-reserved-for-webhook.png`;
  await page.screenshot({ path: screenshot, fullPage: true });
  await fs.appendFile(`${artifact}/phase1-steps.jsonl`, `${JSON.stringify({ phase: 1, action: 'Reapply coupon once and hold reservation for permitted webhook simulation', expected: 'Discounted draft and one reserved row', actual: `HTTP ${response.status()}, -$216 and $2,706 visible; no second draft refresh invoked`, result: 'PASS_WITH_WORKAROUND', evidence: 'screenshots/022-phase1-coupon-reserved-for-webhook.png' })}\n`);
  await context.storageState({ path: `${artifact}/phase1-primary-customer-storage.json` });
  await fs.writeFile(`${artifact}/phase1-identities.json`, JSON.stringify({ guestEmail, guestIdentityId, checkoutSessionKey, primaryOrderId }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
