import type { PoolClient } from 'pg';
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
import { nowPaymentsProvider } from './payments/nowPaymentsProvider';
import { stripeProvider } from './payments/stripeProvider';
import { Logger } from '../utils/logger';
import { paymentMonitoringService } from './paymentMonitoringService';
import { paymentFailureService } from './paymentFailureService';
import { shouldIgnoreNowPaymentsStatusRegression } from '../utils/nowpaymentsStatus';
import { paymentMethodService } from './paymentMethodService';
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
import { orderService } from './orderService';
import { couponService } from './couponService';
import {
  buildTikTokProductProperties,
  tiktokEventsService,
} from './tiktokEventsService';
import { normalizeCurrencyCode } from '../utils/currency';
import {
  computeNextRenewalDates,
  getNextStripeRenewalAttemptDate,
} from '../utils/subscriptionHelpers';
import {
  normalizeUpgradeOptions,
  validateUpgradeOptions,
} from '../utils/upgradeOptions';
import {
  ensureRenewalTask,
  notifyStripeRenewalFailure,
  notifyStripeRenewalSuccess,
} from './renewalNotificationService';

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

  async ensureStripeCustomer(userId: string): Promise<{
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

    const email = userResult.rows[0].email as string | null;
    const existingCustomerId = userResult.rows[0].stripe_customer_id as
      | string
      | null;

    if (existingCustomerId) {
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
      await paymentRepository.create({
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
          await paymentRepository.create({
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
            return true;
          }

          if (!updateResult.updated) {
            Logger.info('Stripe renewal skipped', {
              paymentId,
              subscriptionId,
              reason: updateResult.reason,
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

      const intent = event.data.object as any;
      const paymentId = intent.id as string;

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
        // Ignore non-payment_intent events for now (e.g., charges)
        if (!event.type.startsWith('payment_intent.')) {
          Logger.info(
            `Ignoring Stripe event ${event.type} (not a payment_intent)`
          );
          return true;
        }

        // Fetch payment record
        const payment = await paymentRepository.findByProviderPaymentId(
          'stripe',
          paymentId
        );

        if (!payment) {
          Logger.error('Stripe payment not found in repository', { paymentId });
          return false;
        }

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

    const paymentId = order.payment_reference || params.paymentId || null;
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
      await this.reconcileStripePaymentIntent(paymentId);
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
      await this.reconcileStripePaymentIntent(paymentId);
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
        o.payment_reference,
        COALESCE(p.created_at, o.updated_at, o.created_at) AS started_at
      FROM orders o
      LEFT JOIN payments p
        ON p.provider = 'stripe'
       AND p.provider_payment_id = o.payment_reference
      WHERE o.status = 'pending_payment'
        AND o.payment_provider = 'stripe'
        AND COALESCE(p.created_at, o.updated_at, o.created_at) <= $1
      ORDER BY COALESCE(p.created_at, o.updated_at, o.created_at) ASC
      LIMIT $2
      `,
      [cutoff, batchSize]
    );

    let cancelled = 0;
    let reconciled = 0;
    let skipped = 0;
    let errors = 0;

    for (const row of result.rows) {
      const orderId = row.order_id as string;
      const paymentId = row.payment_reference as string | null;
      try {
        const outcome = await this.cancelStripeCheckout({
          orderId,
          paymentId,
          reason: 'checkout_timeout',
        });
        if (outcome.status === 'cancelled') {
          cancelled += 1;
        } else if (outcome.status === 'reconciled') {
          reconciled += 1;
        } else if (
          outcome.status === 'already_processed' ||
          outcome.status === 'not_stripe'
        ) {
          skipped += 1;
        } else if (outcome.status === 'forbidden') {
          skipped += 1;
        } else {
          errors += 1;
        }
      } catch (error) {
        errors += 1;
        Logger.warn('Failed to sweep stale Stripe checkout', {
          orderId,
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

      await paymentRepository.create(unifiedPaymentInput);

      return {
        success: true,
        clientSecret: providerPayment.clientSecret,
        paymentId: providerPayment.providerPaymentId,
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
  async processWebhook(payload: WebhookPayload): Promise<boolean> {
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
