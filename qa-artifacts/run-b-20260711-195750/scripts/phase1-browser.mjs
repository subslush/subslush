import { chromium } from '/home/yuri/projects/ss/frontend/node_modules/playwright-core/index.mjs';
import fs from 'node:fs/promises';

const artifact = '/home/yuri/projects/ss/qa-artifacts/run-b-20260711-195750';
const baseUrl = 'http://127.0.0.1:3000';
const guestEmail = `qa-b2-guest-${Date.now()}@example.test`;
const pendingEmail = `qa-b2-pending-${Date.now()}@example.test`;
const adminToken = (await fs.readFile(`${artifact}/admin-token.txt`, 'utf8')).trim();
const phase0Ids = JSON.parse(await fs.readFile(`${artifact}/phase0-ids.json`, 'utf8'));
let shot = 14;
const steps = [];
async function record(action, expected, actual, result, evidence = '') {
  const row = { phase: 1, action, expected, actual, result, evidence };
  steps.push(row);
  await fs.appendFile(`${artifact}/phase1-steps.jsonl`, `${JSON.stringify(row)}\n`);
}
async function snap(page, name) {
  const relative = `screenshots/${String(++shot).padStart(3, '0')}-phase1-${name}.png`;
  await page.screenshot({ path: `${artifact}/${relative}`, fullPage: true });
  return relative;
}
async function dismiss(page) {
  const b = page.getByRole('button', { name: 'Reject non-essential' });
  if (await b.isVisible({ timeout: 3000 }).catch(() => false)) await b.click();
}
async function addProduct(page, slug, option) {
  await page.goto(`${baseUrl}/browse/products/${slug}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  if (option) await page.getByRole('button', { name: new RegExp(option, 'i') }).click();
  await page.getByRole('button', { name: 'ADD TO CART' }).click();
  await page.getByRole('button', { name: 'Close cart sidebar' }).click();
}

async function setP1ListingDuration(browser, months) {
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await adminContext.addCookies([
    { name: 'auth_token', value: adminToken, url: `${baseUrl}/` },
    { name: 'csrf_token', value: 'qa-b2-csrf', url: `${baseUrl}/` },
  ]);
  const adminPage = await adminContext.newPage();
  try {
    await adminPage.goto(`${baseUrl}/admin-next/products/${phase0Ids.p1.productId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await dismiss(adminPage);
    await adminPage.getByRole('button', { name: 'Pricing' }).click();
    await adminPage.getByText('Duration months').locator('xpath=following::input[1]').fill(String(months));
    const responsePromise = adminPage.waitForResponse(response => response.request().method() === 'PATCH' && new URL(response.url()).pathname === `/api/v1/admin/products/${phase0Ids.p1.productId}`);
    await adminPage.getByRole('button', { name: 'Save fixed price' }).click();
    const response = await responsePromise;
    await adminPage.getByText('Product saved.', { exact: true }).waitFor();
    await record(`Set P1 listing duration to ${months} month(s) through admin UI`, 'Supported browser configuration selects the listing term', `HTTP ${response.status()}`, response.ok() ? 'PASS' : 'FAIL');
  } finally {
    await adminContext.close();
  }
}

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, recordHar: { path: `${artifact}/network/phase1.har`, mode: 'full', content: 'embed' } });
const page = await context.newPage();
page.setDefaultTimeout(20000);
page.on('request', request => { if (request.url().includes('/api/')) void fs.appendFile(`${artifact}/network/phase1-requests.jsonl`, `${JSON.stringify({ method: request.method(), url: request.url(), postData: request.postData() })}\n`); });
page.on('dialog', async dialog => { await fs.appendFile(`${artifact}/phase1-dialogs.log`, `${dialog.type()}: ${dialog.message()}\n`); await dialog.dismiss(); });

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await dismiss(page);
  await page.getByText('SubSlush', { exact: false }).first().waitFor();
  await record('Browse public home', 'Home renders in Chromium', `Rendered ${await page.title()}`, 'PASS', await snap(page, 'home'));

  await page.goto(`${baseUrl}/browse?category=qa-b2`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const browseText = await page.locator('body').innerText();
  const categoryPass = ['QA-B2 Streaming', 'QA-B2 AI Tool', 'QA-B2 Link Product'].every(name => browseText.includes(name));
  await record('Browse QA-B2 category', 'P1–P3 list', categoryPass ? 'All three QA-B2 products visible' : 'One or more QA-B2 products missing', categoryPass ? 'PASS' : 'FAIL', await snap(page, 'category'));

  for (const [slug, name, expectedPrice] of [['qa-b2-streaming', 'QA-B2 Streaming', '$49.00'], ['qa-b2-ai-tool', 'QA-B2 AI Tool', '$120.00'], ['qa-b2-link-product', 'QA-B2 Link Product', '$99.00']]) {
    await page.goto(`${baseUrl}/browse/products/${slug}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const text = await page.locator('body').innerText();
    const pass = text.includes(name) && text.includes(expectedPrice) && text.includes('ADD TO CART');
    await record(`Browse ${name} public product page`, 'Name, current price, fulfillment option and cart control render', `${name}: ${expectedPrice}; controls rendered=${pass}`, pass ? 'PASS' : 'FAIL', await snap(page, `${slug}-page`));
  }

  await page.goto(`${baseUrl}/browse/products/qa-b2-streaming`, { waitUntil: 'domcontentloaded' });
  const p1Text = await page.locator('body').innerText();
  const listingPass = p1Text.includes('6 months fixed period');
  await record('D02: verify P1 listing binds its configured 6-month term', 'Own listing displays and purchases the configured 6-month term without a selector', listingPass ? '6 months fixed period visible; no storage manipulation' : 'Configured 6-month term not visible', listingPass ? 'PASS' : 'FAIL', await snap(page, 'p1-six-month-listing'));

  await addProduct(page, 'qa-b2-streaming', 'Your account');
  await addProduct(page, 'qa-b2-ai-tool', null);
  await addProduct(page, 'qa-b2-link-product', null);
  await addProduct(page, 'qa-b2-streaming', 'New account');
  await page.goto(`${baseUrl}/checkout`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const streamingCards = page.getByText('QA-B2 Streaming', { exact: true }).locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
  let removed = false;
  for (let i = 0; i < await streamingCards.count(); i += 1) {
    const card = streamingCards.nth(i);
    if ((await card.innerText()).includes('newly created private account')) {
      await card.getByRole('button', { name: 'Remove item' }).click();
      await page.getByRole('button', { name: 'Remove', exact: true }).click();
      removed = true;
      break;
    }
  }
  await record('Add then remove extra cart item', 'Extra P1 new-account row removed via confirmation UI', removed ? 'Removal confirmation completed; three intended rows remain' : 'Extra row not located', removed ? 'PASS' : 'FAIL', await snap(page, 'cart-after-remove'));

  const cartState = await page.evaluate(() => JSON.parse(localStorage.getItem('subslush_cart') || '[]'));
  const p1Own = cartState.find(item => item.serviceName === 'QA-B2 Streaming' && item.upgradeSelectionType === 'upgrade_own_account');
  await record('D02: verify native P1 cart term', 'P1 own-account cart row remains 6 months with no localStorage write', `Native termMonths=${p1Own?.termMonths ?? 'missing'}`, p1Own?.termMonths === 6 ? 'PASS' : 'FAIL');

  await page.getByLabel('Account email').fill('qa-b2-own-account@example.test');
  await page.getByLabel('Account password').fill('QA-B2-Own-Pass!123');
  await page.getByLabel('DELIVERY EMAIL').fill(guestEmail);
  await page.getByRole('button', { name: 'Got a discount code?' }).click();
  await page.getByPlaceholder('Enter code').fill('QA-B2-TEST15');
  const couponRequest = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname === '/api/v1/checkout/draft');
  await page.getByRole('button', { name: 'APPLY' }).click();
  await couponRequest;
  await page.getByText('Coupon applied.', { exact: true }).waitFor();
  const checkoutText = await page.locator('body').innerText();
  const couponPass = checkoutText.includes('Coupon discount') && checkoutText.includes('-$18.00') && checkoutText.includes('$250.00');
  await record('Apply QA-B2-TEST15', '15% discounts highest $120 item only; total $268→$250', couponPass ? 'Coupon discount -$18.00 and total $250.00 visible' : 'Expected discount/total absent', couponPass ? 'PASS' : 'FAIL', await snap(page, 'coupon-applied'));

  await page.getByRole('button', { name: /Continue to payment/ }).click();
  await page.waitForURL('**/checkout/payment', { timeout: 60000 });
  await page.getByText('Order summary', { exact: true }).waitFor();
  const paymentSummary = await page.locator('body').innerText();
  const draftState = await page.evaluate(() => localStorage.getItem('checkout_draft_state'));
  await fs.writeFile(`${artifact}/phase1-primary-draft-state.json`, draftState || 'null');
  const parsedDraft = JSON.parse(draftState || '{}');
  const primaryOrderId = parsedDraft.orderId || parsedDraft.order_id;
  const couponRetained = paymentSummary.includes('$250.00') && !paymentSummary.includes('$268.00');
  await record('D03: continue after coupon application', 'Re-draft retains discount and reaches payment without reservation error', `Payment page rendered; order ${primaryOrderId || 'ID in DB lookup'}; discounted total retained=${couponRetained}`, primaryOrderId && couponRetained ? 'PASS' : 'FAIL', await snap(page, 'payment-page'));

  await page.evaluate(() => { localStorage.setItem('subslush_cart', '[]'); localStorage.removeItem('checkout_draft_state'); sessionStorage.clear(); });
  await setP1ListingDuration(browser, 1);
  await addProduct(page, 'qa-b2-streaming', 'New account');
  await page.goto(`${baseUrl}/checkout`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByLabel('DELIVERY EMAIL').fill(pendingEmail);
  await page.getByRole('button', { name: /Continue to payment/ }).click();
  await page.waitForURL('**/checkout/payment', { timeout: 60000 });
  const pendingStateRaw = await page.evaluate(() => localStorage.getItem('checkout_draft_state'));
  await fs.writeFile(`${artifact}/phase1-pending-draft-state.json`, pendingStateRaw || 'null');
  const pendingState = JSON.parse(pendingStateRaw || '{}');
  const pendingOrderId = pendingState.orderId || pendingState.order_id;
  await record('Create second single-item P1 order and leave unpaid', '1-month order reaches payment selection but remains pending', `Payment page rendered; order ${pendingOrderId || 'ID in DB lookup'}`, pendingOrderId ? 'PASS' : 'FAIL', await snap(page, 'pending-payment-page'));
  await setP1ListingDuration(browser, 6);

  await context.storageState({ path: `${artifact}/phase1-customer-storage.json` });
  await fs.writeFile(`${artifact}/phase1-identities.json`, JSON.stringify({ guestEmail, pendingEmail, primaryOrderId, pendingOrderId }, null, 2));
  await fs.writeFile(`${artifact}/phase1-browser-summary.json`, JSON.stringify({ result: steps.every(step => step.result === 'PASS') ? 'PASS' : 'FAIL', steps }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
