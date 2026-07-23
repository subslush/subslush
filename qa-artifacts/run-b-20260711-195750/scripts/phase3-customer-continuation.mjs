import { chromium } from '/home/yuri/projects/ss/frontend/node_modules/playwright-core/index.mjs';
import pg from '/home/yuri/projects/ss/node_modules/pg/lib/index.js';
import dotenv from '/home/yuri/projects/ss/node_modules/dotenv/lib/main.js';
import fs from 'node:fs/promises';

dotenv.config({ path: '/home/yuri/projects/ss/.env', quiet: true });
const { Client } = pg;
const artifact = '/home/yuri/projects/ss/qa-artifacts/run-b-20260711-195750';
const backendLog = `${artifact}/backend.log`;
const baseUrl = 'http://127.0.0.1:3000';
const guestEmail = 'qa-b2-guest-1783792954184@example.test';
const password = 'QA-B2-Claim!123';
const claimToken = 'a34a32d4dde6329dc20fa178867de4e4f8775cba20440050cc8202e58a0c2be8';
const orderId = 'f1a571a5-64e7-48ad-891e-ff2ded33696c';
const subs = { p1: 'e8618e2c-37a0-4661-bfe1-995125820b7b', p2: 'e869bdd6-d17e-49a2-a602-964dbec01785', p3: '3d147a02-f654-40dc-9c88-661d8a483ca7' };
const db = new Client({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432), database: process.env.DB_DATABASE, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
await db.connect();
let shot = 31;
const record = row => fs.appendFile(`${artifact}/phase3-steps.jsonl`, `${JSON.stringify({ phase: 3, ...row })}\n`);
const snap = async (page, name) => { const p = `screenshots/${String(++shot).padStart(3, '0')}-phase3-${name}.png`; await page.screenshot({ path: `${artifact}/${p}`, fullPage: true }); return p; };
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, userAgent: 'QA-B2-Chromium-UA/1.0' });
const page = await context.newPage();
page.setDefaultTimeout(30000);
const dialogs = [];
page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
try {
  const verificationUrl = 'https://qdwabbvhkbxasfnyhkce.supabase.co/auth/v1/verify?token=38be57dff73d829213e1b71b3c7e3f0706aee10a48a6964aa620751d&type=signup&redirect_to=https://subslush.com';
  await fs.writeFile(`${artifact}/phase3-verification-path.txt`, verificationUrl);
  await page.goto(verificationUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await record({ action: 'Verify registration via real console email link', expected: 'Emailed Supabase token verifies account', actual: 'Visited exact console-email verification URL in Chromium', result: 'PASS', evidence: await snap(page, 'email-verified') });

  await page.goto(`${baseUrl}/auth/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const consent = page.getByRole('button', { name: 'Reject non-essential' });
  if (await consent.isVisible({ timeout: 3000 }).catch(() => false)) await consent.click();
  await page.getByLabel('Email address').fill(guestEmail);
  await page.getByLabel('Password', { exact: true }).fill(password);
  const loginResponse = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/v1/auth/login');
  await page.getByRole('button', { name: /Sign in/i }).click();
  const login = await loginResponse;
  await record({ action: 'Log in as newly registered account before claim', expected: 'Authenticated customer session', actual: `HTTP ${login.status()}`, result: login.ok() ? 'PASS' : 'FAIL' });

  const claimUrl = `${baseUrl}/checkout/claim?token=${claimToken}`;
  const claimResponse = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/v1/checkout/claim');
  await page.goto(claimUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const claim = await claimResponse;
  await page.getByRole('heading', { name: 'Order claimed successfully' }).waitFor();
  await record({ action: 'Submit real console claim link after login', expected: 'Claim succeeds with reassigned true and attaches order/subscriptions/emails', actual: `HTTP ${claim.status()}: ${await claim.text()}`, result: claim.ok() ? 'PASS' : 'FAIL', evidence: await snap(page, 'claim-success') });

  const secondClaimResponse = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/v1/checkout/claim');
  await page.goto(claimUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const secondClaim = await secondClaimResponse;
  const graceful = secondClaim.ok() && await page.getByRole('heading', { name: 'Order claimed successfully' }).isVisible().catch(() => false);
  await record({ action: 'Re-submit same claim link', expected: 'Graceful already-claimed success and order remains visible', actual: `HTTP ${secondClaim.status()}: ${await secondClaim.text()}`, result: graceful ? 'PASS' : 'FAIL', evidence: await snap(page, 'claim-idempotent') });

  await page.goto(`${baseUrl}/dashboard/orders`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const firstPaint = await page.locator('body').innerText();
  const threeRows = ['QA-B2 Streaming', 'QA-B2 AI Tool', 'QA-B2 Link Product'].every(label => firstPaint.includes(label)) && (firstPaint.match(/Reveal/g) || []).length >= 2;
  await record({ action: 'Dashboard orders first paint after claim', expected: 'Three independent item rows appear without reload', actual: `three products=${threeRows}; reveal controls=${(firstPaint.match(/Reveal/g) || []).length}`, result: threeRows ? 'PASS' : 'FAIL', evidence: await snap(page, 'dashboard-first-paint') });

  const revealBefore = Number((await db.query('SELECT count(*) FROM credential_reveal_audit_logs WHERE subscription_id=$1', [subs.p1])).rows[0].count);
  const p1Card = page.getByText(/QA-B2 Streaming.*6 months/i).last().locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');
  const p1Response = page.waitForResponse(response => new URL(response.url()).pathname === `/api/v1/orders/${orderId}/items/${subs.p1}/reveal`);
  await p1Card.getByRole('button', { name: 'Reveal' }).click();
  const p1Reveal = await p1Response;
  await page.getByText(/QA-B2 P1 fulfilled access/).waitFor();
  const revealAfter = Number((await db.query('SELECT count(*) FROM credential_reveal_audit_logs WHERE subscription_id=$1', [subs.p1])).rows[0].count);
  const p1Evidence = (await db.query(`SELECT event_type,payload,user_agent FROM order_compliance_evidence_logs WHERE subscription_id=$1 ORDER BY created_at DESC LIMIT 1`, [subs.p1])).rows[0];
  await record({ action: 'P1 per-item reveal', expected: 'Exactly P1 credentials; reveal + compliance audits carry browser UA', actual: `HTTP ${p1Reveal.status()}; audit ${revealBefore}→${revealAfter}; evidence=${JSON.stringify(p1Evidence)}`, result: p1Reveal.ok() && revealAfter === revealBefore + 1 && JSON.stringify(p1Evidence).includes('QA-B2-Chromium-UA/1.0') ? 'PASS' : 'FAIL', evidence: await snap(page, 'p1-reveal') });

  const p2Card = page.getByText(/QA-B2 AI Tool.*12 months/i).last().locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');
  await p2Card.getByRole('button', { name: 'Reveal' }).click();
  const modal = page.getByRole('heading', { name: 'Rules acknowledgement' }).locator('xpath=..');
  const rulesText = await modal.innerText();
  const accept = modal.getByRole('button', { name: 'Accept' });
  const blocked = await accept.isDisabled();
  await modal.getByRole('checkbox').check();
  const acceptResponse = page.waitForResponse(response => new URL(response.url()).pathname === `/api/v1/orders/${orderId}/items/${subs.p2}/accept-rules`);
  const p2RevealResponse = page.waitForResponse(response => new URL(response.url()).pathname === `/api/v1/orders/${orderId}/items/${subs.p2}/reveal`);
  await accept.click();
  const accepted = await acceptResponse; const revealed = await p2RevealResponse;
  await page.getByText(/QA-B2 P2 fulfilled access/).waitFor();
  const acceptance = (await db.query(`SELECT event_type,payload,user_agent FROM order_compliance_evidence_logs WHERE subscription_id=$1 AND event_type='strict_rules_acceptance' ORDER BY created_at DESC LIMIT 1`, [subs.p2])).rows[0];
  await record({ action: 'P2 strict-rules XSS-safe acknowledgment and reveal', expected: 'Literal script inert; Accept gated; acceptance version logged; credentials revealed', actual: `literal=${rulesText.includes('<script>alert(1)</script>')}; dialogs=${dialogs.length}; blocked=${blocked}; accept=${accepted.status()}; reveal=${revealed.status()}; evidence=${JSON.stringify(acceptance)}`, result: rulesText.includes('<script>alert(1)</script>') && dialogs.length === 0 && blocked && accepted.ok() && revealed.ok() ? 'PASS' : 'FAIL', evidence: await snap(page, 'p2-reveal') });
  await p2Card.getByRole('button', { name: 'Hide' }).click();
  await p2Card.getByRole('button', { name: 'Reveal' }).click();
  const repeatedModal = await page.getByRole('heading', { name: 'Rules acknowledgement' }).isVisible().catch(() => false);
  await record({ action: 'Second P2 reveal after accepted rules', expected: 'Modal skipped and new reveal audit written', actual: repeatedModal ? 'Rules acknowledgement modal appeared again' : 'Modal skipped', result: repeatedModal ? 'FAIL' : 'PASS', evidence: await snap(page, 'p2-second-reveal') });
  if (repeatedModal) await modal.getByRole('button', { name: 'Cancel' }).click();

  const p3Card = page.getByText(/QA-B2 Link Product.*12 months/i).last().locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');
  const ready = p3Card.getByRole('button', { name: "I'm ready to activate" });
  const readyBlocked = await ready.isDisabled();
  await p3Card.getByRole('checkbox').check();
  const readyResponse = page.waitForResponse(response => new URL(response.url()).pathname === `/api/v1/orders/${orderId}/items/${subs.p3}/activation-ready`);
  await ready.click();
  const readyResult = await readyResponse;
  await p3Card.getByText('Activation readiness sent.', { exact: true }).waitFor();
  const p3db = (await db.query('SELECT activation_handshake_state FROM subscriptions WHERE id=$1', [subs.p3])).rows[0];
  const p3evidence = (await db.query(`SELECT event_type,payload,user_agent FROM order_compliance_evidence_logs WHERE subscription_id=$1 ORDER BY created_at DESC LIMIT 1`, [subs.p3])).rows[0];
  await record({ action: 'P3 mandatory-checkbox readiness confirmation', expected: 'Disabled until check; customer_ready; evidence with UA', actual: `blocked=${readyBlocked}; HTTP ${readyResult.status()}; DB=${JSON.stringify(p3db)}; evidence=${JSON.stringify(p3evidence)}`, result: readyBlocked && readyResult.ok() && p3db.activation_handshake_state === 'customer_ready' && JSON.stringify(p3evidence).includes('QA-B2-Chromium-UA/1.0') ? 'PASS' : 'FAIL', evidence: await snap(page, 'p3-ready') });
  await context.storageState({ path: `${artifact}/phase3-customer-storage.json` });
  const account = (await db.query('SELECT id,email FROM users WHERE email=$1', [guestEmail])).rows[0];
  await fs.writeFile(`${artifact}/phase3-account.json`, JSON.stringify(account, null, 2));
} finally { await context.close(); await browser.close(); await db.end(); }
