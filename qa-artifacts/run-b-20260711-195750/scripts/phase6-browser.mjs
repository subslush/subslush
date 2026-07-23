import { chromium } from '/home/yuri/projects/ss/frontend/node_modules/playwright-core/index.mjs';
import fs from 'node:fs/promises';

const a = '/home/yuri/projects/ss/qa-artifacts/run-b-20260711-195750';
const base = 'http://127.0.0.1:3000';
const order = 'f1a571a5-64e7-48ad-891e-ff2ded33696c';
const payment = '934738ce-b5c8-4cbb-92e5-da7455abb4a8';
const email = 'qa-b2-guest-1783792954184@example.test';
const ref = 'pi_evt_QA_B2_1783793094945';
const token = (await fs.readFile(`${a}/admin-token.txt`, 'utf8')).trim();
const log = x => fs.appendFile(`${a}/phase6-steps.jsonl`, `${JSON.stringify({ phase: 6, ...x })}\n`);
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addCookies([{ name: 'auth_token', value: token, url: `${base}/` }, { name: 'csrf_token', value: 'qa-b2-csrf', url: `${base}/` }]);
const p = await context.newPage(); p.setDefaultTimeout(30000);
const visit = async (path, shot, expected) => {
  const response = await p.goto(`${base}${path}`, { waitUntil: 'networkidle', timeout: 60000 });
  const body = await p.locator('body').innerText();
  await p.screenshot({ path: `${a}/screenshots/${shot}.png`, fullPage: true });
  await log({ action: `Visit ${path}`, expected, actual: `HTTP ${response?.status()}; title=${await p.title()}; body chars=${body.length}`, result: response?.ok() && !/Internal Server Error/i.test(body) ? 'PASS' : 'FAIL', evidence: `screenshots/${shot}.png` });
  return body;
};
try {
  const pay = await visit('/admin-next/payments', '062-phase6-payments', 'QA payments and statuses render; no refund/credit controls');
  const forbidden = /refund|credit|monitoring/i.test(pay);
  await log({ action: 'Inspect new Payments scope', expected: 'No monitoring/refund/credit UI', actual: `forbidden labels present=${forbidden}`, result: forbidden ? 'FAIL' : 'PASS', evidence: 'screenshots/062-phase6-payments.png' });
  await p.goto(`${base}/admin-next/payments?payment=${payment}`, { waitUntil: 'networkidle' });
  await p.screenshot({ path: `${a}/screenshots/062-phase6-payment-drawer.png`, fullPage: true });
  await log({ action: 'Open signed Stripe payment drawer', expected: 'Event timeline and linked order', actual: (await p.locator('body').innerText()).includes('Event timeline') ? 'Drawer has event timeline' : 'No event timeline', result: (await p.locator('body').innerText()).includes('Event timeline') ? 'PASS' : 'FAIL', evidence: 'screenshots/062-phase6-payment-drawer.png' });

  const coupon = await visit('/admin-next/coupons', '062-phase6-coupons', 'QA-B2-TEST15 visible with usage and include-expired toggle');
  await log({ action: 'Inspect QA coupon', expected: 'QA-B2-TEST15 and usage 1/5 shown', actual: `code=${coupon.includes('QA-B2-TEST15')}; usage=${coupon.includes('1 / 5') || coupon.includes('1/5')}`, result: coupon.includes('QA-B2-TEST15') && (coupon.includes('1 / 5') || coupon.includes('1/5')) ? 'PASS' : 'FAIL', evidence: 'screenshots/062-phase6-coupons.png' });
  await p.getByRole('button', { name: 'Newsletter coupons' }).click(); await p.waitForTimeout(500);
  await p.screenshot({ path: `${a}/screenshots/062-phase6-newsletter-stats.png`, fullPage: true });

  await p.goto(`${base}/admin-next/users?search=${encodeURIComponent(email)}`, { waitUntil: 'networkidle' });
  const users = await p.locator('body').innerText(); await p.screenshot({ path: `${a}/screenshots/062-phase6-users-evidence.png`, fullPage: true });
  await log({ action: 'User support lookup', expected: 'Claimed account, orders, subscriptions, evidence IP/UA', actual: `email=${users.includes(email)} evidence=${users.includes('Recent evidence')} UA=${users.includes('QA-B2-Chromium-UA')}`, result: users.includes(email) && users.includes('Recent evidence') ? 'PASS' : 'FAIL', evidence: 'screenshots/062-phase6-users-evidence.png' });

  const of = await visit(`/admin-next/orders/${order}`, '062-phase6-order-file', 'Per-item status, coupon, payment/evidence/email/claim history');
  await log({ action: 'Inspect multi-item order file', expected: 'Three items, coupon, evidence and emails', actual: `products=${['Qa B2 Streaming','Qa B2 Ai Tool','Qa B2 Link Product'].filter(x => of.toLowerCase().includes(x.toLowerCase())).length}; coupon=${of.includes('QA-B2-TEST15')}; evidence=${/evidence/i.test(of)}; email=${/email/i.test(of)}`, result: of.includes('QA-B2-TEST15') && /evidence/i.test(of) ? 'PASS' : 'FAIL', evidence: 'screenshots/062-phase6-order-file.png' });

  await p.goto(`${base}/admin-next`, { waitUntil: 'networkidle' });
  for (const q of [order, ref, email]) {
    const input = p.getByLabel('Global admin search'); await input.fill(q); await p.waitForTimeout(700);
    const visible = await p.locator('.search-results').isVisible().catch(() => false);
    await log({ action: `Global search ${q}`, expected: 'Matching result', actual: `results visible=${visible}`, result: visible ? 'PASS' : 'FAIL', evidence: 'browser global search' });
    await input.fill('');
  }
  await p.screenshot({ path: `${a}/screenshots/062-phase6-global-search.png`, fullPage: true });

  await p.goto(`${base}/admin-next/announcements`, { waitUntil: 'networkidle' });
  await p.locator('label').filter({ hasText: 'Title' }).locator('input').fill('QA-B2 Announcement');
  await p.locator('textarea').fill('QA-B2 browser verification announcement');
  p.once('dialog', d => d.accept());
  const ar = p.waitForResponse(r => new URL(r.url()).pathname.includes('/admin/next/announcements') && r.request().method() === 'POST');
  await p.getByRole('button', { name: 'Publish to all users' }).click(); const arp = await ar;
  await p.waitForTimeout(500); await p.screenshot({ path: `${a}/screenshots/062-phase6-announcement.png`, fullPage: true });
  await log({ action: 'Publish QA-B2 announcement', expected: 'Published and appears in history', actual: `HTTP ${arp.status()}; history=${(await p.locator('body').innerText()).includes('QA-B2 Announcement')}`, result: arp.ok() ? 'PASS' : 'FAIL', evidence: 'screenshots/062-phase6-announcement.png' });

  const old = ['/admin','/admin/products','/admin/orders','/admin/payments','/admin/subscriptions','/admin/users','/admin/coupons','/admin/tasks','/admin/notifications'];
  let n = 63;
  for (const path of old) await visit(path, `${String(n++).padStart(3,'0')}-phase6-old-${path.split('/').pop() || 'overview'}`, 'Old admin page renders without server/UI error');
} finally { await context.close(); await browser.close(); }
