import { chromium } from '/home/yuri/projects/ss/frontend/node_modules/playwright-core/index.mjs';
import fs from 'node:fs/promises';

const artifact = '/home/yuri/projects/ss/qa-artifacts/run-b-20260711-095147';
const baseUrl = 'http://127.0.0.1:3000';
const pendingEmail = `qa-b1-pending-${Date.now()}@example.test`;
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
page.setDefaultTimeout(30000);
try {
  await page.goto(`${baseUrl}/browse/products/qa-b1-streaming`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  const consent = page.getByRole('button', { name: 'Reject non-essential' });
  if (await consent.isVisible({ timeout: 3000 }).catch(() => false))
    await consent.click();
  await page.getByRole('button', { name: /New account/i }).click();
  await page.getByRole('button', { name: 'ADD TO CART' }).click();
  await page.getByRole('button', { name: 'GO TO CHECKOUT' }).click();
  await page.waitForURL('**/checkout');
  await page.getByLabel('DELIVERY EMAIL').fill(pendingEmail);
  await page.getByRole('button', { name: /Continue to payment/ }).click();
  await page.waitForURL('**/checkout/payment', { timeout: 60000 });
  await page.getByRole('heading', { name: 'Payment methods' }).waitFor();
  await page
    .getByRole('button', { name: /Cards/i })
    .first()
    .waitFor({ timeout: 60000 });
  await page.screenshot({
    path: `${artifact}/screenshots/026-phase6-expiry-payment-methods.png`,
    fullPage: true,
  });
  const sessionResponsePromise = page.waitForResponse(
    response =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/v1/checkout/antom/session',
    { timeout: 60000 }
  );
  await page.getByRole('button', { name: 'PAY', exact: true }).click();
  const sessionResponse = await sessionResponsePromise;
  const sessionPayload = await sessionResponse.json().catch(() => ({}));
  const state = JSON.parse(
    await page.evaluate(
      () => localStorage.getItem('checkout_draft_state') || '{}'
    )
  );
  const orderId =
    sessionPayload.data?.order_id || sessionPayload.order_id || state.orderId;
  await fs.writeFile(
    `${artifact}/phase6-expiry.json`,
    JSON.stringify(
      {
        pendingEmail,
        orderId,
        status: sessionResponse.status(),
        payload: sessionPayload,
      },
      null,
      2
    )
  );
  await fs.appendFile(
    `${artifact}/phase1-steps.jsonl`,
    `${JSON.stringify({ phase: 6, action: 'Create Antom pending checkout for expiry sweep', expected: 'Native payment session created; order pending and absent from queue', actual: `Antom session HTTP ${sessionResponse.status()}, order ${orderId}`, result: sessionResponse.ok() ? 'PASS' : 'FAIL', evidence: 'screenshots/026-phase6-expiry-payment-methods.png; phase6-expiry.json' })}\n`
  );
} finally {
  await context.close();
  await browser.close();
}
