import type { PoolClient } from 'pg';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getDatabasePool } from '../config/database';
import { env } from '../config/environment';
import { redisClient } from '../config/redis';
import { creditAllocationService } from './creditAllocationService';
import {
  NOWPaymentsError,
  nowpaymentsClient,
} from '../utils/nowpaymentsClient';
import { paymentRepository } from './paymentRepository';
import { paymentEventRepository } from './paymentEventRepository';
import { nowPaymentsProvider } from './payments/nowPaymentsProvider';
import { stripeProvider } from './payments/stripeProvider';
import { Logger } from '../utils/logger';
import { paymentMonitoringService } from './paymentMonitoringService';
import { paymentFailureService } from './paymentFailureService';
import { shouldIgnoreNowPaymentsStatusRegression } from '../utils/nowpaymentsStatus';
import { paymentMethodService } from './paymentMethodService';
import { creditService } from './creditService';
import { UserPaymentMethod } from '../types/paymentMethod';
import {
  Payment,
  PaymentStatus,
  CreatePaymentRequest,
  PaymentStatusResponse,
  PaymentHistoryQuery,
  PaymentHistoryItem,
  PaymentOperationResult,
  CreateUnifiedPaymentInput,
  WebhookPayload,
  CurrencyInfo,
  UnifiedPayment,
  UnifiedPaymentStatus,
} from '../types/payment';
import { subscriptionService } from './subscriptionService';
import {
  resolveCycleEndDate,
  subscriptionRenewalService,
} from './subscriptionRenewalService';
import { orderService } from './orderService';
import { orderItemUpgradeSelectionService } from './orderItemUpgradeSelectionService';
import { upgradeSelectionService } from './upgradeSelectionService';
import { couponService } from './couponService';
import {
  buildTikTokProductProperties,
  tiktokEventsService,
} from './tiktokEventsService';
import { normalizeCurrencyCode } from '../utils/currency';
import { computeTermPricing } from '../utils/termPricing';
import { parseJsonValue } from '../utils/json';
import {
  computeNextRenewalDates,
  getNextStripeRenewalAttemptDate,
} from '../utils/subscriptionHelpers';
import {
  normalizeUpgradeOptions,
  ownAccountCredentialRequirementRequiresPassword,
  validateUpgradeOptions,
} from '../utils/upgradeOptions';
import {
  ensureRenewalTask,
  notifyStripeRenewalFailure,
  notifyStripeRenewalSuccess,
} from './renewalNotificationService';
import type { OrderItem, Order, OrderWithItems } from '../types/order';

interface StripeOrderContext {
  orderId?: string;
  productVariantId?: string | null;
  productSlug?: string | null;
  priceCents?: number | null;
  basePriceCents?: number | null;
  discountPercent?: number | null;
  termMonths?: number | null;
  currency?: string | null;
  autoRenew?: boolean;
  nextBillingAt?: Date | null;
  renewalMethod?: string | null;
  statusReason?: string | null;
}

const NETWORK_SUFFIXES: Array<{ suffix: string; label: string }> = [
  { suffix: 'trc20', label: 'TRC20' },
  { suffix: 'erc20', label: 'ERC20' },
  { suffix: 'bep20', label: 'BEP20' },
  { suffix: 'bep2', label: 'BEP2' },
  { suffix: 'bsc', label: 'BSC' },
  { suffix: 'arbitrum', label: 'Arbitrum' },
  { suffix: 'arb', label: 'Arbitrum' },
  { suffix: 'optimism', label: 'Optimism' },
  { suffix: 'op', label: 'Optimism' },
  { suffix: 'polygon', label: 'Polygon' },
  { suffix: 'matic', label: 'Polygon' },
  { suffix: 'solana', label: 'Solana' },
  { suffix: 'sol', label: 'Solana' },
  { suffix: 'avaxc', label: 'Avalanche C-Chain' },
  { suffix: 'avax', label: 'Avalanche' },
  { suffix: 'base', label: 'Base' },
  { suffix: 'celo', label: 'Celo' },
  { suffix: 'ton', label: 'TON' },
  { suffix: 'algo', label: 'Algorand' },
  { suffix: 'near', label: 'Near' },
];
const NETWORK_SUFFIXES_SORTED = [...NETWORK_SUFFIXES].sort(
  (a, b) => b.suffix.length - a.suffix.length
);
const KNOWN_NETWORK_BASES = new Set([
  'usdt',
  'usdc',
  'dai',
  'busd',
  'tusd',
  'usdp',
  'usdr',
]);

const parsePositiveInt = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
};

const parseNonNegativeInt = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed);
};

const parsePercent = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return null;
  return parsed;
};

export class PaymentService {
  private readonly CACHE_PREFIX = 'payment:';
  private readonly PAYMENT_CACHE_TTL = 300; // 5 minutes
  private readonly STATUS_CACHE_TTL = 60; // 1 minute for status updates
  private readonly CURRENCY_CACHE_TTL = env.NOWPAYMENTS_CURRENCY_CACHE_TTL;
  private readonly CURRENCY_LKG_TTL = env.NOWPAYMENTS_CURRENCY_LKG_TTL;
  private readonly CURRENCY_SANITY_MIN_COUNT = 20;
  private readonly MIN_CREDIT_AMOUNT_USD = 5;
  private readonly STRIPE_CHECKOUT_MAX_NETWORK_ATTEMPTS = 3;
  private readonly STRIPE_RETRYABLE_NETWORK_CODES = new Set([
    'ENOTFOUND',
    'EAI_AGAIN',
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'EHOSTUNREACH',
    'ENETUNREACH',
  ]);

  private mapNowPaymentsStatus(status: PaymentStatus): UnifiedPaymentStatus {
    switch (status) {
      case 'finished':
        return 'succeeded';
      case 'failed':
      case 'refunded':
        return 'failed';
      case 'expired':
        return 'expired';
      case 'pending':
      case 'waiting':
      case 'confirming':
      case 'confirmed':
      case 'sending':
      case 'partially_paid':
      default:
        return 'processing';
    }
  }

  private mapUnifiedPaymentStatusToPaymentStatus(
    status: UnifiedPaymentStatus
  ): PaymentStatus {
    switch (status) {
      case 'succeeded':
        return 'finished';
      case 'failed':
        return 'failed';
      case 'canceled':
        return 'failed';
      case 'expired':
        return 'expired';
      case 'processing':
        return 'confirming';
      case 'requires_action':
      case 'requires_payment_method':
      case 'pending':
      default:
        return 'waiting';
    }
  }

  private mapStripePaymentIntentStatus(status: string): UnifiedPaymentStatus {
    switch (status) {
      case 'succeeded':
        return 'succeeded';
      case 'processing':
        return 'processing';
      case 'requires_payment_method':
        return 'requires_payment_method';
      case 'requires_action':
      case 'requires_confirmation':
        return 'requires_action';
      case 'canceled':
        return 'canceled';
      default:
        return 'pending';
    }
  }

  private resolveStripeEventType(status: string): string {
    switch (status) {
      case 'succeeded':
        return 'payment_intent.succeeded';
      case 'canceled':
        return 'payment_intent.canceled';
      case 'requires_payment_method':
        return 'payment_intent.payment_failed';
      case 'requires_action':
      case 'requires_confirmation':
        return 'payment_intent.requires_action';
      case 'processing':
        return 'payment_intent.processing';
      default:
        return 'payment_intent.processing';
    }
  }

  private async recordPaymentEvent(params: {
    provider: string;
    eventId: string;
    eventType: string;
    orderId?: string | null;
    paymentId?: string | null;
    client?: PoolClient;
  }): Promise<boolean> {
    return paymentEventRepository.recordEvent(
      {
        provider: params.provider,
        eventId: params.eventId,
        eventType: params.eventType,
        orderId: params.orderId ?? null,
        paymentId: params.paymentId ?? null,
      },
      params.client
    );
  }

  private resolveOrderItemMetadata(item: OrderItem): Record<string, any> {
    return parseJsonValue<Record<string, any>>(item.metadata, {});
  }

  private resolveOrderItemTermMonths(
    item: OrderItem,
    metadata: Record<string, any>
  ): number | null {
    return (
      parsePositiveInt(item.term_months) ??
      parsePositiveInt(metadata['term_months']) ??
      parsePositiveInt(metadata['duration_months']) ??
      parsePositiveInt(metadata['termMonths']) ??
      parsePositiveInt(metadata['durationMonths'])
    );
  }

  private resolveOrderItemDisplayName(item: OrderItem): string {
    const productName =
      typeof item.product_name === 'string' &&
      item.product_name.trim().length > 0
        ? item.product_name.trim()
        : null;
    const variantName =
      typeof item.variant_name === 'string' &&
      item.variant_name.trim().length > 0
        ? item.variant_name.trim()
        : null;
    const description =
      typeof item.description === 'string' && item.description.trim().length > 0
        ? item.description.trim()
        : null;
    if (productName && variantName) {
      return `${productName} ${variantName}`;
    }
    return (
      productName || variantName || description || `item ${item.id.slice(0, 8)}`
    );
  }

  private async validateOwnAccountSelectionData(
    order: OrderWithItems
  ): Promise<{ valid: true } | { valid: false; missingItemLabel: string }> {
    const selectionMap =
      await orderItemUpgradeSelectionService.listSelectionsForOrder(order.id);

    for (const item of order.items) {
      const itemMetadata = this.resolveOrderItemMetadata(item);
      const selectionType =
        selectionMap[item.id]?.selection_type ??
        (typeof itemMetadata['selection_type'] === 'string'
          ? itemMetadata['selection_type']
          : null);

      if (selectionType !== 'upgrade_own_account') {
        continue;
      }

      const upgradeOptions = normalizeUpgradeOptions(itemMetadata);
      const requiresPassword =
        ownAccountCredentialRequirementRequiresPassword(upgradeOptions);
      const accountIdentifier =
        selectionMap[item.id]?.account_identifier?.trim() ?? '';
      const credentialsEncrypted =
        selectionMap[item.id]?.credentials_encrypted?.trim() ?? '';

      if (!accountIdentifier) {
        return {
          valid: false,
          missingItemLabel: this.resolveOrderItemDisplayName(item),
        };
      }

      if (requiresPassword && !credentialsEncrypted) {
        return {
          valid: false,
          missingItemLabel: this.resolveOrderItemDisplayName(item),
        };
      }
    }

    return { valid: true };
  }

  private async createPaymentItemAllocations(params: {
    paymentRecordId: string;
    orderItems: OrderItem[];
    client?: PoolClient;
  }): Promise<void> {
    const client = params.client ?? getDatabasePool();
    if (params.orderItems.length === 0) {
      return;
    }

    const existing = await client.query(
      'SELECT 1 FROM payment_items WHERE payment_id = $1 LIMIT 1',
      [params.paymentRecordId]
    );
    if (existing.rows.length > 0) {
      return;
    }

    const values: string[] = [];
    const args: Array<string | number> = [];
    let index = 0;

    for (const item of params.orderItems) {
      const metadata = this.resolveOrderItemMetadata(item);
      const termMonths = this.resolveOrderItemTermMonths(item, metadata);
      const basePriceCents = parseNonNegativeInt(item.base_price_cents);
      const discountPercent = parsePercent(item.discount_percent ?? 0) ?? 0;
      const couponDiscountCents = Math.max(
        0,
        parseNonNegativeInt(item.coupon_discount_cents) ?? 0
      );

      let subtotalCents = Math.max(0, item.total_price_cents);
      let discountCents = couponDiscountCents;

      if (basePriceCents !== null && termMonths !== null) {
        const snapshot = computeTermPricing({
          basePriceCents,
          termMonths,
          discountPercent,
        });
        subtotalCents = snapshot.basePriceCents * snapshot.termMonths;
        discountCents = snapshot.discountCents + couponDiscountCents;
      }

      const totalCents = Math.max(0, item.total_price_cents);

      values.push(
        `($${++index}, $${++index}, $${++index}, $${++index}, $${++index})`
      );
      args.push(
        params.paymentRecordId,
        item.id,
        subtotalCents,
        discountCents,
        totalCents
      );
    }

    await client.query(
      `INSERT INTO payment_items
        (payment_id, order_item_id, allocated_subtotal_cents, allocated_discount_cents, allocated_total_cents)
       VALUES ${values.join(', ')}`,
      args
    );
  }

  private resolveAppBaseUrl(): string | null {
    const base = env.APP_BASE_URL?.replace(/\/$/, '');
    if (base) return base;
    if (env.NODE_ENV !== 'production') {
      return 'http://localhost:3000';
    }
    return null;
  }

  private async createSubscriptionsForOrder(params: {
    order: Order;
    orderItems: OrderItem[];
    renewalMethod: string | null;
  }): Promise<
    Array<{
      id: string;
      orderItemId: string;
      autoRenew: boolean;
    }>
  > {
    if (params.orderItems.length === 0) {
      return [];
    }

    const pool = getDatabasePool();
    const orderItemIds = params.orderItems.map(item => item.id);
    const existingResult = await pool.query(
      `SELECT id, order_item_id
       FROM subscriptions
       WHERE order_item_id = ANY($1::uuid[])`,
      [orderItemIds]
    );
    const existingByItem = new Map<string, string>();
    for (const row of existingResult.rows) {
      if (row.order_item_id) {
        existingByItem.set(row.order_item_id, row.id);
      }
    }

    const orderMetadata = parseJsonValue<Record<string, any>>(
      params.order.metadata,
      {}
    );
    const selectionByItem =
      await orderItemUpgradeSelectionService.listSelectionsForOrder(
        params.order.id
      );

    const created: Array<{
      id: string;
      orderItemId: string;
      autoRenew: boolean;
    }> = [];

    for (const item of params.orderItems) {
      if (existingByItem.has(item.id)) {
        created.push({
          id: existingByItem.get(item.id) as string,
          orderItemId: item.id,
          autoRenew: item.auto_renew === true,
        });
        continue;
      }

      const itemMetadata = this.resolveOrderItemMetadata(item);
      const serviceType =
        itemMetadata['service_type'] || orderMetadata['service_type'] || null;
      const servicePlan =
        itemMetadata['service_plan'] || orderMetadata['service_plan'] || null;

      if (!serviceType || !servicePlan) {
        Logger.error('Missing service metadata for order item', {
          orderId: params.order.id,
          orderItemId: item.id,
        });
        continue;
      }

      const termMonths =
        this.resolveOrderItemTermMonths(item, itemMetadata) ??
        parsePositiveInt(orderMetadata['term_months']) ??
        parsePositiveInt(orderMetadata['duration_months']) ??
        parsePositiveInt(params.order.term_months) ??
        1;

      const basePriceCents = parseNonNegativeInt(item.base_price_cents);
      const discountPercent = parsePercent(item.discount_percent ?? 0) ?? 0;
      const couponDiscountCents = Math.max(
        0,
        parseNonNegativeInt(item.coupon_discount_cents) ?? 0
      );

      let termTotalCents =
        Math.max(0, item.total_price_cents) + couponDiscountCents;
      if (basePriceCents !== null && termMonths !== null) {
        const snapshot = computeTermPricing({
          basePriceCents,
          termMonths,
          discountPercent,
        });
        termTotalCents = snapshot.totalPriceCents;
      }

      const upgradeOptions = normalizeUpgradeOptions(itemMetadata);
      const selectionRow = selectionByItem[item.id];
      const selectionType =
        selectionRow?.selection_type ??
        (itemMetadata['selection_type'] as string | undefined) ??
        null;
      const manualMonthlyAcknowledged =
        Boolean(selectionRow?.manual_monthly_acknowledged_at) ||
        itemMetadata['manual_monthly_acknowledged'] === true;
      const selectionProvided =
        Boolean(selectionType) || manualMonthlyAcknowledged;

      const autoRenew = item.auto_renew === true;
      const currency =
        params.order.currency ||
        item.currency ||
        (typeof orderMetadata['currency'] === 'string'
          ? orderMetadata['currency']
          : null);

      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + termMonths);
      const renewalDate = new Date(endDate);
      renewalDate.setDate(renewalDate.getDate() - 7);
      const nextBillingAt = autoRenew ? renewalDate : null;

      const subscriptionResult = await subscriptionService.createSubscription(
        params.order.user_id,
        {
          service_type: serviceType as any,
          service_plan: servicePlan as any,
          start_date: startDate,
          end_date: endDate,
          renewal_date: renewalDate,
          auto_renew: autoRenew,
          order_id: params.order.id,
          order_item_id: item.id,
          product_variant_id: item.product_variant_id ?? null,
          price_cents: termTotalCents,
          base_price_cents: basePriceCents ?? null,
          discount_percent: discountPercent ?? null,
          term_months: termMonths,
          currency: currency ?? null,
          next_billing_at: nextBillingAt,
          renewal_method: params.renewalMethod,
          status_reason: 'payment_succeeded',
          upgrade_options_snapshot: upgradeOptions ?? null,
          selection_provided: selectionProvided,
          manual_monthly_acknowledged: manualMonthlyAcknowledged,
        }
      );

      if (!subscriptionResult.success || !subscriptionResult.data) {
        const errorMessage = subscriptionResult.success
          ? 'subscription_missing_data'
          : subscriptionResult.error;
        Logger.error('Failed to create subscription for order item', {
          orderId: params.order.id,
          orderItemId: item.id,
          error: errorMessage,
        });
        continue;
      }

      const subscription = subscriptionResult.data;
      created.push({
        id: subscription.id,
        orderItemId: item.id,
        autoRenew,
      });

      if (selectionRow) {
        if (selectionRow.selection_type) {
          await upgradeSelectionService.submitSelection({
            subscriptionId: subscription.id,
            selectionType: selectionRow.selection_type as any,
            accountIdentifier: selectionRow.account_identifier ?? null,
            credentials: selectionRow.credentials_encrypted ?? null,
            manualMonthlyAcknowledgedAt:
              selectionRow.manual_monthly_acknowledged_at ?? null,
          });
        } else if (selectionRow.manual_monthly_acknowledged_at) {
          await upgradeSelectionService.acknowledgeManualMonthly({
            subscriptionId: subscription.id,
            acknowledgedAt: selectionRow.manual_monthly_acknowledged_at,
          });
        }
      }
    }

    return created;
  }

  private parseMetadataDate(value: unknown): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value === 'number') {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      const parsed = new Date(trimmed);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
      if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
        try {
          const unquoted = JSON.parse(trimmed);
          const nested = new Date(unquoted);
          return Number.isNaN(nested.getTime()) ? null : nested;
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  private extractExpectedEndDate(metadata: Record<string, any>): Date | null {
    const raw =
      metadata['expected_end_date'] ??
      metadata['expectedEndDate'] ??
      metadata['expected_end'] ??
      null;
    return this.parseMetadataDate(raw);
  }

  private readonly HARD_DECLINE_CODES = new Set([
    'authentication_required',
    'expired_card',
    'incorrect_number',
    'invalid_number',
    'invalid_expiry_month',
    'invalid_expiry_year',
    'invalid_cvc',
    'lost_card',
    'stolen_card',
    'pickup_card',
    'fraudulent',
    'restricted_card',
    'card_not_supported',
    'invalid_account',
    'no_account',
  ]);

  private classifyStripeDecline(intent: any): {
    declineCode: string | null;
    isHard: boolean;
  } {
    const lastError = intent?.last_payment_error;
    const declineCode =
      (typeof lastError?.decline_code === 'string'
        ? lastError.decline_code
        : null) ||
      (typeof lastError?.code === 'string' ? lastError.code : null);

    if (!declineCode) {
      return { declineCode: null, isHard: false };
    }

    return {
      declineCode,
      isHard: this.HARD_DECLINE_CODES.has(declineCode),
    };
  }

  private getStripeErrorType(error: unknown): string | null {
    if (!error || typeof error !== 'object') {
      return null;
    }
    const type = (error as { type?: unknown }).type;
    return typeof type === 'string' ? type : null;
  }

  private getStripeNetworkCode(error: unknown): string | null {
    if (!error || typeof error !== 'object') {
      return null;
    }

    const directCode = (error as { code?: unknown }).code;
    if (typeof directCode === 'string') {
      return directCode;
    }

    const rawCode = (error as { raw?: { code?: unknown } }).raw?.code;
    if (typeof rawCode === 'string') {
      return rawCode;
    }

    const rawDetailCode = (error as { raw?: { detail?: { code?: unknown } } })
      .raw?.detail?.code;
    if (typeof rawDetailCode === 'string') {
      return rawDetailCode;
    }

    const detailCode = (error as { detail?: { code?: unknown } }).detail?.code;
    if (typeof detailCode === 'string') {
      return detailCode;
    }

    const causeCode = (error as { cause?: { code?: unknown } }).cause?.code;
    if (typeof causeCode === 'string') {
      return causeCode;
    }

    return null;
  }

  private isStripeConnectionError(error: unknown): boolean {
    if (this.getStripeErrorType(error) === 'StripeConnectionError') {
      return true;
    }

    const networkCode = this.getStripeNetworkCode(error);
    return networkCode
      ? this.STRIPE_RETRYABLE_NETWORK_CODES.has(networkCode)
      : false;
  }

  private isStripeRateLimitError(error: unknown): boolean {
    return this.getStripeErrorType(error) === 'StripeRateLimitError';
  }

  private isStripeAuthenticationError(error: unknown): boolean {
    return this.getStripeErrorType(error) === 'StripeAuthenticationError';
  }

  private async createCheckoutSessionWithRetry(
    params: Parameters<typeof stripeProvider.createCheckoutSession>[0],
    context: { orderId: string }
  ): Promise<Awaited<ReturnType<typeof stripeProvider.createCheckoutSession>>> {
    let lastError: unknown;

    for (
      let attempt = 1;
      attempt <= this.STRIPE_CHECKOUT_MAX_NETWORK_ATTEMPTS;
      attempt += 1
    ) {
      try {
        return await stripeProvider.createCheckoutSession(params);
      } catch (error) {
        lastError = error;
        const isRetryable = this.isStripeConnectionError(error);
        const canRetry =
          isRetryable && attempt < this.STRIPE_CHECKOUT_MAX_NETWORK_ATTEMPTS;

        if (!canRetry) {
          throw error;
        }

        const delayMs = 250 * 2 ** (attempt - 1);
        Logger.warn(
          'Transient Stripe connection error while creating checkout session, retrying',
          {
            orderId: context.orderId,
            attempt,
            maxAttempts: this.STRIPE_CHECKOUT_MAX_NETWORK_ATTEMPTS,
            delayMs,
            errorType: this.getStripeErrorType(error),
            errorCode: this.getStripeNetworkCode(error),
          }
        );

        await new Promise<void>(resolve => {
          setTimeout(() => resolve(), delayMs);
        });
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('Stripe checkout session creation failed');
  }

  async ensureStripeCustomer(
    userId: string,
    options?: { preferredEmail?: string | null }
  ): Promise<{
    customerId: string;
    email: string | null;
  }> {
    const pool = getDatabasePool();
    const userResult = await pool.query(
      'SELECT email, stripe_customer_id FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new Error('User not found');
    }

    const userEmail = userResult.rows[0].email as string | null;
    const preferredEmail =
      typeof options?.preferredEmail === 'string'
        ? options.preferredEmail.trim().toLowerCase()
        : null;
    const email = preferredEmail || userEmail;
    const existingCustomerId = userResult.rows[0].stripe_customer_id as
      | string
      | null;

    if (existingCustomerId) {
      if (preferredEmail) {
        try {
          await stripeProvider.updateCustomer({
            customerId: existingCustomerId,
            email: preferredEmail,
          });
        } catch (error) {
          Logger.warn('Failed to update Stripe customer email', {
            userId,
            customerId: existingCustomerId,
            error,
          });
        }
      }
      return { customerId: existingCustomerId, email };
    }

    const customer = await stripeProvider.createCustomer({
      ...(email ? { email } : {}),
      metadata: { user_id: userId },
    });

    const updateResult = await pool.query(
      `UPDATE users
       SET stripe_customer_id = $1
       WHERE id = $2 AND stripe_customer_id IS NULL
       RETURNING stripe_customer_id`,
      [customer.id, userId]
    );

    if (updateResult.rows.length > 0) {
      return { customerId: updateResult.rows[0].stripe_customer_id, email };
    }

    const refresh = await pool.query(
      'SELECT stripe_customer_id FROM users WHERE id = $1',
      [userId]
    );

    return {
      customerId: refresh.rows[0]?.stripe_customer_id || customer.id,
      email,
    };
  }

  async createStripeSetupIntent(params: {
    userId: string;
    subscriptionId?: string | null;
  }): Promise<{ setupIntentId: string; clientSecret: string }> {
    const { customerId } = await this.ensureStripeCustomer(params.userId);
    const intent = await stripeProvider.createSetupIntent({
      customerId,
      metadata: {
        user_id: params.userId,
        ...(params.subscriptionId
          ? { subscription_id: params.subscriptionId }
          : {}),
      },
    });

    if (!intent.client_secret) {
      throw new Error('Stripe SetupIntent missing client_secret');
    }

    return {
      setupIntentId: intent.id,
      clientSecret: intent.client_secret,
    };
  }

  async confirmStripeSetupIntent(params: {
    userId: string;
    setupIntentId: string;
  }): Promise<{ paymentMethodId: string; customerId: string }> {
    const { customerId } = await this.ensureStripeCustomer(params.userId);
    const intent = await stripeProvider.retrieveSetupIntent(
      params.setupIntentId
    );

    if (intent.status !== 'succeeded') {
      throw new Error('SetupIntent not succeeded');
    }

    if (!intent.payment_method) {
      throw new Error('SetupIntent missing payment method');
    }

    const intentCustomer =
      typeof intent.customer === 'string'
        ? intent.customer
        : intent.customer?.id;
    if (intentCustomer && intentCustomer !== customerId) {
      throw new Error('SetupIntent customer mismatch');
    }

    return {
      paymentMethodId:
        typeof intent.payment_method === 'string'
          ? intent.payment_method
          : intent.payment_method.id,
      customerId,
    };
  }

  async saveStripePaymentMethod(params: {
    userId: string;
    paymentMethodId: string;
    customerId: string;
    setupIntentId?: string | null;
  }): Promise<UserPaymentMethod> {
    const paymentMethod = await stripeProvider.retrievePaymentMethod(
      params.paymentMethodId
    );

    const card = paymentMethod.card;
    const saved = await paymentMethodService.upsertPaymentMethod({
      user_id: params.userId,
      provider: 'stripe',
      provider_customer_id: params.customerId,
      provider_payment_method_id: paymentMethod.id,
      brand: card?.brand ?? null,
      last4: card?.last4 ?? null,
      exp_month: card?.exp_month ?? null,
      exp_year: card?.exp_year ?? null,
      status: 'active',
      is_default: true,
      setup_intent_id: params.setupIntentId ?? null,
    });

    if (!saved) {
      throw new Error('Failed to save payment method');
    }

    await paymentMethodService.setDefaultPaymentMethod(
      params.userId,
      'stripe',
      saved.id
    );

    return saved;
  }

  async createStripeOffSessionRenewalPayment(params: {
    userId: string;
    amount: number;
    currency: string;
    description: string;
    paymentMethodId: string;
    customerId: string;
    subscriptionId: string;
    metadata: Record<string, any>;
    orderContext?: StripeOrderContext;
  }): Promise<{
    success: boolean;
    paymentId?: string;
    paymentRecordId?: string;
    status?: UnifiedPaymentStatus;
    providerStatus?: string;
    error?: string;
  }> {
    try {
      if (!params.customerId) {
        return {
          success: false,
          error: 'Stripe customer is missing for off-session payment',
        };
      }

      const resolvedCurrency = normalizeCurrencyCode(params.currency) || 'USD';
      const supportsCurrency =
        await stripeProvider.supportsCurrency(resolvedCurrency);
      if (!supportsCurrency) {
        return {
          success: false,
          error: `Currency ${resolvedCurrency} is not supported by Stripe`,
        };
      }

      const intent = await stripeProvider.createOffSessionPaymentIntent({
        customerId: params.customerId,
        paymentMethodId: params.paymentMethodId,
        amount: params.amount,
        currency: resolvedCurrency,
        description: params.description,
        metadata: params.metadata,
      });

      const normalizedStatus = this.mapStripePaymentIntentStatus(intent.status);
      const paymentRecord = await paymentRepository.create({
        userId: params.userId,
        provider: 'stripe',
        providerPaymentId: intent.id,
        status: normalizedStatus,
        providerStatus: intent.status,
        purpose: 'one_time',
        amount: params.amount,
        currency: resolvedCurrency.toLowerCase(),
        ...(resolvedCurrency === 'USD' ? { amountUsd: params.amount } : {}),
        paymentMethodType: 'card',
        subscriptionId: params.subscriptionId,
        metadata: params.metadata,
        ...(params.orderContext?.orderId
          ? { orderId: params.orderContext.orderId }
          : {}),
        ...(params.orderContext?.productVariantId !== undefined &&
        params.orderContext?.productVariantId !== null
          ? { productVariantId: params.orderContext.productVariantId }
          : {}),
        ...(params.orderContext?.priceCents !== undefined &&
        params.orderContext?.priceCents !== null
          ? { priceCents: params.orderContext.priceCents }
          : {}),
        ...(params.orderContext?.basePriceCents !== undefined &&
        params.orderContext?.basePriceCents !== null
          ? { basePriceCents: params.orderContext.basePriceCents }
          : {}),
        ...(params.orderContext?.discountPercent !== undefined &&
        params.orderContext?.discountPercent !== null
          ? { discountPercent: params.orderContext.discountPercent }
          : {}),
        ...(params.orderContext?.termMonths !== undefined &&
        params.orderContext?.termMonths !== null
          ? { termMonths: params.orderContext.termMonths }
          : {}),
        ...(params.orderContext?.autoRenew !== undefined
          ? { autoRenew: params.orderContext.autoRenew }
          : {}),
        ...(params.orderContext?.nextBillingAt !== undefined &&
        params.orderContext?.nextBillingAt !== null
          ? { nextBillingAt: params.orderContext.nextBillingAt }
          : {}),
        ...(params.orderContext?.renewalMethod
          ? { renewalMethod: params.orderContext.renewalMethod }
          : {}),
        ...(params.orderContext?.statusReason
          ? { statusReason: params.orderContext.statusReason }
          : {}),
      });

      return {
        success:
          normalizedStatus === 'succeeded' || normalizedStatus === 'processing',
        paymentId: intent.id,
        paymentRecordId: paymentRecord.id,
        status: normalizedStatus,
        providerStatus: intent.status,
      };
    } catch (error: any) {
      const stripeIntent =
        error && typeof error === 'object' && error.payment_intent
          ? (error.payment_intent as any)
          : null;

      if (stripeIntent?.id) {
        const normalizedStatus = this.mapStripePaymentIntentStatus(
          stripeIntent.status
        );
        const fallbackCurrency =
          normalizeCurrencyCode(params.currency) || 'USD';
        try {
          const paymentRecord = await paymentRepository.create({
            userId: params.userId,
            provider: 'stripe',
            providerPaymentId: stripeIntent.id,
            status: normalizedStatus,
            providerStatus: stripeIntent.status,
            purpose: 'one_time',
            amount: params.amount,
            currency: fallbackCurrency.toLowerCase(),
            ...(fallbackCurrency === 'USD' ? { amountUsd: params.amount } : {}),
            ...(params.orderContext?.orderId
              ? { orderId: params.orderContext.orderId }
              : {}),
            ...(params.orderContext?.productVariantId !== undefined &&
            params.orderContext?.productVariantId !== null
              ? { productVariantId: params.orderContext.productVariantId }
              : {}),
            ...(params.orderContext?.priceCents !== undefined &&
            params.orderContext?.priceCents !== null
              ? { priceCents: params.orderContext.priceCents }
              : {}),
            ...(params.orderContext?.basePriceCents !== undefined &&
            params.orderContext?.basePriceCents !== null
              ? { basePriceCents: params.orderContext.basePriceCents }
              : {}),
            ...(params.orderContext?.discountPercent !== undefined &&
            params.orderContext?.discountPercent !== null
              ? { discountPercent: params.orderContext.discountPercent }
              : {}),
            ...(params.orderContext?.termMonths !== undefined &&
            params.orderContext?.termMonths !== null
              ? { termMonths: params.orderContext.termMonths }
              : {}),
            ...(params.orderContext?.autoRenew !== undefined
              ? { autoRenew: params.orderContext.autoRenew }
              : {}),
            ...(params.orderContext?.nextBillingAt !== undefined &&
            params.orderContext?.nextBillingAt !== null
              ? { nextBillingAt: params.orderContext.nextBillingAt }
              : {}),
            ...(params.orderContext?.renewalMethod
              ? { renewalMethod: params.orderContext.renewalMethod }
              : {}),
            ...(params.orderContext?.statusReason
              ? { statusReason: params.orderContext.statusReason }
              : {}),
            subscriptionId: params.subscriptionId,
            metadata: params.metadata,
          });
          return {
            success: false,
            paymentId: stripeIntent.id,
            paymentRecordId: paymentRecord.id,
            status: normalizedStatus,
            providerStatus: stripeIntent.status,
            error:
              error instanceof Error ? error.message : 'Stripe payment failed',
          };
        } catch (repoError) {
          Logger.error(
            'Failed to record off-session Stripe payment:',
            repoError
          );
        }
        return {
          success: false,
          paymentId: stripeIntent.id,
          status: normalizedStatus,
          providerStatus: stripeIntent.status,
          error:
            error instanceof Error ? error.message : 'Stripe payment failed',
        };
      }

      Logger.error('Error creating Stripe off-session payment:', error);
      return {
        success: false,
        error: 'Failed to create Stripe off-session payment',
      };
    }
  }

  private async enforceStripeOrderGuard(params: {
    orderId: string;
    intent: any;
    paymentId: string;
  }): Promise<boolean> {
    const { orderId, intent, paymentId } = params;
    const order = await orderService.getOrderById(orderId);

    if (!order) {
      Logger.error('Stripe payment order not found', { orderId, paymentId });
      return false;
    }

    if (order.status !== 'pending_payment') {
      Logger.warn('Stripe payment order not pending', {
        orderId,
        paymentId,
        status: order.status,
      });
      return false;
    }

    const intentAmount =
      typeof intent?.amount_received === 'number'
        ? intent.amount_received
        : typeof intent?.amount === 'number'
          ? intent.amount
          : null;
    const intentCurrency =
      typeof intent?.currency === 'string'
        ? intent.currency.toUpperCase()
        : null;

    const orderTotalCents =
      order.total_cents !== null && order.total_cents !== undefined
        ? Number(order.total_cents)
        : null;
    const orderCurrencyRaw =
      typeof order.currency === 'string' ? order.currency : null;
    const orderCurrency =
      normalizeCurrencyCode(orderCurrencyRaw) ||
      orderCurrencyRaw?.toUpperCase() ||
      null;

    if (
      orderTotalCents !== null &&
      intentAmount !== null &&
      orderTotalCents !== intentAmount
    ) {
      Logger.error('Stripe payment amount mismatch', {
        orderId,
        paymentId,
        orderTotalCents,
        intentAmount,
      });
      await orderService.updateOrderStatus(
        orderId,
        'cancelled',
        'payment_amount_mismatch'
      );
      await couponService.voidRedemptionForOrder(orderId);
      return false;
    }

    if (orderCurrency && intentCurrency && orderCurrency !== intentCurrency) {
      Logger.error('Stripe payment currency mismatch', {
        orderId,
        paymentId,
        orderCurrency,
        intentCurrency,
      });
      await orderService.updateOrderStatus(
        orderId,
        'cancelled',
        'payment_currency_mismatch'
      );
      await couponService.voidRedemptionForOrder(orderId);
      return false;
    }

    return true;
  }

  private async processStripePaymentIntent(params: {
    intent: any;
    payment: UnifiedPayment;
    eventType: string;
  }): Promise<boolean> {
    const intent = params.intent;
    const payment = params.payment;
    const eventType = params.eventType;
    const paymentId = intent.id as string;

    const stripeMetadata = intent.metadata || {};
    const mergedMetadata = {
      ...(stripeMetadata || {}),
      ...(payment.metadata || {}),
    };

    const mapEventToStatus = (status: string): UnifiedPaymentStatus => {
      switch (status) {
        case 'succeeded':
          return 'succeeded';
        case 'processing':
          return 'processing';
        case 'requires_payment_method':
          return 'requires_payment_method';
        case 'requires_action':
        case 'requires_confirmation':
          return 'requires_action';
        case 'canceled':
          return 'canceled';
        default:
          return 'pending';
      }
    };

    const statusPriority: Record<UnifiedPaymentStatus, number> = {
      pending: 0,
      requires_payment_method: 1,
      requires_action: 2,
      processing: 3,
      failed: 4,
      canceled: 4,
      expired: 4,
      succeeded: 5,
    };

    const incomingStatus = mapEventToStatus(intent.status);
    const currentStatus = payment.status;
    const wasAlreadySucceeded = currentStatus === 'succeeded';
    if (statusPriority[incomingStatus] < statusPriority[currentStatus]) {
      Logger.info('Ignoring Stripe event due to status regression', {
        paymentId,
        eventType,
        currentStatus,
        incomingStatus,
      });
      return true;
    }

    const autoRenew =
      mergedMetadata.auto_renew === true ||
      mergedMetadata.auto_renew === 'true' ||
      mergedMetadata.auto_renew === 1 ||
      mergedMetadata.auto_renew === '1';
    const isRenewal =
      mergedMetadata.renewal === true ||
      mergedMetadata.renewal === 'true' ||
      mergedMetadata.renewal === 1 ||
      mergedMetadata.renewal === '1';
    const subscriptionId =
      (mergedMetadata.subscription_id ||
        mergedMetadata.subscriptionId ||
        stripeMetadata.subscription_id ||
        stripeMetadata.subscriptionId ||
        payment.subscriptionId) ??
      null;
    const isSessionCheckout =
      !isRenewal &&
      (payment.checkoutMode === 'session' || Boolean(payment.stripeSessionId));

    if (isSessionCheckout) {
      await paymentRepository.updateStatusByProviderPaymentId(
        'stripe',
        paymentId,
        incomingStatus,
        intent.status,
        mergedMetadata
      );
      Logger.info('Ignoring Stripe payment_intent event for session checkout', {
        paymentId,
        eventType,
      });
      return true;
    }

    if (eventType === 'payment_intent.succeeded') {
      await paymentRepository.updateStatusByProviderPaymentId(
        'stripe',
        paymentId,
        'succeeded',
        intent.status,
        mergedMetadata
      );

      const serviceType = (mergedMetadata.service_type ||
        stripeMetadata.service_type) as string | undefined;
      const servicePlan = (mergedMetadata.service_plan ||
        stripeMetadata.service_plan) as string | undefined;

      const termMonthsFromMetadata = parsePositiveInt(
        mergedMetadata.term_months ??
          mergedMetadata.duration_months ??
          stripeMetadata.term_months ??
          stripeMetadata.duration_months
      );
      const resolvedTermMonths = payment.termMonths ?? termMonthsFromMetadata;
      const durationMonths = resolvedTermMonths ?? 1;

      const orderId =
        payment.orderId ||
        mergedMetadata.order_id ||
        mergedMetadata.orderId ||
        stripeMetadata.order_id ||
        stripeMetadata.orderId ||
        null;

      const productVariantId =
        payment.productVariantId ||
        mergedMetadata.product_variant_id ||
        stripeMetadata.product_variant_id ||
        null;
      const productSlug = (mergedMetadata.product_slug ||
        mergedMetadata.productSlug ||
        stripeMetadata.product_slug ||
        stripeMetadata.productSlug) as string | undefined;

      const priceCents =
        payment.priceCents ??
        (mergedMetadata.price_cents
          ? Number(mergedMetadata.price_cents)
          : undefined);
      const subscriptionPriceCents = parseNonNegativeInt(
        mergedMetadata.subscription_price_cents ??
          mergedMetadata.pre_coupon_price_cents ??
          stripeMetadata.subscription_price_cents ??
          stripeMetadata.pre_coupon_price_cents
      );
      const basePriceCents =
        payment.basePriceCents ??
        parseNonNegativeInt(
          mergedMetadata.base_price_cents ??
            mergedMetadata.basePriceCents ??
            stripeMetadata.base_price_cents ??
            stripeMetadata.basePriceCents
        );
      const discountPercent =
        payment.discountPercent ??
        parsePercent(
          mergedMetadata.discount_percent ??
            mergedMetadata.discountPercent ??
            stripeMetadata.discount_percent ??
            stripeMetadata.discountPercent
        );

      const currencyRaw =
        payment.currency ||
        mergedMetadata.currency ||
        stripeMetadata.currency ||
        'usd';
      const currency =
        typeof currencyRaw === 'string' ? currencyRaw.toLowerCase() : 'usd';
      const purchaseValue =
        typeof priceCents === 'number' && Number.isFinite(priceCents)
          ? priceCents / 100
          : typeof subscriptionPriceCents === 'number' &&
              Number.isFinite(subscriptionPriceCents)
            ? subscriptionPriceCents / 100
            : typeof payment.amount === 'number' &&
                Number.isFinite(payment.amount)
              ? payment.amount
              : undefined;
      const purchaseContentName = (mergedMetadata.product_name ||
        mergedMetadata.productName ||
        stripeMetadata.product_name ||
        stripeMetadata.productName ||
        serviceType ||
        servicePlan ||
        'Subscription') as string;
      const purchaseContentCategory = (mergedMetadata.content_category ||
        mergedMetadata.contentCategory ||
        stripeMetadata.content_category ||
        stripeMetadata.contentCategory ||
        serviceType) as string | null;

      if (!isRenewal && orderId) {
        const guardOk = await this.enforceStripeOrderGuard({
          orderId,
          intent,
          paymentId,
        });
        if (!guardOk) {
          return true;
        }
      }

      if (isRenewal && subscriptionId) {
        const subscriptionResult =
          await subscriptionService.getSubscriptionById(subscriptionId);
        if (!subscriptionResult.success || !subscriptionResult.data) {
          Logger.error('Stripe renewal subscription not found', {
            paymentId,
            subscriptionId,
          });
        } else {
          const subscription = subscriptionResult.data;
          const termMonths =
            resolvedTermMonths ??
            parsePositiveInt(subscription.term_months) ??
            1;
          const now = new Date();
          const currentEndDate = new Date(subscription.end_date);
          const termStartAt = currentEndDate > now ? currentEndDate : now;
          const nextDates = computeNextRenewalDates({
            endDate: currentEndDate,
            termMonths,
            autoRenew: subscription.auto_renew ?? false,
            now,
          });
          const expectedEndDate = this.extractExpectedEndDate(mergedMetadata);
          const cycleEndDate = resolveCycleEndDate({
            expectedEndDate,
            endDate: subscription.end_date,
            termStartAt: subscription.term_start_at ?? null,
            termMonths,
          });

          if (!cycleEndDate) {
            Logger.error('Stripe renewal missing cycle end date', {
              paymentId,
              subscriptionId,
            });
            return true;
          }

          const renewalLock =
            await subscriptionRenewalService.beginRenewalProcessing({
              subscriptionId,
              cycleEndDate,
              paymentId: payment.id ?? null,
            });

          if (!renewalLock.acquired && renewalLock.status === 'succeeded') {
            Logger.info('Stripe renewal already processed', {
              paymentId,
              subscriptionId,
              cycleEndDate: renewalLock.cycleEndDate,
            });
            return true;
          }

          const updateResult =
            await subscriptionService.updateSubscriptionForRenewalWithGuard({
              subscriptionId,
              updates: {
                term_start_at: termStartAt,
                end_date: nextDates.endDate,
                renewal_date: nextDates.renewalDate,
                next_billing_at: nextDates.nextBillingAt,
                status_reason: 'renewal_payment_succeeded',
                renewal_method: 'stripe',
                ...(priceCents !== undefined && priceCents !== null
                  ? { price_cents: priceCents }
                  : {}),
                ...(basePriceCents !== null && basePriceCents !== undefined
                  ? { base_price_cents: basePriceCents }
                  : {}),
                ...(discountPercent !== null && discountPercent !== undefined
                  ? { discount_percent: discountPercent }
                  : {}),
                ...(termMonths ? { term_months: termMonths } : {}),
                ...(currency ? { currency } : {}),
              },
              expectedEndDate,
            });

          if (!updateResult.success) {
            Logger.error('Stripe renewal update failed', {
              paymentId,
              subscriptionId,
              error: updateResult.error,
            });
            await subscriptionRenewalService.markRenewalSucceeded({
              subscriptionId,
              cycleEndDate,
              paymentId: payment.id ?? null,
            });
            return true;
          }

          if (!updateResult.updated) {
            Logger.info('Stripe renewal skipped', {
              paymentId,
              subscriptionId,
              reason: updateResult.reason,
            });
            await subscriptionRenewalService.markRenewalSucceeded({
              subscriptionId,
              cycleEndDate,
              paymentId: payment.id ?? null,
            });
            return true;
          }

          const updatedSubscription = updateResult.data
            ? { ...subscription, ...updateResult.data }
            : subscription;
          const renewalNotes = `Renewal paid. Manual renewal required for ${updatedSubscription.service_type} ${updatedSubscription.service_plan}.`;
          const fulfillmentDueDate = new Date(Date.now() + 72 * 60 * 60 * 1000);
          await ensureRenewalTask({
            subscriptionId,
            userId: updatedSubscription.user_id,
            orderId: updatedSubscription.order_id ?? null,
            dueDate: fulfillmentDueDate,
            notes: renewalNotes,
            priority: 'high',
          });

          try {
            await notifyStripeRenewalSuccess({
              userId: updatedSubscription.user_id,
              subscriptionId,
              serviceType: updatedSubscription.service_type,
              servicePlan: updatedSubscription.service_plan,
              productName: updatedSubscription.product_name ?? null,
              variantName: updatedSubscription.variant_name ?? null,
              termMonths: updatedSubscription.term_months ?? null,
            });
          } catch (error) {
            Logger.warn('Stripe renewal success notification failed', {
              subscriptionId,
              error,
            });
          }

          await subscriptionRenewalService.markRenewalSucceeded({
            subscriptionId,
            cycleEndDate,
            paymentId: payment.id ?? null,
          });
        }

        return true;
      }

      let subscriptionCreated = false;
      let createdSubscriptionId: string | null = null;

      if (
        payment.purpose === 'subscription' &&
        !payment.subscriptionId &&
        serviceType &&
        servicePlan
      ) {
        const upgradeOptionsRaw = normalizeUpgradeOptions(mergedMetadata);
        const upgradeValidation = validateUpgradeOptions(upgradeOptionsRaw);
        const upgradeOptions = upgradeValidation.valid
          ? upgradeOptionsRaw
          : null;
        if (!upgradeValidation.valid) {
          Logger.warn('Invalid upgrade options in Stripe metadata', {
            paymentId,
            reason: upgradeValidation.reason,
          });
        }

        const startDate = new Date();
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + durationMonths);
        const renewalDate = new Date(endDate);
        renewalDate.setDate(renewalDate.getDate() - 7);

        const subResult = await subscriptionService.createSubscription(
          payment.userId,
          {
            service_type: serviceType as any,
            service_plan: servicePlan as any,
            start_date: startDate,
            end_date: endDate,
            renewal_date: renewalDate,
            auto_renew: autoRenew,
            order_id: orderId || undefined,
            product_variant_id: productVariantId || undefined,
            price_cents: subscriptionPriceCents ?? priceCents ?? null,
            base_price_cents: basePriceCents ?? null,
            discount_percent: discountPercent ?? null,
            term_months: durationMonths,
            currency,
            next_billing_at: autoRenew ? renewalDate : null,
            renewal_method: 'stripe',
            status_reason: 'stripe_payment_succeeded',
            upgrade_options_snapshot: upgradeOptions ?? null,
          }
        );

        if (subResult.success && subResult.data) {
          subscriptionCreated = true;
          createdSubscriptionId = subResult.data.id;
          await paymentRepository.linkSubscription(
            'stripe',
            paymentId,
            subResult.data.id
          );
        } else {
          Logger.error('Failed to create subscription after Stripe success', {
            paymentId,
            error: !subResult.success ? subResult : undefined,
          });
        }
      }

      const resolvedSubscriptionId =
        createdSubscriptionId || payment.subscriptionId || null;
      const hasSubscription = subscriptionCreated || !!payment.subscriptionId;

      if (autoRenew && resolvedSubscriptionId) {
        const stripeCustomerId =
          typeof intent.customer === 'string'
            ? intent.customer
            : intent.customer?.id;
        const stripePaymentMethodId =
          typeof intent.payment_method === 'string'
            ? intent.payment_method
            : intent.payment_method?.id;

        if (stripeCustomerId && stripePaymentMethodId) {
          try {
            const savedMethod = await this.saveStripePaymentMethod({
              userId: payment.userId,
              paymentMethodId: stripePaymentMethodId,
              customerId: stripeCustomerId,
            });

            await subscriptionService.updateSubscriptionForAdmin(
              resolvedSubscriptionId,
              {
                billing_payment_method_id: savedMethod.id,
                auto_renew: true,
                renewal_method: 'stripe',
                auto_renew_enabled_at: new Date(),
                auto_renew_disabled_at: null,
              }
            );
          } catch (error) {
            Logger.warn('Failed to save Stripe auto-renew payment method', {
              paymentId,
              subscriptionId: resolvedSubscriptionId,
              error,
            });
          }
        }
      }

      if (orderId) {
        await orderService.updateOrderPayment(orderId, {
          payment_provider: 'stripe',
          payment_reference: paymentId,
          auto_renew: autoRenew,
          status: 'in_process',
          status_reason: hasSubscription
            ? 'payment_succeeded'
            : 'subscription_create_failed',
        });
        await couponService.finalizeRedemptionForOrder(orderId);
      }
      if (!isRenewal && !wasAlreadySucceeded) {
        const properties = buildTikTokProductProperties({
          value: purchaseValue ?? null,
          currency: currency.toUpperCase(),
          contentId: productSlug || productVariantId || orderId || paymentId,
          contentName: purchaseContentName,
          contentCategory: purchaseContentCategory ?? null,
          price: purchaseValue ?? null,
          brand: serviceType || null,
        });
        void tiktokEventsService.trackPurchase({
          userId: payment.userId,
          eventId: orderId
            ? `order_${orderId}_purchase`
            : `payment_${paymentId}_purchase`,
          properties,
        });
      }
    } else if (
      eventType === 'payment_intent.payment_failed' ||
      eventType === 'payment_intent.canceled'
    ) {
      const failedStatus =
        eventType === 'payment_intent.canceled' ? 'canceled' : 'failed';
      await paymentRepository.updateStatusByProviderPaymentId(
        'stripe',
        paymentId,
        failedStatus,
        intent.status,
        mergedMetadata
      );

      if (isRenewal && subscriptionId) {
        const subscriptionResult =
          await subscriptionService.getSubscriptionById(subscriptionId);
        if (!subscriptionResult.success || !subscriptionResult.data) {
          Logger.error('Stripe renewal subscription not found', {
            paymentId,
            subscriptionId,
          });
          return true;
        }

        const subscription = subscriptionResult.data;
        if (subscription.status !== 'active') {
          Logger.info('Stripe renewal ignored for inactive subscription', {
            paymentId,
            subscriptionId,
            status: subscription.status,
          });
          return true;
        }
        const decline = this.classifyStripeDecline(intent);
        const requiresAction = intent.status === 'requires_action';
        const isHardFailure = decline.isHard || requiresAction;
        const canRetry = subscription.auto_renew === true && !isHardFailure;
        const nextRetryAt = canRetry
          ? getNextStripeRenewalAttemptDate(
              new Date(subscription.end_date),
              subscription.next_billing_at || subscription.renewal_date
            )
          : null;

        const disableAutoRenew =
          subscription.auto_renew === true && (isHardFailure || !nextRetryAt);
        await subscriptionService.updateSubscriptionForAdmin(subscriptionId, {
          status_reason: 'renewal_payment_failed',
          next_billing_at: nextRetryAt ?? null,
          ...(disableAutoRenew
            ? {
                auto_renew: false,
                auto_renew_disabled_at: new Date(),
              }
            : {}),
        });

        const paymentMethodId =
          mergedMetadata.user_payment_method_id ||
          subscription.billing_payment_method_id ||
          null;
        if (paymentMethodId && isHardFailure) {
          await paymentMethodService.updatePaymentMethodStatus(
            paymentMethodId,
            'requires_action'
          );
        }

        try {
          await notifyStripeRenewalFailure({
            userId: subscription.user_id,
            subscriptionId,
            serviceType: subscription.service_type,
            servicePlan: subscription.service_plan,
            productName: subscription.product_name ?? null,
            variantName: subscription.variant_name ?? null,
            termMonths: subscription.term_months ?? null,
            endDate: new Date(subscription.end_date),
            renewalDate: subscription.renewal_date ?? null,
            priceCents: subscription.price_cents ?? null,
            currency: subscription.currency ?? null,
            reason:
              decline.declineCode ||
              intent.last_payment_error?.message ||
              'stripe_payment_failed',
            nextRetryAt,
          });
        } catch (error) {
          Logger.warn('Stripe renewal failure notification failed', {
            subscriptionId,
            error,
          });
        }

        const expectedEndDate = this.extractExpectedEndDate(mergedMetadata);
        const cycleEndDate = resolveCycleEndDate({
          expectedEndDate,
          endDate: subscription.end_date,
          termStartAt: subscription.term_start_at ?? null,
          termMonths: subscription.term_months ?? null,
        });
        if (cycleEndDate) {
          const renewalLock =
            await subscriptionRenewalService.beginRenewalProcessing({
              subscriptionId,
              cycleEndDate,
              paymentId: payment.id ?? null,
            });
          if (!(renewalLock.status === 'succeeded' && !renewalLock.acquired)) {
            await subscriptionRenewalService.markRenewalFailed({
              subscriptionId,
              cycleEndDate,
            });
          }
        }

        return true;
      }

      const orderId =
        payment.orderId ||
        mergedMetadata.order_id ||
        mergedMetadata.orderId ||
        stripeMetadata.order_id ||
        stripeMetadata.orderId ||
        null;

      if (orderId) {
        await orderService.updateOrderStatus(orderId, 'cancelled', eventType);
        await couponService.voidRedemptionForOrder(orderId);
      }
    } else if (
      eventType === 'payment_intent.requires_action' ||
      eventType === 'payment_intent.requires_payment_method'
    ) {
      await paymentRepository.updateStatusByProviderPaymentId(
        'stripe',
        paymentId,
        mapEventToStatus(intent.status),
        intent.status,
        mergedMetadata
      );

      if (isRenewal && subscriptionId) {
        const subscriptionResult =
          await subscriptionService.getSubscriptionById(subscriptionId);
        if (!subscriptionResult.success || !subscriptionResult.data) {
          Logger.error('Stripe renewal subscription not found', {
            paymentId,
            subscriptionId,
          });
          return true;
        }

        const subscription = subscriptionResult.data;
        if (subscription.status !== 'active') {
          Logger.info('Stripe renewal ignored for inactive subscription', {
            paymentId,
            subscriptionId,
            status: subscription.status,
          });
          return true;
        }
        const decline = this.classifyStripeDecline(intent);
        const requiresAction = intent.status === 'requires_action';
        const isHardFailure = decline.isHard || requiresAction;
        const canRetry = subscription.auto_renew === true && !isHardFailure;
        const nextRetryAt = canRetry
          ? getNextStripeRenewalAttemptDate(
              new Date(subscription.end_date),
              subscription.next_billing_at || subscription.renewal_date
            )
          : null;

        const disableAutoRenew =
          subscription.auto_renew === true && (isHardFailure || !nextRetryAt);
        await subscriptionService.updateSubscriptionForAdmin(subscriptionId, {
          status_reason: 'renewal_payment_failed',
          next_billing_at: nextRetryAt ?? null,
          ...(disableAutoRenew
            ? {
                auto_renew: false,
                auto_renew_disabled_at: new Date(),
              }
            : {}),
        });

        const paymentMethodId =
          mergedMetadata.user_payment_method_id ||
          subscription.billing_payment_method_id ||
          null;
        if (paymentMethodId && isHardFailure) {
          await paymentMethodService.updatePaymentMethodStatus(
            paymentMethodId,
            'requires_action'
          );
        }

        try {
          await notifyStripeRenewalFailure({
            userId: subscription.user_id,
            subscriptionId,
            serviceType: subscription.service_type,
            servicePlan: subscription.service_plan,
            productName: subscription.product_name ?? null,
            variantName: subscription.variant_name ?? null,
            termMonths: subscription.term_months ?? null,
            endDate: new Date(subscription.end_date),
            renewalDate: subscription.renewal_date ?? null,
            priceCents: subscription.price_cents ?? null,
            currency: subscription.currency ?? null,
            reason:
              decline.declineCode ||
              intent.last_payment_error?.message ||
              'requires_action',
            nextRetryAt,
          });
        } catch (error) {
          Logger.warn('Stripe renewal requires-action notification failed', {
            subscriptionId,
            error,
          });
        }

        const expectedEndDate = this.extractExpectedEndDate(mergedMetadata);
        const cycleEndDate = resolveCycleEndDate({
          expectedEndDate,
          endDate: subscription.end_date,
          termStartAt: subscription.term_start_at ?? null,
          termMonths: subscription.term_months ?? null,
        });
        if (cycleEndDate) {
          const renewalLock =
            await subscriptionRenewalService.beginRenewalProcessing({
              subscriptionId,
              cycleEndDate,
              paymentId: payment.id ?? null,
            });
          if (!(renewalLock.status === 'succeeded' && !renewalLock.acquired)) {
            await subscriptionRenewalService.markRenewalFailed({
              subscriptionId,
              cycleEndDate,
            });
          }
        }
      }

      return true;
    } else {
      await paymentRepository.updateStatusByProviderPaymentId(
        'stripe',
        paymentId,
        incomingStatus,
        intent.status,
        mergedMetadata
      );
    }

    return true;
  }

  private async processStripeCheckoutSession(params: {
    session: any;
    eventType: string;
  }): Promise<boolean> {
    const session = params.session;
    const orderId =
      session?.metadata?.order_id ||
      session?.metadata?.orderId ||
      session?.client_reference_id ||
      null;

    if (!orderId) {
      Logger.error('Stripe session missing order reference', {
        sessionId: session?.id,
      });
      return false;
    }

    if (params.eventType !== 'checkout.session.completed') {
      Logger.info('Ignoring Stripe session event', {
        orderId,
        eventType: params.eventType,
      });
      return true;
    }

    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent?.id ?? null);

    const lockClient = await getDatabasePool().connect();
    let lockAcquired = false;
    try {
      await lockClient.query('SELECT pg_advisory_lock(hashtext($1))', [
        orderId,
      ]);
      lockAcquired = true;
    } catch (error) {
      Logger.error('Stripe session lock acquisition failed', {
        orderId,
        error,
      });
      lockClient.release();
      return false;
    }

    try {
      const order = await orderService.getOrderWithItems(orderId);
      if (!order) {
        Logger.error('Stripe session order not found', { orderId });
        return false;
      }

      if (!['pending_payment', 'cart'].includes(order.status)) {
        Logger.info('Stripe session order already processed', {
          orderId,
          status: order.status,
        });
        return true;
      }

      const sessionAmount =
        typeof session.amount_total === 'number' ? session.amount_total : null;
      if (
        sessionAmount !== null &&
        order.total_cents !== null &&
        order.total_cents !== undefined &&
        sessionAmount !== Number(order.total_cents)
      ) {
        Logger.error('Stripe session amount mismatch', {
          orderId,
          orderTotal: order.total_cents,
          sessionAmount,
        });
        await orderService.updateOrderStatus(
          orderId,
          'cancelled',
          'payment_amount_mismatch'
        );
        await couponService.voidRedemptionForOrder(orderId);
        return false;
      }

      const sessionCurrency =
        typeof session.currency === 'string'
          ? session.currency.toUpperCase()
          : null;
      if (
        sessionCurrency &&
        order.currency &&
        sessionCurrency !== order.currency.toUpperCase()
      ) {
        Logger.error('Stripe session currency mismatch', {
          orderId,
          orderCurrency: order.currency,
          sessionCurrency,
        });
        await orderService.updateOrderStatus(
          orderId,
          'cancelled',
          'payment_currency_mismatch'
        );
        await couponService.voidRedemptionForOrder(orderId);
        return false;
      }

      const updateResult = await getDatabasePool().query(
        `UPDATE orders
         SET status = 'in_process',
             status_reason = 'payment_succeeded',
             payment_provider = 'stripe',
             payment_reference = COALESCE($1, payment_reference),
             checkout_mode = 'session',
             stripe_session_id = $2,
             updated_at = NOW()
         WHERE id = $3
           AND status IN ('pending_payment', 'cart')
         RETURNING id`,
        [paymentIntentId, session.id, orderId]
      );

      if (updateResult.rows.length === 0) {
        return true;
      }

      let payment: UnifiedPayment | null = null;
      if (paymentIntentId) {
        payment = await paymentRepository.findByProviderPaymentId(
          'stripe',
          paymentIntentId
        );
      }

      if (!payment && paymentIntentId) {
        const unifiedPayment: CreateUnifiedPaymentInput = {
          userId: order.user_id,
          provider: 'stripe',
          providerPaymentId: paymentIntentId,
          status: 'succeeded',
          providerStatus: 'succeeded',
          purpose: 'subscription',
          amount: (order.total_cents ?? 0) / 100,
          currency: (order.currency || 'USD').toLowerCase(),
          paymentMethodType: 'card',
          orderId: order.id,
          checkoutMode: 'session',
          stripeSessionId: session.id,
          metadata: {
            order_id: order.id,
            checkout_mode: 'session',
          },
        };

        const singleItem =
          order.items.length === 1 ? (order.items[0]?.id ?? null) : null;
        if (singleItem) {
          unifiedPayment.orderItemId = singleItem;
        }

        payment = await paymentRepository.create(unifiedPayment);
      } else if (payment) {
        await getDatabasePool().query(
          `UPDATE payments
           SET checkout_mode = COALESCE(checkout_mode, 'session'),
               stripe_session_id = COALESCE(stripe_session_id, $2),
               updated_at = NOW()
           WHERE id = $1`,
          [payment.id, session.id]
        );
      }

      if (payment) {
        const singleItem =
          order.items.length === 1 ? (order.items[0]?.id ?? null) : null;
        if (singleItem) {
          await getDatabasePool().query(
            `UPDATE payments
             SET order_item_id = COALESCE(order_item_id, $2)
             WHERE id = $1`,
            [payment.id, singleItem]
          );
        }

        await this.createPaymentItemAllocations({
          paymentRecordId: payment.id,
          orderItems: order.items,
        });
      }

      const createdSubscriptions = await this.createSubscriptionsForOrder({
        order,
        orderItems: order.items,
        renewalMethod: 'stripe',
      });

      const autoRenewSubscriptions = createdSubscriptions.filter(
        subscription => subscription.autoRenew
      );

      if (autoRenewSubscriptions.length > 0 && paymentIntentId) {
        try {
          const details =
            await stripeProvider.getPaymentStatus(paymentIntentId);
          const intent = details.raw as any;
          const stripeCustomerId =
            typeof intent.customer === 'string'
              ? intent.customer
              : intent.customer?.id;
          const stripePaymentMethodId =
            typeof intent.payment_method === 'string'
              ? intent.payment_method
              : intent.payment_method?.id;

          if (stripeCustomerId && stripePaymentMethodId) {
            const savedMethod = await this.saveStripePaymentMethod({
              userId: order.user_id,
              paymentMethodId: stripePaymentMethodId,
              customerId: stripeCustomerId,
            });

            for (const subscription of autoRenewSubscriptions) {
              await subscriptionService.updateSubscriptionForAdmin(
                subscription.id,
                {
                  billing_payment_method_id: savedMethod.id,
                  auto_renew: true,
                  renewal_method: 'stripe',
                  auto_renew_enabled_at: new Date(),
                  auto_renew_disabled_at: null,
                }
              );
            }
          }
        } catch (error) {
          Logger.warn('Failed to save Stripe payment method for session', {
            orderId,
            paymentIntentId,
            error,
          });
        }
      }

      await couponService.finalizeRedemptionForOrder(orderId);

      try {
        const confirmationResult =
          await orderService.sendOrderPaymentConfirmationEmail(orderId);
        if (
          !confirmationResult.success &&
          !['already_sent', 'renewal_order'].includes(
            confirmationResult.reason ?? ''
          )
        ) {
          Logger.warn('Failed to send order payment confirmation email', {
            orderId,
            reason: confirmationResult.reason,
          });
        }
      } catch (error) {
        Logger.warn('Order payment confirmation email call failed', {
          orderId,
          error,
        });
      }

      const orderCurrency = (
        order.display_currency ||
        order.currency ||
        order.items.find(item => item.currency)?.currency ||
        'USD'
      ).toUpperCase();
      const totalValue = Number(
        (
          (typeof order.display_total_cents === 'number'
            ? order.display_total_cents
            : typeof order.total_cents === 'number'
              ? order.total_cents
              : order.items.reduce(
                  (sum, item) =>
                    sum +
                    (Number.isFinite(item.total_price_cents)
                      ? item.total_price_cents
                      : 0),
                  0
                )) / 100
        ).toFixed(2)
      );
      const primaryItem = order.items[0];
      const purchaseProperties = {
        ...buildTikTokProductProperties({
          value: totalValue,
          currency: orderCurrency,
          contentId:
            primaryItem?.product_variant_id || primaryItem?.id || order.id,
          contentName:
            primaryItem?.product_name ||
            primaryItem?.variant_name ||
            `Order ${order.id}`,
          contentCategory: primaryItem?.product_name || null,
          price: totalValue,
          brand: null,
        }),
        contents: order.items.map(item => ({
          content_id: item.product_variant_id || item.id,
          content_type: 'product',
          content_name: item.product_name || item.variant_name || item.id,
          quantity: item.quantity,
          price: Number((item.unit_price_cents / 100).toFixed(2)),
        })),
      };
      void tiktokEventsService.trackPurchase({
        userId: order.user_id,
        email: order.contact_email ?? null,
        eventId: `order_${orderId}_purchase`,
        properties: purchaseProperties,
      });

      return true;
    } finally {
      if (lockAcquired) {
        await lockClient.query('SELECT pg_advisory_unlock(hashtext($1))', [
          orderId,
        ]);
      }
      lockClient.release();
    }
  }

  private async processNowPaymentsOrderInvoice(
    payload: WebhookPayload,
    payment: UnifiedPayment
  ): Promise<boolean> {
    const orderId = payment.orderId || payload.order_id || null;
    if (!orderId) {
      Logger.error('NOWPayments invoice missing order reference', {
        paymentId: payment.providerPaymentId,
      });
      return false;
    }

    const previousProviderStatus = payment.providerStatus as
      | PaymentStatus
      | undefined;
    if (
      previousProviderStatus &&
      shouldIgnoreNowPaymentsStatusRegression(
        previousProviderStatus,
        payload.payment_status
      )
    ) {
      Logger.warn('Ignoring NOWPayments status regression for order invoice', {
        paymentId: payment.providerPaymentId,
        previousStatus: previousProviderStatus,
        newStatus: payload.payment_status,
      });
      return true;
    }

    const updatedMetadata: Record<string, any> = {
      ...(payment.metadata || {}),
      orderId,
      actuallyPaid: payload.actually_paid ?? null,
      invoiceStatus: payload.payment_status,
      payCurrency: payload.pay_currency,
      payAddress: payload.pay_address,
      lastWebhookAt: new Date().toISOString(),
      lastWebhookPaymentId: payload.payment_id,
    };

    await paymentRepository.updateStatusByProviderPaymentId(
      'nowpayments',
      payment.providerPaymentId,
      this.mapNowPaymentsStatus(payload.payment_status),
      payload.payment_status,
      updatedMetadata
    );

    if (payload.payment_status !== 'finished') {
      if (
        ['failed', 'expired'].includes(payload.payment_status) &&
        payment.status !== 'failed'
      ) {
        await orderService.updateOrderStatus(
          orderId,
          'cancelled',
          payload.payment_status
        );
        await couponService.voidRedemptionForOrder(orderId);
      }
      return true;
    }

    const lockClient = await getDatabasePool().connect();
    let lockAcquired = false;
    try {
      await lockClient.query('SELECT pg_advisory_lock(hashtext($1))', [
        orderId,
      ]);
      lockAcquired = true;
    } catch (error) {
      Logger.error('NOWPayments invoice lock acquisition failed', {
        orderId,
        error,
      });
      lockClient.release();
      return false;
    }

    try {
      const order = await orderService.getOrderWithItems(orderId);
      if (!order) {
        Logger.error('NOWPayments invoice order not found', { orderId });
        return false;
      }

      if (!['pending_payment', 'cart'].includes(order.status)) {
        Logger.info('NOWPayments order already processed', {
          orderId,
          status: order.status,
        });
        return true;
      }

      const updateResult = await getDatabasePool().query(
        `UPDATE orders
         SET status = 'in_process',
             status_reason = 'payment_succeeded',
             payment_provider = 'nowpayments',
             payment_reference = $1,
             checkout_mode = 'invoice',
             updated_at = NOW()
         WHERE id = $2
           AND status IN ('pending_payment', 'cart')
         RETURNING id`,
        [payment.providerPaymentId, orderId]
      );

      if (updateResult.rows.length === 0) {
        return true;
      }

      if (order.items.length === 1) {
        const singleItem = order.items[0]?.id ?? null;
        if (singleItem) {
          await getDatabasePool().query(
            `UPDATE payments
             SET order_item_id = COALESCE(order_item_id, $2)
             WHERE id = $1`,
            [payment.id, singleItem]
          );
        }
      }

      await this.createPaymentItemAllocations({
        paymentRecordId: payment.id,
        orderItems: order.items,
      });

      await this.createSubscriptionsForOrder({
        order,
        orderItems: order.items,
        renewalMethod: null,
      });

      await couponService.finalizeRedemptionForOrder(orderId);

      try {
        const confirmationResult =
          await orderService.sendOrderPaymentConfirmationEmail(orderId);
        if (
          !confirmationResult.success &&
          !['already_sent', 'renewal_order'].includes(
            confirmationResult.reason ?? ''
          )
        ) {
          Logger.warn('Failed to send order payment confirmation email', {
            orderId,
            reason: confirmationResult.reason,
          });
        }
      } catch (error) {
        Logger.warn('Order payment confirmation email call failed', {
          orderId,
          error,
        });
      }

      return true;
    } finally {
      if (lockAcquired) {
        await lockClient.query('SELECT pg_advisory_unlock(hashtext($1))', [
          orderId,
        ]);
      }
      lockClient.release();
    }
  }

  async handleStripeWebhook(
    payload: any,
    signature: string | undefined
  ): Promise<boolean> {
    try {
      if (!signature) {
        Logger.error('Stripe webhook missing signature header');
        return false;
      }

      // Validate signature using Stripe library
      const stripe = require('stripe')(process.env['STRIPE_SECRET_KEY'], {
        apiVersion: '2024-06-20',
      });

      let event;
      try {
        event = stripe.webhooks.constructEvent(
          payload.rawBody,
          signature,
          process.env['STRIPE_WEBHOOK_SECRET']
        );
      } catch (err) {
        Logger.error('Stripe webhook signature verification failed:', err);
        return false;
      }

      if (event.type.startsWith('checkout.session.')) {
        const session = event.data.object as any;
        const orderId =
          session?.metadata?.order_id ||
          session?.metadata?.orderId ||
          session?.client_reference_id ||
          null;
        const paymentIntentId =
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : (session.payment_intent?.id ?? null);

        const paymentRecord = paymentIntentId
          ? await paymentRepository.findByProviderPaymentId(
              'stripe',
              paymentIntentId
            )
          : null;

        const recorded = await this.recordPaymentEvent({
          provider: 'stripe',
          eventId: event.id,
          eventType: event.type,
          orderId,
          paymentId: paymentRecord?.id ?? null,
        });
        if (!recorded) {
          Logger.info('Duplicate Stripe session event ignored', {
            eventId: event.id,
            eventType: event.type,
          });
          return true;
        }

        return await this.processStripeCheckoutSession({
          session,
          eventType: event.type,
        });
      }

      // Ignore non-payment_intent events for now (e.g., charges)
      if (!event.type.startsWith('payment_intent.')) {
        Logger.info(
          `Ignoring Stripe event ${event.type} (not a payment_intent)`
        );
        return true;
      }

      const intent = event.data.object as any;
      const paymentId = intent.id as string;

      // Fetch payment record
      const payment = await paymentRepository.findByProviderPaymentId(
        'stripe',
        paymentId
      );

      if (!payment) {
        Logger.error('Stripe payment not found in repository', { paymentId });
        return false;
      }

      const recorded = await this.recordPaymentEvent({
        provider: 'stripe',
        eventId: event.id,
        eventType: event.type,
        orderId: payment.orderId ?? null,
        paymentId: payment.id,
      });
      if (!recorded) {
        Logger.info('Duplicate Stripe payment_intent event ignored', {
          eventId: event.id,
          eventType: event.type,
        });
        return true;
      }

      const lockClient = await getDatabasePool().connect();
      let lockAcquired = false;
      try {
        await lockClient.query('SELECT pg_advisory_lock(hashtext($1))', [
          paymentId,
        ]);
        lockAcquired = true;
      } catch (lockError) {
        Logger.error('Stripe webhook lock acquisition failed', {
          paymentId,
          error: lockError,
        });
        lockClient.release();
        return false;
      }

      try {
        return await this.processStripePaymentIntent({
          intent,
          payment,
          eventType: event.type,
        });
      } finally {
        if (lockAcquired) {
          await lockClient.query('SELECT pg_advisory_unlock(hashtext($1))', [
            paymentId,
          ]);
        }
        lockClient.release();
      }
    } catch (error) {
      Logger.error('Stripe webhook handling failed:', error);
      return false;
    }
  }

  async reconcileStripePaymentIntent(paymentId: string): Promise<{
    handled: boolean;
    status?: UnifiedPaymentStatus;
    error?: string;
  }> {
    const lockClient = await getDatabasePool().connect();
    let lockAcquired = false;

    try {
      await lockClient.query('SELECT pg_advisory_lock(hashtext($1))', [
        paymentId,
      ]);
      lockAcquired = true;
    } catch (lockError) {
      Logger.error('Stripe reconcile lock acquisition failed', {
        paymentId,
        error: lockError,
      });
      lockClient.release();
      return { handled: false, error: 'lock_failed' };
    }

    try {
      const payment = await paymentRepository.findByProviderPaymentId(
        'stripe',
        paymentId
      );
      if (!payment) {
        Logger.error('Stripe payment not found during reconciliation', {
          paymentId,
        });
        return { handled: false, error: 'payment_not_found' };
      }

      const details = await stripeProvider.getPaymentStatus(paymentId);
      const intent = details.raw as any;
      const eventType = this.resolveStripeEventType(details.providerStatus);

      await this.processStripePaymentIntent({
        intent,
        payment,
        eventType,
      });

      return {
        handled: true,
        status: this.mapStripePaymentIntentStatus(details.providerStatus),
      };
    } catch (error) {
      Logger.error('Stripe payment reconciliation failed', {
        paymentId,
        error,
      });
      return { handled: false, error: 'reconcile_failed' };
    } finally {
      if (lockAcquired) {
        await lockClient.query('SELECT pg_advisory_unlock(hashtext($1))', [
          paymentId,
        ]);
      }
      lockClient.release();
    }
  }

  private async reconcileStripeCheckoutSessionForOrder(params: {
    orderId: string;
    stripeSessionId: string;
  }): Promise<boolean> {
    try {
      const session = await stripeProvider.retrieveCheckoutSession(
        params.stripeSessionId,
        { expand: ['payment_intent'] }
      );
      const sessionMetadata = (session?.metadata || {}) as Record<string, any>;
      const sessionOrderId =
        sessionMetadata['order_id'] ||
        sessionMetadata['orderId'] ||
        session?.client_reference_id ||
        null;
      if (sessionOrderId && sessionOrderId !== params.orderId) {
        Logger.error('Stripe session reconciliation order mismatch', {
          orderId: params.orderId,
          stripeSessionId: params.stripeSessionId,
          sessionOrderId,
        });
        return false;
      }

      const sessionPaid =
        session?.payment_status === 'paid' || session?.status === 'complete';
      if (!sessionPaid) {
        return false;
      }

      return await this.processStripeCheckoutSession({
        session,
        eventType: 'checkout.session.completed',
      });
    } catch (error) {
      Logger.warn('Failed to reconcile Stripe checkout session for order', {
        orderId: params.orderId,
        stripeSessionId: params.stripeSessionId,
        error,
      });
      return false;
    }
  }

  async cancelPendingStripeRenewalPayments(subscriptionIds: string[]): Promise<{
    cancelled: number;
    skipped: number;
    errors: number;
    total: number;
  }> {
    if (!subscriptionIds || subscriptionIds.length === 0) {
      return { cancelled: 0, skipped: 0, errors: 0, total: 0 };
    }

    const pendingPayments =
      await paymentRepository.listPendingStripeRenewalPayments(subscriptionIds);
    if (pendingPayments.length === 0) {
      return { cancelled: 0, skipped: 0, errors: 0, total: 0 };
    }

    let cancelled = 0;
    let skipped = 0;
    let errors = 0;

    for (const payment of pendingPayments) {
      try {
        const intent = await stripeProvider.cancelPaymentIntent(
          payment.providerPaymentId
        );
        await paymentRepository.updateStatusByProviderPaymentId(
          'stripe',
          payment.providerPaymentId,
          'canceled',
          intent.status,
          payment.metadata
        );
        cancelled += 1;
      } catch (error) {
        try {
          const details = await stripeProvider.getPaymentStatus(
            payment.providerPaymentId
          );
          const normalized = this.mapStripePaymentIntentStatus(
            details.providerStatus
          );
          await paymentRepository.updateStatusByProviderPaymentId(
            'stripe',
            payment.providerPaymentId,
            normalized,
            details.providerStatus,
            payment.metadata
          );
          skipped += 1;
        } catch (statusError) {
          errors += 1;
          Logger.warn('Failed to cancel Stripe renewal payment intent', {
            paymentId: payment.providerPaymentId,
            error,
            statusError,
          });
        }
      }
    }

    Logger.info('Stripe renewal payment cleanup complete', {
      cancelled,
      skipped,
      errors,
      total: pendingPayments.length,
    });

    return { cancelled, skipped, errors, total: pendingPayments.length };
  }

  async cancelStripeCheckout(params: {
    orderId: string;
    paymentId?: string | null;
    userId?: string;
    reason?: string;
  }): Promise<{
    cancelled: boolean;
    status: string;
    paymentStatus?: UnifiedPaymentStatus;
  }> {
    const { orderId, userId } = params;
    const reason = params.reason || 'checkout_cancelled';

    const order = await orderService.getOrderById(orderId);
    if (!order) {
      return { cancelled: false, status: 'order_not_found' };
    }

    if (userId && order.user_id !== userId) {
      return { cancelled: false, status: 'forbidden' };
    }

    if (order.status !== 'pending_payment') {
      return { cancelled: false, status: 'already_processed' };
    }

    if (order.payment_provider !== 'stripe') {
      return { cancelled: false, status: 'not_stripe' };
    }

    if (
      params.paymentId &&
      order.payment_reference &&
      params.paymentId !== order.payment_reference
    ) {
      return { cancelled: false, status: 'payment_mismatch' };
    }

    const isSessionCheckout =
      order.checkout_mode === 'session' || Boolean(order.stripe_session_id);
    let paymentId = order.payment_reference || params.paymentId || null;

    if (isSessionCheckout && order.stripe_session_id) {
      try {
        await stripeProvider.expireCheckoutSession(order.stripe_session_id);
      } catch (error) {
        Logger.warn('Failed to expire Stripe checkout session', {
          orderId,
          sessionId: order.stripe_session_id,
          error,
        });
      }
    }

    if (isSessionCheckout && !paymentId && order.stripe_session_id) {
      try {
        const session = await stripeProvider.retrieveCheckoutSession(
          order.stripe_session_id,
          { expand: ['payment_intent'] }
        );
        paymentId =
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : (session.payment_intent?.id ?? null);
      } catch (error) {
        Logger.warn('Failed to retrieve Stripe checkout session', {
          orderId,
          sessionId: order.stripe_session_id,
          error,
        });
      }
    }

    if (!paymentId) {
      await orderService.updateOrderStatus(orderId, 'cancelled', reason);
      await couponService.voidRedemptionForOrder(orderId);
      return { cancelled: true, status: 'cancelled' };
    }

    let details: Awaited<
      ReturnType<typeof stripeProvider.getPaymentStatus>
    > | null = null;
    try {
      details = await stripeProvider.getPaymentStatus(paymentId);
    } catch (error) {
      const errorCode =
        error && typeof error === 'object' && 'code' in error
          ? (error as { code?: string }).code
          : undefined;
      const errorMessage = error instanceof Error ? error.message : '';
      const isMissingIntent =
        errorCode === 'resource_missing' ||
        errorMessage.toLowerCase().includes('no such payment_intent');
      if (isMissingIntent) {
        await orderService.updateOrderStatus(orderId, 'cancelled', reason);
        await couponService.voidRedemptionForOrder(orderId);
        return { cancelled: true, status: 'cancelled' };
      }
      Logger.warn('Failed to fetch Stripe payment status for checkout cancel', {
        orderId,
        paymentId,
        error,
      });
      return { cancelled: false, status: 'status_unavailable' };
    }
    if (!details) {
      return { cancelled: false, status: 'status_unavailable' };
    }

    let normalized = this.mapStripePaymentIntentStatus(details.providerStatus);
    if (normalized === 'succeeded' || normalized === 'processing') {
      const reconcileResult =
        await this.reconcileStripePaymentIntent(paymentId);
      if (!reconcileResult.handled) {
        const sessionReconciled =
          isSessionCheckout && order.stripe_session_id
            ? await this.reconcileStripeCheckoutSessionForOrder({
                orderId,
                stripeSessionId: order.stripe_session_id,
              })
            : false;
        if (!sessionReconciled) {
          return {
            cancelled: false,
            status: 'reconcile_failed',
            paymentStatus: normalized,
          };
        }
      }
      return {
        cancelled: false,
        status: 'reconciled',
        paymentStatus: normalized,
      };
    }

    if (normalized !== 'canceled') {
      try {
        const intent = await stripeProvider.cancelPaymentIntent(paymentId);
        normalized = this.mapStripePaymentIntentStatus(intent.status);
      } catch (error) {
        try {
          const refreshed = await stripeProvider.getPaymentStatus(paymentId);
          normalized = this.mapStripePaymentIntentStatus(
            refreshed.providerStatus
          );
        } catch (statusError) {
          Logger.warn('Failed to cancel Stripe checkout intent', {
            orderId,
            paymentId,
            error,
            statusError,
          });
          return { cancelled: false, status: 'cancel_failed' };
        }
      }
    }

    if (normalized === 'succeeded' || normalized === 'processing') {
      const reconcileResult =
        await this.reconcileStripePaymentIntent(paymentId);
      if (!reconcileResult.handled) {
        const sessionReconciled =
          isSessionCheckout && order.stripe_session_id
            ? await this.reconcileStripeCheckoutSessionForOrder({
                orderId,
                stripeSessionId: order.stripe_session_id,
              })
            : false;
        if (!sessionReconciled) {
          return {
            cancelled: false,
            status: 'reconcile_failed',
            paymentStatus: normalized,
          };
        }
      }
      return {
        cancelled: false,
        status: 'reconciled',
        paymentStatus: normalized,
      };
    }

    if (normalized !== 'canceled') {
      return {
        cancelled: false,
        status: 'cancel_failed',
        paymentStatus: normalized,
      };
    }

    await paymentRepository.updateStatusByProviderPaymentId(
      'stripe',
      paymentId,
      'canceled',
      normalized === 'canceled' ? 'canceled' : details.providerStatus,
      details.metadata
    );
    await orderService.updateOrderStatus(orderId, 'cancelled', reason);
    await couponService.voidRedemptionForOrder(orderId);

    return { cancelled: true, status: 'cancelled', paymentStatus: 'canceled' };
  }

  async cancelNowPaymentsCheckout(params: {
    orderId: string;
    userId?: string;
    reason?: string;
  }): Promise<{
    cancelled: boolean;
    status: string;
    paymentStatus?: UnifiedPaymentStatus;
  }> {
    const { orderId, userId } = params;
    const reason = params.reason || 'checkout_cancelled';

    const order = await orderService.getOrderById(orderId);
    if (!order) {
      return { cancelled: false, status: 'order_not_found' };
    }

    if (userId && order.user_id !== userId) {
      return { cancelled: false, status: 'forbidden' };
    }

    if (order.status !== 'pending_payment') {
      return { cancelled: false, status: 'already_processed' };
    }

    if (order.payment_provider !== 'nowpayments') {
      return { cancelled: false, status: 'not_nowpayments' };
    }

    const paymentReference = order.payment_reference || null;
    if (paymentReference) {
      const existingPayment = await paymentRepository.findByProviderPaymentId(
        'nowpayments',
        paymentReference
      );

      if (existingPayment) {
        const providerStatus = (
          existingPayment.providerStatus || ''
        ).toLowerCase();
        const isSettled =
          existingPayment.status === 'succeeded' ||
          providerStatus === 'finished';

        if (isSettled) {
          return {
            cancelled: false,
            status: 'reconciled',
            paymentStatus: 'succeeded',
          };
        }

        await paymentRepository.updateStatusByProviderPaymentId(
          'nowpayments',
          paymentReference,
          'expired',
          'expired',
          {
            ...(existingPayment.metadata || {}),
            timeout_reason: reason,
            timeout_cancelled_at: new Date().toISOString(),
          }
        );
      }
    }

    await orderService.updateOrderStatus(orderId, 'cancelled', reason);
    await couponService.voidRedemptionForOrder(orderId);
    return { cancelled: true, status: 'cancelled', paymentStatus: 'expired' };
  }

  async sweepStaleStripeCheckouts(params?: {
    ttlMinutes?: number;
    batchSize?: number;
  }): Promise<{
    scanned: number;
    cancelled: number;
    reconciled: number;
    skipped: number;
    errors: number;
  }> {
    const ttlMinutes = params?.ttlMinutes ?? env.CHECKOUT_ABANDON_TTL_MINUTES;
    const batchSize =
      params?.batchSize ?? env.CHECKOUT_ABANDON_SWEEP_BATCH_SIZE;

    if (!ttlMinutes || ttlMinutes <= 0) {
      return { scanned: 0, cancelled: 0, reconciled: 0, skipped: 0, errors: 0 };
    }

    const cutoff = new Date(Date.now() - ttlMinutes * 60 * 1000);
    const pool = getDatabasePool();
    const result = await pool.query(
      `
      SELECT
        o.id AS order_id,
        o.user_id,
        o.payment_provider,
        o.payment_reference,
        COALESCE(p.created_at, o.updated_at, o.created_at) AS started_at
      FROM orders o
      LEFT JOIN payments p
        ON p.provider = o.payment_provider
       AND p.provider_payment_id = o.payment_reference
      WHERE o.status = 'pending_payment'
        AND o.payment_provider = ANY($2::text[])
        AND COALESCE(p.created_at, o.updated_at, o.created_at) <= $1
      ORDER BY COALESCE(p.created_at, o.updated_at, o.created_at) ASC
      LIMIT $3
      `,
      [cutoff, ['stripe', 'nowpayments'], batchSize]
    );

    let cancelled = 0;
    let reconciled = 0;
    let skipped = 0;
    let errors = 0;

    for (const row of result.rows) {
      const orderId = row.order_id as string;
      const paymentId = row.payment_reference as string | null;
      const paymentProvider = row.payment_provider as string | null;
      try {
        const outcome =
          paymentProvider === 'stripe'
            ? await this.cancelStripeCheckout({
                orderId,
                paymentId,
                reason: 'checkout_timeout',
              })
            : paymentProvider === 'nowpayments'
              ? await this.cancelNowPaymentsCheckout({
                  orderId,
                  reason: 'checkout_timeout',
                })
              : { cancelled: false, status: 'unsupported_provider' };
        if (outcome.status === 'cancelled') {
          cancelled += 1;
        } else if (outcome.status === 'reconciled') {
          reconciled += 1;
        } else if (
          outcome.status === 'already_processed' ||
          outcome.status === 'not_stripe' ||
          outcome.status === 'not_nowpayments' ||
          outcome.status === 'unsupported_provider'
        ) {
          skipped += 1;
        } else if (outcome.status === 'forbidden') {
          skipped += 1;
        } else {
          errors += 1;
        }
      } catch (error) {
        errors += 1;
        Logger.warn('Failed to sweep stale checkout', {
          orderId,
          paymentProvider,
          paymentId,
          error,
        });
      }
    }

    return {
      scanned: result.rows.length,
      cancelled,
      reconciled,
      skipped,
      errors,
    };
  }

  async createStripeCheckoutSession(params: {
    orderId: string;
    successUrl?: string | null;
    cancelUrl?: string | null;
  }): Promise<
    | {
        success: true;
        sessionId: string;
        sessionUrl: string;
        paymentId: string | null;
        orderId: string;
      }
    | { success: false; error: string }
  > {
    try {
      const order = await orderService.getOrderWithItems(params.orderId);
      if (!order) {
        return { success: false, error: 'order_not_found' };
      }

      if (!['cart', 'pending_payment'].includes(order.status)) {
        return { success: false, error: 'order_not_pending' };
      }

      if (order.payment_provider && order.payment_provider !== 'stripe') {
        return { success: false, error: 'payment_provider_mismatch' };
      }

      const orderCurrency =
        normalizeCurrencyCode(order.currency) ||
        (order.currency ? order.currency.toUpperCase() : null);
      if (!orderCurrency) {
        return { success: false, error: 'invalid_currency' };
      }

      const supportsCurrency =
        await stripeProvider.supportsCurrency(orderCurrency);
      if (!supportsCurrency) {
        return {
          success: false,
          error: `Currency ${orderCurrency} is not supported by Stripe`,
        };
      }

      const items = order.items ?? [];
      if (items.length === 0) {
        return { success: false, error: 'order_missing_items' };
      }

      const ownAccountValidation = await this.validateOwnAccountSelectionData(
        order as OrderWithItems
      );
      if (!ownAccountValidation.valid) {
        Logger.warn(
          'Missing own-account credentials while creating Stripe checkout session',
          {
            orderId: order.id,
            item: ownAccountValidation.missingItemLabel,
          }
        );
        return { success: false, error: 'own_account_credentials_required' };
      }

      const autoRenewAny = items.some(item => item.auto_renew === true);
      const baseUrl = this.resolveAppBaseUrl();
      if (!baseUrl) {
        return { success: false, error: 'missing_app_base_url' };
      }

      const defaultSuccessUrl = `${baseUrl}/checkout/stripe?status=success&order_id=${order.id}&session_id={CHECKOUT_SESSION_ID}`;
      const defaultCancelUrl = `${baseUrl}/checkout`;
      const successUrl = params.successUrl || defaultSuccessUrl;
      const cancelUrl = params.cancelUrl || defaultCancelUrl;

      const lineItems = items.map(item => {
        const quantity = Math.max(1, item.quantity || 1);
        const unitAmount = Math.max(
          1,
          Math.round(item.total_price_cents / quantity)
        );
        const name =
          item.product_name ||
          item.variant_name ||
          item.description ||
          'Subscription';
        return {
          price_data: {
            currency: orderCurrency.toLowerCase(),
            unit_amount: unitAmount,
            product_data: {
              name,
              ...(item.description ? { description: item.description } : {}),
            },
          },
          quantity,
        };
      });

      const customerInfo = autoRenewAny
        ? await this.ensureStripeCustomer(order.user_id, {
            preferredEmail: order.contact_email ?? null,
          })
        : null;
      const customerEmail = order.contact_email ?? customerInfo?.email ?? null;

      if (order.checkout_mode === 'session' && order.stripe_session_id) {
        try {
          const existingSession = await stripeProvider.retrieveCheckoutSession(
            order.stripe_session_id
          );
          if (existingSession.url) {
            return {
              success: true,
              sessionId: existingSession.id,
              sessionUrl: existingSession.url,
              paymentId:
                typeof existingSession.payment_intent === 'string'
                  ? existingSession.payment_intent
                  : (existingSession.payment_intent?.id ?? null),
              orderId: order.id,
            };
          }
        } catch (error) {
          Logger.warn('Failed to reuse existing Stripe session', {
            orderId: order.id,
            sessionId: order.stripe_session_id,
            error,
          });
        }
      }

      const session = await this.createCheckoutSessionWithRetry(
        {
          lineItems,
          successUrl,
          cancelUrl,
          ...(customerInfo?.customerId
            ? { customerId: customerInfo.customerId }
            : {}),
          ...(customerEmail ? { customerEmail } : {}),
          metadata: {
            order_id: order.id,
            checkout_mode: 'session',
          },
          paymentIntentMetadata: {
            order_id: order.id,
            checkout_mode: 'session',
            auto_renew_any: autoRenewAny,
          },
          ...(autoRenewAny ? { setupFutureUsage: 'off_session' } : {}),
          clientReferenceId: order.id,
          expand: ['payment_intent'],
        },
        { orderId: order.id }
      );

      const paymentIntentId =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : (session.payment_intent?.id ?? null);

      if (paymentIntentId) {
        const intentStatus =
          typeof session.payment_intent === 'string'
            ? null
            : (session.payment_intent?.status ?? null);
        const existingPayment = await paymentRepository.findByProviderPaymentId(
          'stripe',
          paymentIntentId
        );
        if (!existingPayment) {
          const unifiedPayment: CreateUnifiedPaymentInput = {
            userId: order.user_id,
            provider: 'stripe',
            providerPaymentId: paymentIntentId,
            status: this.mapStripePaymentIntentStatus(
              intentStatus ?? 'requires_payment_method'
            ),
            providerStatus: intentStatus ?? 'requires_payment_method',
            purpose: 'subscription',
            amount: (order.total_cents ?? 0) / 100,
            currency: orderCurrency.toLowerCase(),
            paymentMethodType: 'card',
            orderId: order.id,
            checkoutMode: 'session',
            stripeSessionId: session.id,
            metadata: {
              order_id: order.id,
              checkout_mode: 'session',
            },
          };

          const singleItem = items.length === 1 ? (items[0]?.id ?? null) : null;
          if (singleItem) {
            unifiedPayment.orderItemId = singleItem;
          }

          await paymentRepository.create(unifiedPayment);
        }
      }

      await orderService.updateOrderPayment(order.id, {
        payment_provider: 'stripe',
        payment_reference: paymentIntentId,
        checkout_mode: 'session',
        stripe_session_id: session.id,
        status: order.status === 'cart' ? 'pending_payment' : order.status,
        status_reason:
          order.status === 'cart'
            ? 'awaiting_payment'
            : (order.status_reason ?? null),
      });

      return {
        success: true,
        sessionId: session.id,
        sessionUrl: session.url || '',
        paymentId: paymentIntentId,
        orderId: order.id,
      };
    } catch (error) {
      Logger.error('Failed to create Stripe checkout session', error);
      if (this.isStripeConnectionError(error)) {
        return { success: false, error: 'payment_provider_unavailable' };
      }
      if (this.isStripeRateLimitError(error)) {
        return { success: false, error: 'payment_provider_rate_limited' };
      }
      if (this.isStripeAuthenticationError(error)) {
        return { success: false, error: 'payment_provider_misconfigured' };
      }
      return { success: false, error: 'stripe_session_failed' };
    }
  }

  async createNowPaymentsOrderInvoice(params: {
    orderId: string;
    payCurrency?: string | null;
    forceNewInvoice?: boolean;
    successUrl?: string | null;
    cancelUrl?: string | null;
  }): Promise<
    | {
        success: true;
        orderId: string;
        invoiceId: string;
        invoiceUrl: string;
        payAddress?: string | null;
        payAmount?: number | null;
        payCurrency?: string | null;
        status?: string | null;
      }
    | { success: false; error: string }
  > {
    try {
      const order = await orderService.getOrderWithItems(params.orderId);
      if (!order) {
        return { success: false, error: 'order_not_found' };
      }

      if (!['cart', 'pending_payment'].includes(order.status)) {
        return { success: false, error: 'order_not_pending' };
      }

      if (order.payment_provider && order.payment_provider !== 'nowpayments') {
        return { success: false, error: 'payment_provider_mismatch' };
      }

      const orderCurrency =
        normalizeCurrencyCode(order.currency) ||
        (order.currency ? order.currency.toUpperCase() : null);
      if (!orderCurrency) {
        return { success: false, error: 'invalid_currency' };
      }

      if (!order.items || order.items.length === 0) {
        return { success: false, error: 'order_missing_items' };
      }

      const ownAccountValidation = await this.validateOwnAccountSelectionData(
        order as OrderWithItems
      );
      if (!ownAccountValidation.valid) {
        Logger.warn(
          'Missing own-account credentials while creating NOWPayments invoice',
          {
            orderId: order.id,
            item: ownAccountValidation.missingItemLabel,
          }
        );
        return { success: false, error: 'own_account_credentials_required' };
      }

      const totalCents = order.total_cents ?? null;
      if (!totalCents || totalCents <= 0) {
        return { success: false, error: 'amount_invalid' };
      }

      const amount = totalCents / 100;
      const payCurrency = params.payCurrency
        ? params.payCurrency.trim().toLowerCase()
        : null;

      if (payCurrency) {
        const supported =
          await nowpaymentsClient.isCurrencySupported(payCurrency);
        if (!supported) {
          return { success: false, error: 'currency_unsupported' };
        }
      }

      if (payCurrency) {
        const minimumCheck = await this.getNowPaymentsOrderMinimum({
          orderId: order.id,
          payCurrency,
        });
        if (!minimumCheck.success) {
          return { success: false, error: minimumCheck.error };
        }
        if (!minimumCheck.meetsMinimum) {
          return { success: false, error: 'below_nowpayments_minimum' };
        }
      }

      if (
        order.payment_provider === 'nowpayments' &&
        order.checkout_mode === 'invoice' &&
        order.payment_reference
      ) {
        const existingPayment = await paymentRepository.findByProviderPaymentId(
          'nowpayments',
          order.payment_reference
        );
        if (
          existingPayment &&
          !['failed', 'expired'].includes(existingPayment.status)
        ) {
          const metadata = existingPayment.metadata || {};
          const existingPayCurrencyRaw =
            metadata['pay_currency'] || metadata['payCurrency'] || null;
          const existingPayCurrency =
            typeof existingPayCurrencyRaw === 'string'
              ? existingPayCurrencyRaw.trim().toLowerCase()
              : null;
          const invoiceUrl =
            metadata['invoice_url'] ||
            metadata['invoiceUrl'] ||
            metadata['invoiceURL'] ||
            '';
          const requestedPayCurrency =
            payCurrency?.trim().toLowerCase() || null;
          const shouldReuseExistingInvoice =
            params.forceNewInvoice !== true &&
            (!requestedPayCurrency ||
              (existingPayCurrency &&
                existingPayCurrency === requestedPayCurrency)) &&
            invoiceUrl.length > 0;

          if (shouldReuseExistingInvoice) {
            return {
              success: true,
              orderId: order.id,
              invoiceId: existingPayment.providerPaymentId,
              invoiceUrl,
              payAddress:
                metadata['pay_address'] || metadata['payAddress'] || null,
              payAmount:
                metadata['pay_amount'] || metadata['payAmount'] || null,
              payCurrency:
                metadata['pay_currency'] || metadata['payCurrency'] || null,
              status: existingPayment.providerStatus ?? existingPayment.status,
            };
          }
        }
      }

      const itemDescriptions = order.items
        .map(item => item.description)
        .filter(Boolean) as string[];
      const fallbackDescription = `Order ${order.id}`;
      const rawDescription =
        itemDescriptions.length > 0
          ? itemDescriptions.join(', ')
          : fallbackDescription;
      const orderDescription =
        rawDescription.length > 200
          ? `${rawDescription.slice(0, 197)}...`
          : rawDescription;

      const invoice = await nowpaymentsClient.createInvoice({
        price_amount: amount,
        price_currency: orderCurrency.toLowerCase(),
        ...(payCurrency ? { pay_currency: payCurrency } : {}),
        order_id: order.id,
        order_description: orderDescription,
        ipn_callback_url: env.NOWPAYMENTS_WEBHOOK_URL,
        ...(params.successUrl ? { success_url: params.successUrl } : {}),
        ...(params.cancelUrl ? { cancel_url: params.cancelUrl } : {}),
      });

      const unifiedPayment: CreateUnifiedPaymentInput = {
        userId: order.user_id,
        provider: 'nowpayments',
        providerPaymentId: invoice.id,
        status: this.mapNowPaymentsStatus(invoice.payment_status),
        providerStatus: invoice.payment_status,
        purpose: 'subscription',
        amount,
        currency: orderCurrency.toLowerCase(),
        ...(orderCurrency.toLowerCase() === 'usd' ? { amountUsd: amount } : {}),
        paymentMethodType: 'crypto',
        orderId: order.id,
        checkoutMode: 'invoice',
        metadata: {
          order_id: order.id,
          invoice_url: invoice.invoice_url,
          pay_address: invoice.pay_address,
          pay_amount: invoice.pay_amount,
          pay_currency: invoice.pay_currency,
          price_amount: invoice.price_amount,
          price_currency: invoice.price_currency,
          order_description: invoice.order_description,
        },
      };

      const singleItem =
        order.items.length === 1 ? (order.items[0]?.id ?? null) : null;
      if (singleItem) {
        unifiedPayment.orderItemId = singleItem;
      }

      await paymentRepository.create(unifiedPayment);

      await orderService.updateOrderPayment(order.id, {
        payment_provider: 'nowpayments',
        payment_reference: invoice.id,
        checkout_mode: 'invoice',
        status: order.status === 'cart' ? 'pending_payment' : order.status,
        status_reason:
          order.status === 'cart'
            ? 'awaiting_payment'
            : (order.status_reason ?? null),
      });

      return {
        success: true,
        orderId: order.id,
        invoiceId: invoice.id,
        invoiceUrl: invoice.invoice_url,
        payAddress: invoice.pay_address,
        payAmount: invoice.pay_amount,
        payCurrency: invoice.pay_currency,
        status: invoice.payment_status,
      };
    } catch (error) {
      Logger.error('Failed to create NOWPayments order invoice', error);
      return { success: false, error: 'invoice_failed' };
    }
  }

  async getNowPaymentsOrderMinimum(params: {
    orderId: string;
    payCurrency: string;
  }): Promise<
    | {
        success: true;
        orderId: string;
        payCurrency: string;
        priceCurrency: string;
        orderTotalAmount: number;
        minPriceAmount: number;
        meetsMinimum: boolean;
        shortfallAmount: number;
        minFiatEquivalent?: number | null;
      }
    | { success: false; error: string }
  > {
    try {
      const order = await orderService.getOrderWithItems(params.orderId);
      if (!order) {
        return { success: false, error: 'order_not_found' };
      }

      if (!['cart', 'pending_payment'].includes(order.status)) {
        return { success: false, error: 'order_not_pending' };
      }

      const orderCurrency =
        normalizeCurrencyCode(order.currency) ||
        (order.currency ? order.currency.toUpperCase() : null);
      if (!orderCurrency) {
        return { success: false, error: 'invalid_currency' };
      }

      const totalCents = order.total_cents ?? null;
      if (!totalCents || totalCents <= 0) {
        return { success: false, error: 'amount_invalid' };
      }

      const payCurrency = params.payCurrency.trim().toLowerCase();
      if (!payCurrency) {
        return { success: false, error: 'currency_unsupported' };
      }

      const supported =
        await nowpaymentsClient.isCurrencySupported(payCurrency);
      if (!supported) {
        return { success: false, error: 'currency_unsupported' };
      }

      const orderTotalAmount = totalCents / 100;
      const minAmountResponse = await nowpaymentsClient.getMinAmount({
        // NOWPayments minimums are network/coin specific. Query using the
        // selected pay currency pair, then compare in order currency.
        currency_from: payCurrency,
        currency_to: payCurrency,
        fiat_equivalent: orderCurrency.toLowerCase(),
      });

      const minPayAmount = Number(minAmountResponse.min_amount);
      if (!Number.isFinite(minPayAmount) || minPayAmount <= 0) {
        return { success: false, error: 'minimum_amount_unavailable' };
      }

      const parsedFiatEquivalent = Number(minAmountResponse.fiat_equivalent);
      let minPriceAmount: number | null =
        Number.isFinite(parsedFiatEquivalent) && parsedFiatEquivalent > 0
          ? parsedFiatEquivalent
          : null;

      // Fallback for providers that omit fiat_equivalent for some pairs.
      if (minPriceAmount === null) {
        const minEstimate = await nowpaymentsClient.getEstimate({
          amount: minPayAmount,
          currency_from: payCurrency,
          currency_to: orderCurrency.toLowerCase(),
        });
        const estimated = Number(minEstimate.estimated_amount);
        if (!Number.isFinite(estimated) || estimated <= 0) {
          return { success: false, error: 'minimum_amount_unavailable' };
        }
        minPriceAmount = estimated;
      }

      const minFiatEquivalent =
        Number.isFinite(parsedFiatEquivalent) && parsedFiatEquivalent > 0
          ? parsedFiatEquivalent
          : null;
      const shortfallAmount = Math.max(0, minPriceAmount - orderTotalAmount);
      const meetsMinimum = shortfallAmount <= 0;

      return {
        success: true,
        orderId: order.id,
        payCurrency,
        priceCurrency: orderCurrency,
        orderTotalAmount,
        minPriceAmount,
        meetsMinimum,
        shortfallAmount,
        minFiatEquivalent,
      };
    } catch (error) {
      Logger.error('Failed to resolve NOWPayments minimum for order', {
        orderId: params.orderId,
        payCurrency: params.payCurrency,
        error,
      });
      return { success: false, error: 'minimum_amount_unavailable' };
    }
  }

  async completeCheckoutOrderWithCredits(params: {
    orderId: string;
    userId: string;
  }): Promise<
    | {
        success: true;
        orderId: string;
        transactionId: string | null;
        amountDebited: number;
        balanceAfter: number | null;
        fulfilledSubscriptions: number;
      }
    | {
        success: false;
        error: string;
        detail?: string;
        itemLabel?: string;
      }
  > {
    const lockClient = await getDatabasePool().connect();
    let lockAcquired = false;

    try {
      await lockClient.query('SELECT pg_advisory_lock(hashtext($1))', [
        params.orderId,
      ]);
      lockAcquired = true;

      const order = await orderService.getOrderWithItems(params.orderId);
      if (!order) {
        return { success: false, error: 'order_not_found' };
      }

      if (order.user_id !== params.userId) {
        return { success: false, error: 'order_forbidden' };
      }

      if (!['cart', 'pending_payment'].includes(order.status)) {
        return { success: false, error: 'order_not_pending' };
      }

      if (order.payment_provider && order.payment_provider !== 'credits') {
        return { success: false, error: 'payment_provider_mismatch' };
      }

      const orderCurrency =
        normalizeCurrencyCode(order.currency) ||
        (order.currency ? order.currency.toUpperCase() : null);
      if (orderCurrency !== 'USD') {
        return { success: false, error: 'invalid_currency' };
      }

      if (!order.items || order.items.length === 0) {
        return { success: false, error: 'order_missing_items' };
      }

      const ownAccountValidation =
        await this.validateOwnAccountSelectionData(order);
      if (!ownAccountValidation.valid) {
        return {
          success: false,
          error: 'own_account_credentials_required',
          itemLabel: ownAccountValidation.missingItemLabel,
        };
      }

      for (const item of order.items) {
        if (!item.product_variant_id) {
          return { success: false, error: 'order_item_missing_variant' };
        }
        const validation = await subscriptionService.canPurchaseSubscription(
          params.userId,
          item.product_variant_id
        );
        if (!validation.canPurchase) {
          return {
            success: false,
            error: 'purchase_not_allowed',
            detail: validation.reason || 'Purchase not allowed',
            itemLabel: this.resolveOrderItemDisplayName(item),
          };
        }
      }

      const totalCents = order.total_cents ?? null;
      if (!totalCents || totalCents <= 0) {
        return { success: false, error: 'amount_invalid' };
      }

      const amountDebited = totalCents / 100;
      const spendResult = await creditService.spendCredits(
        params.userId,
        amountDebited,
        `Checkout order ${order.id} (${order.items.length} item${
          order.items.length === 1 ? '' : 's'
        })`,
        {
          checkout_source: 'checkout',
          order_id: order.id,
          item_count: order.items.length,
        },
        {
          orderId: order.id,
          priceCents: totalCents,
          currency: orderCurrency,
          autoRenew: order.auto_renew === true,
          renewalMethod: 'credits',
          statusReason: 'paid_with_credits',
        }
      );
      const debitTransactionId = spendResult.transaction?.id ?? null;

      if (!spendResult.success) {
        if (
          spendResult.error &&
          spendResult.error.toLowerCase().includes('insufficient')
        ) {
          return {
            success: false,
            error: 'insufficient_credits',
            detail: spendResult.error,
          };
        }
        return {
          success: false,
          error: 'credit_payment_failed',
          detail: spendResult.error || 'Unable to debit credits',
        };
      }

      const paymentUpdate = await orderService.updateOrderPayment(order.id, {
        payment_provider: 'credits',
        payment_reference: debitTransactionId,
        paid_with_credits: true,
        auto_renew: order.auto_renew === true,
        status: 'in_process',
        status_reason: 'paid_with_credits',
      });

      if (!paymentUpdate.success) {
        const refundResult = await creditService.refundCredits(
          params.userId,
          amountDebited,
          'Credits checkout failed to update order - automatic refund',
          debitTransactionId ?? undefined,
          {
            order_id: order.id,
            reason: 'order_update_failed',
          },
          {
            orderId: order.id,
            priceCents: totalCents,
            currency: orderCurrency,
            autoRenew: order.auto_renew === true,
            renewalMethod: 'credits',
            statusReason: 'order_update_failed_refund',
          }
        );
        if (!refundResult.success) {
          Logger.error('Failed to refund credits after order update failure', {
            orderId: order.id,
            userId: params.userId,
            transactionId: debitTransactionId,
            error: refundResult.error,
          });
        }
        Logger.error('Failed to update order after credits checkout', {
          orderId: order.id,
          userId: params.userId,
          transactionId: debitTransactionId,
          error: paymentUpdate.error,
        });
        return { success: false, error: 'order_update_failed' };
      }

      const createdSubscriptions = await this.createSubscriptionsForOrder({
        order,
        orderItems: order.items,
        renewalMethod: 'credits',
      });

      await couponService.finalizeRedemptionForOrder(order.id);

      try {
        const confirmationResult =
          await orderService.sendOrderPaymentConfirmationEmail(order.id);
        if (
          !confirmationResult.success &&
          !['already_sent', 'renewal_order'].includes(
            confirmationResult.reason ?? ''
          )
        ) {
          Logger.warn('Failed to send order payment confirmation email', {
            orderId: order.id,
            reason: confirmationResult.reason,
          });
        }
      } catch (error) {
        Logger.warn('Order payment confirmation email call failed', {
          orderId: order.id,
          error,
        });
      }

      return {
        success: true,
        orderId: order.id,
        transactionId: debitTransactionId,
        amountDebited,
        balanceAfter: spendResult.balance?.availableBalance ?? null,
        fulfilledSubscriptions: createdSubscriptions.length,
      };
    } catch (error) {
      Logger.error('Failed to complete checkout order with credits', {
        orderId: params.orderId,
        userId: params.userId,
        error,
      });
      return { success: false, error: 'credits_checkout_failed' };
    } finally {
      if (lockAcquired) {
        await lockClient.query('SELECT pg_advisory_unlock(hashtext($1))', [
          params.orderId,
        ]);
      }
      lockClient.release();
    }
  }

  async confirmStripeCheckoutSession(params: {
    orderId: string;
    sessionId: string;
  }): Promise<
    | {
        success: true;
        orderId: string;
        sessionId: string;
        orderStatus: string | null;
        fulfilled: boolean;
      }
    | { success: false; error: string }
  > {
    try {
      const session = await stripeProvider.retrieveCheckoutSession(
        params.sessionId,
        { expand: ['payment_intent'] }
      );

      const sessionOrderId =
        session.metadata?.['order_id'] || session.client_reference_id || null;
      if (!sessionOrderId || sessionOrderId !== params.orderId) {
        return { success: false, error: 'checkout_session_mismatch' };
      }

      const sessionPaid =
        session.payment_status === 'paid' || session.status === 'complete';
      if (!sessionPaid) {
        return { success: false, error: 'payment_not_completed' };
      }

      const processed = await this.processStripeCheckoutSession({
        session,
        eventType: 'checkout.session.completed',
      });
      if (!processed) {
        return { success: false, error: 'fulfillment_failed' };
      }

      const updatedOrder = await orderService.getOrderById(params.orderId);

      return {
        success: true,
        orderId: params.orderId,
        sessionId: params.sessionId,
        orderStatus: updatedOrder?.status ?? null,
        fulfilled:
          updatedOrder !== null &&
          ['in_process', 'delivered', 'paid'].includes(updatedOrder.status),
      };
    } catch (error) {
      Logger.error('Failed to confirm Stripe checkout session', {
        orderId: params.orderId,
        sessionId: params.sessionId,
        error,
      });
      return { success: false, error: 'stripe_session_confirm_failed' };
    }
  }

  async createStripePayment(
    userId: string,
    amount: number,
    currency: string,
    description: string,
    purpose: 'subscription' | 'credit_topup' | 'one_time',
    metadata?: Record<string, any>,
    orderContext?: StripeOrderContext
  ): Promise<
    | {
        success: true;
        clientSecret: string;
        paymentId: string;
        paymentRecordId: string;
        amount: number;
        currency: string;
      }
    | { success: false; error: string }
  > {
    try {
      if (amount <= 0 || Number.isNaN(amount)) {
        return { success: false, error: 'Invalid amount' };
      }

      const resolvedCurrency =
        normalizeCurrencyCode(orderContext?.currency) ||
        normalizeCurrencyCode(currency) ||
        'USD';

      const supportsCurrency =
        await stripeProvider.supportsCurrency(resolvedCurrency);
      if (!supportsCurrency) {
        return {
          success: false,
          error: `Currency ${resolvedCurrency} is not supported by Stripe`,
        };
      }

      const paymentMetadata: Record<string, any> = {
        ...(metadata || {}),
      };
      const wantsAutoRenew =
        paymentMetadata['auto_renew'] === true ||
        paymentMetadata['auto_renew'] === 'true' ||
        paymentMetadata['auto_renew'] === 1 ||
        paymentMetadata['auto_renew'] === '1';

      let stripeCustomerId: string | undefined;
      if (wantsAutoRenew) {
        const customer = await this.ensureStripeCustomer(userId);
        stripeCustomerId = customer.customerId;
      }

      if (orderContext?.productVariantId) {
        paymentMetadata['product_variant_id'] = orderContext.productVariantId;
      }
      if (orderContext?.productSlug) {
        paymentMetadata['product_slug'] = orderContext.productSlug;
      }

      if (
        orderContext?.priceCents !== undefined &&
        orderContext.priceCents !== null
      ) {
        paymentMetadata['price_cents'] = orderContext.priceCents;
      }

      if (
        orderContext?.basePriceCents !== undefined &&
        orderContext.basePriceCents !== null
      ) {
        paymentMetadata['base_price_cents'] = orderContext.basePriceCents;
      }

      if (
        orderContext?.discountPercent !== undefined &&
        orderContext.discountPercent !== null
      ) {
        paymentMetadata['discount_percent'] = orderContext.discountPercent;
      }

      if (
        orderContext?.termMonths !== undefined &&
        orderContext.termMonths !== null
      ) {
        paymentMetadata['term_months'] = orderContext.termMonths;
      }

      paymentMetadata['currency'] = resolvedCurrency;

      const providerPayment = await stripeProvider.createPayment({
        userId,
        amount,
        priceCurrency: resolvedCurrency,
        payCurrency: resolvedCurrency,
        description,
        ...(orderContext?.orderId ? { orderId: orderContext.orderId } : {}),
        ...(stripeCustomerId ? { customerId: stripeCustomerId } : {}),
        metadata: paymentMetadata,
      });

      if (!providerPayment.clientSecret) {
        return {
          success: false,
          error: 'Stripe did not return a client secret',
        };
      }

      const unifiedPaymentMetadata: Record<string, any> = {
        ...(metadata || {}),
        description,
      };

      if (orderContext?.orderId) {
        unifiedPaymentMetadata['order_id'] = orderContext.orderId;
      }
      if (orderContext?.productSlug) {
        unifiedPaymentMetadata['product_slug'] = orderContext.productSlug;
      }

      const unifiedPaymentInput: CreateUnifiedPaymentInput = {
        userId,
        provider: 'stripe' as const,
        providerPaymentId: providerPayment.providerPaymentId,
        status: providerPayment.normalizedStatus,
        providerStatus: providerPayment.providerStatus,
        purpose,
        amount,
        currency: resolvedCurrency.toLowerCase(),
        ...(resolvedCurrency === 'USD' ? { amountUsd: amount } : {}),
        paymentMethodType: 'card',
        metadata: unifiedPaymentMetadata,
      };

      if (orderContext?.orderId) {
        unifiedPaymentInput.orderId = orderContext.orderId;
      }

      if (
        orderContext?.productVariantId !== undefined &&
        orderContext.productVariantId !== null
      ) {
        unifiedPaymentInput.productVariantId = orderContext.productVariantId;
      }

      if (
        orderContext?.priceCents !== undefined &&
        orderContext.priceCents !== null
      ) {
        unifiedPaymentInput.priceCents = orderContext.priceCents;
      }

      if (
        orderContext?.basePriceCents !== undefined &&
        orderContext.basePriceCents !== null
      ) {
        unifiedPaymentInput.basePriceCents = orderContext.basePriceCents;
      }

      if (
        orderContext?.discountPercent !== undefined &&
        orderContext.discountPercent !== null
      ) {
        unifiedPaymentInput.discountPercent = orderContext.discountPercent;
      }

      if (
        orderContext?.termMonths !== undefined &&
        orderContext.termMonths !== null
      ) {
        unifiedPaymentInput.termMonths = orderContext.termMonths;
      }

      if (orderContext?.autoRenew !== undefined) {
        unifiedPaymentInput.autoRenew = orderContext.autoRenew;
      }

      if (
        orderContext?.nextBillingAt !== undefined &&
        orderContext.nextBillingAt !== null
      ) {
        unifiedPaymentInput.nextBillingAt = orderContext.nextBillingAt;
      }

      if (orderContext?.renewalMethod) {
        unifiedPaymentInput.renewalMethod = orderContext.renewalMethod;
      }

      if (orderContext?.statusReason) {
        unifiedPaymentInput.statusReason = orderContext.statusReason;
      }

      const paymentRecord = await paymentRepository.create(unifiedPaymentInput);

      return {
        success: true,
        clientSecret: providerPayment.clientSecret,
        paymentId: providerPayment.providerPaymentId,
        paymentRecordId: paymentRecord.id,
        amount,
        currency: resolvedCurrency,
      };
    } catch (error) {
      Logger.error('Error creating Stripe payment:', error);
      return { success: false, error: 'Failed to create Stripe payment' };
    }
  }

  // Create a new payment invoice
  async createPayment(
    userId: string,
    request: CreatePaymentRequest
  ): Promise<PaymentOperationResult> {
    let client: PoolClient | null = null;
    let transactionOpen = false;
    let payCurrency = '';

    try {
      // Validate credit amount
      if (!Number.isInteger(request.creditAmount)) {
        return {
          success: false,
          error: 'Credit amount must be a whole number',
        };
      }
      if (
        request.creditAmount < this.MIN_CREDIT_AMOUNT_USD ||
        request.creditAmount > 10000
      ) {
        return {
          success: false,
          error: `Credit amount must be between ${this.MIN_CREDIT_AMOUNT_USD} and 10,000`,
        };
      }

      const baseCurrency = (request.price_currency || 'usd')
        .trim()
        .toLowerCase();
      if (baseCurrency !== 'usd') {
        return {
          success: false,
          error: 'Credit top-ups require base currency to be USD',
        };
      }

      const rawPayCurrency = request.pay_currency || request.currency;
      if (!rawPayCurrency) {
        return {
          success: false,
          error: 'pay_currency is required',
        };
      }
      if (request.currency && !request.pay_currency) {
        Logger.warn(
          'Deprecated currency field used for create-payment request',
          {
            userId,
            currency: request.currency,
          }
        );
      }
      payCurrency = rawPayCurrency.trim().toLowerCase();

      // Check if currency is supported
      let isSupported = false;
      let payCurrencyInfo: CurrencyInfo | null = null;
      try {
        const supportedCurrencies = await this.getSupportedCurrencies();
        payCurrencyInfo =
          supportedCurrencies.find(
            currencyInfo => currencyInfo.ticker === payCurrency
          ) || null;
        isSupported = Boolean(payCurrencyInfo);
      } catch (error) {
        Logger.error('NOWPayments currency validation failed:', error);
        return {
          success: false,
          error:
            'Payment provider is unavailable. Please try again in a few minutes.',
          errorCode: 'PAYMENT_PROVIDER_UNAVAILABLE',
        };
      }
      if (!isSupported) {
        return {
          success: false,
          error: `Currency ${payCurrency.toUpperCase()} is not supported`,
        };
      }

      let minAmount: number | null = null;
      let minFiatEquivalent: number | null = null;
      let effectiveMinUsd = this.MIN_CREDIT_AMOUNT_USD;
      try {
        const minAmountResponse = await nowpaymentsClient.getMinAmount({
          currency_from: payCurrency,
          currency_to: payCurrency,
          fiat_equivalent: 'usd',
        });
        minAmount = Number(minAmountResponse.min_amount);
        const fiatEquivalent = Number(minAmountResponse.fiat_equivalent);
        if (Number.isFinite(fiatEquivalent)) {
          minFiatEquivalent = fiatEquivalent;
          effectiveMinUsd = Math.max(
            this.MIN_CREDIT_AMOUNT_USD,
            Math.ceil(fiatEquivalent)
          );
        }
      } catch (error) {
        if (this.isUnsupportedPairError(error)) {
          return {
            success: false,
            error: `Currency ${payCurrency.toUpperCase()} is not supported for USD top-ups`,
            errorCode: 'PAYMENT_UNSUPPORTED_PAIR',
          };
        }
        if (this.isProviderUnavailable(error)) {
          return {
            success: false,
            error:
              'Payment provider is unavailable. Please try again in a few minutes.',
            errorCode: 'PAYMENT_PROVIDER_UNAVAILABLE',
          };
        }
        const meta = this.getNowPaymentsErrorMeta(error);
        return {
          success: false,
          error: meta.message || 'Unable to validate minimum payment amount',
        };
      }

      if (request.creditAmount < effectiveMinUsd) {
        return {
          success: false,
          error: `Minimum amount for ${payCurrency.toUpperCase()} is $${effectiveMinUsd}`,
          errorCode: 'PAYMENT_MIN_AMOUNT',
        };
      }

      // Generate unique payment ID and order ID
      const paymentId = uuidv4();
      const orderId = `credit-${paymentId}`;

      // Get estimate for cryptocurrency amount
      const stableBaseRaw =
        payCurrencyInfo?.baseTicker || payCurrencyInfo?.ticker || payCurrency;
      const stableBase =
        stableBaseRaw === 'usdce' || stableBaseRaw === 'usdc.e'
          ? 'usdc'
          : stableBaseRaw;
      const useStableUsdPeg = ['usdt', 'usdc'].includes(stableBase);

      let estimatedAmount = 0;
      if (useStableUsdPeg) {
        estimatedAmount = request.creditAmount;
      } else {
        try {
          const estimate = await nowpaymentsClient.getEstimate({
            amount: request.creditAmount,
            currency_from: baseCurrency,
            currency_to: payCurrency,
          });
          estimatedAmount = Number(estimate.estimated_amount);

          if (!Number.isFinite(estimatedAmount) || estimatedAmount <= 0) {
            return {
              success: false,
              error: 'Unable to calculate payment amount',
            };
          }
        } catch (error) {
          Logger.error('Error getting payment estimate:', error);
          if (this.isMinAmountError(error)) {
            const minAmountMessage =
              minFiatEquivalent && Number.isFinite(minFiatEquivalent)
                ? `Minimum amount for ${payCurrency.toUpperCase()} is $${effectiveMinUsd}`
                : 'Payment amount is below the minimum required';
            return {
              success: false,
              error: minAmountMessage,
              errorCode: 'PAYMENT_MIN_AMOUNT',
            };
          }
          if (this.isUnsupportedPairError(error)) {
            return {
              success: false,
              error: `Currency ${payCurrency.toUpperCase()} is not supported for USD top-ups`,
              errorCode: 'PAYMENT_UNSUPPORTED_PAIR',
            };
          }
          const providerUnavailable = this.isProviderUnavailable(error);
          return {
            success: false,
            error: providerUnavailable
              ? 'Payment provider is unavailable. Please try again in a few minutes.'
              : 'Unable to calculate payment amount',
            ...(providerUnavailable && {
              errorCode: 'PAYMENT_PROVIDER_UNAVAILABLE',
            }),
          };
        }
      }

      if (
        Number.isFinite(minAmount) &&
        minAmount !== null &&
        estimatedAmount < minAmount
      ) {
        return {
          success: false,
          error: `Minimum amount for ${payCurrency.toUpperCase()} is $${effectiveMinUsd}`,
          errorCode: 'PAYMENT_MIN_AMOUNT',
        };
      }

      // Create provider payment (NOWPayments)
      const providerPayment = await nowPaymentsProvider.createPayment({
        userId,
        amount: estimatedAmount,
        priceCurrency: payCurrency,
        payCurrency,
        orderId,
        description:
          request.orderDescription ||
          `Credit purchase: $${request.creditAmount}`,
      });

      // Validate payment response has all critical data
      if (!providerPayment.providerPaymentId) {
        Logger.error(
          'NOWPayments payment missing payment_id:',
          providerPayment.raw
        );
        return {
          success: false,
          error: 'Invalid payment response: missing payment ID',
        };
      }

      if (!providerPayment.payAddress) {
        Logger.error(
          'NOWPayments payment missing pay_address:',
          providerPayment.raw
        );
        return {
          success: false,
          error: 'Invalid payment response: missing payment address',
        };
      }

      if (!providerPayment.payAmount || providerPayment.payAmount <= 0) {
        Logger.error('NOWPayments payment missing/invalid pay_amount:', {
          providerPayment,
        });
        return {
          success: false,
          error: 'Invalid payment response: missing payment amount',
        };
      }

      const priceAmount = request.creditAmount;
      const providerPriceCurrency = baseCurrency;
      const amountUsd = priceAmount;

      // Calculate expiry time (30 minutes from now)
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

      const pool = getDatabasePool();
      client = await pool.connect();
      await client.query('BEGIN');
      transactionOpen = true;

      // Store payment in credit_transactions table with payment fields
      const paymentRecord: Partial<Payment> = {
        id: paymentId,
        userId,
        paymentId: providerPayment.providerPaymentId,
        provider: 'nowpayments',
        status: providerPayment.providerStatus as PaymentStatus,
        currency: providerPayment.payCurrency,
        amount: providerPayment.payAmount,
        creditAmount: request.creditAmount,
        payAddress: providerPayment.payAddress,
        ...(request.orderDescription && {
          orderDescription: request.orderDescription,
        }),
        metadata: {
          orderId,
          creditAmountUsd: priceAmount,
          priceAmount,
          priceCurrency: providerPriceCurrency,
          payAddress: providerPayment.payAddress,
          payCurrency: providerPayment.payCurrency,
          payAmount: providerPayment.payAmount,
          estimatedPayAmount: estimatedAmount,
          minAmountCrypto: Number.isFinite(minAmount) ? minAmount : null,
          minAmountUsd: effectiveMinUsd,
          expiresAt: expiresAt.toISOString(),
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt,
      };

      // Insert into credit_transactions table with payment fields
      // Use 0 amount initially - will be set to positive when payment is confirmed
      await client.query(
        `INSERT INTO credit_transactions
         (id, user_id, type, amount, balance_before, balance_after, description, metadata,
          created_at, updated_at, payment_id, payment_provider, payment_status,
          payment_currency, payment_amount)
         VALUES ($1, $2, 'deposit', 0, 0, 0, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          paymentRecord.id,
          paymentRecord.userId,
          paymentRecord.orderDescription ||
            `Pending crypto payment - ${providerPayment.payCurrency.toUpperCase()}`,
          JSON.stringify(paymentRecord.metadata || {}),
          paymentRecord.createdAt,
          paymentRecord.updatedAt,
          paymentRecord.paymentId,
          paymentRecord.provider,
          paymentRecord.status,
          paymentRecord.currency,
          paymentRecord.amount,
        ]
      );

      // Persist unified payment record for provider-agnostic tracking
      await paymentRepository.create(
        {
          userId,
          provider: 'nowpayments',
          providerPaymentId: providerPayment.providerPaymentId,
          status: providerPayment.normalizedStatus,
          providerStatus: providerPayment.providerStatus,
          purpose: 'credit_topup',
          amount: priceAmount,
          currency: providerPriceCurrency,
          ...(amountUsd !== undefined ? { amountUsd } : {}),
          paymentMethodType: 'crypto',
          creditTransactionId: paymentRecord.id!,
          expiresAt,
          metadata: {
            creditAmountUsd: priceAmount,
            payCurrency: providerPayment.payCurrency,
            payAmount: providerPayment.payAmount,
            payAddress: providerPayment.payAddress,
            orderDescription: request.orderDescription,
          },
        },
        client
      );

      await client.query('COMMIT');
      transactionOpen = false;

      // Cache payment data
      await this.cachePayment(paymentRecord as Payment);

      if (paymentRecord.paymentId) {
        void paymentMonitoringService
          .addPendingPayment(paymentRecord.paymentId, userId)
          .catch(error => {
            Logger.warn('Failed to enqueue payment for monitoring', error);
          });
      }

      Logger.info(`Created payment for user ${userId}`, {
        paymentId: paymentRecord.id,
        nowPaymentsId: paymentRecord.paymentId,
        creditAmount: paymentRecord.creditAmount,
        currency: paymentRecord.currency,
        amount: paymentRecord.amount,
      });

      return {
        success: true,
        payment: paymentRecord as Payment,
      };
    } catch (error) {
      if (transactionOpen && client) {
        await client.query('ROLLBACK');
        transactionOpen = false;
      }
      Logger.error('Error creating payment:', error);
      if (this.isMinAmountError(error)) {
        return {
          success: false,
          error: 'Payment amount is below the minimum required',
          errorCode: 'PAYMENT_MIN_AMOUNT',
        };
      }
      if (this.isUnsupportedPairError(error)) {
        return {
          success: false,
          error: `Currency ${payCurrency.toUpperCase()} is not supported for USD top-ups`,
          errorCode: 'PAYMENT_UNSUPPORTED_PAIR',
        };
      }
      const providerUnavailable = this.isProviderUnavailable(error);
      return {
        success: false,
        error: providerUnavailable
          ? 'Payment provider is unavailable. Please try again in a few minutes.'
          : 'Failed to create payment',
        ...(providerUnavailable && {
          errorCode: 'PAYMENT_PROVIDER_UNAVAILABLE',
        }),
      };
    } finally {
      if (client) {
        if (transactionOpen) {
          try {
            await client.query('ROLLBACK');
          } catch (rollbackError) {
            Logger.error(
              'Failed to rollback payment creation transaction',
              rollbackError
            );
          }
        }
        client.release();
      }
    }
  }

  // Get payment status
  async getPaymentStatus(
    paymentId: string,
    userId?: string
  ): Promise<PaymentStatusResponse | null> {
    try {
      const cacheKey = `${this.CACHE_PREFIX}status:${paymentId}`;

      // Try cache first
      const cached = await redisClient.getClient().get(cacheKey);
      if (cached) {
        Logger.debug(`Payment status cache hit: ${paymentId}`);
        return JSON.parse(cached);
      }

      const pool = getDatabasePool();

      // Query with detailed logging
      Logger.info(`Fetching payment status`, {
        paymentId,
        userId,
        query: userId
          ? 'SELECT FROM credit_transactions WHERE payment_id = $1 AND user_id = $2'
          : 'SELECT FROM credit_transactions WHERE payment_id = $1',
      });

      const query = userId
        ? `SELECT id, payment_id, user_id, payment_status, payment_currency,
                payment_amount, blockchain_hash, amount, type, description,
                created_at, updated_at, metadata
           FROM credit_transactions
           WHERE payment_id = $1 AND user_id = $2
           ORDER BY created_at DESC
           LIMIT 1`
        : `SELECT id, payment_id, user_id, payment_status, payment_currency,
                payment_amount, blockchain_hash, amount, type, description,
                created_at, updated_at, metadata
           FROM credit_transactions
           WHERE payment_id = $1
           ORDER BY created_at DESC
           LIMIT 1`;

      const params = userId ? [paymentId, userId] : [paymentId];
      const result = await pool.query(query, params);

      if (result.rows.length === 0) {
        Logger.warn(`Payment not found in database`, { paymentId, userId });

        let unifiedPayment: UnifiedPayment | null = null;
        try {
          unifiedPayment = await paymentRepository.findByProviderPaymentIdAny(
            paymentId,
            userId
          );
        } catch (lookupError) {
          Logger.error(
            'Failed to fetch payment from unified payments table:',
            lookupError
          );
        }

        if (unifiedPayment) {
          const metadata: Record<string, any> = unifiedPayment.metadata || {};
          const status =
            unifiedPayment.provider === 'nowpayments' &&
            typeof unifiedPayment.providerStatus === 'string'
              ? (unifiedPayment.providerStatus as PaymentStatus)
              : this.mapUnifiedPaymentStatusToPaymentStatus(
                  unifiedPayment.status
                );
          const fallbackAmount =
            unifiedPayment.amountUsd !== undefined
              ? unifiedPayment.amountUsd
              : unifiedPayment.amount;
          const fallbackCurrency =
            unifiedPayment.amountUsd !== undefined
              ? 'usd'
              : unifiedPayment.currency;
          const resolvedCreditAmount = this.resolveCreditAmountUsd(
            metadata,
            fallbackAmount,
            fallbackCurrency
          );
          const creditAmount =
            resolvedCreditAmount !== null
              ? resolvedCreditAmount
              : fallbackAmount;
          const metadataPayAmount = Number(
            metadata['payAmount'] ?? metadata['pay_amount']
          );
          const payAmount =
            Number.isFinite(metadataPayAmount) && metadataPayAmount > 0
              ? metadataPayAmount
              : unifiedPayment.amount;
          const payCurrency =
            typeof metadata['payCurrency'] === 'string'
              ? metadata['payCurrency']
              : typeof metadata['pay_currency'] === 'string'
                ? metadata['pay_currency']
                : unifiedPayment.currency;

          const response: PaymentStatusResponse = {
            paymentId: unifiedPayment.providerPaymentId,
            status,
            creditAmount,
            payAmount,
            payCurrency,
            createdAt: new Date(unifiedPayment.createdAt),
            updatedAt: new Date(unifiedPayment.updatedAt),
          };

          if (metadata['actuallyPaid'] !== undefined) {
            response.actuallyPaid = Number(metadata['actuallyPaid']);
          }

          if (metadata['blockchainHash']) {
            response.blockchainHash = metadata['blockchainHash'];
          } else if (metadata['payin_hash']) {
            response.blockchainHash = metadata['payin_hash'];
          }

          if (unifiedPayment.expiresAt) {
            response.expiresAt = new Date(unifiedPayment.expiresAt);
          }

          await redisClient
            .getClient()
            .setex(cacheKey, this.STATUS_CACHE_TTL, JSON.stringify(response));

          return response;
        }

        if (userId) {
          return null;
        }

        // Fallback: Try querying NOWPayments API directly
        try {
          Logger.info(`Attempting to fetch from NOWPayments API: ${paymentId}`);
          const nowPaymentStatus =
            await nowpaymentsClient.getPaymentStatus(paymentId);

          Logger.info(`Retrieved from NOWPayments API`, {
            paymentId,
            status: nowPaymentStatus.payment_status,
            actuallyPaid: nowPaymentStatus.actually_paid,
          });

          // If payment is finished in NOWPayments but not in our DB, trigger webhook processing manually
          if (nowPaymentStatus.payment_status === 'finished') {
            Logger.warn(
              `Payment finished in NOWPayments but not in our DB - triggering manual sync`
            );
            await this.syncPaymentFromNOWPayments(nowPaymentStatus);
          }

          const apiStatus: PaymentStatusResponse = {
            paymentId: nowPaymentStatus.payment_id,
            status: nowPaymentStatus.payment_status,
            creditAmount: nowPaymentStatus.price_amount,
            payAmount: nowPaymentStatus.pay_amount,
            payCurrency: nowPaymentStatus.pay_currency,
            createdAt: new Date(nowPaymentStatus.created_at),
            updatedAt: new Date(nowPaymentStatus.updated_at),
          };

          if (
            nowPaymentStatus.actually_paid !== undefined &&
            nowPaymentStatus.actually_paid !== null
          ) {
            apiStatus.actuallyPaid = nowPaymentStatus.actually_paid;
          }

          if (nowPaymentStatus.payin_hash) {
            apiStatus.blockchainHash = nowPaymentStatus.payin_hash;
          }

          return apiStatus;
        } catch (apiError) {
          Logger.error(`Failed to fetch from NOWPayments API:`, apiError);
          return null;
        }
      }

      const row = result.rows[0];

      Logger.info(`Payment found in database`, {
        paymentId: row.payment_id,
        status: row.payment_status,
        amount: row.amount,
        userId: row.user_id,
      });

      // Parse metadata safely
      const metadata = row.metadata
        ? typeof row.metadata === 'string'
          ? JSON.parse(row.metadata)
          : row.metadata
        : {};

      const response: PaymentStatusResponse = {
        paymentId: row.payment_id,
        status: row.payment_status,
        creditAmount:
          this.resolveCreditAmountUsd(
            metadata,
            Math.abs(parseFloat(row.amount || '0')),
            metadata['priceCurrency']
          ) || Math.abs(parseFloat(row.amount || '0')),
        payAmount: parseFloat(row.payment_amount || '0'),
        payCurrency: row.payment_currency || 'btc',
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      };

      if (metadata.actuallyPaid !== undefined) {
        response.actuallyPaid = metadata.actuallyPaid;
      }

      if (row.blockchain_hash) {
        response.blockchainHash = row.blockchain_hash;
      }

      if (metadata.expiresAt) {
        response.expiresAt = new Date(metadata.expiresAt);
      }

      // Cache the result
      await redisClient
        .getClient()
        .setex(cacheKey, this.STATUS_CACHE_TTL, JSON.stringify(response));

      return response;
    } catch (error) {
      Logger.error('Error getting payment status:', error);
      return null;
    }
  }

  // Add new method to manually sync payment from NOWPayments
  private async syncPaymentFromNOWPayments(
    nowPaymentStatus: any
  ): Promise<void> {
    const pool = getDatabasePool();
    const client = await pool.connect();
    let transactionOpen = false;

    try {
      await client.query('BEGIN');
      transactionOpen = true;

      // Find the payment record
      const result = await client.query(
        'SELECT * FROM credit_transactions WHERE payment_id = $1',
        [nowPaymentStatus.payment_id]
      );

      let payment = result.rows[0] || null;
      let resolvedPaymentId = nowPaymentStatus.payment_id;
      let matchedByOrderId = false;

      if (!payment && nowPaymentStatus.order_id) {
        const orderResult = await client.query(
          `SELECT *
           FROM credit_transactions
           WHERE payment_provider = 'nowpayments'
             AND (metadata->>'orderId' = $1 OR metadata->>'order_id' = $1)
           ORDER BY created_at DESC
           LIMIT 1`,
          [nowPaymentStatus.order_id]
        );

        if (orderResult.rows.length > 0) {
          payment = orderResult.rows[0];
          resolvedPaymentId = payment.payment_id;
          matchedByOrderId = true;
        }
      }

      if (!payment) {
        Logger.error(
          `Cannot sync - payment not found: ${nowPaymentStatus.payment_id}`,
          { orderId: nowPaymentStatus.order_id }
        );
        await client.query('ROLLBACK');
        transactionOpen = false;
        return;
      }

      const previousStatus = payment.payment_status;

      if (
        shouldIgnoreNowPaymentsStatusRegression(
          previousStatus,
          nowPaymentStatus.payment_status
        )
      ) {
        Logger.warn('Ignoring NOWPayments status regression in sync', {
          paymentId: resolvedPaymentId,
          webhookPaymentId: nowPaymentStatus.payment_id,
          previousStatus,
          newStatus: nowPaymentStatus.payment_status,
        });
        await client.query('COMMIT');
        transactionOpen = false;
        return;
      }
      const metadata = payment.metadata
        ? typeof payment.metadata === 'string'
          ? JSON.parse(payment.metadata)
          : payment.metadata
        : {};
      const existingRelatedPaymentIds = Array.isArray(
        metadata['relatedPaymentIds']
      )
        ? metadata['relatedPaymentIds']
        : [];
      const relatedPaymentIds = Array.from(
        new Set(
          [
            ...existingRelatedPaymentIds,
            payment.payment_id,
            nowPaymentStatus.payment_id,
          ].filter(Boolean)
        )
      );

      const updatedMetadata: Record<string, any> = {
        ...metadata,
        orderId:
          metadata.orderId || nowPaymentStatus.order_id || metadata.order_id,
        actuallyPaid: nowPaymentStatus.actually_paid,
        blockchainHash: nowPaymentStatus.payin_hash,
        syncedManually: true,
        lastSyncedAt: new Date().toISOString(),
        lastWebhookPaymentId: nowPaymentStatus.payment_id,
        ...(relatedPaymentIds.length > 0 ? { relatedPaymentIds } : undefined),
        ...(matchedByOrderId
          ? {
              redepositPaymentId: nowPaymentStatus.payment_id,
              redepositStatus: nowPaymentStatus.payment_status,
              redepositOrderId: nowPaymentStatus.order_id,
            }
          : undefined),
      };

      // Update payment record with latest status (no balance mutation here)
      await client.query(
        `UPDATE credit_transactions
         SET payment_status = $1,
             blockchain_hash = $2,
             updated_at = NOW(),
             metadata = $3
         WHERE payment_id = $4`,
        [
          nowPaymentStatus.payment_status,
          nowPaymentStatus.payin_hash,
          JSON.stringify(updatedMetadata),
          resolvedPaymentId,
        ]
      );

      await paymentRepository.updateStatusByProviderPaymentId(
        'nowpayments',
        resolvedPaymentId,
        this.mapNowPaymentsStatus(nowPaymentStatus.payment_status),
        nowPaymentStatus.payment_status,
        updatedMetadata,
        client
      );

      await client.query('COMMIT');
      transactionOpen = false;

      const paymentUserId = payment.user_id as string;
      if (
        nowPaymentStatus.payment_status === 'finished' &&
        previousStatus !== 'finished'
      ) {
        const usdAmount = this.resolveCreditAmountUsd(
          updatedMetadata,
          nowPaymentStatus.price_amount,
          nowPaymentStatus.price_currency
        );

        if (
          usdAmount === null ||
          !Number.isFinite(usdAmount) ||
          usdAmount <= 0
        ) {
          Logger.error('Invalid USD amount for NOWPayments sync allocation', {
            paymentId: resolvedPaymentId,
            userId: paymentUserId,
            usdAmount,
          });
          await paymentFailureService.handlePaymentFailure(
            resolvedPaymentId,
            nowPaymentStatus.payment_status,
            'Invalid payment amount for allocation',
            { sync: true }
          );
          return;
        }

        const allocationResult =
          await creditAllocationService.allocateCreditsForPayment(
            paymentUserId,
            resolvedPaymentId,
            usdAmount,
            nowPaymentStatus
          );

        if (allocationResult.success) {
          Logger.info(`Successfully synced payment from NOWPayments`, {
            paymentId: resolvedPaymentId,
            userId: paymentUserId,
            creditAmount: allocationResult.data.creditAmount,
            balanceAfter: allocationResult.data.balanceAfter,
          });
          await paymentFailureService.resolveFailure(
            resolvedPaymentId,
            'nowpayments_sync'
          );
        } else {
          Logger.error('Credit allocation failed during NOWPayments sync', {
            paymentId: resolvedPaymentId,
            userId: paymentUserId,
            error: allocationResult.error,
          });
          await paymentFailureService.handlePaymentFailure(
            resolvedPaymentId,
            nowPaymentStatus.payment_status,
            allocationResult.error || 'Credit allocation failed',
            { sync: true }
          );
        }
      } else {
        Logger.info(`Synced payment status from NOWPayments`, {
          paymentId: resolvedPaymentId,
          status: nowPaymentStatus.payment_status,
          previousStatus,
        });
      }
    } catch (error) {
      if (transactionOpen) {
        await client.query('ROLLBACK');
        transactionOpen = false;
      }
      Logger.error('Error syncing payment from NOWPayments:', error);
      throw error;
    } finally {
      if (transactionOpen) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          Logger.error(
            'Failed to rollback NOWPayments sync transaction',
            rollbackError
          );
        }
      }
      client.release();
    }
  }

  // Process webhook from NOWPayments
  async processWebhook(
    payload: WebhookPayload,
    rawBody?: Buffer | string
  ): Promise<boolean> {
    const rawBodyText =
      rawBody === undefined || rawBody === null
        ? null
        : typeof rawBody === 'string'
          ? rawBody
          : rawBody.toString('utf8');
    const eventId = rawBodyText
      ? `npw_${createHash('sha256').update(rawBodyText).digest('hex')}`
      : null;

    const invoicePayment = await paymentRepository.findByProviderPaymentId(
      'nowpayments',
      payload.payment_id
    );
    let orderInvoicePayment =
      invoicePayment && invoicePayment.purpose === 'subscription'
        ? invoicePayment
        : null;

    if (!orderInvoicePayment && payload.order_id) {
      const fallbackInvoice = await paymentRepository.findLatestByOrderId(
        'nowpayments',
        payload.order_id,
        'subscription'
      );
      if (fallbackInvoice) {
        orderInvoicePayment = fallbackInvoice;
      }
    }

    if (eventId) {
      const recorded = await this.recordPaymentEvent({
        provider: 'nowpayments',
        eventId,
        eventType: 'nowpayments_webhook',
        orderId: orderInvoicePayment?.orderId ?? payload.order_id ?? null,
        paymentId: orderInvoicePayment?.id ?? null,
      });
      if (!recorded) {
        Logger.info('Duplicate NOWPayments webhook ignored', {
          eventId,
          paymentId: payload.payment_id,
        });
        return true;
      }
    }

    if (orderInvoicePayment) {
      return await this.processNowPaymentsOrderInvoice(
        payload,
        orderInvoicePayment
      );
    }

    const pool = getDatabasePool();
    const client = await pool.connect();
    let transactionOpen = false;

    try {
      await client.query('BEGIN');
      transactionOpen = true;

      // Find payment by NOWPayments payment_id in credit_transactions
      const paymentResult = await client.query(
        'SELECT * FROM credit_transactions WHERE payment_id = $1',
        [payload.payment_id]
      );

      let payment = paymentResult.rows[0] || null;
      let resolvedPaymentId = payload.payment_id;
      let matchedByOrderId = false;

      if (!payment && payload.order_id) {
        const orderResult = await client.query(
          `SELECT *
           FROM credit_transactions
           WHERE payment_provider = 'nowpayments'
             AND (metadata->>'orderId' = $1 OR metadata->>'order_id' = $1)
           ORDER BY created_at DESC
           LIMIT 1`,
          [payload.order_id]
        );

        if (orderResult.rows.length > 0) {
          payment = orderResult.rows[0];
          resolvedPaymentId = payment.payment_id;
          matchedByOrderId = true;
        }
      }

      if (!payment) {
        Logger.error(`Payment not found for webhook: ${payload.payment_id}`, {
          orderId: payload.order_id,
        });
        await client.query('ROLLBACK');
        transactionOpen = false;
        return false;
      }

      const previousStatus = payment.payment_status;

      if (
        shouldIgnoreNowPaymentsStatusRegression(
          previousStatus,
          payload.payment_status
        )
      ) {
        Logger.warn('Ignoring NOWPayments status regression in webhook', {
          paymentId: resolvedPaymentId,
          webhookPaymentId: payload.payment_id,
          previousStatus,
          newStatus: payload.payment_status,
        });
        await client.query('COMMIT');
        transactionOpen = false;
        return true;
      }

      // FIX: Handle metadata that might already be an object
      const metadata = payment.metadata
        ? typeof payment.metadata === 'string'
          ? JSON.parse(payment.metadata)
          : payment.metadata
        : {};
      const existingRelatedPaymentIds = Array.isArray(
        metadata['relatedPaymentIds']
      )
        ? metadata['relatedPaymentIds']
        : [];
      const relatedPaymentIds = Array.from(
        new Set(
          [
            ...existingRelatedPaymentIds,
            payment.payment_id,
            payload.payment_id,
          ].filter(Boolean)
        )
      );

      const updatedMetadata: Record<string, any> = {
        ...metadata,
        orderId: metadata.orderId || payload.order_id || metadata.order_id,
        actuallyPaid: payload.actually_paid,
        blockchainHash: payload.payin_hash,
        lastWebhookAt: new Date().toISOString(),
        lastWebhookPaymentId: payload.payment_id,
        ...(relatedPaymentIds.length > 0 ? { relatedPaymentIds } : undefined),
        ...(matchedByOrderId
          ? {
              redepositPaymentId: payload.payment_id,
              redepositStatus: payload.payment_status,
              redepositOrderId: payload.order_id,
            }
          : undefined),
      };

      await client.query(
        `UPDATE credit_transactions
         SET payment_status = $1, blockchain_hash = $2, updated_at = NOW(), metadata = $3
         WHERE payment_id = $4`,
        [
          payload.payment_status,
          payload.payin_hash,
          JSON.stringify(updatedMetadata),
          resolvedPaymentId,
        ]
      );

      // Sync unified payment record status
      await paymentRepository.updateStatusByProviderPaymentId(
        'nowpayments',
        resolvedPaymentId,
        this.mapNowPaymentsStatus(payload.payment_status),
        payload.payment_status,
        updatedMetadata,
        client
      );

      await client.query('COMMIT');
      transactionOpen = false;

      // Clear cached data
      await this.clearPaymentCache(payment.id);
      if (
        payload.payment_status === 'finished' &&
        previousStatus !== 'finished'
      ) {
        const usdAmount = this.resolveCreditAmountUsd(
          updatedMetadata,
          payload.price_amount,
          payload.price_currency
        );

        if (
          usdAmount === null ||
          !Number.isFinite(usdAmount) ||
          usdAmount <= 0
        ) {
          Logger.error('Invalid USD amount for webhook allocation', {
            paymentId: resolvedPaymentId,
            userId: payment.user_id,
            usdAmount,
          });
          await paymentFailureService.handlePaymentFailure(
            resolvedPaymentId,
            payload.payment_status,
            'Invalid payment amount for allocation',
            { webhook: true }
          );
          return true;
        }

        const allocationResult =
          await creditAllocationService.allocateCreditsForPayment(
            payment.user_id,
            resolvedPaymentId,
            usdAmount,
            payload
          );

        if (allocationResult.success) {
          await paymentFailureService.resolveFailure(
            resolvedPaymentId,
            'nowpayments_webhook'
          );
        } else {
          Logger.error('Credit allocation failed for webhook payment', {
            paymentId: resolvedPaymentId,
            userId: payment.user_id,
            error: allocationResult.error,
          });
          await paymentFailureService.handlePaymentFailure(
            resolvedPaymentId,
            payload.payment_status,
            allocationResult.error || 'Credit allocation failed',
            { webhook: true }
          );
        }
      }

      Logger.info(`Processed webhook for payment ${payment.id}`, {
        paymentId: resolvedPaymentId,
        previousStatus,
        newStatus: payload.payment_status,
        actuallyPaid: payload.actually_paid,
        matchedByOrderId,
        webhookPaymentId: payload.payment_id,
      });

      return true;
    } catch (error) {
      if (transactionOpen) {
        await client.query('ROLLBACK');
        transactionOpen = false;
      }
      Logger.error('Error processing webhook:', error);
      return false;
    } finally {
      if (transactionOpen) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          Logger.error(
            'Failed to rollback payment webhook transaction',
            rollbackError
          );
        }
      }
      client.release();
    }
  }

  // Get payment history for user
  async getPaymentHistory(
    query: PaymentHistoryQuery
  ): Promise<PaymentHistoryItem[]> {
    try {
      const pool = getDatabasePool();
      let sql = `
        SELECT id, payment_id, payment_status, payment_provider, payment_currency,
               payment_amount, blockchain_hash, created_at, updated_at, amount, metadata
        FROM credit_transactions
        WHERE payment_id IS NOT NULL
      `;
      const params: any[] = [];
      let paramIndex = 1;

      // Add filters
      if (query.userId) {
        sql += ` AND user_id = $${paramIndex}`;
        params.push(query.userId);
        paramIndex++;
      }

      if (query.status) {
        sql += ` AND payment_status = $${paramIndex}`;
        params.push(query.status);
        paramIndex++;
      }

      if (query.provider) {
        sql += ` AND payment_provider = $${paramIndex}`;
        params.push(query.provider);
        paramIndex++;
      }

      if (query.startDate) {
        sql += ` AND created_at >= $${paramIndex}`;
        params.push(query.startDate);
        paramIndex++;
      }

      if (query.endDate) {
        sql += ` AND created_at <= $${paramIndex}`;
        params.push(query.endDate);
        paramIndex++;
      }

      // Add ordering and pagination
      sql += ` ORDER BY created_at DESC`;

      if (query.limit) {
        sql += ` LIMIT $${paramIndex}`;
        params.push(query.limit);
        paramIndex++;
      }

      if (query.offset) {
        sql += ` OFFSET $${paramIndex}`;
        params.push(query.offset);
        paramIndex++;
      }

      const result = await pool.query(sql, params);

      return result.rows.map(row => {
        // Safe metadata parsing with fallback for corrupted data
        const metadata = row.metadata
          ? typeof row.metadata === 'string'
            ? row.metadata === '[object Object]'
              ? {}
              : ((): any => {
                  try {
                    return JSON.parse(row.metadata);
                  } catch {
                    Logger.warn(
                      'Failed to parse metadata JSON in payment history, using empty object:',
                      row.metadata
                    );
                    return {};
                  }
                })()
            : row.metadata
          : {};
        return {
          id: row.id,
          paymentId: row.payment_id,
          status: row.payment_status,
          provider: row.payment_provider,
          currency: row.payment_currency,
          amount: parseFloat(row.payment_amount || '0'),
          creditAmount:
            this.resolveCreditAmountUsd(
              metadata,
              Math.abs(parseFloat(row.amount)),
              metadata['priceCurrency']
            ) || Math.abs(parseFloat(row.amount)),
          blockchainHash: row.blockchain_hash,
          createdAt: new Date(row.created_at),
          updatedAt: new Date(row.updated_at),
        };
      });
    } catch (error) {
      Logger.error('Error getting payment history:', error);
      return [];
    }
  }

  // Get supported currencies
  async getSupportedCurrencies(): Promise<CurrencyInfo[]> {
    const cacheKey = `${this.CACHE_PREFIX}currencies`;
    const lastKnownKey = `${this.CACHE_PREFIX}currencies:last_good`;
    const canCache = redisClient.isConnected();
    const client = canCache ? redisClient.getClient() : null;

    if (client) {
      const cached = await client.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as CurrencyInfo[];
        if (this.isCurrencyListSane(parsed)) {
          return parsed;
        }
        Logger.warn(
          'Cached NOWPayments currencies failed sanity check; refreshing',
          {
            count: parsed.length,
          }
        );
        await client.del(cacheKey);
      }
    }

    try {
      const currencyInfo = await this.fetchSupportedCurrencies();

      if (!this.isCurrencyListSane(currencyInfo)) {
        Logger.warn('Fetched NOWPayments currencies failed sanity check', {
          count: currencyInfo.length,
        });

        if (client) {
          const lastKnown = await client.get(lastKnownKey);
          if (lastKnown) {
            const parsed = JSON.parse(lastKnown) as CurrencyInfo[];
            if (this.isCurrencyListSane(parsed)) {
              Logger.warn(
                'Using last-known-good NOWPayments currencies after sanity failure'
              );
              return parsed;
            }
          }
        }

        throw new Error('NOWPayments returned an unexpected currency list');
      }

      if (client) {
        await client.setex(
          cacheKey,
          this.CURRENCY_CACHE_TTL,
          JSON.stringify(currencyInfo)
        );
        await client.setex(
          lastKnownKey,
          this.CURRENCY_LKG_TTL,
          JSON.stringify(currencyInfo)
        );
      } else {
        Logger.warn(
          'Redis not connected; skipping NOWPayments currency cache update'
        );
      }

      Logger.info(
        `Successfully processed ${currencyInfo.length} supported currencies`
      );
      return currencyInfo;
    } catch (error) {
      Logger.error('Error getting supported currencies:', error);

      if (client) {
        const lastKnown = await client.get(lastKnownKey);
        if (lastKnown) {
          const parsed = JSON.parse(lastKnown) as CurrencyInfo[];
          if (this.isCurrencyListSane(parsed)) {
            Logger.warn(
              'Returning last-known-good NOWPayments currencies from cache'
            );
            return parsed;
          }
        }
      }

      throw error;
    }
  }

  async refreshSupportedCurrencies(): Promise<CurrencyInfo[]> {
    const cacheKey = `${this.CACHE_PREFIX}currencies`;
    const lastKnownKey = `${this.CACHE_PREFIX}currencies:last_good`;
    const currencyInfo = await this.fetchSupportedCurrencies();

    if (!this.isCurrencyListSane(currencyInfo)) {
      Logger.warn(
        'Skipping currency cache refresh due to sanity check failure',
        {
          count: currencyInfo.length,
        }
      );
      throw new Error('NOWPayments returned an unexpected currency list');
    }

    if (redisClient.isConnected()) {
      const client = redisClient.getClient();
      await client.setex(
        cacheKey,
        this.CURRENCY_CACHE_TTL,
        JSON.stringify(currencyInfo)
      );
      await client.setex(
        lastKnownKey,
        this.CURRENCY_LKG_TTL,
        JSON.stringify(currencyInfo)
      );
    } else {
      Logger.warn(
        'Redis not connected; skipping NOWPayments currency cache refresh'
      );
    }

    return currencyInfo;
  }

  private async fetchSupportedCurrencies(): Promise<CurrencyInfo[]> {
    try {
      const fullCurrencies = await nowpaymentsClient.getCurrenciesFull();

      Logger.debug(
        `Received ${fullCurrencies.length} currencies-full from NOWPayments API`
      );

      const filtered = fullCurrencies.filter(currency => !currency.is_fiat);
      if (filtered.length === 0) {
        throw new Error('NOWPayments returned no supported crypto currencies');
      }

      const tickerSet = new Set(
        filtered.map(currency => currency.ticker.toLowerCase())
      );

      return filtered.map(currency => {
        const lowerTicker = currency.ticker.toLowerCase();
        const networkInfo = this.resolveNetworkInfo(lowerTicker, tickerSet);
        return {
          ticker: lowerTicker,
          name: currency.name || this.generateCurrencyName(currency.ticker),
          image:
            currency.image ||
            `https://nowpayments.io/images/coins/${lowerTicker}.svg`,
          isPopular: currency.is_popular,
          isStable: currency.is_stable,
          baseTicker: networkInfo.baseTicker,
          network: networkInfo.networkLabel,
          networkCode: networkInfo.networkCode,
        };
      });
    } catch (error) {
      Logger.warn(
        'Falling back to basic currency list from NOWPayments',
        error
      );
    }

    const currencyTickers = await nowpaymentsClient.getCurrencies();

    Logger.debug(
      `Received ${currencyTickers.length} currencies from NOWPayments API`
    );

    if (currencyTickers.length === 0) {
      throw new Error('NOWPayments returned no supported currencies');
    }

    return this.buildCurrencyInfo(currencyTickers);
  }

  private buildCurrencyInfo(currencyTickers: string[]): CurrencyInfo[] {
    const tickerSet = new Set(
      currencyTickers.map(ticker => ticker.toLowerCase())
    );
    const popularCurrencies = [
      'btc',
      'eth',
      'usdt',
      'usdc',
      'ltc',
      'bch',
      'xrp',
      'ada',
      'dot',
      'matic',
    ];
    const stableCurrencies = [
      'usdt',
      'usdc',
      'usdp',
      'dai',
      'busd',
      'tusd',
      'usdcbsc',
      'usdttrc20',
    ];

    return currencyTickers.map(ticker => {
      const lowerTicker = ticker.toLowerCase();
      const isPopular = popularCurrencies.includes(lowerTicker);
      const isStable = stableCurrencies.includes(lowerTicker);
      const name = this.generateCurrencyName(ticker);
      const networkInfo = this.resolveNetworkInfo(lowerTicker, tickerSet);

      return {
        ticker: lowerTicker,
        name,
        image: `https://nowpayments.io/images/coins/${lowerTicker}.svg`,
        isPopular,
        isStable,
        baseTicker: networkInfo.baseTicker,
        network: networkInfo.networkLabel,
        networkCode: networkInfo.networkCode,
      };
    });
  }

  private resolveNetworkInfo(
    ticker: string,
    tickerSet: Set<string>
  ): { baseTicker: string; networkCode: string; networkLabel: string } {
    for (const network of NETWORK_SUFFIXES_SORTED) {
      if (ticker.endsWith(network.suffix)) {
        const baseTicker = ticker.slice(0, -network.suffix.length);
        if (
          baseTicker &&
          (tickerSet.has(baseTicker) || KNOWN_NETWORK_BASES.has(baseTicker))
        ) {
          return {
            baseTicker,
            networkCode: network.suffix,
            networkLabel: network.label,
          };
        }
      }
    }

    return {
      baseTicker: ticker,
      networkCode: 'native',
      networkLabel: 'Native',
    };
  }

  private isCurrencyListSane(currencies: CurrencyInfo[]): boolean {
    if (
      !Array.isArray(currencies) ||
      currencies.length < this.CURRENCY_SANITY_MIN_COUNT
    ) {
      return false;
    }

    const tickers = new Set(currencies.map(currency => currency.ticker));
    const requiredTickers = ['btc', 'eth'];
    return requiredTickers.every(ticker => tickers.has(ticker));
  }

  private resolveCreditAmountUsd(
    metadata: Record<string, any>,
    fallbackAmount?: number,
    fallbackCurrency?: string
  ): number | null {
    const paidUsd = Number(metadata['paidUsd'] ?? metadata['paid_usd']);
    if (Number.isFinite(paidUsd) && paidUsd > 0) {
      return paidUsd;
    }

    const metadataCurrency =
      typeof metadata['priceCurrency'] === 'string'
        ? metadata['priceCurrency'].toLowerCase()
        : null;
    const metadataAmount = Number(metadata['creditAmountUsd']);
    if (Number.isFinite(metadataAmount) && metadataAmount > 0) {
      return metadataAmount;
    }
    const legacyAmount = Number(metadata['priceAmount']);
    if (
      Number.isFinite(legacyAmount) &&
      legacyAmount > 0 &&
      metadataCurrency === 'usd'
    ) {
      return legacyAmount;
    }

    if (fallbackCurrency && fallbackCurrency.toLowerCase() !== 'usd') {
      return null;
    }

    const fallbackValue = Number(fallbackAmount);
    if (Number.isFinite(fallbackValue) && fallbackValue > 0) {
      return fallbackValue;
    }

    return null;
  }

  private getNowPaymentsErrorMeta(error: unknown): {
    code?: string;
    message?: string;
    statusCode?: number;
  } {
    if (error instanceof NOWPaymentsError) {
      const response = error.response as
        | { code?: string; message?: string }
        | undefined;
      const meta: { code?: string; message?: string; statusCode?: number } = {};

      if (response?.code) {
        meta.code = response.code;
      }
      if (response?.message) {
        meta.message = response.message;
      } else if (error.message) {
        meta.message = error.message;
      }
      if (typeof error.statusCode === 'number') {
        meta.statusCode = error.statusCode;
      }

      return meta;
    }

    if (error instanceof Error) {
      return { message: error.message };
    }

    return {};
  }

  private isProviderUnavailable(error: unknown): boolean {
    if (!(error instanceof NOWPaymentsError)) {
      return false;
    }
    if (!error.statusCode) {
      return true;
    }
    return error.statusCode >= 500 || error.statusCode === 429;
  }

  private isMinAmountError(error: unknown): boolean {
    const meta = this.getNowPaymentsErrorMeta(error);
    const message = meta.message?.toLowerCase() || '';
    return (
      meta.code === 'AMOUNT_MINIMAL_ERROR' ||
      message.includes('minimal') ||
      message.includes('less than minimal')
    );
  }

  private isUnsupportedPairError(error: unknown): boolean {
    const meta = this.getNowPaymentsErrorMeta(error);
    const message = meta.message?.toLowerCase() || '';
    return (
      meta.code === 'CURRENCY_NOT_SUPPORTED' ||
      (meta.code === 'BAD_REQUEST' &&
        (message.includes('can not get estimate') ||
          message.includes('can not get min amount') ||
          message.includes('not supported')))
    );
  }

  // Helper method to generate currency display names
  private generateCurrencyName(ticker: string): string {
    const currencyNames: Record<string, string> = {
      btc: 'Bitcoin',
      eth: 'Ethereum',
      usdt: 'Tether',
      usdc: 'USD Coin',
      ltc: 'Litecoin',
      bch: 'Bitcoin Cash',
      xrp: 'Ripple',
      ada: 'Cardano',
      dot: 'Polkadot',
      matic: 'Polygon',
      avax: 'Avalanche',
      now: 'ChangeNOW',
      fil: 'Filecoin',
      usdp: 'Pax Dollar',
      dai: 'Dai',
      busd: 'Binance USD',
      tusd: 'TrueUSD',
      usdcbsc: 'USD Coin (BSC)',
      usdttrc20: 'Tether (TRC20)',
    };

    return currencyNames[ticker.toLowerCase()] || ticker.toUpperCase();
  }

  // Get minimum deposit amount for a pay currency
  async getMinimumDeposit(currency: string): Promise<{
    currency: string;
    minAmount: number;
    fiatEquivalent?: number;
    minUsd: number;
    internalMinUsd: number;
  }> {
    const payCurrency = currency.toLowerCase();
    try {
      const minAmountResponse = await nowpaymentsClient.getMinAmount({
        currency_from: payCurrency,
        currency_to: payCurrency,
        fiat_equivalent: 'usd',
      });

      const minAmount = Number(minAmountResponse.min_amount);
      if (!Number.isFinite(minAmount) || minAmount <= 0) {
        throw new Error('Invalid minimum amount response from NOWPayments');
      }

      const fiatEquivalent = Number(minAmountResponse.fiat_equivalent);
      const resolvedFiat =
        Number.isFinite(fiatEquivalent) && fiatEquivalent > 0
          ? fiatEquivalent
          : undefined;
      const minUsd = Math.max(
        this.MIN_CREDIT_AMOUNT_USD,
        resolvedFiat ? Math.ceil(resolvedFiat) : this.MIN_CREDIT_AMOUNT_USD
      );

      return {
        currency: payCurrency,
        minAmount,
        ...(resolvedFiat !== undefined ? { fiatEquivalent: resolvedFiat } : {}),
        minUsd,
        internalMinUsd: this.MIN_CREDIT_AMOUNT_USD,
      };
    } catch (error) {
      Logger.error('Error getting minimum deposit:', error);
      throw error;
    }
  }

  // Get payment estimate
  async getEstimate(
    amount: number,
    currency: string
  ): Promise<{ estimatedAmount: number; currency: string } | null> {
    try {
      const estimate = await nowpaymentsClient.getEstimate({
        amount,
        currency_from: 'usd',
        currency_to: currency.toLowerCase(),
      });

      return {
        estimatedAmount: estimate.estimated_amount,
        currency: currency.toUpperCase(),
      };
    } catch (error) {
      Logger.error('Error getting payment estimate:', error);
      throw error;
    }
  }

  // Update payment status from NOWPayments API
  async refreshPaymentStatus(paymentId: string): Promise<boolean> {
    try {
      const pool = getDatabasePool();

      // Get payment from credit_transactions table using NOWPayments payment_id
      const result = await pool.query(
        'SELECT id, payment_id, metadata, payment_status FROM credit_transactions WHERE payment_id = $1',
        [paymentId]
      );

      if (result.rows.length === 0) {
        return false;
      }

      const localId = result.rows[0].id;
      const nowpaymentsId = result.rows[0].payment_id;
      const previousStatus = result.rows[0]
        .payment_status as PaymentStatus | null;
      const metadata = result.rows[0].metadata
        ? typeof result.rows[0].metadata === 'string'
          ? JSON.parse(result.rows[0].metadata)
          : result.rows[0].metadata
        : {};

      // Get latest status from NOWPayments
      const status = await nowpaymentsClient.getPaymentStatus(nowpaymentsId);

      if (
        shouldIgnoreNowPaymentsStatusRegression(
          previousStatus,
          status.payment_status
        )
      ) {
        Logger.warn(
          `Ignoring NOWPayments status regression for ${nowpaymentsId}`,
          {
            previousStatus,
            newStatus: status.payment_status,
          }
        );
        return true;
      }

      // Update metadata with latest payment info
      metadata.actuallyPaid = status.actually_paid;

      // Update database using local ID for WHERE clause
      await pool.query(
        `UPDATE credit_transactions
         SET payment_status = $1, blockchain_hash = $2, updated_at = NOW(), metadata = $3
         WHERE id = $4`,
        [
          status.payment_status,
          status.payin_hash,
          JSON.stringify(metadata),
          localId,
        ]
      );

      await paymentRepository.updateStatusByProviderPaymentId(
        'nowpayments',
        nowpaymentsId,
        this.mapNowPaymentsStatus(status.payment_status),
        status.payment_status,
        metadata
      );

      // Clear cache
      await this.clearPaymentCache(paymentId);

      return true;
    } catch (error) {
      Logger.error('Error refreshing payment status:', error);
      return false;
    }
  }

  // Cache payment data
  private async cachePayment(payment: Payment): Promise<void> {
    try {
      const cacheKey = `${this.CACHE_PREFIX}${payment.id}`;
      await redisClient
        .getClient()
        .setex(cacheKey, this.PAYMENT_CACHE_TTL, JSON.stringify(payment));
    } catch (error) {
      Logger.error('Error caching payment:', error);
    }
  }

  // Clear payment cache
  private async clearPaymentCache(paymentId: string): Promise<void> {
    try {
      const keys = [
        `${this.CACHE_PREFIX}${paymentId}`,
        `${this.CACHE_PREFIX}status:${paymentId}`,
      ];
      await redisClient.getClient().del(...keys);
    } catch (error) {
      Logger.error('Error clearing payment cache:', error);
    }
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      const pool = getDatabasePool();
      await pool.query('SELECT 1 FROM credit_transactions LIMIT 1');

      return await nowpaymentsClient.healthCheck();
    } catch (error) {
      Logger.error('Payment service health check failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const paymentService = new PaymentService();
