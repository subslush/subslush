import { createHash } from 'crypto';
import { isIP } from 'net';
import geoip from 'geoip-lite';
import { getDatabasePool } from '../config/database';
import { env } from '../config/environment';
import { Logger } from '../utils/logger';

type RiskDecision = 'allow' | 'review' | 'block' | 'skipped' | 'error';
type RiskTriggerType =
  | 'first_order'
  | 'repeat_material_change'
  | 'manual_review';

type RiskTriggerReason =
  | 'first_order'
  | 'manual_recheck'
  | 'new_device'
  | 'new_ip'
  | 'new_country'
  | 'new_payment_method'
  | 'high_order_value'
  | 'fast_repeat_purchase'
  | 'dormant_return'
  | 'prior_refund_history'
  | 'prior_dispute_history';

type OrderRiskContext = {
  orderId: string;
  userId: string;
  status: string;
  createdAt: Date;
  contactEmail: string | null;
  totalCents: number | null;
  currency: string | null;
  paymentProvider: string | null;
  paymentReference: string | null;
  checkoutSessionKey: string | null;
  metadata: Record<string, unknown>;
  paymentMetadata: Record<string, unknown>;
  paymentMethodType: string | null;
  paymentProviderId: string | null;
};

type PriorOrderBaseline = {
  previousSuccessCount: number;
  previousAverageCents: number | null;
  lastSuccessfulOrderAt: Date | null;
};

type RefundHistory = {
  refundCount: number;
  disputeCount: number;
};

type HistoricalSignalRow = {
  ipAddress: string | null;
  countryCode: string | null;
  deviceFingerprint: string | null;
  paymentFingerprint: string | null;
};

type CurrentSignals = {
  ipAddress: string | null;
  countryCode: string | null;
  userAgent: string | null;
  acceptLanguage: string | null;
  sessionId: string | null;
  deviceFingerprint: string | null;
  paymentFingerprint: string | null;
  paymentBin: string | null;
  paymentLast4: string | null;
  paymentBrand: string | null;
};

type MaxMindOutcome = {
  riskScore: number | null;
  riskScoreReason: string | null;
  responseBody: Record<string, unknown> | null;
};

export type OrderRiskRequestContext = {
  ipAddress?: string | null;
  countryCode?: string | null;
  userAgent?: string | null;
  acceptLanguage?: string | null;
  sessionId?: string | null;
  source?: string | null;
};

export type OrderRiskEvaluationResult = {
  success: boolean;
  orderId: string;
  triggerType: RiskTriggerType;
  triggerReasons: RiskTriggerReason[];
  shouldRun: boolean;
  isFirstOrder: boolean;
  decision: RiskDecision;
  riskScore: number | null;
  riskScoreReason: string | null;
  holdFulfillment: boolean;
  error?: string;
};

type EvaluateOrderRiskInput = {
  orderId: string;
  requestContext?: OrderRiskRequestContext | null;
  forceRun?: boolean;
  manualReasons?: RiskTriggerReason[];
};

const SUCCESS_ORDER_STATUSES = ['paid', 'in_process', 'delivered'] as const;
const REVIEW_TASK_TYPE = 'verification';
const REVIEW_TASK_CATEGORY = 'order_risk';

const normalizeIpCandidate = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const firstPart = trimmed.split(',')[0]?.trim() ?? '';
  if (!firstPart) return null;

  let candidate = firstPart;
  if (candidate.startsWith('[')) {
    const closeIndex = candidate.indexOf(']');
    if (closeIndex > 1) {
      candidate = candidate.slice(1, closeIndex);
    }
  } else if (candidate.includes('.') && candidate.includes(':')) {
    const parts = candidate.split(':');
    if (parts.length === 2 && parts[0]) {
      candidate = parts[0];
    }
  }

  const normalized = candidate.trim();
  return isIP(normalized) ? normalized : null;
};

const normalizeCountryCode = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return null;
  if (normalized === 'XX' || normalized === 'T1') return null;
  return normalized;
};

const normalizeString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
};

const parseJsonObject = (value: unknown): Record<string, unknown> => {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
    return {};
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
};

const parseInteger = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
};

const parseDecimal = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
};

const parseDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
};

const hashFingerprint = (input: string): string =>
  createHash('sha256').update(input).digest('hex');

const compactObject = (
  value: Record<string, unknown>
): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const [key, candidate] of Object.entries(value)) {
    if (candidate === undefined || candidate === null) continue;
    if (typeof candidate === 'string' && candidate.trim() === '') continue;
    result[key] = candidate;
  }
  return result;
};

export class OrderRiskService {
  async captureOrderRequestContext(params: {
    orderId: string;
    requestContext?: OrderRiskRequestContext | null;
  }): Promise<void> {
    try {
      const context = params.requestContext ?? null;
      if (!context) return;

      const ipAddress = normalizeIpCandidate(context.ipAddress);
      const userAgent = normalizeString(context.userAgent);
      const acceptLanguage = normalizeString(context.acceptLanguage);
      const sessionId = normalizeString(context.sessionId);
      const explicitCountry = normalizeCountryCode(context.countryCode);
      const derivedCountry = ipAddress
        ? normalizeCountryCode(geoip.lookup(ipAddress)?.country)
        : null;
      const countryCode = explicitCountry || derivedCountry;

      const contextPayload = compactObject({
        ip_address: ipAddress,
        country_code: countryCode,
        user_agent: userAgent,
        accept_language: acceptLanguage,
        session_id: sessionId,
        source: normalizeString(context.source),
        captured_at: new Date().toISOString(),
      });

      if (Object.keys(contextPayload).length === 0) {
        return;
      }

      await getDatabasePool().query(
        `UPDATE orders
         SET metadata = jsonb_set(
               COALESCE(metadata, '{}'::jsonb),
               '{risk_context}',
               $2::jsonb,
               true
             ),
             updated_at = NOW()
         WHERE id = $1`,
        [params.orderId, JSON.stringify(contextPayload)]
      );
    } catch (error) {
      Logger.warn('Failed to capture order request context for risk checks', {
        orderId: params.orderId,
        error,
      });
    }
  }

  async evaluateOrderRisk(
    input: EvaluateOrderRiskInput
  ): Promise<OrderRiskEvaluationResult> {
    const order = await this.loadOrderContext(input.orderId);
    if (!order) {
      return {
        success: false,
        orderId: input.orderId,
        triggerType: input.forceRun
          ? 'manual_review'
          : 'repeat_material_change',
        triggerReasons: input.forceRun
          ? input.manualReasons && input.manualReasons.length > 0
            ? input.manualReasons
            : ['manual_recheck']
          : [],
        shouldRun: false,
        isFirstOrder: false,
        decision: 'error',
        riskScore: null,
        riskScoreReason: null,
        holdFulfillment: false,
        error: 'order_not_found',
      };
    }

    const baseline = await this.loadPriorOrderBaseline(
      order.userId,
      order.orderId
    );
    const refundHistory = await this.loadRefundHistory(order.userId);
    const historySignals = await this.loadHistoricalSignals(order.userId);
    const signals = this.resolveCurrentSignals(
      order,
      input.requestContext ?? null
    );

    const isFirstOrder = baseline.previousSuccessCount === 0;
    let triggerType: RiskTriggerType = 'repeat_material_change';
    let triggerReasons: RiskTriggerReason[] = [];
    let shouldRun = false;

    if (input.forceRun) {
      triggerType = 'manual_review';
      triggerReasons =
        input.manualReasons && input.manualReasons.length > 0
          ? input.manualReasons
          : ['manual_recheck'];
      shouldRun = true;
    } else if (isFirstOrder) {
      triggerType = 'first_order';
      triggerReasons = ['first_order'];
      shouldRun = true;
    } else {
      const repeatReasons = this.resolveRepeatTriggerReasons({
        order,
        baseline,
        refundHistory,
        historySignals,
        signals,
      });
      triggerReasons = repeatReasons;
      shouldRun = repeatReasons.length > 0;
    }

    const localSignals: Record<string, unknown> = {
      current_ip: signals.ipAddress,
      current_country: signals.countryCode,
      current_device_fingerprint: signals.deviceFingerprint,
      current_payment_fingerprint: signals.paymentFingerprint,
      previous_success_orders: baseline.previousSuccessCount,
      previous_average_cents: baseline.previousAverageCents,
      last_successful_order_at:
        baseline.lastSuccessfulOrderAt?.toISOString() ?? null,
      refund_count: refundHistory.refundCount,
      dispute_count: refundHistory.disputeCount,
      trigger_reasons: triggerReasons,
    };

    if (!shouldRun) {
      await this.persistAssessment({
        order,
        triggerType,
        triggerReasons,
        shouldRun: false,
        isFirstOrder,
        decision: 'skipped',
        riskScore: null,
        riskScoreReason: null,
        signals,
        localSignals,
        maxMindRequest: null,
        maxMindResponse: null,
        errorMessage: null,
      });

      return {
        success: true,
        orderId: order.orderId,
        triggerType,
        triggerReasons,
        shouldRun: false,
        isFirstOrder,
        decision: 'skipped',
        riskScore: null,
        riskScoreReason: null,
        holdFulfillment: false,
      };
    }

    const maxMindRequest = this.buildMaxMindRequest({
      order,
      baseline,
      refundHistory,
      signals,
      triggerReasons,
    });

    if (
      !env.MAXMIND_MINFRAUD_ENABLED ||
      !env.MAXMIND_ACCOUNT_ID ||
      !env.MAXMIND_LICENSE_KEY
    ) {
      await this.persistAssessment({
        order,
        triggerType,
        triggerReasons,
        shouldRun: true,
        isFirstOrder,
        decision: 'skipped',
        riskScore: null,
        riskScoreReason: null,
        signals,
        localSignals,
        maxMindRequest,
        maxMindResponse: null,
        errorMessage: 'maxmind_disabled_or_not_configured',
      });

      return {
        success: true,
        orderId: order.orderId,
        triggerType,
        triggerReasons,
        shouldRun: true,
        isFirstOrder,
        decision: 'skipped',
        riskScore: null,
        riskScoreReason: null,
        holdFulfillment: false,
      };
    }

    try {
      const maxMind = await this.submitMaxMindFactors(maxMindRequest);
      const decision = this.resolveDecision(maxMind.riskScore);
      const holdFulfillment = decision === 'block';

      await this.persistAssessment({
        order,
        triggerType,
        triggerReasons,
        shouldRun: true,
        isFirstOrder,
        decision,
        riskScore: maxMind.riskScore,
        riskScoreReason: maxMind.riskScoreReason,
        signals,
        localSignals,
        maxMindRequest,
        maxMindResponse: maxMind.responseBody,
        errorMessage: null,
      });

      if (decision === 'review' || decision === 'block') {
        await this.createOrUpdateRiskVerificationTask({
          orderId: order.orderId,
          userId: order.userId,
          riskScore: maxMind.riskScore,
          triggerReasons,
          decision,
        });
      }

      return {
        success: true,
        orderId: order.orderId,
        triggerType,
        triggerReasons,
        shouldRun: true,
        isFirstOrder,
        decision,
        riskScore: maxMind.riskScore,
        riskScoreReason: maxMind.riskScoreReason,
        holdFulfillment,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'maxmind_request_failed';

      await this.persistAssessment({
        order,
        triggerType,
        triggerReasons,
        shouldRun: true,
        isFirstOrder,
        decision: 'error',
        riskScore: null,
        riskScoreReason: null,
        signals,
        localSignals,
        maxMindRequest,
        maxMindResponse: null,
        errorMessage: message,
      });

      Logger.warn('MaxMind risk evaluation failed, continuing fail-open', {
        orderId: order.orderId,
        triggerType,
        triggerReasons,
        error: message,
      });

      return {
        success: false,
        orderId: order.orderId,
        triggerType,
        triggerReasons,
        shouldRun: true,
        isFirstOrder,
        decision: 'error',
        riskScore: null,
        riskScoreReason: null,
        holdFulfillment: false,
        error: message,
      };
    }
  }

  private resolveCurrentSignals(
    order: OrderRiskContext,
    requestContext: OrderRiskRequestContext | null
  ): CurrentSignals {
    const riskContext = parseJsonObject(order.metadata['risk_context']);
    const paymentMetadata = order.paymentMetadata;

    const ipAddress =
      normalizeIpCandidate(requestContext?.ipAddress) ||
      normalizeIpCandidate(riskContext['ip_address']) ||
      null;

    const userAgent =
      normalizeString(requestContext?.userAgent) ||
      normalizeString(riskContext['user_agent']) ||
      null;

    const acceptLanguage =
      normalizeString(requestContext?.acceptLanguage) ||
      normalizeString(riskContext['accept_language']) ||
      null;

    const sessionId =
      normalizeString(requestContext?.sessionId) ||
      normalizeString(riskContext['session_id']) ||
      normalizeString(order.checkoutSessionKey) ||
      null;

    const explicitCountry =
      normalizeCountryCode(requestContext?.countryCode) ||
      normalizeCountryCode(riskContext['country_code']);

    const geoCountry = ipAddress
      ? normalizeCountryCode(geoip.lookup(ipAddress)?.country)
      : null;

    const countryCode = explicitCountry || geoCountry;

    const deviceFingerprint =
      userAgent || acceptLanguage
        ? hashFingerprint(`${userAgent ?? ''}|${acceptLanguage ?? ''}`)
        : null;

    const paymentMethodId =
      normalizeString(paymentMetadata['stripe_payment_method_id']) ||
      normalizeString(paymentMetadata['payment_method_id']) ||
      normalizeString(paymentMetadata['provider_payment_method_id']);

    const paymentBin =
      normalizeString(paymentMetadata['bin']) ||
      normalizeString(paymentMetadata['iin']) ||
      normalizeString(paymentMetadata['issuer_id_number']);

    const paymentLast4 =
      normalizeString(paymentMetadata['card_last4']) ||
      normalizeString(paymentMetadata['last4']);

    const paymentBrand =
      normalizeString(paymentMetadata['card_brand']) ||
      normalizeString(paymentMetadata['brand']);

    const paymentFingerprint = this.resolvePaymentFingerprint({
      provider: order.paymentProvider,
      paymentMethodId,
      paymentBin,
      paymentLast4,
      paymentBrand,
      paymentMethodType: order.paymentMethodType,
    });

    return {
      ipAddress,
      countryCode,
      userAgent,
      acceptLanguage,
      sessionId,
      deviceFingerprint,
      paymentFingerprint,
      paymentBin,
      paymentLast4,
      paymentBrand,
    };
  }

  private resolveRepeatTriggerReasons(params: {
    order: OrderRiskContext;
    baseline: PriorOrderBaseline;
    refundHistory: RefundHistory;
    historySignals: HistoricalSignalRow[];
    signals: CurrentSignals;
  }): RiskTriggerReason[] {
    const reasons = new Set<RiskTriggerReason>();
    const seenIp = new Set<string>();
    const seenCountries = new Set<string>();
    const seenDevices = new Set<string>();
    const seenPayments = new Set<string>();

    for (const row of params.historySignals) {
      if (row.ipAddress) seenIp.add(row.ipAddress);
      if (row.countryCode) seenCountries.add(row.countryCode);
      if (row.deviceFingerprint) seenDevices.add(row.deviceFingerprint);
      if (row.paymentFingerprint) seenPayments.add(row.paymentFingerprint);
    }

    if (params.signals.deviceFingerprint) {
      if (!seenDevices.has(params.signals.deviceFingerprint)) {
        reasons.add('new_device');
      }
    }

    if (params.signals.ipAddress) {
      if (!seenIp.has(params.signals.ipAddress)) {
        reasons.add('new_ip');
      }
    }

    if (params.signals.countryCode) {
      if (!seenCountries.has(params.signals.countryCode)) {
        reasons.add('new_country');
      }
    }

    if (params.signals.paymentFingerprint) {
      if (!seenPayments.has(params.signals.paymentFingerprint)) {
        reasons.add('new_payment_method');
      }
    }

    const currentTotalCents = params.order.totalCents ?? 0;
    const averageCents = params.baseline.previousAverageCents;
    if (averageCents !== null && averageCents > 0) {
      const highValueThreshold = Math.max(
        env.MAXMIND_REPEAT_HIGH_VALUE_ABSOLUTE_CENTS,
        Math.round(averageCents * env.MAXMIND_REPEAT_HIGH_VALUE_MULTIPLIER)
      );
      if (currentTotalCents >= highValueThreshold) {
        reasons.add('high_order_value');
      }
    } else if (
      currentTotalCents >= env.MAXMIND_REPEAT_HIGH_VALUE_ABSOLUTE_CENTS
    ) {
      reasons.add('high_order_value');
    }

    if (params.baseline.lastSuccessfulOrderAt) {
      const gapMs =
        params.order.createdAt.getTime() -
        params.baseline.lastSuccessfulOrderAt.getTime();

      const fastRepeatMs = env.MAXMIND_REPEAT_FAST_MINUTES * 60 * 1000;
      if (gapMs > 0 && gapMs <= fastRepeatMs) {
        reasons.add('fast_repeat_purchase');
      }

      const dormancyMs = env.MAXMIND_REPEAT_DORMANCY_DAYS * 24 * 60 * 60 * 1000;
      if (gapMs >= dormancyMs) {
        reasons.add('dormant_return');
      }
    }

    if (params.refundHistory.refundCount > 0) {
      reasons.add('prior_refund_history');
    }

    if (params.refundHistory.disputeCount > 0) {
      reasons.add('prior_dispute_history');
    }

    return Array.from(reasons);
  }

  private buildMaxMindRequest(params: {
    order: OrderRiskContext;
    baseline: PriorOrderBaseline;
    refundHistory: RefundHistory;
    signals: CurrentSignals;
    triggerReasons: RiskTriggerReason[];
  }): Record<string, unknown> {
    const amount =
      typeof params.order.totalCents === 'number'
        ? Number((params.order.totalCents / 100).toFixed(2))
        : null;
    const currency =
      normalizeString(params.order.currency)?.toUpperCase() ?? 'USD';
    const email = normalizeString(params.order.contactEmail);
    const provider = normalizeString(params.order.paymentProvider);

    const paymentObject = compactObject({
      processor: provider,
    });

    const creditCardObject = compactObject({
      issuer_id_number: params.signals.paymentBin,
      last_digits: params.signals.paymentLast4,
    });

    const customInputs = compactObject({
      trigger_reasons: params.triggerReasons.join(','),
      previous_success_orders: params.baseline.previousSuccessCount,
      prior_refund_count: params.refundHistory.refundCount,
      prior_dispute_count: params.refundHistory.disputeCount,
      is_repeat_order: params.baseline.previousSuccessCount > 0,
      payment_method_type: params.order.paymentMethodType,
    });

    const requestPayload = compactObject({
      device: compactObject({
        ip_address: params.signals.ipAddress,
        user_agent: params.signals.userAgent,
        accept_language: params.signals.acceptLanguage,
        session_id: params.signals.sessionId,
      }),
      event: compactObject({
        type: 'purchase',
        transaction_id: params.order.orderId,
        shop_id: 'subslush_marketplace',
        time: new Date().toISOString(),
      }),
      account: compactObject({
        user_id: params.order.userId,
      }),
      email: compactObject({
        address: email,
      }),
      transaction: compactObject({
        amount,
        currency,
      }),
      payment:
        Object.keys(paymentObject).length > 0 ? paymentObject : undefined,
      credit_card:
        Object.keys(creditCardObject).length > 0 ? creditCardObject : undefined,
      custom_inputs: customInputs,
    });

    return requestPayload;
  }

  private async submitMaxMindFactors(
    requestPayload: Record<string, unknown>
  ): Promise<MaxMindOutcome> {
    const credentials = `${env.MAXMIND_ACCOUNT_ID}:${env.MAXMIND_LICENSE_KEY}`;
    const authorization = `Basic ${Buffer.from(credentials).toString('base64')}`;
    const abortSignal = globalThis.AbortSignal.timeout(env.MAXMIND_TIMEOUT_MS);

    const response = await fetch(env.MAXMIND_MINFRAUD_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: authorization,
      },
      body: JSON.stringify(requestPayload),
      signal: abortSignal,
    });

    const textBody = await response.text();
    let parsedBody: Record<string, unknown> | null = null;
    if (textBody) {
      try {
        const candidate = JSON.parse(textBody);
        if (candidate && typeof candidate === 'object') {
          parsedBody = candidate as Record<string, unknown>;
        }
      } catch {
        parsedBody = null;
      }
    }

    if (!response.ok) {
      throw new Error(
        `maxmind_http_${response.status}: ${textBody || 'empty_response'}`
      );
    }

    const riskScore = parsedBody
      ? parseDecimal(parsedBody['risk_score'])
      : null;
    const riskScoreReason = parsedBody
      ? normalizeString(parsedBody['risk_score_reason'])
      : null;

    return {
      riskScore,
      riskScoreReason,
      responseBody: parsedBody,
    };
  }

  private resolveDecision(riskScore: number | null): RiskDecision {
    if (riskScore === null) {
      return 'error';
    }
    if (riskScore >= env.MAXMIND_BLOCK_SCORE) {
      return 'block';
    }
    if (riskScore >= env.MAXMIND_REVIEW_SCORE) {
      return 'review';
    }
    return 'allow';
  }

  private resolvePaymentFingerprint(params: {
    provider: string | null;
    paymentMethodId: string | null;
    paymentBin: string | null;
    paymentLast4: string | null;
    paymentBrand: string | null;
    paymentMethodType: string | null;
  }): string | null {
    const provider =
      normalizeString(params.provider)?.toLowerCase() ?? 'unknown';
    if (params.paymentMethodId) {
      return `${provider}:pm:${params.paymentMethodId}`;
    }
    if (params.paymentBin && params.paymentLast4) {
      return `${provider}:bin:${params.paymentBin}:last4:${params.paymentLast4}`;
    }
    if (params.paymentBrand && params.paymentLast4) {
      return `${provider}:brand:${params.paymentBrand}:last4:${params.paymentLast4}`;
    }
    if (params.paymentMethodType) {
      return `${provider}:type:${params.paymentMethodType}`;
    }
    return null;
  }

  private async loadOrderContext(
    orderId: string
  ): Promise<OrderRiskContext | null> {
    try {
      const result = await getDatabasePool().query(
        `SELECT o.id,
                o.user_id,
                o.status,
                o.created_at,
                o.contact_email,
                o.total_cents,
                o.currency,
                o.payment_provider,
                o.payment_reference,
                o.checkout_session_key,
                o.metadata,
                p.metadata AS payment_metadata,
                p.payment_method_type,
                p.provider_payment_id
         FROM orders o
         LEFT JOIN LATERAL (
           SELECT metadata, payment_method_type, provider_payment_id
           FROM payments
           WHERE order_id = o.id
           ORDER BY created_at DESC
           LIMIT 1
         ) p ON TRUE
         WHERE o.id = $1
         LIMIT 1`,
        [orderId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0] as Record<string, unknown>;
      return {
        orderId: String(row['id']),
        userId: String(row['user_id']),
        status: String(row['status'] ?? ''),
        createdAt: parseDate(row['created_at']) ?? new Date(),
        contactEmail: normalizeString(row['contact_email']),
        totalCents: parseInteger(row['total_cents']),
        currency: normalizeString(row['currency']),
        paymentProvider: normalizeString(row['payment_provider']),
        paymentReference: normalizeString(row['payment_reference']),
        checkoutSessionKey: normalizeString(row['checkout_session_key']),
        metadata: parseJsonObject(row['metadata']),
        paymentMetadata: parseJsonObject(row['payment_metadata']),
        paymentMethodType: normalizeString(row['payment_method_type']),
        paymentProviderId: normalizeString(row['provider_payment_id']),
      };
    } catch (error) {
      Logger.error('Failed to load order context for risk evaluation', {
        orderId,
        error,
      });
      return null;
    }
  }

  private async loadPriorOrderBaseline(
    userId: string,
    orderId: string
  ): Promise<PriorOrderBaseline> {
    try {
      const result = await getDatabasePool().query(
        `SELECT COUNT(*)::int AS previous_success_count,
                AVG(total_cents)::numeric AS previous_average_cents,
                MAX(created_at) AS last_successful_order_at
         FROM orders
         WHERE user_id = $1
           AND id <> $2
           AND status = ANY($3::text[])`,
        [userId, orderId, [...SUCCESS_ORDER_STATUSES]]
      );

      const row = result.rows[0] as Record<string, unknown> | undefined;
      return {
        previousSuccessCount: row
          ? (parseInteger(row['previous_success_count']) ?? 0)
          : 0,
        previousAverageCents: row
          ? parseDecimal(row['previous_average_cents'])
          : null,
        lastSuccessfulOrderAt: row
          ? parseDate(row['last_successful_order_at'])
          : null,
      };
    } catch (error) {
      Logger.warn('Failed to load prior order baseline for risk evaluation', {
        userId,
        orderId,
        error,
      });
      return {
        previousSuccessCount: 0,
        previousAverageCents: null,
        lastSuccessfulOrderAt: null,
      };
    }
  }

  private async loadRefundHistory(userId: string): Promise<RefundHistory> {
    try {
      const result = await getDatabasePool().query(
        `SELECT COUNT(*) FILTER (
                  WHERE status <> 'rejected'
                )::int AS refund_count,
                COUNT(*) FILTER (
                  WHERE status <> 'rejected'
                    AND reason = 'dispute'
                )::int AS dispute_count
         FROM payment_refunds
         WHERE user_id = $1`,
        [userId]
      );

      const row = result.rows[0] as Record<string, unknown> | undefined;
      return {
        refundCount: row ? (parseInteger(row['refund_count']) ?? 0) : 0,
        disputeCount: row ? (parseInteger(row['dispute_count']) ?? 0) : 0,
      };
    } catch (error) {
      Logger.warn('Failed to load refund history for risk evaluation', {
        userId,
        error,
      });
      return {
        refundCount: 0,
        disputeCount: 0,
      };
    }
  }

  private async loadHistoricalSignals(
    userId: string
  ): Promise<HistoricalSignalRow[]> {
    try {
      const result = await getDatabasePool().query(
        `SELECT ip_address,
                country_code,
                device_fingerprint,
                payment_fingerprint
         FROM maxmind_risk_assessments
         WHERE user_id = $1
           AND created_at >= NOW() - ($2::int || ' days')::interval
         ORDER BY created_at DESC
         LIMIT 200`,
        [userId, env.MAXMIND_SIGNAL_LOOKBACK_DAYS]
      );

      return result.rows.map((row: Record<string, unknown>) => ({
        ipAddress: normalizeIpCandidate(row['ip_address']),
        countryCode: normalizeCountryCode(row['country_code']),
        deviceFingerprint: normalizeString(row['device_fingerprint']),
        paymentFingerprint: normalizeString(row['payment_fingerprint']),
      }));
    } catch (error) {
      Logger.warn('Failed to load historical risk signals', {
        userId,
        error,
      });
      return [];
    }
  }

  private async persistAssessment(params: {
    order: OrderRiskContext;
    triggerType: RiskTriggerType;
    triggerReasons: RiskTriggerReason[];
    shouldRun: boolean;
    isFirstOrder: boolean;
    decision: RiskDecision;
    riskScore: number | null;
    riskScoreReason: string | null;
    signals: CurrentSignals;
    localSignals: Record<string, unknown>;
    maxMindRequest: Record<string, unknown> | null;
    maxMindResponse: Record<string, unknown> | null;
    errorMessage: string | null;
  }): Promise<void> {
    try {
      await getDatabasePool().query(
        `INSERT INTO maxmind_risk_assessments (
           order_id,
           user_id,
           trigger_type,
           trigger_reasons,
           should_run,
           decision,
           risk_score,
           risk_score_reason,
           ip_address,
           country_code,
           device_fingerprint,
           payment_fingerprint,
           amount_cents,
           currency,
           is_first_order,
           provider,
           local_signals,
           maxmind_request,
           maxmind_response,
           error_message,
           evaluated_at
         )
         VALUES (
           $1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10,
           $11, $12, $13, $14, $15, $16, $17::jsonb, $18::jsonb,
           $19::jsonb, $20, NOW()
         )`,
        [
          params.order.orderId,
          params.order.userId,
          params.triggerType,
          JSON.stringify(params.triggerReasons),
          params.shouldRun,
          params.decision,
          params.riskScore,
          params.riskScoreReason,
          params.signals.ipAddress,
          params.signals.countryCode,
          params.signals.deviceFingerprint,
          params.signals.paymentFingerprint,
          params.order.totalCents,
          params.order.currency,
          params.isFirstOrder,
          params.order.paymentProvider,
          JSON.stringify(params.localSignals),
          params.maxMindRequest ? JSON.stringify(params.maxMindRequest) : null,
          params.maxMindResponse
            ? JSON.stringify(params.maxMindResponse)
            : null,
          params.errorMessage,
        ]
      );

      const riskSnapshot = compactObject({
        checked_at: new Date().toISOString(),
        trigger_type: params.triggerType,
        trigger_reasons: params.triggerReasons,
        should_run: params.shouldRun,
        decision: params.decision,
        risk_score: params.riskScore,
        risk_score_reason: params.riskScoreReason,
        ip_address: params.signals.ipAddress,
        country_code: params.signals.countryCode,
      });

      await getDatabasePool().query(
        `UPDATE orders
         SET metadata = jsonb_set(
               COALESCE(metadata, '{}'::jsonb),
               '{risk}',
               $2::jsonb,
               true
             ),
             updated_at = NOW()
         WHERE id = $1`,
        [params.order.orderId, JSON.stringify(riskSnapshot)]
      );
    } catch (error) {
      Logger.warn('Failed to persist MaxMind risk assessment', {
        orderId: params.order.orderId,
        error,
      });
    }
  }

  private async createOrUpdateRiskVerificationTask(params: {
    orderId: string;
    userId: string;
    riskScore: number | null;
    triggerReasons: RiskTriggerReason[];
    decision: 'review' | 'block';
  }): Promise<void> {
    try {
      const priority = params.decision === 'block' ? 'urgent' : 'high';
      const dueInterval =
        params.decision === 'block' ? '10 minutes' : '30 minutes';
      const noteParts = [
        `[${new Date().toISOString()}] MaxMind ${params.decision.toUpperCase()} score.`,
        `risk_score=${params.riskScore ?? 'n/a'}`,
        `reasons=${params.triggerReasons.join(', ') || 'n/a'}`,
      ];
      const note = noteParts.join(' ');

      await getDatabasePool().query(
        `INSERT INTO admin_tasks (
           subscription_id,
           user_id,
           order_id,
           task_type,
           due_date,
           priority,
           notes,
           task_category,
           sla_due_at,
           is_issue
         )
         SELECT NULL, $1, $2, $3, NOW() + ($4)::interval, $5, $6, $7,
                NOW() + ($4)::interval, TRUE
         WHERE NOT EXISTS (
           SELECT 1
           FROM admin_tasks
           WHERE order_id = $2
             AND task_type = $3
             AND task_category = $7
             AND completed_at IS NULL
         )`,
        [
          params.userId,
          params.orderId,
          REVIEW_TASK_TYPE,
          dueInterval,
          priority,
          note,
          REVIEW_TASK_CATEGORY,
        ]
      );
    } catch (error) {
      Logger.warn('Failed to create MaxMind verification task', {
        orderId: params.orderId,
        error,
      });
    }
  }
}

export const orderRiskService = new OrderRiskService();
