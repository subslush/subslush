import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { authPreHandler } from '../middleware/authMiddleware';
import { createRateLimitHandler } from '../middleware/rateLimitMiddleware';
import { orderService } from '../services/orderService';
import { subscriptionService } from '../services/subscriptionService';
import { orderEntitlementService } from '../services/orderEntitlementService';
import { catalogService } from '../services/catalogService';
import { getDatabasePool } from '../config/database';
import { ErrorResponses, SuccessResponses } from '../utils/response';
import { Logger } from '../utils/logger';
import { getPaymentMethodBadge } from '../utils/orderHelpers';
import { credentialsEncryptionService } from '../utils/encryption';
import { logCredentialRevealAttempt } from '../services/auditLogService';
import { orderComplianceEvidenceService } from '../services/orderComplianceEvidenceService';
import { getRequestIp } from '../utils/requestIp';
import { normalizeUpgradeOptions } from '../utils/upgradeOptions';
import type { OrderStatus } from '../types/order';
import type { PriceHistory } from '../types/catalog';
import type { OrderEntitlement } from '../types/orderEntitlement';
import type { UpgradeOptionsSnapshot } from '../types/subscription';
import {
  resolvePreferredCurrency,
  resolveCountryFromHeaders,
  normalizeCurrencyCode,
  type SupportedCurrency,
} from '../utils/currency';

const ordersRateLimit = createRateLimitHandler({
  windowMs: 60 * 1000,
  maxRequests: 60,
  keyGenerator: (request: FastifyRequest) => {
    const userId = request.user?.userId || request.ip;
    return `orders_list:${userId}`;
  },
});

const orderCredentialRevealRateLimit = createRateLimitHandler({
  windowMs: 60 * 1000,
  maxRequests: 10,
  keyGenerator: (request: FastifyRequest) => {
    const userId = request.user?.userId || request.ip;
    return `order_credential_reveal:${userId}`;
  },
});

const parseBoolean = (value: unknown): boolean | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return undefined;
};

const getRequestUserAgent = (request: FastifyRequest): string | null => {
  const userAgent = request.headers['user-agent'];
  return typeof userAgent === 'string' && userAgent.trim().length > 0
    ? userAgent
    : null;
};

const resolveRequestCurrency = (request: FastifyRequest): SupportedCurrency => {
  const queryCurrency = (request.query as { currency?: string })?.currency;
  const headerCurrency = request.headers['x-currency'];
  const cookieCurrency = request.cookies?.['preferred_currency'];
  const headerCountry = resolveCountryFromHeaders(
    request.headers as Record<string, string | string[] | undefined>
  );

  return resolvePreferredCurrency({
    queryCurrency: queryCurrency ?? null,
    headerCurrency: typeof headerCurrency === 'string' ? headerCurrency : null,
    cookieCurrency: typeof cookieCurrency === 'string' ? cookieCurrency : null,
    headerCountry,
    fallback: 'USD',
  });
};

type ParsedMetadata = Record<string, any>;

const acceptRulesBodySchema = z
  .object({
    confirmed: z.literal(true),
  })
  .strict();

type OrderItemContext = {
  id: string;
  product_name?: string | null;
  variant_name?: string | null;
  term_months?: number | null;
  metadata?: ParsedMetadata | null;
  product_metadata?: ParsedMetadata | null;
};

type SourceSubscriptionContext = {
  id: string;
  activation_handshake_state?: string | null;
  delivered_at?: Date | null;
  activation_instructions_delivered_at?: Date | null;
  activation_customer_ready_at?: Date | null;
  activation_link_delivered_at?: Date | null;
  accepted_rules_versions?: string[];
};

export type DashboardOrderSubscriptionPayload = {
  id: string;
  user_id: string;
  service_type: string;
  service_plan: string;
  start_date: Date;
  term_start_at: Date;
  end_date: Date;
  renewal_date: Date;
  status: OrderEntitlement['status'];
  auto_renew: false;
  next_billing_at: null;
  renewal_method: null;
  term_months: number | null;
  product_name: string | null;
  variant_name: string | null;
  order_id: string;
  order_item_id: string | null;
  activation_handshake_state: string | null;
  delivered_at: Date | null;
  activation_instructions_delivered_at: Date | null;
  activation_customer_ready_at: Date | null;
  activation_link_delivered_at: Date | null;
  strict_rules_accepted: boolean;
  product_options: UpgradeOptionsSnapshot | null;
  status_reason: 'order_entitlement';
  metadata: Record<string, any> & {
    order_entitlement_id: string;
    source_subscription_id: string | null;
    mmu_cycle_index: number | null;
    mmu_cycle_total: number | null;
  };
  created_at: Date;
  updated_at: Date;
};

const parseMetadata = (value: unknown): ParsedMetadata | null => {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as ParsedMetadata;
  }
  return null;
};

const readString = (
  source: ParsedMetadata | null | undefined,
  ...keys: string[]
): string | null => {
  if (!source) return null;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
};

const resolveDashboardProductOptions = (
  ...metadataSources: Array<ParsedMetadata | null | undefined>
): UpgradeOptionsSnapshot | null => {
  let merged: ParsedMetadata | null = null;
  for (const metadata of metadataSources) {
    const raw = metadata?.['upgrade_options'] ?? metadata?.['upgradeOptions'];
    let parsed = raw;
    if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = null;
      }
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      merged = { ...(merged ?? {}), ...(parsed as ParsedMetadata) };
    }
  }
  return merged ? normalizeUpgradeOptions({ upgrade_options: merged }) : null;
};

export const toLegacySubscriptionPayload = (params: {
  entitlement: OrderEntitlement;
  orderMetadata: ParsedMetadata | null;
  orderItem?: OrderItemContext | undefined;
  sourceSubscription?: SourceSubscriptionContext | undefined;
}): DashboardOrderSubscriptionPayload => {
  const itemMetadata = parseMetadata(params.orderItem?.metadata);
  const productOptions = resolveDashboardProductOptions(
    params.orderMetadata,
    params.orderItem?.product_metadata,
    itemMetadata
  );
  const currentRulesVersion = String(productOptions?.strict_rules_version || 1);
  const serviceType =
    readString(itemMetadata, 'service_type', 'serviceType') ??
    readString(params.orderMetadata, 'service_type', 'serviceType') ??
    'unknown';
  const servicePlan =
    readString(itemMetadata, 'service_plan', 'servicePlan') ??
    readString(params.orderMetadata, 'service_plan', 'servicePlan') ??
    'unknown';
  const termMonths =
    params.entitlement.duration_months_snapshot ??
    params.orderItem?.term_months ??
    null;

  return {
    id: params.entitlement.source_subscription_id || params.entitlement.id,
    user_id: params.entitlement.user_id,
    service_type: serviceType,
    service_plan: servicePlan,
    start_date: params.entitlement.starts_at,
    term_start_at: params.entitlement.starts_at,
    end_date: params.entitlement.ends_at,
    renewal_date: params.entitlement.ends_at,
    status: params.entitlement.status,
    auto_renew: false,
    next_billing_at: null,
    renewal_method: null,
    term_months: termMonths,
    product_name: params.orderItem?.product_name ?? null,
    variant_name: params.orderItem?.variant_name ?? null,
    order_id: params.entitlement.order_id,
    order_item_id: params.entitlement.order_item_id ?? null,
    activation_handshake_state:
      params.sourceSubscription?.activation_handshake_state ?? null,
    delivered_at: params.sourceSubscription?.delivered_at ?? null,
    activation_instructions_delivered_at:
      params.sourceSubscription?.activation_instructions_delivered_at ?? null,
    activation_customer_ready_at:
      params.sourceSubscription?.activation_customer_ready_at ?? null,
    activation_link_delivered_at:
      params.sourceSubscription?.activation_link_delivered_at ?? null,
    strict_rules_accepted:
      params.sourceSubscription?.accepted_rules_versions?.includes(
        currentRulesVersion
      ) === true,
    product_options: productOptions ?? null,
    status_reason: 'order_entitlement',
    metadata: {
      ...(params.entitlement.metadata || {}),
      order_entitlement_id: params.entitlement.id,
      source_subscription_id: params.entitlement.source_subscription_id ?? null,
      mmu_cycle_index: params.entitlement.mmu_cycle_index ?? null,
      mmu_cycle_total: params.entitlement.mmu_cycle_total ?? null,
    },
    created_at: params.entitlement.created_at,
    updated_at: params.entitlement.updated_at,
  };
};

const sanitizeEntitlement = (
  entitlement: OrderEntitlement
): Omit<OrderEntitlement, 'credentials_encrypted'> & {
  has_credentials: boolean;
} => {
  const { credentials_encrypted: _credentials, ...safe } = entitlement;
  return {
    ...safe,
    has_credentials: Boolean(entitlement.credentials_encrypted),
  };
};

async function revealOrderItemCredentials(params: {
  request: FastifyRequest;
  reply: FastifyReply;
  orderId: string;
  subscriptionId: string;
}): Promise<FastifyReply> {
  const userId = params.request.user?.userId;
  if (!userId) {
    return ErrorResponses.unauthorized(params.reply, 'Authentication required');
  }

  const pool = getDatabasePool();
  const result = await pool.query(
    `SELECT o.id AS order_id,
            o.user_id,
            o.contact_email,
            s.id AS subscription_id,
            s.order_item_id,
            s.credentials_encrypted,
            p.metadata AS product_metadata
     FROM orders o
     JOIN subscriptions s ON s.order_id = o.id
     LEFT JOIN product_variants pv ON pv.id = s.product_variant_id
     LEFT JOIN products p ON p.id = pv.product_id
     WHERE o.id = $1
       AND o.user_id = $2
       AND s.id = $3`,
    [params.orderId, userId, params.subscriptionId]
  );
  const row = result.rows[0] || null;
  if (!row) {
    return ErrorResponses.notFound(params.reply, 'Order item not found');
  }

  const upgradeOptions = normalizeUpgradeOptions(row.product_metadata);
  if (upgradeOptions?.strict_rules) {
    const acceptedResult = await pool.query(
      `SELECT created_at, ip_address, metadata
       FROM order_compliance_evidence_logs
       WHERE order_id = $1
         AND user_id = $2
         AND event_type = 'strict_rules_acceptance'
         AND metadata->>'subscription_id' = $3
         AND (metadata->>'rules_version')::int = $4
       ORDER BY created_at DESC
       LIMIT 1`,
      [
        params.orderId,
        userId,
        params.subscriptionId,
        upgradeOptions.strict_rules_version || 1,
      ]
    );
    if (acceptedResult.rows.length === 0) {
      await logCredentialRevealAttempt(params.request, {
        subscriptionId: params.subscriptionId,
        success: false,
        failureReason: 'strict_rules_not_accepted',
        metadata: {
          order_id: params.orderId,
          order_item_id: row.order_item_id ?? null,
        },
      });
      return ErrorResponses.badRequest(
        params.reply,
        'Strict rules acceptance is required before revealing credentials'
      );
    }
  }

  if (!row.credentials_encrypted) {
    await logCredentialRevealAttempt(params.request, {
      subscriptionId: params.subscriptionId,
      success: false,
      failureReason: 'credentials_missing',
      metadata: {
        order_id: params.orderId,
        order_item_id: row.order_item_id ?? null,
        source: 'subscription_item',
      },
    });
    await orderComplianceEvidenceService.recordCredentialRevealEvidence({
      orderId: params.orderId,
      userId,
      customerEmail: row.contact_email ?? null,
      ipAddress: getRequestIp(params.request),
      success: false,
      evidence: {
        source: 'subscription_item',
        subscription_id: params.subscriptionId,
        order_item_id: row.order_item_id ?? null,
        failure_reason: 'credentials_missing',
        user_agent: getRequestUserAgent(params.request),
      },
    });
    return ErrorResponses.notFound(
      params.reply,
      'Credentials are not available for this item'
    );
  }

  const decrypted = credentialsEncryptionService.decryptFromString(
    row.credentials_encrypted
  );
  if (!decrypted.wasEncrypted && decrypted.migratedPayload) {
    await subscriptionService.updateSubscriptionCredentialsEncryptedValue({
      subscriptionId: params.subscriptionId,
      encryptedValue: decrypted.migratedPayload,
    });
  }

  await logCredentialRevealAttempt(params.request, {
    subscriptionId: params.subscriptionId,
    success: true,
    metadata: {
      order_id: params.orderId,
      order_item_id: row.order_item_id ?? null,
      source: 'subscription_item',
    },
  });
  await orderComplianceEvidenceService.recordCredentialRevealEvidence({
    orderId: params.orderId,
    userId,
    customerEmail: row.contact_email ?? null,
    ipAddress: getRequestIp(params.request),
    success: true,
    evidence: {
      source: 'subscription_item',
      subscription_id: params.subscriptionId,
      order_item_id: row.order_item_id ?? null,
      user_agent: getRequestUserAgent(params.request),
    },
  });

  return SuccessResponses.ok(params.reply, {
    order_id: params.orderId,
    subscription_id: params.subscriptionId,
    order_item_id: row.order_item_id ?? null,
    credentials: decrypted.plaintext,
  });
}

export async function orderRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/',
    {
      preHandler: [ordersRateLimit, authPreHandler],
      schema: {
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            payment_provider: { type: 'string' },
            limit: { type: 'number', minimum: 1, maximum: 100 },
            offset: { type: 'number', minimum: 0 },
            include_items: { type: 'string' },
            include_cart: { type: 'string' },
            include_unpaid: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = request.user?.userId;
        if (!userId) {
          return ErrorResponses.unauthorized(reply, 'Authentication required');
        }

        const query = request.query as {
          status?: OrderStatus;
          payment_provider?: string;
          limit?: number;
          offset?: number;
          include_items?: string;
          include_cart?: string;
          include_unpaid?: string;
        };

        const limit = Number(query.limit ?? 20);
        const offset = Number(query.offset ?? 0);
        const includeItems = parseBoolean(query.include_items) ?? false;
        const includeCart = parseBoolean(query.include_cart) ?? false;
        const includeUnpaid = parseBoolean(query.include_unpaid) ?? false;
        const preferredCurrency = resolveRequestCurrency(request);

        const result = await orderService.listOrdersForUser({
          userId,
          limit,
          offset,
          includeItems,
          includeCart,
          includeUnpaid,
          ...(query.status ? { status: query.status } : {}),
          ...(query.payment_provider
            ? { payment_provider: query.payment_provider }
            : {}),
        });

        let orders = result.orders.map(order => ({
          ...order,
          payment_method_badge: getPaymentMethodBadge(order),
        }));

        if (includeItems && orders.length > 0) {
          const variantIds = Array.from(
            new Set(
              orders
                .flatMap(order => order.items || [])
                .map(item => item.product_variant_id)
                .filter(
                  (id): id is string => typeof id === 'string' && id.length > 0
                )
            )
          );

          const normalizedPreferred = normalizeCurrencyCode(preferredCurrency);
          if (normalizedPreferred && variantIds.length > 0) {
            const preferredPriceMap: Map<string, PriceHistory> =
              await catalogService.listCurrentPricesForCurrency({
                variantIds,
                currency: normalizedPreferred,
              });

            const orderCurrencies = new Set<string>();
            for (const order of orders) {
              const orderCurrency = normalizeCurrencyCode(order.currency);
              if (orderCurrency && orderCurrency !== normalizedPreferred) {
                orderCurrencies.add(orderCurrency);
              }
            }

            const orderCurrencyMaps = new Map<
              string,
              Map<string, PriceHistory>
            >();
            for (const currency of orderCurrencies) {
              orderCurrencyMaps.set(
                currency,
                await catalogService.listCurrentPricesForCurrency({
                  variantIds,
                  currency,
                })
              );
            }

            orders = orders.map(order => {
              const orderCurrency = normalizeCurrencyCode(order.currency);
              if (!orderCurrency || orderCurrency === normalizedPreferred) {
                return order;
              }

              const orderPriceMap = orderCurrencyMaps.get(orderCurrency);
              const items = order.items || [];
              if (!orderPriceMap || items.length === 0) {
                return order;
              }

              let canDisplay = true;
              let weightedRatioSum = 0;
              let weightSum = 0;

              for (const item of items) {
                if (!item.product_variant_id) {
                  canDisplay = false;
                  break;
                }
                const preferredPrice = preferredPriceMap.get(
                  item.product_variant_id
                );
                const orderPrice = orderPriceMap.get(item.product_variant_id);
                const preferredBase = preferredPrice
                  ? Number(preferredPrice.price_cents)
                  : Number.NaN;
                const orderBase = orderPrice
                  ? Number(orderPrice.price_cents)
                  : Number.NaN;
                if (
                  !Number.isFinite(preferredBase) ||
                  !Number.isFinite(orderBase) ||
                  orderBase <= 0
                ) {
                  canDisplay = false;
                  break;
                }

                const itemTotal = Number(item.total_price_cents);
                if (!Number.isFinite(itemTotal)) {
                  canDisplay = false;
                  break;
                }

                const weight = itemTotal > 0 ? itemTotal : 1;
                weightedRatioSum += (preferredBase / orderBase) * weight;
                weightSum += weight;
              }

              const baseTotal = order.total_cents ?? order.subtotal_cents;
              if (
                !canDisplay ||
                weightSum === 0 ||
                baseTotal === null ||
                baseTotal === undefined
              ) {
                return order;
              }

              const displayTotalCents = Math.round(
                Number(baseTotal) * (weightedRatioSum / weightSum)
              );

              return {
                ...order,
                display_total_cents: displayTotalCents,
                display_currency: normalizedPreferred,
              };
            });
          }
        }

        return SuccessResponses.ok(reply, {
          orders,
          pagination: {
            limit,
            offset,
            total: result.total,
            hasMore: offset + limit < result.total,
          },
        });
      } catch (error) {
        Logger.error('Orders list failed:', error);
        return ErrorResponses.internalError(reply, 'Failed to list orders');
      }
    }
  );

  fastify.post(
    '/:orderId/credentials/reveal',
    {
      preHandler: [orderCredentialRevealRateLimit, authPreHandler],
      schema: {
        params: {
          type: 'object',
          required: ['orderId'],
          properties: {
            orderId: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user?.userId;
      if (!userId) {
        return ErrorResponses.unauthorized(reply, 'Authentication required');
      }

      const { orderId } = request.params as { orderId: string };
      const pool = getDatabasePool();
      const orderResult = await pool.query(
        'SELECT id, user_id, contact_email FROM orders WHERE id = $1',
        [orderId]
      );

      if (orderResult.rows.length === 0) {
        return ErrorResponses.notFound(reply, 'Order not found');
      }

      const order = orderResult.rows[0];
      if (order.user_id !== userId) {
        return ErrorResponses.notFound(reply, 'Order not found');
      }

      const subscriptionResult = await pool.query(
        `SELECT id, status, credentials_encrypted
         FROM subscriptions
         WHERE order_id = $1
           AND user_id = $2
         ORDER BY created_at ASC`,
        [orderId, userId]
      );
      const subscriptionWithCredentials =
        subscriptionResult.rows.find(
          row =>
            typeof row.credentials_encrypted === 'string' &&
            row.credentials_encrypted.trim().length > 0
        ) ?? null;
      if (!subscriptionWithCredentials?.credentials_encrypted) {
        await logCredentialRevealAttempt(request, {
          success: false,
          failureReason: 'credentials_missing',
          metadata: {
            order_id: orderId,
            source: 'order_entitlement_fallback',
          },
        });
        await orderComplianceEvidenceService.recordCredentialRevealEvidence({
          orderId,
          userId,
          customerEmail: order.contact_email ?? null,
          ipAddress: getRequestIp(request),
          success: false,
          evidence: {
            source: 'order_entitlement_fallback',
            failure_reason: 'credentials_missing',
            user_agent: getRequestUserAgent(request),
          },
        });
        return ErrorResponses.notFound(
          reply,
          'Credentials are not available for this order'
        );
      }

      return revealOrderItemCredentials({
        request,
        reply,
        orderId,
        subscriptionId: subscriptionWithCredentials.id as string,
      });
    }
  );

  fastify.post(
    '/:orderId/items/:subscriptionId/reveal',
    {
      preHandler: [orderCredentialRevealRateLimit, authPreHandler],
      schema: {
        params: {
          type: 'object',
          required: ['orderId', 'subscriptionId'],
          properties: {
            orderId: { type: 'string' },
            subscriptionId: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orderId, subscriptionId } = request.params as {
        orderId: string;
        subscriptionId: string;
      };
      return revealOrderItemCredentials({
        request,
        reply,
        orderId,
        subscriptionId,
      });
    }
  );

  fastify.post(
    '/:orderId/items/:subscriptionId/accept-rules',
    {
      preHandler: [authPreHandler],
      schema: {
        params: {
          type: 'object',
          required: ['orderId', 'subscriptionId'],
          properties: {
            orderId: { type: 'string' },
            subscriptionId: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user?.userId;
      if (!userId) {
        return ErrorResponses.unauthorized(reply, 'Authentication required');
      }
      const { orderId, subscriptionId } = request.params as {
        orderId: string;
        subscriptionId: string;
      };
      const parsedBody = acceptRulesBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return ErrorResponses.badRequest(
          reply,
          'Rules confirmation is required'
        );
      }
      const pool = getDatabasePool();
      const result = await pool.query(
        `SELECT o.contact_email, s.order_item_id, p.metadata AS product_metadata
         FROM orders o
         JOIN subscriptions s ON s.order_id = o.id
         LEFT JOIN product_variants pv ON pv.id = s.product_variant_id
         LEFT JOIN products p ON p.id = pv.product_id
         WHERE o.id = $1
           AND o.user_id = $2
           AND s.id = $3`,
        [orderId, userId, subscriptionId]
      );
      const row = result.rows[0] || null;
      if (!row) {
        return ErrorResponses.notFound(reply, 'Order item not found');
      }
      const upgradeOptions = normalizeUpgradeOptions(row.product_metadata);
      if (!upgradeOptions?.strict_rules) {
        return ErrorResponses.badRequest(
          reply,
          'Strict rules are not required for this item'
        );
      }
      const rulesVersion = upgradeOptions.strict_rules_version || 1;
      const existing = await pool.query(
        `SELECT created_at, ip_address, metadata
         FROM order_compliance_evidence_logs
         WHERE order_id = $1
           AND user_id = $2
           AND event_type = 'strict_rules_acceptance'
           AND metadata->>'subscription_id' = $3
           AND (metadata->>'rules_version')::int = $4
         ORDER BY created_at DESC
         LIMIT 1`,
        [orderId, userId, subscriptionId, rulesVersion]
      );
      if (existing.rows.length === 0) {
        await orderComplianceEvidenceService.recordGenericEvidence({
          orderId,
          eventType: 'strict_rules_acceptance',
          userId,
          customerEmail: row.contact_email ?? null,
          ipAddress: getRequestIp(request),
          accessEvidence: {
            accepted: true,
            accepted_at: new Date().toISOString(),
            user_agent: getRequestUserAgent(request),
          },
          metadata: {
            subscription_id: subscriptionId,
            order_item_id: row.order_item_id ?? null,
            rules_version: rulesVersion,
          },
        });
      }

      return SuccessResponses.ok(reply, {
        accepted: true,
        subscription_id: subscriptionId,
        rules_version: rulesVersion,
      });
    }
  );

  fastify.post(
    '/:orderId/items/:subscriptionId/activation-ready',
    {
      preHandler: [authPreHandler],
      schema: {
        params: {
          type: 'object',
          required: ['orderId', 'subscriptionId'],
          properties: {
            orderId: { type: 'string' },
            subscriptionId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['confirmed'],
          properties: {
            confirmed: { type: 'boolean' },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user?.userId;
      if (!userId) {
        return ErrorResponses.unauthorized(reply, 'Authentication required');
      }
      const { confirmed } = request.body as { confirmed: boolean };
      if (confirmed !== true) {
        return ErrorResponses.badRequest(
          reply,
          'Activation expiry acknowledgement is required'
        );
      }
      const { orderId, subscriptionId } = request.params as {
        orderId: string;
        subscriptionId: string;
      };
      const pool = getDatabasePool();
      const currentResult = await pool.query(
        `SELECT s.id, s.order_item_id, s.activation_handshake_state, o.contact_email
         FROM subscriptions s
         JOIN orders o ON o.id = s.order_id
         WHERE o.id = $1
           AND o.user_id = $2
           AND s.id = $3`,
        [orderId, userId, subscriptionId]
      );
      const current = currentResult.rows[0] || null;
      if (!current) {
        return ErrorResponses.notFound(reply, 'Order item not found');
      }
      if (current.activation_handshake_state === 'customer_ready') {
        return SuccessResponses.ok(reply, {
          subscription_id: subscriptionId,
          activation_handshake_state: 'customer_ready',
        });
      }
      if (current.activation_handshake_state !== 'awaiting_customer') {
        return reply.status(409).send({
          error: 'Conflict',
          code: 'INVALID_ACTIVATION_STATE',
          message:
            'Activation instructions are not awaiting customer confirmation',
          current_state: current.activation_handshake_state,
        });
      }
      const result = await pool.query(
        `UPDATE subscriptions
         SET activation_handshake_state = 'customer_ready',
             activation_customer_ready_at = NOW()
         WHERE id = $1
           AND activation_handshake_state = 'awaiting_customer'
         RETURNING id, order_item_id`,
        [subscriptionId]
      );
      const row = result.rows[0] || null;
      if (!row) {
        return reply.status(409).send({
          error: 'Conflict',
          code: 'INVALID_ACTIVATION_STATE',
          message:
            'Activation instructions are not awaiting customer confirmation',
          current_state: current.activation_handshake_state,
        });
      }

      const existingEvidence = await pool.query(
        `SELECT 1
         FROM order_compliance_evidence_logs
         WHERE order_id = $1
           AND user_id = $2
           AND event_type = 'activation_customer_ready'
           AND metadata->>'subscription_id' = $3
         LIMIT 1`,
        [orderId, userId, subscriptionId]
      );
      if (existingEvidence.rows.length === 0) {
        await orderComplianceEvidenceService.recordGenericEvidence({
          orderId,
          eventType: 'activation_customer_ready',
          userId,
          customerEmail: current.contact_email ?? null,
          ipAddress: getRequestIp(request),
          accessEvidence: {
            confirmed: true,
            confirmed_at: new Date().toISOString(),
            user_agent: getRequestUserAgent(request),
          },
          metadata: {
            subscription_id: subscriptionId,
            order_item_id: row.order_item_id ?? null,
          },
        });
      }

      return SuccessResponses.ok(reply, {
        subscription_id: subscriptionId,
        activation_handshake_state: 'customer_ready',
      });
    }
  );

  fastify.get(
    '/:orderId/subscription',
    {
      preHandler: [authPreHandler],
      schema: {
        params: {
          type: 'object',
          required: ['orderId'],
          properties: {
            orderId: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = request.user?.userId;
        if (!userId) {
          return ErrorResponses.unauthorized(reply, 'Authentication required');
        }

        const { orderId } = request.params as { orderId: string };
        const pool = getDatabasePool();
        const orderResult = await pool.query(
          'SELECT id, user_id, metadata FROM orders WHERE id = $1',
          [orderId]
        );

        if (orderResult.rows.length === 0) {
          return ErrorResponses.notFound(reply, 'Order not found');
        }

        const order = orderResult.rows[0];
        if (order.user_id !== userId) {
          return ErrorResponses.notFound(reply, 'Order not found');
        }

        const orderMetadata = parseMetadata(order.metadata);
        const entitlements = await orderEntitlementService.listForOrder({
          orderId,
          userId,
        });

        if (entitlements.length > 0) {
          const orderItemsResult = await pool.query(
            `SELECT oi.id,
                    COALESCE(p.name, oi.metadata->>'product_name') AS product_name,
                    COALESCE(pv.name, oi.metadata->>'variant_name') AS variant_name,
                    oi.term_months,
                    oi.metadata,
                    p.metadata AS product_metadata
             FROM order_items oi
             LEFT JOIN product_variants pv ON pv.id = oi.product_variant_id
             LEFT JOIN products p ON p.id::text = COALESCE(pv.product_id::text, oi.metadata->>'product_id')
             WHERE oi.order_id = $1`,
            [orderId]
          );
          const orderItemById = new Map<string, OrderItemContext>();
          for (const row of orderItemsResult.rows) {
            orderItemById.set(row.id as string, {
              id: row.id as string,
              product_name: row.product_name ?? null,
              variant_name: row.variant_name ?? null,
              term_months: row.term_months ?? null,
              metadata: parseMetadata(row.metadata),
              product_metadata: parseMetadata(row.product_metadata),
            });
          }

          const sourceSubscriptions = await pool.query(
            `SELECT s.id,
                    s.activation_handshake_state,
                    s.delivered_at,
                    s.activation_instructions_delivered_at,
                    s.activation_customer_ready_at,
                    s.activation_link_delivered_at,
                    ARRAY(
                      SELECT e.metadata->>'rules_version'
                      FROM order_compliance_evidence_logs e
                      WHERE e.order_id = s.order_id
                        AND e.user_id = s.user_id
                        AND e.event_type = 'strict_rules_acceptance'
                        AND e.metadata->>'subscription_id' = s.id::text
                    ) AS accepted_rules_versions
               FROM subscriptions s
              WHERE s.id = ANY($1::uuid[])`,
            [
              entitlements
                .map(entitlement => entitlement.source_subscription_id)
                .filter((id): id is string => Boolean(id)),
            ]
          );
          const sourceSubscriptionById = new Map<
            string,
            SourceSubscriptionContext
          >(
            sourceSubscriptions.rows.map(row => [
              row.id as string,
              {
                id: row.id as string,
                activation_handshake_state:
                  (row.activation_handshake_state as string | null) ?? null,
                delivered_at: (row.delivered_at as Date | null) ?? null,
                activation_instructions_delivered_at:
                  (row.activation_instructions_delivered_at as Date | null) ??
                  null,
                activation_customer_ready_at:
                  (row.activation_customer_ready_at as Date | null) ?? null,
                activation_link_delivered_at:
                  (row.activation_link_delivered_at as Date | null) ?? null,
                accepted_rules_versions: Array.isArray(
                  row.accepted_rules_versions
                )
                  ? row.accepted_rules_versions.map(String)
                  : [],
              },
            ])
          );

          const first = entitlements[0];
          if (!first) {
            return SuccessResponses.ok(reply, { subscription: null });
          }
          const orderItem = first.order_item_id
            ? orderItemById.get(first.order_item_id)
            : undefined;
          const mapped = toLegacySubscriptionPayload({
            entitlement: first,
            orderMetadata,
            ...(orderItem ? { orderItem } : {}),
            ...(first.source_subscription_id &&
            sourceSubscriptionById.get(first.source_subscription_id)
              ? {
                  sourceSubscription: sourceSubscriptionById.get(
                    first.source_subscription_id
                  ) as SourceSubscriptionContext,
                }
              : {}),
          });
          return SuccessResponses.ok(reply, { subscription: mapped });
        }

        const subscriptionResult = await pool.query(
          'SELECT id FROM subscriptions WHERE order_id = $1 ORDER BY created_at ASC LIMIT 1',
          [orderId]
        );

        if (subscriptionResult.rows.length === 0) {
          return SuccessResponses.ok(reply, { subscription: null });
        }

        const subscriptionId = subscriptionResult.rows[0]?.id as string;
        const subscriptionData = await subscriptionService.getSubscriptionById(
          subscriptionId,
          userId
        );

        if (!subscriptionData.success || !subscriptionData.data) {
          return SuccessResponses.ok(reply, { subscription: null });
        }

        const { credentials_encrypted: _credentials, ...safeSubscription } =
          subscriptionData.data;

        return SuccessResponses.ok(reply, {
          subscription: safeSubscription,
        });
      } catch (error) {
        Logger.error('Order subscription lookup failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to fetch order subscription'
        );
      }
    }
  );

  fastify.get(
    '/:orderId/subscriptions',
    {
      preHandler: [authPreHandler],
      schema: {
        params: {
          type: 'object',
          required: ['orderId'],
          properties: {
            orderId: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = request.user?.userId;
        if (!userId) {
          return ErrorResponses.unauthorized(reply, 'Authentication required');
        }

        const { orderId } = request.params as { orderId: string };
        const pool = getDatabasePool();
        const orderResult = await pool.query(
          'SELECT id, user_id, metadata FROM orders WHERE id = $1',
          [orderId]
        );

        if (orderResult.rows.length === 0) {
          return ErrorResponses.notFound(reply, 'Order not found');
        }

        const order = orderResult.rows[0];
        if (order.user_id !== userId) {
          return ErrorResponses.notFound(reply, 'Order not found');
        }

        const orderMetadata = parseMetadata(order.metadata);
        const entitlements = await orderEntitlementService.listForOrder({
          orderId,
          userId,
        });

        if (entitlements.length > 0) {
          const orderItemsResult = await pool.query(
            `SELECT oi.id,
                    COALESCE(p.name, oi.metadata->>'product_name') AS product_name,
                    COALESCE(pv.name, oi.metadata->>'variant_name') AS variant_name,
                    oi.term_months,
                    oi.metadata,
                    p.metadata AS product_metadata
             FROM order_items oi
             LEFT JOIN product_variants pv ON pv.id = oi.product_variant_id
             LEFT JOIN products p ON p.id::text = COALESCE(pv.product_id::text, oi.metadata->>'product_id')
             WHERE oi.order_id = $1`,
            [orderId]
          );
          const orderItemById = new Map<string, OrderItemContext>();
          for (const row of orderItemsResult.rows) {
            orderItemById.set(row.id as string, {
              id: row.id as string,
              product_name: row.product_name ?? null,
              variant_name: row.variant_name ?? null,
              term_months: row.term_months ?? null,
              metadata: parseMetadata(row.metadata),
              product_metadata: parseMetadata(row.product_metadata),
            });
          }

          const sourceSubscriptions = await pool.query(
            `SELECT s.id,
                    s.activation_handshake_state,
                    s.delivered_at,
                    s.activation_instructions_delivered_at,
                    s.activation_customer_ready_at,
                    s.activation_link_delivered_at,
                    ARRAY(
                      SELECT e.metadata->>'rules_version'
                      FROM order_compliance_evidence_logs e
                      WHERE e.order_id = s.order_id
                        AND e.user_id = s.user_id
                        AND e.event_type = 'strict_rules_acceptance'
                        AND e.metadata->>'subscription_id' = s.id::text
                    ) AS accepted_rules_versions
               FROM subscriptions s
              WHERE s.id = ANY($1::uuid[])`,
            [
              entitlements
                .map(entitlement => entitlement.source_subscription_id)
                .filter((id): id is string => Boolean(id)),
            ]
          );
          const sourceSubscriptionById = new Map<
            string,
            SourceSubscriptionContext
          >(
            sourceSubscriptions.rows.map(row => [
              row.id as string,
              {
                id: row.id as string,
                activation_handshake_state:
                  (row.activation_handshake_state as string | null) ?? null,
                delivered_at: (row.delivered_at as Date | null) ?? null,
                activation_instructions_delivered_at:
                  (row.activation_instructions_delivered_at as Date | null) ??
                  null,
                activation_customer_ready_at:
                  (row.activation_customer_ready_at as Date | null) ?? null,
                activation_link_delivered_at:
                  (row.activation_link_delivered_at as Date | null) ?? null,
                accepted_rules_versions: Array.isArray(
                  row.accepted_rules_versions
                )
                  ? row.accepted_rules_versions.map(String)
                  : [],
              },
            ])
          );

          const subscriptions = entitlements.map(entitlement =>
            toLegacySubscriptionPayload({
              entitlement,
              orderMetadata,
              ...(entitlement.order_item_id &&
              orderItemById.get(entitlement.order_item_id)
                ? {
                    orderItem: orderItemById.get(
                      entitlement.order_item_id
                    ) as OrderItemContext,
                  }
                : {}),
              ...(entitlement.source_subscription_id &&
              sourceSubscriptionById.get(entitlement.source_subscription_id)
                ? {
                    sourceSubscription: sourceSubscriptionById.get(
                      entitlement.source_subscription_id
                    ) as SourceSubscriptionContext,
                  }
                : {}),
            })
          );

          return SuccessResponses.ok(reply, { subscriptions });
        }

        const subscriptionResult = await pool.query(
          `SELECT s.id, p.metadata AS product_metadata
           FROM subscriptions s
           LEFT JOIN product_variants pv ON pv.id = s.product_variant_id
           LEFT JOIN products p ON p.id = pv.product_id
           WHERE s.order_id = $1
           ORDER BY s.created_at ASC`,
          [orderId]
        );

        if (subscriptionResult.rows.length === 0) {
          return SuccessResponses.ok(reply, { subscriptions: [] });
        }

        const subscriptions = [];
        for (const row of subscriptionResult.rows) {
          const subscriptionId = row.id as string;
          const subscriptionData =
            await subscriptionService.getSubscriptionById(
              subscriptionId,
              userId
            );
          if (subscriptionData.success && subscriptionData.data) {
            const { credentials_encrypted: _credentials, ...safeSubscription } =
              subscriptionData.data;
            subscriptions.push({
              ...safeSubscription,
              product_options: normalizeUpgradeOptions(row.product_metadata),
            });
          }
        }

        return SuccessResponses.ok(reply, { subscriptions });
      } catch (error) {
        Logger.error('Order subscriptions lookup failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to fetch order subscriptions'
        );
      }
    }
  );

  fastify.get(
    '/:orderId/entitlements',
    {
      preHandler: [authPreHandler],
      schema: {
        params: {
          type: 'object',
          required: ['orderId'],
          properties: {
            orderId: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = request.user?.userId;
        if (!userId) {
          return ErrorResponses.unauthorized(reply, 'Authentication required');
        }

        const { orderId } = request.params as { orderId: string };
        const pool = getDatabasePool();
        const orderResult = await pool.query(
          'SELECT id, user_id FROM orders WHERE id = $1',
          [orderId]
        );

        if (orderResult.rows.length === 0) {
          return ErrorResponses.notFound(reply, 'Order not found');
        }

        const order = orderResult.rows[0];
        if (order.user_id !== userId) {
          return ErrorResponses.notFound(reply, 'Order not found');
        }

        const entitlements = await orderEntitlementService.listForOrder({
          orderId,
          userId,
        });
        return SuccessResponses.ok(reply, {
          entitlements: entitlements.map(sanitizeEntitlement),
        });
      } catch (error) {
        Logger.error('Order entitlements lookup failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to fetch order entitlements'
        );
      }
    }
  );
}
