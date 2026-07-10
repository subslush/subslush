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
    visible: () => page.locator('.list b', { hasText: variantName }).waitFor(),
  });

  const productId = page.url().split('/').pop();
  const variantsTab = page.locator('form').filter({
    has: page.getByRole('button', { name: 'Add variant' }),
  });
  const termsForm = page.locator('form').filter({
    has: page.getByRole('button', { name: 'Add term' }),
  });
  await termsForm.getByLabel('Variant for term').selectOption({ label: variantName });
  await termsForm.getByLabel('Term months').fill('6');
  await submitAndAssert({
    requestPath: '/api/v1/admin/product-variant-terms',
    click: () => termsForm.getByRole('button', { name: 'Add term' }).click(),
    visible: () => page.locator('.list p', { hasText: '6 months' }).waitFor(),
  });

  await page.getByRole('button', { name: 'Pricing' }).click();
  const priceForm = page.locator('form').filter({
    has: page.getByRole('button', { name: 'Set current price' }),
  });
  await priceForm.getByLabel('Variant for price').selectOption({ label: variantName });
  await priceForm.getByLabel('Price cents').fill('1234');
  await submitAndAssert({
    requestPath: '/api/v1/admin/price-history/current',
    click: () => priceForm.getByRole('button', { name: 'Set current price' }).click(),
    visible: () => page.locator('.list p', { hasText: '$12.34' }).waitFor(),
  });

  await page.getByRole('button', { name: 'Fulfillment settings' }).click();
  await page.getByText('Manual monthly upgrade (MMU)', { exact: true }).click();
  await page.getByLabel('Interval (months)').fill('1');
  await page.getByText('Activation-link handshake', { exact: true }).click();
  await page.getByLabel('Default instruction template').fill('SMOKE handshake instructions');
  await page.getByText('Strict rules', { exact: true }).click();
  await page.getByLabel('Rules text').fill('SMOKE strict rules');
  await submitAndAssert({
    requestPath: `/api/v1/admin/products/${productId}`,
    click: () => page.getByRole('button', { name: 'Save fulfillment settings' }).click(),
    visible: () => page.getByText('Product saved.', { exact: true }).waitFor(),
  });

  await page.getByLabel('Interval (months)').fill('4');
  const rejectedSave = page.waitForResponse(response =>
    response.request().method() === 'PATCH' &&
    new URL(response.url()).pathname === `/api/v1/admin/products/${productId}`
  );
  await page.getByRole('button', { name: 'Save fulfillment settings' }).click();
  if ((await rejectedSave).ok()) throw new Error('MMU divisibility rejection unexpectedly saved.');
  await page.getByText('Term length must be divisible by the MMU interval.', { exact: true }).waitFor();

  await page.getByRole('button', { name: 'Basics' }).click();
  await page.getByLabel('Status').selectOption('active');
  await submitAndAssert({
    requestPath: `/api/v1/admin/products/${productId}`,
    click: () => page.getByRole('button', { name: 'Save basics' }).click(),
    visible: () => page.getByText('Active', { exact: true }).waitFor(),
  });

  const couponCode = `${runId}-COUPON`;
  await page.goto(`${baseUrl}/admin-next/coupons`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.getByLabel('Code').fill(couponCode);
  await page.getByLabel('Percent off').fill('15');
  await page.getByLabel('Max redemptions').fill('3');
  await submitAndAssert({
    requestPath: '/api/v1/admin/coupons',
    click: () => page.getByRole('button', { name: 'Create coupon' }).click(),
    visible: () => page.locator('.row .mono', { hasText: couponCode }).waitFor(),
  });

  const announcementTitle = `${runId} announcement`;
  page.once('dialog', dialog => dialog.accept());
  await page.goto(`${baseUrl}/admin-next/announcements`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.getByLabel('Title').fill(announcementTitle);
  await page.getByLabel('Message').fill('SMOKE announcement message');
  await submitAndAssert({
    requestPath: '/api/v1/admin/notifications/announcements',
    click: () => page.getByRole('button', { name: 'Publish to all users' }).click(),
    visible: () => page.locator('.row span', { hasText: announcementTitle }).waitFor(),
  });

  console.log(`PASS admin-next smoke: ${productName} -> ${variantName} -> catalog/coupon/announcement`);
} finally {
  await browser.close();
}
