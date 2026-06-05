import { env } from '../config/environment';
import {
  closeDatabasePool,
  createDatabasePool,
  getDatabasePool,
  testDatabaseConnection,
} from '../config/database';
import { orderService } from '../services/orderService';
import { paymentRepository } from '../services/paymentRepository';
import { paymentService } from '../services/paymentService';
import { subscriptionService } from '../services/subscriptionService';
import type { OrderWithItems } from '../types/order';
import type { UnifiedPayment, WebhookPayload } from '../types/payment';
import { Logger } from '../utils/logger';

const SCRIPT_ACTOR = 'script:replay-nowpayments-order';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CliOptions = {
  orderId: string;
  dryRun: boolean;
  deliver: boolean;
  requireCredentials: boolean;
};

const usage = (): string =>
  `
Usage:
  npm run order:replay-nowpayments -- --order <order-id> [--deliver] [--dry-run] [--allow-without-credentials]

Examples:
  npm run order:replay-nowpayments -- --order e5556f39-1445-46e6-a804-5bc2ee069e07
  npm run order:replay-nowpayments -- --order e5556f39-1445-46e6-a804-5bc2ee069e07 --deliver

Behavior:
  - Replays a synthetic NOWPayments "finished" webhook through paymentService.processWebhook().
  - Optionally runs the delivery step afterwards.
  - If the order is already delivered and --deliver is supplied, replays delivery dates and resends the delivery email.
`.trim();

function parseArgs(argv: string[]): CliOptions {
  let orderId = '';
  let dryRun = false;
  let deliver = false;
  let requireCredentials = true;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? '';

    if (arg === '--order') {
      orderId = (argv[index + 1] || '').trim();
      index += 1;
      continue;
    }

    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }

    if (arg === '--deliver') {
      deliver = true;
      continue;
    }

    if (arg === '--allow-without-credentials') {
      requireCredentials = false;
      continue;
    }

    if (!arg.startsWith('--') && !orderId) {
      orderId = arg.trim();
      continue;
    }

    throw new Error(`Unknown argument: ${arg}\n\n${usage()}`);
  }

  if (!UUID_PATTERN.test(orderId)) {
    throw new Error(`A valid order UUID is required.\n\n${usage()}`);
  }

  return {
    orderId,
    dryRun,
    deliver,
    requireCredentials,
  };
}

function readString(
  metadata: Record<string, any>,
  keys: string[]
): string | null {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value !== 'string') {
      continue;
    }
    const normalized = value.trim();
    if (normalized.length > 0) {
      return normalized;
    }
  }
  return null;
}

function readNumber(
  metadata: Record<string, any>,
  keys: string[]
): number | null {
  for (const key of keys) {
    const raw = metadata[key];
    const parsed =
      typeof raw === 'number'
        ? raw
        : typeof raw === 'string'
          ? Number(raw)
          : Number.NaN;
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return null;
}

function buildFallbackDescription(order: OrderWithItems): string {
  const descriptions = order.items
    .map(item => item.description?.trim() || '')
    .filter(Boolean);
  if (descriptions.length > 0) {
    return descriptions.join(', ');
  }
  return `Order ${order.id}`;
}

async function resolveOrderPayment(
  order: OrderWithItems
): Promise<UnifiedPayment | null> {
  if (
    order.payment_provider === 'nowpayments' &&
    typeof order.payment_reference === 'string' &&
    order.payment_reference.trim().length > 0
  ) {
    const byReference = await paymentRepository.findByProviderPaymentId(
      'nowpayments',
      order.payment_reference.trim()
    );
    if (byReference) {
      return byReference;
    }
  }

  const latestSubscriptionPayment = await paymentRepository.findLatestByOrderId(
    'nowpayments',
    order.id,
    'subscription'
  );
  if (latestSubscriptionPayment) {
    return latestSubscriptionPayment;
  }

  return paymentRepository.findLatestByOrderId('nowpayments', order.id);
}

function buildSyntheticWebhookPayload(
  order: OrderWithItems,
  payment: UnifiedPayment
): WebhookPayload {
  const metadata = payment.metadata || {};
  const priceCurrency =
    readString(metadata, ['price_currency', 'priceCurrency']) ||
    order.currency?.trim().toLowerCase() ||
    payment.currency ||
    'usd';
  const payCurrency =
    readString(metadata, ['pay_currency', 'payCurrency']) || 'btc';
  const priceAmount =
    readNumber(metadata, ['price_amount', 'priceAmount']) ?? payment.amount;
  const payAmount =
    readNumber(metadata, ['pay_amount', 'payAmount']) ?? priceAmount;
  const actuallyPaid =
    readNumber(metadata, ['actually_paid', 'actuallyPaid']) ?? payAmount;
  const orderDescription =
    readString(metadata, ['order_description', 'orderDescription']) ||
    buildFallbackDescription(order);
  const payload: WebhookPayload = {
    payment_id: payment.providerPaymentId,
    payment_status: 'finished',
    pay_address:
      readString(metadata, ['pay_address', 'payAddress']) ||
      'manual-demo-replay',
    price_amount: priceAmount,
    price_currency: priceCurrency,
    pay_amount: payAmount,
    actually_paid: actuallyPaid,
    pay_currency: payCurrency,
    order_id: order.id,
    order_description: orderDescription,
    purchase_id:
      readString(metadata, ['purchase_id', 'purchaseId']) ||
      `manual_replay_${order.id}`,
  };

  const outcomeAmount = readNumber(metadata, [
    'outcome_amount',
    'outcomeAmount',
  ]);
  if (outcomeAmount !== null) {
    payload.outcome_amount = outcomeAmount;
  }

  const outcomeCurrency = readString(metadata, [
    'outcome_currency',
    'outcomeCurrency',
  ]);
  if (outcomeCurrency) {
    payload.outcome_currency = outcomeCurrency;
  }

  const payinHash = readString(metadata, ['payin_hash', 'payinHash']);
  if (payinHash) {
    payload.payin_hash = payinHash;
  }

  const payoutHash = readString(metadata, ['payout_hash', 'payoutHash']);
  if (payoutHash) {
    payload.payout_hash = payoutHash;
  }

  return payload;
}

async function readClaimEmailEligibility(order: OrderWithItems): Promise<{
  isGuestUser: boolean;
  hasGuestIdentity: boolean;
  hasContactEmail: boolean;
  eligible: boolean;
}> {
  const pool = getDatabasePool();
  const userResult = await pool.query(
    'SELECT is_guest FROM users WHERE id = $1 LIMIT 1',
    [order.user_id]
  );

  const isGuestUser = userResult.rows[0]?.is_guest === true;
  const hasGuestIdentity =
    typeof order.metadata?.['guest_identity_id'] === 'string' &&
    order.metadata['guest_identity_id'].trim().length > 0;
  const hasContactEmail =
    typeof order.contact_email === 'string' &&
    order.contact_email.trim().length > 0;

  return {
    isGuestUser,
    hasGuestIdentity,
    hasContactEmail,
    eligible: isGuestUser && hasGuestIdentity && hasContactEmail,
  };
}

function logOrderState(prefix: string, order: OrderWithItems): void {
  Logger.info(prefix, {
    orderId: order.id,
    status: order.status,
    statusReason: order.status_reason ?? null,
    paymentProvider: order.payment_provider ?? null,
    paymentReference: order.payment_reference ?? null,
    checkoutMode: order.checkout_mode ?? null,
    itemCount: order.items.length,
  });
}

async function replayPaymentIfNeeded(
  order: OrderWithItems,
  payment: UnifiedPayment,
  dryRun: boolean
): Promise<OrderWithItems> {
  if (['in_process', 'paid', 'delivered'].includes(order.status)) {
    Logger.info('Skipping payment replay because order is already processed', {
      orderId: order.id,
      status: order.status,
    });
    return order;
  }

  if (!['cart', 'pending_payment'].includes(order.status)) {
    throw new Error(
      `Order ${order.id} is in status ${order.status}; refusing to replay payment`
    );
  }

  const payload = buildSyntheticWebhookPayload(order, payment);
  Logger.info('Prepared synthetic NOWPayments webhook payload', {
    orderId: order.id,
    paymentId: payload.payment_id,
    payCurrency: payload.pay_currency,
    payAmount: payload.pay_amount,
    priceAmount: payload.price_amount,
    priceCurrency: payload.price_currency,
  });

  if (dryRun) {
    Logger.info('Dry run enabled; payment replay was not executed', {
      orderId: order.id,
    });
    return order;
  }

  const processed = await paymentService.processWebhook(payload);
  if (!processed) {
    throw new Error(`Payment replay failed for order ${order.id}`);
  }

  const refreshedOrder = await orderService.getOrderWithItems(order.id);
  if (!refreshedOrder) {
    throw new Error(`Order ${order.id} disappeared after payment replay`);
  }

  Logger.info('Payment replay completed', {
    orderId: refreshedOrder.id,
    status: refreshedOrder.status,
    statusReason: refreshedOrder.status_reason ?? null,
  });

  return refreshedOrder;
}

async function runDeliveryFlow(
  order: OrderWithItems,
  options: CliOptions
): Promise<OrderWithItems> {
  if (!options.deliver) {
    return order;
  }

  if (options.dryRun) {
    Logger.info('Dry run enabled; delivery flow was not executed', {
      orderId: order.id,
      currentStatus: order.status,
      requireCredentials: options.requireCredentials,
    });
    return order;
  }

  if (order.status === 'delivered') {
    const replayResult = await subscriptionService.replayDeliveryForOrder(
      order.id,
      SCRIPT_ACTOR,
      {
        requireCredentials: options.requireCredentials,
        reason: 'manual_demo_delivery_replay',
      }
    );
    const resendResult = await orderService.resendOrderDeliveredEmail(order.id);

    Logger.info('Replayed delivery for already delivered order', {
      orderId: order.id,
      replayResult,
      resendEmail: resendResult,
    });
  } else {
    if (!['in_process', 'paid'].includes(order.status)) {
      throw new Error(
        `Order ${order.id} must be in_process/paid before delivery; current status is ${order.status}`
      );
    }

    const statusResult = await orderService.updateOrderStatus(
      order.id,
      'delivered',
      'manual_demo_delivery'
    );
    if (!statusResult.success) {
      throw new Error(
        statusResult.error || `Failed to mark order ${order.id} delivered`
      );
    }

    const activationResult =
      await subscriptionService.activateSubscriptionsForOrder(
        order.id,
        SCRIPT_ACTOR,
        {
          requireCredentials: options.requireCredentials,
          reason: 'manual_demo_delivery',
        }
      );

    Logger.info('Delivery flow completed', {
      orderId: order.id,
      activationResult,
      requireCredentials: options.requireCredentials,
    });
  }

  const refreshedOrder = await orderService.getOrderWithItems(order.id);
  if (!refreshedOrder) {
    throw new Error(`Order ${order.id} disappeared after delivery flow`);
  }

  return refreshedOrder;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  Logger.info('Replay NOWPayments order script started', {
    orderId: options.orderId,
    dryRun: options.dryRun,
    deliver: options.deliver,
    requireCredentials: options.requireCredentials,
  });

  createDatabasePool(env);

  const dbOk = await testDatabaseConnection();
  if (!dbOk) {
    throw new Error('Database connection failed');
  }

  try {
    const initialOrder = await orderService.getOrderWithItems(options.orderId);
    if (!initialOrder) {
      throw new Error(`Order not found: ${options.orderId}`);
    }

    logOrderState('Loaded order', initialOrder);

    const claimEligibility = await readClaimEmailEligibility(initialOrder);
    Logger.info('Claim-email eligibility snapshot', {
      orderId: initialOrder.id,
      ...claimEligibility,
    });

    const payment = await resolveOrderPayment(initialOrder);
    if (!payment) {
      throw new Error(
        `No NOWPayments payment record found for order ${initialOrder.id}`
      );
    }

    Logger.info('Resolved NOWPayments payment record', {
      orderId: initialOrder.id,
      paymentId: payment.providerPaymentId,
      paymentStatus: payment.status,
      providerStatus: payment.providerStatus ?? null,
      purpose: payment.purpose,
    });

    const afterPayment = await replayPaymentIfNeeded(
      initialOrder,
      payment,
      options.dryRun
    );
    const finalOrder = await runDeliveryFlow(afterPayment, options);

    logOrderState('Final order state', finalOrder);
  } finally {
    await closeDatabasePool();
  }

  Logger.info('Replay NOWPayments order script finished', {
    orderId: options.orderId,
  });
}

void main().catch(error => {
  Logger.error('Replay NOWPayments order script failed', {
    error: error instanceof Error ? error.message : error,
  });
  process.exit(1);
});
