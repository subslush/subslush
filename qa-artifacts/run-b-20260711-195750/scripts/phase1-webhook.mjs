import pg from '/home/yuri/projects/ss/node_modules/pg/lib/index.js';
import dotenv from '/home/yuri/projects/ss/node_modules/dotenv/lib/main.js';
import { createHmac } from 'node:crypto';
import fs from 'node:fs/promises';

dotenv.config({ path: '/home/yuri/projects/ss/.env', quiet: true });
const { Client } = pg;
const artifact = '/home/yuri/projects/ss/qa-artifacts/run-b-20260711-195750';
const ids = JSON.parse(
  await fs.readFile(`${artifact}/phase1-identities.json`, 'utf8')
);
const db = new Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_DATABASE,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});
await db.connect();
const orderBefore = (
  await db.query(
    'SELECT id,total_cents,currency,status FROM orders WHERE id=$1',
    [ids.primaryOrderId]
  )
).rows[0];
let eventId = 'evt_QA_B2_1783757604060';
if (orderBefore.status !== 'in_process') {
  eventId = `evt_QA_B2_${Date.now()}`;
  const raw = JSON.stringify({
    id: eventId,
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: `cs_${eventId}`,
        object: 'checkout.session',
        payment_intent: `pi_${eventId}`,
        amount_total: Number(orderBefore.total_cents),
        currency: String(orderBefore.currency || 'USD').toLowerCase(),
        metadata: { order_id: ids.primaryOrderId },
      },
    },
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET)
    .update(`${timestamp}.${raw}`)
    .digest('hex');
  const response = await fetch(
    'http://127.0.0.1:3001/api/v1/payments/stripe/webhook',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': `t=${timestamp},v1=${signature}`,
      },
      body: raw,
    }
  );
  const responseText = await response.text();
  await fs.writeFile(
    `${artifact}/phase1-signed-webhook.json`,
    JSON.stringify(
      {
        request: JSON.parse(raw),
        signature_header: `t=${timestamp},v1=<redacted>`,
        status: response.status,
        response: responseText,
      },
      null,
      2
    )
  );
  if (!response.ok)
    throw new Error(
      `Signed webhook failed ${response.status}: ${responseText}`
    );
}
const assertions = {
  order: (
    await db.query(
      "SELECT id,status,subtotal_cents,discount_cents,total_cents,metadata->>'pricing_snapshot_id' AS header_snapshot FROM orders WHERE id=$1",
      [ids.primaryOrderId]
    )
  ).rows[0],
  items: (
    await db.query(
      `SELECT oi.id,oi.term_months,oi.coupon_discount_cents,oi.metadata->>'pricing_snapshot_id' AS item_snapshot,ph.metadata->>'snapshot_id' AS variant_snapshot FROM order_items oi JOIN LATERAL (SELECT metadata FROM price_history WHERE product_variant_id=oi.product_variant_id AND ends_at IS NULL ORDER BY starts_at DESC LIMIT 1) ph ON TRUE WHERE oi.order_id=$1 ORDER BY oi.created_at`,
      [ids.primaryOrderId]
    )
  ).rows,
  subscription_count: Number(
    (
      await db.query('SELECT count(*) FROM subscriptions WHERE order_id=$1', [
        ids.primaryOrderId,
      ])
    ).rows[0].count
  ),
  task_count: Number(
    (
      await db.query('SELECT count(*) FROM admin_tasks WHERE order_id=$1', [
        ids.primaryOrderId,
      ])
    ).rows[0].count
  ),
  coupon: (
    await db.query(
      `SELECT cr.status,cr.reserved_at,cr.redeemed_at,c.code,c.max_redemptions,(SELECT count(*)::int FROM coupon_redemptions used WHERE used.coupon_id=c.id AND used.status='redeemed') AS redemptions_used FROM coupon_redemptions cr JOIN coupons c ON c.id=cr.coupon_id WHERE cr.order_id=$1`,
      [ids.primaryOrderId]
    )
  ).rows[0],
  payments: (
    await db.query(
      'SELECT id,status,provider,provider_payment_id,amount,currency FROM payments WHERE order_id=$1 ORDER BY created_at',
      [ids.primaryOrderId]
    )
  ).rows,
};
assertions.pass =
  assertions.order.status === 'in_process' &&
  assertions.order.header_snapshot === null &&
  assertions.items.length === 3 &&
  assertions.items.every(
    item => item.item_snapshot && item.item_snapshot === item.variant_snapshot
  ) &&
  assertions.subscription_count === 3 &&
  assertions.task_count === 3 &&
  assertions.coupon?.status === 'redeemed';
await fs.writeFile(
  `${artifact}/phase1-db-assertions.json`,
  JSON.stringify(assertions, null, 2)
);
await fs.appendFile(
  `${artifact}/phase1-steps.jsonl`,
  `${JSON.stringify({ phase: 1, action: 'Correctly HMAC-signed Stripe checkout.session.completed simulation', expected: 'Order in_process; 3 subscriptions/tasks; coupon redeemed; per-line snapshots; null header snapshot', actual: JSON.stringify(assertions), result: assertions.pass ? 'PASS' : 'FAIL', evidence: 'phase1-signed-webhook.json; phase1-db-assertions.json' })}\n`
);
await fs.appendFile(
  `${artifact}/simulations.log`,
  `[PERMITTED-PAYMENT-SIMULATION] HMAC-signed Stripe checkout.session.completed for order ${ids.primaryOrderId}; event ${eventId}; amount ${orderBefore.total_cents}. Evidence phase1-signed-webhook.json.\n`
);
await db.end();
if (!assertions.pass) process.exitCode = 1;
