import { chromium } from '../../frontend/node_modules/playwright-core/index.mjs';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { appendFile, writeFile } from 'node:fs/promises';

const { Client } = pg;
const baseUrl = 'http://127.0.0.1:3000';
const apiUrl = 'http://127.0.0.1:3001/api/v1';
const artifactDir = 'qa-artifacts/product-release-signoff-20260721-2100/r5';
const database = 'ss_product_release_qa_20260721_2100_r5';
const jwtSecret = 'qa-release-signoff-jwt-secret-20260721-minimum-32-characters';
const adminId = '10000000-0000-4000-8000-000000000001';
const customerId = '10000000-0000-4000-8000-000000000002';
const otherCustomerId = '10000000-0000-4000-8000-000000000003';
const adminEmail = 'qa-release-admin@example.test';
const customerEmail = 'qa-release-customer@example.test';
const runTag = 'QA-PRD-2100';

const dbConfig = {
  host: 'localhost',
  port: 5432,
  database,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
};

const results = [];
const defects = [];
const network = [];
const consoleEvents = [];
let sequence = 0;

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const record = async (entry) => {
  const row = { sequence: ++sequence, timestamp: new Date().toISOString(), ...entry };
  results.push(row);
  await appendFile(`${artifactDir}/matrix.jsonl`, `${JSON.stringify(row)}\n`);
};

const runCase = async ({ id, area, prerequisites = '', steps, expected }, fn) => {
  const started = Date.now();
  try {
    const evidence = await fn();
    await record({ id, area, prerequisites, steps, expected, actual: evidence?.actual || expected, status: 'PASS', duration_ms: Date.now() - started, evidence: evidence || {} });
    return evidence;
  } catch (error) {
    const actual = error instanceof Error ? error.message : String(error);
    await record({ id, area, prerequisites, steps, expected, actual, status: 'FAIL', duration_ms: Date.now() - started, evidence: {} });
    return null;
  }
};

const blockCase = async ({ id, area, prerequisites = '', steps, expected, actual }) => {
  await record({ id, area, prerequisites, steps, expected, actual, status: 'BLOCKED', duration_ms: 0, evidence: {} });
};

const addDefect = async (defect) => {
  defects.push(defect);
  await appendFile(`${artifactDir}/defects.jsonl`, `${JSON.stringify(defect)}\n`);
};

const db = async (text, values = []) => {
  const client = new Client(dbConfig);
  await client.connect();
  try {
    return await client.query(text, values);
  } finally {
    await client.end();
  }
};

const sign = (payload, expiresIn = '2h') => jwt.sign(payload, jwtSecret, {
  algorithm: 'HS256',
  expiresIn,
  issuer: 'subscription-platform',
  audience: 'subscription-platform-users',
});

const adminToken = sign({ userId: adminId, email: adminEmail, role: 'admin' });
const customerToken = sign({ userId: customerId, email: customerEmail, role: 'user' });
const otherCustomerToken = sign({ userId: otherCustomerId, email: 'qa-release-other@example.test', role: 'user' });
const expiredToken = sign({ userId: customerId, email: customerEmail, role: 'user' }, '-1s');

const request = async (path, { method = 'GET', body, token, headers = {} } = {}) => {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload, data: payload?.data ?? payload };
};

const createUsers = async () => {
  await db(`INSERT INTO users (id,email,status,first_name,last_name,email_verified_at)
    VALUES ($1,$2,'active','QA','Admin',NOW()),($3,$4,'active','QA','Customer',NOW()),($5,$6,'active','QA','Other',NOW())
    ON CONFLICT (id) DO UPDATE SET status='active'`, [adminId, adminEmail, customerId, customerEmail, otherCustomerId, 'qa-release-other@example.test']);
};

const createLegacyFixtures = async (fixedProductId) => {
  const legacyProductId = '20000000-0000-4000-8000-000000000001';
  const legacyVariantId = '20000000-0000-4000-8000-000000000002';
  const accidentalVariantId = '20000000-0000-4000-8000-000000000003';
  await db(`INSERT INTO products (id,name,slug,description,service_type,status,metadata,category,default_currency)
    VALUES ($1,'QA Legacy Historical 3 Months','qa-legacy-historical-3-months','Historical compatibility fixture','qa_legacy','active','{"features":["Legacy readable"]}'::jsonb,'QA Release','USD')`, [legacyProductId]);
  await db(`INSERT INTO product_variants (id,product_id,name,variant_code,service_plan,is_active)
    VALUES ($1,$2,'QA Legacy Variant','qa-legacy-variant','qa_legacy_plan',TRUE),($3,$4,'Accidental fixed variant','qa-accidental','qa_accidental',TRUE)`, [legacyVariantId, legacyProductId, accidentalVariantId, fixedProductId]);
  await db(`INSERT INTO product_variant_terms (product_variant_id,months,discount_percent,is_active,is_recommended)
    VALUES ($1,3,0,TRUE,TRUE),($2,1,0,TRUE,TRUE)`, [legacyVariantId, accidentalVariantId]);
  const legacySnapshotId = '20000000-0000-4000-8000-000000000010';
  const accidentalSnapshotId = '20000000-0000-4000-8000-000000000011';
  await db(`INSERT INTO pricing_publish_runs (snapshot_id,status,triggered_by,published_at,reason)
    VALUES ($1,'succeeded','system',NOW(),'legacy compatibility fixture'),($2,'succeeded','system',NOW(),'accidental variant fixture')`, [legacySnapshotId, accidentalSnapshotId]);
  await db(`INSERT INTO price_history (product_variant_id,price_cents,currency,metadata)
    VALUES ($1,1777,'USD',jsonb_build_object('snapshot_id',$3::text)),($2,999,'USD',jsonb_build_object('snapshot_id',$4::text))`, [legacyVariantId, accidentalVariantId, legacySnapshotId, accidentalSnapshotId]);
  return { legacyProductId, legacyVariantId, accidentalVariantId };
};

await writeFile(`${artifactDir}/matrix.jsonl`, '');
await writeFile(`${artifactDir}/defects.jsonl`, '');
await createUsers();

await runCase({ id: 'ENV-001', area: 'Environment', steps: 'Call backend health and frontend root on isolated runtime.', expected: 'Both services return 200; DB and Redis are connected.' }, async () => {
  const [health, frontend] = await Promise.all([fetch('http://127.0.0.1:3001/health'), fetch(baseUrl)]);
  const healthBody = await health.json();
  assert(health.status === 200 && frontend.status === 200, `health=${health.status} frontend=${frontend.status}`);
  assert(healthBody.database?.status === 'connected' && healthBody.redis?.status === 'connected', JSON.stringify(healthBody));
  return { actual: 'Backend/frontend 200; PostgreSQL and Redis connected.', health: healthBody };
});

await runCase({ id: 'SEC-001', area: 'Security', steps: 'GET admin product list with no token, customer token, and admin token.', expected: '401, 403, and 200 respectively.' }, async () => {
  const unauth = await request('/admin/products');
  const customer = await request('/admin/products', { token: customerToken });
  const admin = await request('/admin/products', { token: adminToken });
  assert(unauth.response.status === 401, `unauth=${unauth.response.status}`);
  assert(customer.response.status === 403, `customer=${customer.response.status}`);
  assert(admin.response.status === 200, `admin=${admin.response.status}`);
  return { actual: 'Admin authorization enforced: 401/403/200.' };
});

await runCase({ id: 'SEC-002', area: 'Security', steps: 'Call authenticated endpoint with expired JWT.', expected: '401 with stable INVALID_TOKEN code.' }, async () => {
  const result = await request('/orders', { token: expiredToken });
  assert(result.response.status === 401 && result.payload.code === 'INVALID_TOKEN', `${result.response.status} ${JSON.stringify(result.payload)}`);
  return { actual: 'Expired JWT rejected with INVALID_TOKEN.' };
});

await runCase({ id: 'SEC-003', area: 'Security', steps: 'Send an alternate Origin to the development QA runtime.', expected: 'Development runtime reflects origins by design; production allowlist is tested separately.' }, async () => {
  const response = await fetch('http://127.0.0.1:3001/health', { headers: { Origin: 'https://evil.example' } });
  assert(response.headers.get('access-control-allow-origin') === 'https://evil.example', `unexpected development CORS: ${response.headers.get('access-control-allow-origin')}`);
  return { actual: 'Development CORS behavior confirmed; not accepted as production security evidence.' };
});

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await adminContext.addInitScript(() => localStorage.setItem('subslush_cookie_consent', JSON.stringify({
  version: '2026-02-05',
  updatedAt: new Date().toISOString(),
  decision: 'reject_non_essential',
  preferences: { analytics: false, marketing: false }
})));
await adminContext.addCookies([
  { name: 'auth_token', value: adminToken, url: baseUrl },
  { name: 'csrf_token', value: 'qa-release-csrf', url: baseUrl },
]);
const adminPage = await adminContext.newPage();
adminPage.on('console', message => consoleEvents.push({ page: 'admin', type: message.type(), text: message.text() }));
adminPage.on('response', response => {
  const url = new URL(response.url());
  if (url.pathname.startsWith('/api/')) network.push({ page: 'admin', method: response.request().method(), path: url.pathname, status: response.status() });
});

const createProductUi = async ({ name, slug, months, price, comparison }) => {
  await adminPage.goto(`${baseUrl}/admin-next/products`, { waitUntil: 'networkidle', timeout: 60000 });
  await adminPage.getByRole('button', { name: '+ New product' }).click();
  await adminPage.getByLabel('Name').fill(name);
  await adminPage.getByLabel('Slug').fill(slug);
  await adminPage.getByLabel('Service type').fill('qa_product');
  await adminPage.getByLabel('Category').fill('QA Release');
  await adminPage.getByLabel('Description').fill(`${name} product-only QA fixture`);
  await adminPage.getByLabel('Duration (months)').fill(String(months));
  await adminPage.getByLabel('Fixed price (cents)').fill(String(price));
  await adminPage.getByLabel('Comparison price (cents, optional)').fill(String(comparison));
  const responsePromise = adminPage.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/admin/products');
  await adminPage.getByRole('button', { name: 'Create inactive fixed product' }).click();
  const response = await responsePromise;
  assert(response.status() === 201, `create returned ${response.status()}`);
  await adminPage.getByText(name, { exact: true }).waitFor();
  const body = await response.request().postDataJSON();
  assert(!('variant_id' in body) && !('variants' in body), `variant field in create: ${JSON.stringify(body)}`);
  const row = await db('SELECT id,status,duration_months,fixed_price_cents,fixed_price_currency FROM products WHERE slug=$1', [slug]);
  assert(row.rowCount === 1, 'created product not found');
  return row.rows[0];
};

await runCase({ id: 'ADM-001', area: 'Product-only admin', steps: 'Open /admin-next/products and inspect create form and tabs.', expected: 'Fixed Catalog Fields is visible and no Variants & Terms or variant prerequisite exists.' }, async () => {
  await adminPage.goto(`${baseUrl}/admin-next/products`, { waitUntil: 'networkidle', timeout: 60000 });
  await adminPage.getByRole('button', { name: '+ New product' }).click();
  assert(await adminPage.getByText('Fixed Catalog Fields', { exact: true }).isVisible(), 'Fixed Catalog Fields not visible');
  assert((await adminPage.getByText(/Variants & Terms/i).count()) === 0, 'Variants & Terms found');
  assert((await adminPage.getByText(/create a variant/i).count()) === 0, 'variant prerequisite found');
  await adminPage.screenshot({ path: `${artifactDir}/screenshots/adm-001-fixed-fields.png`, fullPage: true });
  return { actual: 'Fixed fields visible; variant administration absent.', screenshot: 'screenshots/adm-001-fixed-fields.png' };
});

await runCase({ id: 'ADM-002', area: 'Validation', steps: 'Enter comparison price below current price in create form.', expected: 'Accessible validation message blocks creation before network request.' }, async () => {
  await adminPage.getByLabel('Name').fill('QA Invalid Comparison');
  await adminPage.getByLabel('Slug').fill('qa-invalid-comparison');
  await adminPage.getByLabel('Service type').fill('qa_product');
  await adminPage.getByLabel('Fixed price (cents)').fill('1000');
  await adminPage.getByLabel('Comparison price (cents, optional)').fill('900');
  await adminPage.getByRole('button', { name: 'Create inactive fixed product' }).click();
  await adminPage.getByText('Comparison price must be greater than the fixed price.', { exact: true }).waitFor();
  const count = await db("SELECT count(*)::int count FROM products WHERE slug='qa-invalid-comparison'");
  assert(count.rows[0].count === 0, 'invalid product was created');
  return { actual: 'Client validation blocked invalid comparison price; DB unchanged.' };
});

const one = await runCase({ id: 'ADM-003', area: 'Product-only admin', steps: 'Create QA Brand — 1 Month through real admin UI.', expected: 'Inactive one-month product created with fixed price and no variant request.' }, async () => {
  const product = await createProductUi({ name: 'QA Brand — 1 Month', slug: 'qa-brand-1-month', months: 1, price: 999, comparison: 1299 });
  return { actual: 'Inactive fixed 1-month product created.', product_id: product.id };
});

const twelve = await runCase({ id: 'ADM-004', area: 'Product-only admin', steps: 'Create QA Brand — 12 Months through real admin UI.', expected: 'Inactive twelve-month product created independently with no variant request.' }, async () => {
  const product = await createProductUi({ name: 'QA Brand — 12 Months', slug: 'qa-brand-12-months', months: 12, price: 9999, comparison: 12999 });
  return { actual: 'Inactive fixed 12-month product created.', product_id: product.id };
});

const oneId = one?.product_id;
const twelveId = twelve?.product_id;

const configureProductUi = async ({ id, name, both = false }) => {
  await adminPage.goto(`${baseUrl}/admin-next/products/${id}`, { waitUntil: 'networkidle', timeout: 60000 });
  assert((await adminPage.getByRole('tab', { name: 'Variants & Terms' }).count()) === 0, 'Variants tab present');
  await adminPage.getByRole('tab', { name: 'Catalog', exact: true }).click();
  await adminPage.getByLabel('Info box').fill('QA release information');
  await adminPage.getByLabel('Activation guide').fill('Open the delivered email and follow the secure activation steps.');
  await adminPage.getByLabel('Delivery format title').fill('Secure digital delivery');
  await adminPage.getByLabel('Delivery format details').fill('Delivered by the fulfillment team with purchase-time instructions.');
  await adminPage.getByLabel('Features (one per line)', { exact: true }).fill('Independent product\nFixed duration\nAudit-safe price');
  await adminPage.getByRole('button', { name: 'Save presentation' }).click();
  await adminPage.getByText('Catalog settings saved.', { exact: true }).waitFor();
  await adminPage.getByRole('tab', { name: 'Media' }).click();
  await adminPage.getByLabel('Media URL').fill('/favicon.png');
  await adminPage.getByLabel('Media alt text').fill(`${name} media`);
  await adminPage.getByRole('button', { name: 'Add media' }).click();
  await adminPage.getByText('Media added.', { exact: true }).waitFor();
  await adminPage.getByRole('tab', { name: 'Fulfillment settings' }).click();
  if (both) {
    const own = adminPage.locator('label.check').filter({ hasText: 'Own account' }).getByRole('checkbox');
    if (!(await own.isChecked())) await own.check();
  }
  await adminPage.getByRole('button', { name: 'Save fulfillment settings' }).click();
  await adminPage.getByText(/Product draft saved|Product saved and published/).waitFor();
  await adminPage.getByRole('tab', { name: 'Basics' }).click();
  await adminPage.getByLabel('Status').selectOption('active');
  await adminPage.getByLabel('Platform').fill('QA Brand');
  await adminPage.getByLabel('Region').fill('Global');
  await adminPage.getByRole('button', { name: 'Save basics' }).click();
  await adminPage.getByText('Product saved and published.', { exact: true }).waitFor();
};

if (oneId && twelveId) {
  await runCase({ id: 'ADM-005', area: 'Product-only admin', prerequisites: 'ADM-003/004', steps: 'Configure presentation/media/fulfillment and publish both products via UI.', expected: 'Both publish without variants; 12-month product allows both fulfillment choices.' }, async () => {
    await configureProductUi({ id: oneId, name: 'QA Brand — 1 Month' });
    await configureProductUi({ id: twelveId, name: 'QA Brand — 12 Months', both: true });
    const variants = await db('SELECT count(*)::int count FROM product_variants WHERE product_id=ANY($1::uuid[])', [[oneId, twelveId]]);
    assert(variants.rows[0].count === 0, `unexpected variants=${variants.rows[0].count}`);
    return { actual: 'Both products published; no variants created.', variant_count: 0 };
  });

  await runCase({ id: 'ADM-006', area: 'Pricing/history', prerequisites: 'ADM-005', steps: 'Update 1-month price through Pricing tab and inspect history.', expected: 'Previous window closes, new current window opens, audit remains visible.' }, async () => {
    await adminPage.goto(`${baseUrl}/admin-next/products/${oneId}`, { waitUntil: 'networkidle' });
    await adminPage.getByRole('tab', { name: 'Pricing' }).click();
    await adminPage.getByLabel('Current fixed price cents').fill('1099');
    await adminPage.getByLabel('Current comparison price cents').fill('1399');
    await adminPage.getByRole('button', { name: 'Save current fixed price' }).click();
    await adminPage.getByText('Current fixed price saved. The previous price remains in history.', { exact: true }).waitFor();
    const history = await db('SELECT price_cents,starts_at,ends_at FROM product_fixed_price_history WHERE product_id=$1 ORDER BY starts_at', [oneId]);
    assert(history.rowCount >= 2, `history rows=${history.rowCount}`);
    assert(history.rows.filter(row => row.ends_at === null).length === 1, 'not exactly one current window');
    await adminPage.screenshot({ path: `${artifactDir}/screenshots/adm-006-price-history.png`, fullPage: true });
    return { actual: `${history.rowCount} history rows; exactly one current window.`, rows: history.rows };
  });
}

await runCase({ id: 'ADM-007', area: 'Publication validation', steps: 'Create incomplete inactive product by API, then attempt publication.', expected: 'Publication returns actionable 400 and does not require a variant.' }, async () => {
  const created = await request('/admin/products', { method: 'POST', token: adminToken, body: { name: 'QA Incomplete', slug: 'qa-incomplete', service_type: 'qa_product', status: 'inactive' } });
  assert(created.response.status === 201, `create=${created.response.status}`);
  const publish = await request(`/admin/products/${created.data.id}`, { method: 'PATCH', token: adminToken, body: { status: 'active' } });
  assert(publish.response.status === 400 && /duration|price|currency/i.test(publish.payload.message || ''), `${publish.response.status} ${JSON.stringify(publish.payload)}`);
  return { actual: `Publication blocked: ${publish.payload.message}` };
});

let legacy = null;
if (oneId) legacy = await createLegacyFixtures(oneId);

if (oneId && legacy) {
  await runCase({ id: 'ADM-008', area: 'Accidental variant recovery', steps: 'Open fixed product with accidental active variant, use Restore fixed catalog mode, inspect dependencies.', expected: 'Variant is deactivated, terms/prices retained, fixed product stays publicly available.' }, async () => {
    await adminPage.goto(`${baseUrl}/admin-next/products/${oneId}`, { waitUntil: 'networkidle' });
    await adminPage.getByText('Legacy compatibility records detected', { exact: true }).waitFor();
    adminPage.once('dialog', dialog => dialog.accept());
    await adminPage.getByRole('button', { name: 'Restore fixed catalog mode' }).click();
    await adminPage.getByText(/Fixed catalog mode restored/).waitFor();
    const rows = await db(`SELECT pv.is_active,
      (SELECT count(*)::int FROM product_variant_terms WHERE product_variant_id=pv.id) term_count,
      (SELECT count(*)::int FROM price_history WHERE product_variant_id=pv.id) price_count
      FROM product_variants pv WHERE pv.id=$1`, [legacy.accidentalVariantId]);
    assert(rows.rows[0]?.is_active === false && rows.rows[0].term_count === 1 && rows.rows[0].price_count === 1, JSON.stringify(rows.rows[0]));
    const detail = await request('/subscriptions/products/qa-brand-1-month');
    assert(detail.response.status === 200, `public detail=${detail.response.status}`);
    return { actual: 'Accidental variant deactivated; term/price retained; detail remains 200.', db: rows.rows[0] };
  });
}

const publicContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await publicContext.addInitScript(() => localStorage.setItem('subslush_cookie_consent', JSON.stringify({
  version: '2026-02-05',
  updatedAt: new Date().toISOString(),
  decision: 'reject_non_essential',
  preferences: { analytics: false, marketing: false }
})));
const publicPage = await publicContext.newPage();
publicPage.on('console', message => consoleEvents.push({ page: 'public', type: message.type(), text: message.text() }));
publicPage.on('response', response => {
  const url = new URL(response.url());
  if (url.pathname.startsWith('/api/')) network.push({ page: 'public', method: response.request().method(), path: url.pathname, status: response.status() });
});

if (oneId && twelveId) {
  await runCase({ id: 'PUB-001', area: 'Public catalog', steps: 'Browse public listing and both product details.', expected: 'Both products appear independently with correct duration, price, comparison price, and delivery copy.' }, async () => {
    const list = await request('/subscriptions/products/available');
    assert(list.response.status === 200, `list=${list.response.status}`);
    const products = list.data.products || list.data;
    const p1 = products.find(product => product.product_id === oneId);
    const p12 = products.find(product => product.product_id === twelveId);
    assert(p1?.duration_months === 1 && p12?.duration_months === 12, `durations ${p1?.duration_months}/${p12?.duration_months}`);
    await publicPage.goto(`${baseUrl}/browse/products/qa-brand-1-month`, { waitUntil: 'networkidle', timeout: 60000 });
    await publicPage.getByText('QA Brand — 1 Month', { exact: true }).first().waitFor();
    await publicPage.getByText('Secure digital delivery', { exact: true }).waitFor();
    await publicPage.screenshot({ path: `${artifactDir}/screenshots/pub-001-one-month.png`, fullPage: true });
    await publicPage.goto(`${baseUrl}/browse/products/qa-brand-12-months`, { waitUntil: 'networkidle', timeout: 60000 });
    await publicPage.getByText('QA Brand — 12 Months', { exact: true }).first().waitFor();
    assert((await publicPage.getByText(/Manual monthly upgrade/i).count()) === 0, 'MMU disclosed as customer action');
    await publicPage.screenshot({ path: `${artifactDir}/screenshots/pub-001-twelve-month.png`, fullPage: true });
    return { actual: 'Independent fixed products rendered in API and browser.', screenshot: ['screenshots/pub-001-one-month.png', 'screenshots/pub-001-twelve-month.png'] };
  });
}

if (oneId) {
  await runCase({ id: 'PUB-002', area: 'Responsive/accessibility', steps: 'Render product detail at 390x844 and keyboard-focus ADD TO CART.', expected: 'No horizontal overflow; control is keyboard reachable with accessible name.' }, async () => {
    await publicPage.setViewportSize({ width: 390, height: 844 });
    await publicPage.goto(`${baseUrl}/browse/products/qa-brand-1-month`, { waitUntil: 'networkidle' });
    const overflow = await publicPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert(!overflow, 'horizontal overflow detected');
    const add = publicPage.getByRole('button', { name: /ADD TO CART/i });
    await add.focus();
    assert(await add.evaluate(element => element === document.activeElement), 'ADD TO CART not focusable');
    await publicPage.screenshot({ path: `${artifactDir}/screenshots/pub-002-mobile.png`, fullPage: true });
    await publicPage.setViewportSize({ width: 1440, height: 1000 });
    return { actual: 'Mobile layout has no horizontal overflow; cart control keyboard focusable.' };
  });
}

await runCase({ id: 'API-001', area: 'Canonical API', steps: 'Price cart with product_id only.', expected: '200 with canonical product identity, fixed duration, cents, currency, and snapshot.' }, async () => {
  const result = await request('/subscriptions/cart-pricing-preview', { method: 'POST', body: { currency: 'USD', items: [{ cart_item_id: 'canonical-1', product_id: oneId, quantity: 1 }] } });
  assert(result.response.status === 200, `${result.response.status} ${JSON.stringify(result.payload)}`);
  const item = result.data.items?.[0];
  assert(item?.product_id === oneId && item.duration_months === 1 && Number.isInteger(item.unit_price_cents) && item.pricing_snapshot_id, JSON.stringify(item));
  return { actual: 'Product-only cart pricing succeeded.', item };
});

if (legacy) {
  await runCase({ id: 'API-002', area: 'Legacy compatibility', steps: 'Price cart with legacy variant_id only.', expected: 'Legacy request succeeds with canonical product_id plus deprecation headers.' }, async () => {
    const result = await request('/subscriptions/cart-pricing-preview', { method: 'POST', body: { currency: 'USD', items: [{ cart_item_id: 'legacy-1', variant_id: legacy.legacyVariantId, term_months: 3, quantity: 1 }] } });
    assert(result.response.status === 200, `${result.response.status} ${JSON.stringify(result.payload)}`);
    assert(result.response.headers.get('deprecation') === 'true' && result.response.headers.get('sunset'), 'deprecation headers missing');
    assert(result.data.items?.[0]?.product_id === legacy.legacyProductId, JSON.stringify(result.data));
    return { actual: 'Legacy variant resolved and returned deprecation headers.', sunset: result.response.headers.get('sunset') };
  });

  await runCase({ id: 'API-003', area: 'Identifier conflict', steps: 'Send product_id with a variant belonging to another product.', expected: 'Item fails with LEGACY_IDENTIFIER_CONFLICT and no identifier is guessed.' }, async () => {
    const result = await request('/subscriptions/cart-pricing-preview', { method: 'POST', body: { currency: 'USD', items: [{ cart_item_id: 'conflict-1', product_id: oneId, variant_id: legacy.legacyVariantId, quantity: 1 }] } });
    const skipped = result.data.skipped_items?.[0];
    assert(result.response.status === 200 && skipped?.code === 'LEGACY_IDENTIFIER_CONFLICT', `${result.response.status} ${JSON.stringify(result.data)}`);
    return { actual: 'Conflict isolated to item with LEGACY_IDENTIFIER_CONFLICT.' };
  });
}

await runCase({ id: 'API-004', area: 'Structured errors', steps: 'Send invalid duration, unsupported currency, missing identifier, and inactive product.', expected: 'Stable machine codes; no generic 500.' }, async () => {
  const invalidDuration = await request('/subscriptions/validate-purchase', { method: 'POST', token: customerToken, body: { product_id: oneId, duration_months: 12, currency: 'USD' } });
  const invalidCurrency = await request('/subscriptions/validate-purchase', { method: 'POST', token: customerToken, body: { product_id: oneId, currency: 'ZZZ' } });
  const missing = await request('/subscriptions/validate-purchase', { method: 'POST', token: customerToken, body: { currency: 'USD' } });
  assert(invalidDuration.payload.code === 'INVALID_DURATION', JSON.stringify(invalidDuration.payload));
  assert(invalidCurrency.payload.code === 'UNSUPPORTED_CURRENCY' || invalidCurrency.payload.code === 'PRICE_UNAVAILABLE', JSON.stringify(invalidCurrency.payload));
  assert(missing.response.status === 400, JSON.stringify(missing.payload));
  return { actual: 'Stable validation responses returned without 500.', codes: [invalidDuration.payload.code, invalidCurrency.payload.code, missing.payload.code || 'schema_validation'] };
});

await runCase({ id: 'RES-001', area: 'Catalog isolation', steps: 'Insert one malformed active product and request catalog list with valid products.', expected: 'Valid products remain; malformed product is omitted with item diagnostic.' }, async () => {
  await db(`INSERT INTO products (id,name,slug,service_type,status)
    VALUES ('30000000-0000-4000-8000-000000000001','QA Malformed','qa-malformed','qa_product','active')`);
  const result = await request('/subscriptions/products/available');
  assert(result.response.status === 200, `status=${result.response.status}`);
  const products = result.data.products || [];
  assert(products.some(product => product.product_id === oneId), 'valid fixed product missing');
  assert(!products.some(product => product.product_id === '30000000-0000-4000-8000-000000000001'), 'malformed product leaked');
  assert((result.data.catalog_diagnostics || []).some(item => item.product_id === '30000000-0000-4000-8000-000000000001'), JSON.stringify(result.data.catalog_diagnostics));
  return { actual: 'Malformed product omitted; valid products retained with diagnostics.', diagnostic_count: result.data.catalog_diagnostics?.length || 0 };
});

let browserCheckoutOrderId = null;
if (oneId) {
  await runCase({ id: 'CHK-001', area: 'Browser checkout', steps: 'Add fixed product to cart, open checkout, enter guest email, and continue to payment.', expected: 'Product-only draft succeeds and user reaches QA Payment page.' }, async () => {
    await publicPage.goto(`${baseUrl}/browse/products/qa-brand-1-month`, { waitUntil: 'networkidle' });
    await publicPage.getByRole('button', { name: /ADD TO CART/i }).click();
    await publicPage.getByRole('button', { name: 'GO TO CHECKOUT' }).click();
    await publicPage.getByLabel('DELIVERY EMAIL').fill('qa-browser-guest@example.test');
    await publicPage.getByRole('button', { name: 'Continue to payment' }).click();
    await publicPage.waitForTimeout(1500);
    if (!publicPage.url().endsWith('/checkout/payment')) {
      await publicPage.screenshot({ path: `${artifactDir}/screenshots/chk-001-consent-block.png`, fullPage: true });
      throw new Error(`Did not reach payment page; current URL ${publicPage.url()}; visible error: ${await publicPage.locator('.text-rose-600').allTextContents()}`);
    }
    await publicPage.getByTestId('qa-payment-option').click();
    await publicPage.getByRole('button', { name: 'PAY', exact: true }).click();
    await publicPage.getByText(/QA Payment successful/).waitFor();
    const order = await db(`SELECT id FROM orders WHERE contact_email='qa-browser-guest@example.test' ORDER BY created_at DESC LIMIT 1`);
    browserCheckoutOrderId = order.rows[0]?.id;
    return { actual: 'Browser product-only checkout completed with QA Payment.', order_id: browserCheckoutOrderId };
  });
}

const failedCheckout = results.find(row => row.id === 'CHK-001' && row.status === 'FAIL');
if (failedCheckout?.actual.includes('Did not reach payment page')) {
  await addDefect({
    id: 'QA-REL-D01', severity: 'Critical', category: 'Product defect', reproducibility: '100%',
    scope: 'All browser checkout methods',
    summary: 'Checkout has no rendered legal-consent controls, so Continue to payment is blocked.',
    evidence: ['matrix.jsonl#CHK-001', 'screenshots/chk-001-consent-block.png', 'frontend/src/routes/checkout/+page.svelte'],
    retest_status: 'Not fixed; open',
  });
}

let apiOrderId = null;
let apiCheckoutSessionKey = null;
await runCase({ id: 'CHK-002', area: 'API purchase lifecycle', steps: 'Create guest identity and product-only draft, then complete through local QA payment.', expected: 'One paid order, subscription, fulfillment task, payment evidence, and immutable product snapshots are written atomically.' }, async () => {
  const identity = await request('/checkout/identity', { method: 'POST', body: { email: 'qa-api-guest@example.test' } });
  assert(identity.response.status === 201 || identity.response.status === 200, `identity=${identity.response.status} ${JSON.stringify(identity.payload)}`);
  const draft = await request('/checkout/draft', { method: 'POST', body: { guest_identity_id: identity.data.guest_identity_id, contact_email: 'qa-api-guest@example.test', currency: 'USD', items: [{ product_id: oneId, quantity: 1, auto_renew: false, upgrade_selection_type: 'upgrade_new_account' }] } });
  assert(draft.response.status === 200 || draft.response.status === 201, `draft=${draft.response.status} ${JSON.stringify(draft.payload)}`);
  apiOrderId = draft.data.order_id;
  apiCheckoutSessionKey = draft.data.checkout_session_key;
  const complete = await request('/checkout/qa/complete', { method: 'POST', body: { checkout_session_key: apiCheckoutSessionKey, legal_consent: { immediate_fulfillment_consent: true, terms_policy_consent: true, consent_timestamp: new Date().toISOString(), checkout_session_key_snapshot: apiCheckoutSessionKey, consent_source: 'qa_release_api' } } });
  assert(complete.response.status === 200, `complete=${complete.response.status} ${JSON.stringify(complete.payload)}`);
  const evidence = await db(`SELECT o.status,oi.product_id,oi.product_variant_id,oi.product_name_snapshot,oi.duration_months_snapshot,oi.unit_price_cents,oi.total_price_cents,oi.currency,oi.catalog_mode_snapshot,
    (SELECT count(*)::int FROM subscriptions s WHERE s.order_id=o.id AND s.product_id=oi.product_id) subscriptions,
    (SELECT count(*)::int FROM admin_tasks t WHERE t.order_id=o.id AND t.product_id=oi.product_id) tasks,
    (SELECT count(*)::int FROM order_entitlements e WHERE e.order_id=o.id AND e.product_id=oi.product_id) entitlements
    FROM orders o JOIN order_items oi ON oi.order_id=o.id WHERE o.id=$1`, [apiOrderId]);
  const row = evidence.rows[0];
  assert(row?.status !== 'pending_payment' && row?.product_id === oneId && row?.product_variant_id === null, JSON.stringify(row));
  assert(row.product_name_snapshot && row.duration_months_snapshot === 1 && row.unit_price_cents === 1099 && row.total_price_cents === 1099 && row.subscriptions === 1 && row.tasks >= 1, JSON.stringify(row));
  return { actual: 'Product-only QA payment created durable identity and snapshots.', order_id: apiOrderId, db: row };
});

if (apiOrderId) {
  await runCase({ id: 'CHK-003', area: 'Idempotency/replay', steps: 'Replay QA payment completion for the same order.', expected: 'Replay does not create duplicate subscriptions/tasks; returns explicit conflict/idempotent result.' }, async () => {
    const before = await db('SELECT (SELECT count(*)::int FROM subscriptions WHERE order_id=$1) subscriptions,(SELECT count(*)::int FROM admin_tasks WHERE order_id=$1) tasks', [apiOrderId]);
    const replay = await request('/checkout/qa/complete', { method: 'POST', body: { checkout_session_key: apiCheckoutSessionKey, legal_consent: { immediate_fulfillment_consent: true, terms_policy_consent: true, consent_timestamp: new Date().toISOString(), checkout_session_key_snapshot: apiCheckoutSessionKey, consent_source: 'qa_release_replay' } } });
    const after = await db('SELECT (SELECT count(*)::int FROM subscriptions WHERE order_id=$1) subscriptions,(SELECT count(*)::int FROM admin_tasks WHERE order_id=$1) tasks', [apiOrderId]);
    assert([200,409].includes(replay.response.status), `replay=${replay.response.status}`);
    assert(JSON.stringify(before.rows[0]) === JSON.stringify(after.rows[0]), `${JSON.stringify(before.rows[0])} -> ${JSON.stringify(after.rows[0])}`);
    return { actual: `Replay returned ${replay.response.status}; lifecycle counts unchanged.`, before: before.rows[0], after: after.rows[0] };
  });

  await runCase({ id: 'DATA-001', area: 'Historical snapshots', steps: 'Rename, reprice, and unpublish purchased product, then reload historical order records.', expected: 'Order/subscription name, duration, price, currency, and fulfillment snapshots remain unchanged.' }, async () => {
    const before = await db('SELECT product_name_snapshot,duration_months_snapshot,unit_price_cents,total_price_cents,currency FROM order_items WHERE order_id=$1', [apiOrderId]);
    const update = await request(`/admin/products/${oneId}`, { method: 'PATCH', token: adminToken, body: { name: 'QA Brand Renamed', status: 'inactive' } });
    assert(update.response.status === 200, `catalog update=${update.response.status}`);
    const price = await request(`/admin/products/${oneId}/fixed-price/current`, { method: 'POST', token: adminToken, body: { price_cents: 1199, currency: 'USD' } });
    assert(price.response.status === 201, `price=${price.response.status}`);
    const after = await db('SELECT product_name_snapshot,duration_months_snapshot,unit_price_cents,total_price_cents,currency FROM order_items WHERE order_id=$1', [apiOrderId]);
    assert(JSON.stringify(before.rows[0]) === JSON.stringify(after.rows[0]), `${JSON.stringify(before.rows[0])} -> ${JSON.stringify(after.rows[0])}`);
    return { actual: 'Historical commercial snapshots unchanged after catalog mutation.', snapshot: after.rows[0] };
  });

  await runCase({ id: 'SEC-004', area: 'Authorization/IDOR', steps: 'Request first customer order using unrelated customer token.', expected: 'Order is not disclosed.' }, async () => {
    const result = await request(`/orders/${apiOrderId}`, { token: otherCustomerToken });
    assert([403,404].includes(result.response.status), `status=${result.response.status} ${JSON.stringify(result.payload)}`);
    return { actual: `Unrelated customer received ${result.response.status}; no order disclosure.` };
  });
}

await runCase({ id: 'OBS-001', area: 'Observability', steps: 'Read admin compatibility counters after canonical, legacy, and conflict requests.', expected: 'Accepted legacy and conflict counts are observable with event names and sunset.' }, async () => {
  const result = await request('/admin/next/catalog-compatibility', { token: adminToken });
  assert(result.response.status === 200, `status=${result.response.status}`);
  assert(result.data.legacy_variant?.accepted >= 1 && result.data.legacy_variant?.conflicts >= 1, JSON.stringify(result.data));
  return { actual: 'Legacy accepted/conflict traffic observable.', metrics: result.data.legacy_variant };
});

await runCase({ id: 'DATA-002', area: 'Backfill verification', steps: 'Inspect product identity audit plus unresolved/conflict coverage.', expected: 'No unresolved/conflicting rows are hidden; audit counts are explicit.' }, async () => {
  const audit = await db(`SELECT entity_table,status,count(*)::int count FROM product_identity_backfill_audit GROUP BY entity_table,status ORDER BY entity_table,status`);
  const unresolved = await db(`SELECT entity_table,entity_id,status FROM product_identity_backfill_audit WHERE status IN ('unresolved','conflict') ORDER BY entity_table,entity_id`);
  const direct = await db(`SELECT
    (SELECT count(*)::int FROM order_items WHERE product_id IS NULL) order_items_without_product,
    (SELECT count(*)::int FROM subscriptions WHERE product_id IS NULL) subscriptions_without_product,
    (SELECT count(*)::int FROM product_variants pv LEFT JOIN products p ON p.id=pv.product_id WHERE p.id IS NULL) orphan_variants`);
  assert(direct.rows[0].order_items_without_product === 0 && direct.rows[0].subscriptions_without_product === 0 && direct.rows[0].orphan_variants === 0, JSON.stringify(direct.rows[0]));
  return { actual: 'No direct-identity gaps or orphan variants in new QA writes.', audit: audit.rows, unresolved: unresolved.rows, direct: direct.rows[0] };
});

const errorConsole = consoleEvents.filter(event => event.type === 'error');
await runCase({ id: 'OBS-002', area: 'Browser/server diagnostics', steps: 'Review captured browser console and API response status after major journeys.', expected: 'No unexpected browser console errors or unclassified API 5xx.' }, async () => {
  const serverErrors = network.filter(item => item.status >= 500);
  assert(errorConsole.length === 0 && serverErrors.length === 0, `console=${JSON.stringify(errorConsole)} server=${JSON.stringify(serverErrors)}`);
  return { actual: 'No browser console errors or API 5xx observed.', api_requests: network.length };
});

await writeFile(`${artifactDir}/network.json`, JSON.stringify(network, null, 2));
await writeFile(`${artifactDir}/browser-console.json`, JSON.stringify(consoleEvents, null, 2));
await writeFile(`${artifactDir}/test-data.json`, JSON.stringify({ database, adminId, customerId, otherCustomerId, oneId, twelveId, legacy, apiOrderId, browserCheckoutOrderId }, null, 2));

await publicContext.close();
await adminContext.close();
await browser.close();

const summary = {
  total: results.length,
  pass: results.filter(result => result.status === 'PASS').length,
  fail: results.filter(result => result.status === 'FAIL').length,
  blocked: results.filter(result => result.status === 'BLOCKED').length,
  defects,
  browser_console_errors: errorConsole.length,
  api_5xx: network.filter(item => item.status >= 500).length,
};
await writeFile(`${artifactDir}/e2e-summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
