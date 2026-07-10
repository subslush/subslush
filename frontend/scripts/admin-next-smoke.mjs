import { chromium } from 'playwright-core';

const baseUrl = process.env.SMOKE_ADMIN_NEXT_URL || 'http://127.0.0.1:3000';
const adminToken = process.env.SMOKE_ADMIN_TOKEN;
const chromePath = process.env.SMOKE_CHROME_PATH || '/usr/bin/google-chrome';

if (!adminToken) {
  throw new Error('SMOKE_ADMIN_TOKEN must contain a local admin JWT.');
}

const runId = `SMOKE-${Date.now()}`;
const productName = `${runId} Product`;
const productSlug = `${runId.toLowerCase()}-product`;
const variantName = `${runId} Variant`;

const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  const context = await browser.newContext();
  await context.addCookies([
    { name: 'auth_token', value: adminToken, url: `${baseUrl}/` },
    { name: 'csrf_token', value: 'smoke-csrf-token', url: `${baseUrl}/` },
  ]);
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);

  async function submitAndAssert({ requestPath, click, visible }) {
    const response = page.waitForResponse(response =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === requestPath
    );
    await click();
    const matched = await response;
    if (!matched.ok()) {
      throw new Error(`${requestPath} returned ${matched.status()}`);
    }
    await visible();
  }

  const productsNavigationStartedAt = performance.now();
  await page.goto(`${baseUrl}/admin-next/products`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  const newProductButton = page.getByRole('button', { name: '+ New product' });
  await newProductButton.waitFor({ state: 'visible' });
  if (!(await newProductButton.isEnabled())) {
    throw new Error('New product control did not become enabled after hydration.');
  }
  console.log(
    `products-page-interactive-ms=${Math.round(performance.now() - productsNavigationStartedAt)}`
  );
  await newProductButton.click();
  await page.getByLabel('Name').fill(productName);
  await page.getByLabel('Slug').fill(productSlug);
  await page.getByLabel('Service type').fill('smoke');
  await submitAndAssert({
    requestPath: '/api/v1/admin/products',
    click: () => page.getByRole('button', { name: 'Create inactive product' }).click(),
    visible: () => page.getByText(productName, { exact: true }).waitFor(),
  });

  await page.getByText(productName, { exact: true }).click();
  await page.getByRole('button', { name: 'Variants & Terms' }).click();
  await page.getByPlaceholder('Name').fill(variantName);
  await page.getByPlaceholder('Code').fill(`${runId}-variant`);
  await submitAndAssert({
    requestPath: '/api/v1/admin/product-variants',
    click: () => page.getByRole('button', { name: 'Add variant' }).click(),
    visible: () => page.getByText(variantName, { exact: true }).waitFor(),
  });

  console.log(`PASS admin-next smoke: ${productName} -> ${variantName}`);
} finally {
  await browser.close();
}
