import { chromium } from '/home/yuri/projects/ss/frontend/node_modules/playwright-core/index.mjs';
import fs from 'node:fs/promises';

const artifact = '/home/yuri/projects/ss/qa-artifacts/run-b-20260711-095147';
const baseUrl = 'http://127.0.0.1:3000';
const guestEmail = `qa-b1-guest-${Date.now()}@example.test`;
const pendingEmail = `qa-b1-pending-${Date.now()}@example.test`;
let shot = 13;
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

  await page.goto(`${baseUrl}/browse?category=qa-b1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const browseText = await page.locator('body').innerText();
  const categoryPass = ['QA-B1 Streaming', 'QA-B1 AI Tool', 'QA-B1 Link Product'].every(name => browseText.includes(name));
  await record('Browse QA-B1 category', 'P1–P3 list', categoryPass ? 'All three QA-B1 products visible' : 'One or more QA-B1 products missing', categoryPass ? 'PASS' : 'FAIL', await snap(page, 'category'));

  for (const [slug, name, expectedPrice] of [['qa-b1-streaming', 'QA-B1 Streaming', '$49.00'], ['qa-b1-ai-tool', 'QA-B1 AI Tool', '$120.00'], ['qa-b1-link-product', 'QA-B1 Link Product', '$99.00']]) {
    await page.goto(`${baseUrl}/browse/products/${slug}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const text = await page.locator('body').innerText();
    const pass = text.includes(name) && text.includes(expectedPrice) && text.includes('ADD TO CART');
    await record(`Browse ${name} public product page`, 'Name, current price, fulfillment option and cart control render', `${name}: ${expectedPrice}; controls rendered=${pass}`, pass ? 'PASS' : 'FAIL', await snap(page, `${slug}-page`));
  }

  await page.goto(`${baseUrl}/browse/products/qa-b1-streaming`, { waitUntil: 'domcontentloaded' });
  const p1Text = await page.locator('body').innerText();
  const termControls = await page.getByRole('button', { name: /6 months?/i }).count();
  const defectEvidence = await snap(page, 'p1-no-term-selector');
  await record('Select P1 6-month term', 'Visible choice between 1 and 6 months', `No 6-month control; page fixed to ${p1Text.includes('1 month fixed period') ? '1 month' : 'first term'}; matching controls=${termControls}`, 'FAIL', defectEvidence);
  await fs.appendFile(`${artifact}/defects.jsonl`, `${JSON.stringify({ id: 'QA-B1-D02', severity: 'Critical', title: 'Public product page provides no variant/term selector', repro: ['Open /browse/products/qa-b1-streaming', 'Observe product has 1- and 6-month active terms', 'Attempt to select 6 months'], expected: 'Both supported terms are selectable', actual: 'Only first/recommended term is assigned; no term selector is rendered', suspected: 'frontend/src/routes/browse/products/[slug]/+page.svelte selectedVariant/selectedTerm reactive assignments around lines 426-427 and purchasePanel' })}\n`);

  await addProduct(page, 'qa-b1-streaming', 'Your account');
  await addProduct(page, 'qa-b1-ai-tool', null);
  await addProduct(page, 'qa-b1-link-product', null);
  await addProduct(page, 'qa-b1-streaming', 'New account');
  await page.goto(`${baseUrl}/checkout`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const streamingCards = page.getByText('QA-B1 Streaming', { exact: true }).locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
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

  const storageMutation = await page.evaluate(() => {
    const before = localStorage.getItem('subslush_cart');
    const items = JSON.parse(before || '[]');
    const target = items.find(item => item.serviceName === 'QA-B1 Streaming' && item.upgradeSelectionType === 'upgrade_own_account');
    if (!target) return { before, after: before, changed: false };
    target.termMonths = 6;
    target.id = String(target.id).replace('|1|', '|6|');
    localStorage.setItem('subslush_cart', JSON.stringify(items));
    return { before, after: localStorage.getItem('subslush_cart'), changed: true };
  });
  await fs.appendFile(`${artifact}/simulations.log`, `[DOCUMENTED-BROWSER-STORAGE-SIMULATION after QA-B1-D02] Changed P1 own-account cart termMonths from 1 to 6 to keep downstream coverage reachable.\nBEFORE=${storageMutation.before}\nAFTER=${storageMutation.after}\n`);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await record('Downstream-only P1 6-month cart simulation', 'Documented simulation after browser selector failure', storageMutation.changed ? 'localStorage cart term changed 1→6; no API/DB write' : 'Target row missing', storageMutation.changed ? 'PASS' : 'FAIL', 'simulations.log');

  await page.getByLabel('Account email').fill('qa-b1-own-account@example.test');
  await page.getByLabel('Account password').fill('QA-B1-Own-Pass!123');
  await page.getByLabel('DELIVERY EMAIL').fill(guestEmail);
  await page.getByRole('button', { name: 'Got a discount code?' }).click();
  await page.getByPlaceholder('Enter code').fill('QA-B1-TEST15');
  const couponRequest = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname === '/api/v1/checkout/draft');
  await page.getByRole('button', { name: 'APPLY' }).click();
  await couponRequest;
  await page.getByText('Coupon applied.', { exact: true }).waitFor();
  const checkoutText = await page.locator('body').innerText();
  const couponPass = checkoutText.includes('Coupon discount') && checkoutText.includes('-$18.00') && checkoutText.includes('$250.00');
  await record('Apply QA-B1-TEST15', '15% discounts highest $120 item only; total $268→$250', couponPass ? 'Coupon discount -$18.00 and total $250.00 visible' : 'Expected discount/total absent', couponPass ? 'PASS' : 'FAIL', await snap(page, 'coupon-applied'));

  await page.getByRole('button', { name: /Continue to payment/ }).click();
  await page.waitForURL('**/checkout/payment', { timeout: 60000 });
  await page.getByText('Order summary', { exact: true }).waitFor();
  const draftState = await page.evaluate(() => localStorage.getItem('checkout_draft_state'));
  await fs.writeFile(`${artifact}/phase1-primary-draft-state.json`, draftState || 'null');
  const parsedDraft = JSON.parse(draftState || '{}');
  const primaryOrderId = parsedDraft.orderId || parsedDraft.order_id;
  await record('Complete guest checkout to payment selection', 'Native three-snapshot draft/order and payment page', `Payment page rendered; order ${primaryOrderId || 'ID in DB lookup'}`, primaryOrderId ? 'PASS' : 'FAIL', await snap(page, 'payment-page'));

  await page.evaluate(() => { localStorage.setItem('subslush_cart', '[]'); localStorage.removeItem('checkout_draft_state'); sessionStorage.clear(); });
  await addProduct(page, 'qa-b1-streaming', 'New account');
  await page.goto(`${baseUrl}/checkout`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByLabel('DELIVERY EMAIL').fill(pendingEmail);
  await page.getByRole('button', { name: /Continue to payment/ }).click();
  await page.waitForURL('**/checkout/payment', { timeout: 60000 });
  const pendingStateRaw = await page.evaluate(() => localStorage.getItem('checkout_draft_state'));
  await fs.writeFile(`${artifact}/phase1-pending-draft-state.json`, pendingStateRaw || 'null');
  const pendingState = JSON.parse(pendingStateRaw || '{}');
  const pendingOrderId = pendingState.orderId || pendingState.order_id;
  await record('Create second single-item P1 order and leave unpaid', '1-month order reaches payment selection but remains pending', `Payment page rendered; order ${pendingOrderId || 'ID in DB lookup'}`, pendingOrderId ? 'PASS' : 'FAIL', await snap(page, 'pending-payment-page'));

  await context.storageState({ path: `${artifact}/phase1-customer-storage.json` });
  await fs.writeFile(`${artifact}/phase1-identities.json`, JSON.stringify({ guestEmail, pendingEmail, primaryOrderId, pendingOrderId }, null, 2));
  await fs.writeFile(`${artifact}/phase1-browser-summary.json`, JSON.stringify({ result: 'FAIL_WITH_DOWNSTREAM_SIMULATION', steps }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
