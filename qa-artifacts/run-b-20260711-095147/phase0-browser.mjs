import { chromium } from '/home/yuri/projects/ss/frontend/node_modules/playwright-core/index.mjs';
import pg from '/home/yuri/projects/ss/node_modules/pg/lib/index.js';
import dotenv from '/home/yuri/projects/ss/node_modules/dotenv/lib/main.js';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';

dotenv.config({ path: '/home/yuri/projects/ss/.env', quiet: true });
const { Client } = pg;
const artifact = '/home/yuri/projects/ss/qa-artifacts/run-b-20260711-095147';
const baseUrl = 'http://127.0.0.1:3000';
const adminToken = (await fs.readFile(`${artifact}/admin-token.txt`, 'utf8')).trim();
const steps = [];
const observedRequests = [];
let shot = 0;

async function record(action, expected, actual, pass, evidence = '') {
  const entry = { phase: 0, action, expected, actual, result: pass ? 'PASS' : 'FAIL', evidence };
  steps.push(entry);
  await fs.appendFile(`${artifact}/phase0-steps.jsonl`, `${JSON.stringify(entry)}\n`);
  if (!pass) throw new Error(`${action}: ${actual}`);
}

async function screenshot(page, name) {
  const path = `${artifact}/screenshots/${String(++shot).padStart(3, '0')}-phase0-${name}.png`;
  await page.screenshot({ path, fullPage: true });
  return path.replace('/home/yuri/projects/ss/', '');
}

async function dismissConsent(page) {
  const button = page.getByRole('button', { name: 'Reject non-essential' });
  if (await button.isVisible({ timeout: 3000 }).catch(() => false)) await button.click();
}

async function waitSubmit(page, path, method, click) {
  const start = observedRequests.length;
  await click();
  let request;
  for (let attempt = 0; attempt < 150; attempt += 1) {
    request = observedRequests.slice(start).find(candidate => candidate.method() === method && new URL(candidate.url()).pathname === path);
    if (request) break;
    await page.waitForTimeout(100);
  }
  if (!request) throw new Error(`${method} ${path} was not observed after real pointer click`);
  const response = await request.response();
  if (!response) throw new Error(`${method} ${path} emitted but produced no response`);
  return response;
}

async function createProduct(page, spec) {
  await page.goto(`${baseUrl}/admin-next/products`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await dismissConsent(page);
  const existing = page.getByText(spec.name, { exact: true });
  if (!(await existing.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: '+ New product' }).click();
    await page.getByLabel('Name').fill(spec.name);
    await page.getByLabel('Slug').fill(spec.slug);
    await page.getByLabel('Service type').fill(spec.serviceType);
    const createResponse = await waitSubmit(page, '/api/v1/admin/products', 'POST', () =>
      page.getByRole('button', { name: 'Create inactive product' }).click()
    );
    await page.getByText(spec.name, { exact: true }).waitFor();
    await record(`Create ${spec.name} in Products UI`, 'POST request and visible inactive product', `HTTP ${createResponse.status()}, product listed`, createResponse.ok(), await screenshot(page, `${spec.key}-created`));
  } else {
    await record(`Resume ${spec.name} after harness selector correction`, 'Use the already-created QA-B1 product without duplicate writes', 'Existing inactive product visible', true, await screenshot(page, `${spec.key}-resume`));
  }
  await page.getByText(spec.name, { exact: true }).click();
  await page.waitForURL(/\/admin-next\/products\/[0-9a-f-]{36}$/);
  const productId = page.url().split('/').pop();

  await page.getByLabel('Category', { exact: true }).fill('QA-B1');
  await page.getByLabel('Sub-category', { exact: true }).fill('Browser walkthrough');
  await page.getByLabel('Description', { exact: true }).fill(`${spec.name} browser walkthrough fixture`);
  const basicsResponse = await waitSubmit(page, `/api/v1/admin/products/${productId}`, 'PATCH', () =>
    page.getByRole('button', { name: 'Save basics' }).click()
  );
  await page.getByText('Product saved.', { exact: true }).waitFor();
  await record(`Save ${spec.name} basics`, 'Fields persist through visible request', `HTTP ${basicsResponse.status()}, success shown`, basicsResponse.ok());

  await page.getByRole('button', { name: 'Variants & Terms' }).click();
  const variantSelect = page.getByLabel('Variant for term');
  const existingVariant = page.locator('.list b', { hasText: spec.variantName });
  let variantId;
  if (!(await existingVariant.isVisible().catch(() => false))) {
    await page.getByPlaceholder('Name').fill(spec.variantName);
    await page.getByPlaceholder('Code').fill(spec.variantCode);
    await page.getByPlaceholder('Service plan').fill(spec.servicePlan);
    const variantResponse = await waitSubmit(page, '/api/v1/admin/product-variants', 'POST', () =>
      page.getByRole('button', { name: 'Add variant' }).click()
    );
    await existingVariant.waitFor();
    variantId = await variantSelect.inputValue();
    await record(`Create ${spec.name} variant`, 'Variant request and visible row', `HTTP ${variantResponse.status()}, variant ${variantId}`, variantResponse.ok());
  } else {
    variantId = await variantSelect.inputValue();
    await record(`Resume existing ${spec.name} variant`, 'No duplicate variant write', `Variant ${variantId} visible`, true);
  }

  for (const months of spec.terms) {
    const existingTerm = page.locator('.list p', { hasText: `${months} months` });
    if (!(await existingTerm.isVisible().catch(() => false))) {
      await variantSelect.selectOption(variantId);
      await page.getByLabel('Term months').fill(String(months));
      const termResponse = await waitSubmit(page, '/api/v1/admin/product-variant-terms', 'POST', () =>
        page.getByRole('button', { name: 'Add term' }).click()
      );
      await existingTerm.waitFor();
      await record(`Add ${months}-month term to ${spec.name}`, 'Term saves via UI', `HTTP ${termResponse.status()}, term visible`, termResponse.ok());
    } else {
      await record(`Resume existing ${months}-month term on ${spec.name}`, 'No duplicate term write', 'Term visible', true);
    }
  }

  if (!spec.snapshotless) {
    await page.getByRole('button', { name: 'Pricing' }).click();
    await page.getByLabel('Variant for price').selectOption(variantId);
    const formatted = `$${(spec.priceCents / 100).toFixed(2)}`;
    if (!(await page.locator('.list p', { hasText: formatted }).isVisible().catch(() => false))) {
      await page.getByLabel('Price cents', { exact: true }).fill(String(spec.priceCents));
      const priceResponse = await waitSubmit(page, '/api/v1/admin/price-history/current', 'POST', () =>
        page.getByRole('button', { name: 'Set current price' }).click()
      );
      await page.getByText('Current price saved.', { exact: true }).waitFor();
      await record(`Set ${spec.name} current price separately`, 'Price request succeeds and price is visible', `HTTP ${priceResponse.status()}`, priceResponse.ok(), await screenshot(page, `${spec.key}-price`));
    } else {
      await record(`Resume existing ${spec.name} current price`, 'No duplicate price publication', `${formatted} visible`, true, await screenshot(page, `${spec.key}-price-resume`));
    }
  }

  if (spec.options) {
    await page.getByRole('button', { name: 'Fulfillment settings' }).click();
    const own = page.getByText('Own account', { exact: true });
    const newAccount = page.getByText('New account', { exact: true });
    if (spec.options.allowOwn && !(await own.locator('xpath=../preceding-sibling::input').isChecked())) await own.click();
    if (!spec.options.allowNew && await newAccount.locator('xpath=../preceding-sibling::input').isChecked()) await newAccount.click();
    if (spec.options.mmu) {
      const mmuToggle = page.getByText('Manual monthly upgrade (MMU)', { exact: true }).locator('xpath=../preceding-sibling::input');
      if (!(await mmuToggle.isChecked())) await page.getByText('Manual monthly upgrade (MMU)', { exact: true }).click();
      await page.getByLabel('Interval (months)').fill(String(spec.options.interval));
    }
    if (spec.options.strict) {
      const strictToggle = page.getByText('Strict rules', { exact: true }).locator('xpath=../preceding-sibling::input');
      if (!(await strictToggle.isChecked())) await page.getByText('Strict rules', { exact: true }).click();
      await page.getByLabel('Rules text').fill(spec.options.rules);
    }
    if (spec.options.handshake) {
      const handshakeToggle = page.getByText('Activation-link handshake', { exact: true }).locator('xpath=../preceding-sibling::input');
      if (!(await handshakeToggle.isChecked())) await page.getByText('Activation-link handshake', { exact: true }).click();
      await page.getByLabel('Default instruction template').fill(spec.options.instructions);
    }
    const settingsResponse = await waitSubmit(page, `/api/v1/admin/products/${productId}`, 'PATCH', () =>
      page.getByRole('button', { name: 'Save fulfillment settings' }).click()
    );
    await page.getByText('Product saved.', { exact: true }).waitFor();
    await record(`Save ${spec.name} fulfillment settings`, 'Settings save with visible success', `HTTP ${settingsResponse.status()}`, settingsResponse.ok(), await screenshot(page, `${spec.key}-fulfillment`));
  }
  return { productId, variantId };
}

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  recordHar: { path: `${artifact}/network/phase0.har`, mode: 'full', content: 'embed' },
});
await context.addCookies([
  { name: 'auth_token', value: adminToken, url: `${baseUrl}/` },
  { name: 'csrf_token', value: 'qa-b1-csrf', url: `${baseUrl}/` },
]);
const page = await context.newPage();
page.setDefaultTimeout(15000);
page.on('dialog', async dialog => { await fs.appendFile(`${artifact}/phase0-dialogs.log`, `${dialog.type()}: ${dialog.message()}\n`); await dialog.dismiss(); });
page.on('request', request => {
  observedRequests.push(request);
  if (request.url().includes('/api/')) void fs.appendFile(`${artifact}/network/phase0-requests.jsonl`, `${JSON.stringify({ method: request.method(), url: request.url(), postData: request.postData() })}\n`);
});

try {
  const specs = [
    { key: 'p1', name: 'QA-B1 Streaming', slug: 'qa-b1-streaming', serviceType: 'streaming', variantName: 'QA-B1 Streaming Plan', variantCode: 'QA-B1-P1', servicePlan: 'Streaming', terms: [1, 6], priceCents: 4900, options: { allowNew: true, allowOwn: true, mmu: true, interval: 1 } },
    { key: 'p2', name: 'QA-B1 AI Tool', slug: 'qa-b1-ai-tool', serviceType: 'ai_tool', variantName: 'QA-B1 AI Annual', variantCode: 'QA-B1-P2', servicePlan: 'AI Annual', terms: [12], priceCents: 12000, options: { allowNew: true, allowOwn: false, mmu: true, interval: 2, strict: true, rules: 'QA-B1 DISTINCTIVE RULES: never share access. <script>alert(1)</script>' } },
    { key: 'p3', name: 'QA-B1 Link Product', slug: 'qa-b1-link-product', serviceType: 'activation_link', variantName: 'QA-B1 Link Annual', variantCode: 'QA-B1-P3', servicePlan: 'Link Annual', terms: [12], priceCents: 9900, options: { allowNew: true, allowOwn: false, handshake: true, instructions: 'QA-B1 custom instructions: confirm readiness, then activate the delivered link within two hours.' } },
  ];
  const ids = {};
  for (const spec of specs) ids[spec.key] = await createProduct(page, spec);

  await page.goto(`${baseUrl}/admin-next/products/${ids.p1.productId}`, { waitUntil: 'domcontentloaded' });
  await dismissConsent(page);
  await page.getByRole('button', { name: 'Fulfillment settings' }).click();
  await page.getByLabel('Interval (months)').fill('4');
  const rejectResponse = await waitSubmit(page, `/api/v1/admin/products/${ids.p1.productId}`, 'PATCH', () => page.getByRole('button', { name: 'Save fulfillment settings' }).click());
  await page.getByText('Term length must be divisible by the MMU interval.', { exact: true }).waitFor();
  await record('Negative MMU divisibility: set P1 interval 4 with 6-month term', 'Visible divisibility error and rejected request', `HTTP ${rejectResponse.status()}, exact error visible`, !rejectResponse.ok(), await screenshot(page, 'p1-mmu-negative'));
  await page.getByLabel('Interval (months)').fill('1');
  const restoreResponse = await waitSubmit(page, `/api/v1/admin/products/${ids.p1.productId}`, 'PATCH', () => page.getByRole('button', { name: 'Save fulfillment settings' }).click());
  await record('Restore P1 MMU interval to 1', 'Supported setting restored', `HTTP ${restoreResponse.status()}`, restoreResponse.ok());

  for (const spec of specs) {
    const id = ids[spec.key].productId;
    await page.goto(`${baseUrl}/admin-next/products/${id}`, { waitUntil: 'domcontentloaded' });
    await page.getByLabel('Status').selectOption('active');
    const response = await waitSubmit(page, `/api/v1/admin/products/${id}`, 'PATCH', () => page.getByRole('button', { name: 'Save basics' }).click());
    await page.locator('header .status-chip', { hasText: 'Active' }).waitFor();
    await record(`Activate ${spec.name}`, 'Snapshot-backed product activates', `HTTP ${response.status()}, Active chip visible`, response.ok());
  }

  const throwawaySpec = { key: 'snapshotless', name: 'QA-B1 Snapshotless Negative', slug: 'qa-b1-snapshotless-negative', serviceType: 'negative', variantName: 'QA-B1 Snapshotless Variant', variantCode: 'QA-B1-NEG', servicePlan: 'Negative', terms: [1], snapshotless: true };
  ids.snapshotless = await createProduct(page, throwawaySpec);
  const directPriceId = randomUUID();
  const exactSql = `INSERT INTO price_history (id, product_variant_id, price_cents, currency, metadata) VALUES ('${directPriceId}', '${ids.snapshotless.variantId}', 999, 'USD', '{}'::jsonb);`;
  const db = new Client({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432), database: process.env.DB_DATABASE, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
  await db.connect();
  await db.query(exactSql);
  await fs.appendFile(`${artifact}/db-manipulations.log`, `[PERMITTED-SIMULATION] Snapshot-less activation negative\n${exactSql}\n`);
  await page.goto(`${baseUrl}/admin-next/products/${ids.snapshotless.productId}`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Status').selectOption('active');
  const activationRefusal = await waitSubmit(page, `/api/v1/admin/products/${ids.snapshotless.productId}`, 'PATCH', () => page.getByRole('button', { name: 'Save basics' }).click());
  await page.locator('.error-banner').waitFor();
  const refusalText = await page.locator('.error-banner').innerText();
  await record('Snapshot-less product activation negative', 'Activation refused without snapshot-backed active USD price', `HTTP ${activationRefusal.status()}: ${refusalText}`, !activationRefusal.ok(), await screenshot(page, 'snapshotless-refusal'));

  const snapshots = (await db.query(`SELECT p.id AS product_id, p.name, pv.id AS variant_id, ph.id AS price_id, ph.metadata->>'snapshot_id' AS snapshot_id, ppr.status AS snapshot_status FROM products p JOIN product_variants pv ON pv.product_id=p.id JOIN price_history ph ON ph.product_variant_id=pv.id AND ph.ends_at IS NULL LEFT JOIN pricing_publish_runs ppr ON ppr.snapshot_id::text=ph.metadata->>'snapshot_id' WHERE p.id = ANY($1::uuid[]) ORDER BY p.name`, [[ids.p1.productId, ids.p2.productId, ids.p3.productId]])).rows;
  await fs.writeFile(`${artifact}/phase0-snapshot-db.json`, JSON.stringify(snapshots, null, 2));
  const distinct = new Set(snapshots.map(row => row.snapshot_id));
  const snapshotPass = snapshots.length === 3 && distinct.size === 3 && snapshots.every(row => row.snapshot_id && row.snapshot_status === 'succeeded');
  await record('Verify three pricing snapshots in DB', 'Three distinct succeeded snapshot IDs attached to current price metadata', JSON.stringify(snapshots), snapshotPass, 'phase0-snapshot-db.json');
  await db.end();

  await page.goto(`${baseUrl}/admin-next/coupons`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Code').fill('QA-B1-TEST15');
  await page.getByLabel('Percent off').fill('15');
  await page.getByLabel('Scope').selectOption('global');
  await page.getByLabel('Apply to').selectOption('highest_eligible_item');
  await page.getByLabel('Max redemptions').fill('5');
  await page.getByLabel('Start').fill('2026-07-10T00:00');
  await page.getByLabel('End').fill('2026-07-20T23:59');
  const couponResponse = await waitSubmit(page, '/api/v1/admin/coupons', 'POST', () => page.getByRole('button', { name: 'Create coupon' }).click());
  await page.locator('.row .mono', { hasText: 'QA-B1-TEST15' }).waitFor();
  await record('Create QA-B1-TEST15 coupon', '15%, global, highest item, max 5, active window and listed', `HTTP ${couponResponse.status()}, coupon listed`, couponResponse.ok(), await screenshot(page, 'coupon-created'));

  await fs.writeFile(`${artifact}/phase0-ids.json`, JSON.stringify(ids, null, 2));
  await fs.writeFile(`${artifact}/phase0-summary.json`, JSON.stringify({ result: 'PASS', steps }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
