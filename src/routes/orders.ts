import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
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

type OrderItemContext = {
  id: string;
  product_name?: string | null;
  variant_name?: string | null;
  term_months?: number | null;
  metadata?: ParsedMetadata | null;
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

const toLegacySubscriptionPayload = (params: {
  entitlement: OrderEntitlement;
  orderMetadata: ParsedMetadata | null;
  orderItem?: OrderItemContext | undefined;
}) => {
  const itemMetadata = parseMetadata(params.orderItem?.metadata);
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

const sanitizeEntitlement = (entitlement: OrderEntitlement) => {
  const { credentials_encrypted: _credentials, ...safe } = entitlement;
  return {
    ...safe,
    has_credentials: Boolean(entitlement.credentials_encrypted),
  };
};

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

      const entitlements = await orderEntitlementService.listForOrder({
        orderId,
        userId,
      });
      const entitlementWithCredentials =
        entitlements.find(
          entitlement =>
            typeof entitlement.credentials_encrypted === 'string' &&
            entitlement.credentials_encrypted.trim().length > 0
        ) ?? null;

      if (entitlementWithCredentials?.credentials_encrypted) {
        const decrypted = credentialsEncryptionService.decryptFromString(
          entitlementWithCredentials.credentials_encrypted
        );
        if (!decrypted.wasEncrypted && decrypted.migratedPayload) {
          await orderEntitlementService.updateEntitlementCredentialsEncryptedValue(
            {
              entitlementId: entitlementWithCredentials.id,
              encryptedValue: decrypted.migratedPayload,
            }
          );
        }

        await logCredentialRevealAttempt(request, {
          subscriptionId:
            entitlementWithCredentials.source_subscription_id ?? null,
          success: true,
          metadata: {
            order_id: orderId,
            entitlement_id: entitlementWithCredentials.id,
            source: 'order_entitlement',
          },
        });
        await orderComplianceEvidenceService.recordCredentialRevealEvidence({
          orderId,
          userId,
          customerEmail: order.contact_email ?? null,
          ipAddress: getRequestIp(request),
          success: true,
          evidence: {
            source: 'order_entitlement',
            entitlement_id: entitlementWithCredentials.id,
            subscription_id:
              entitlementWithCredentials.source_subscription_id ?? null,
          },
        });

        return SuccessResponses.ok(reply, {
          order_id: orderId,
          entitlement_id: entitlementWithCredentials.id,
          subscription_id:
            entitlementWithCredentials.source_subscription_id ?? null,
          credentials: decrypted.plaintext,
        });
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
          },
        });
        return ErrorResponses.notFound(
          reply,
          'Credentials are not available for this order'
        );
      }

      const decrypted = credentialsEncryptionService.decryptFromString(
        subscriptionWithCredentials.credentials_encrypted
      );
      if (!decrypted.wasEncrypted && decrypted.migratedPayload) {
        await subscriptionService.updateSubscriptionCredentialsEncryptedValue({
          subscriptionId: subscriptionWithCredentials.id as string,
          encryptedValue: decrypted.migratedPayload,
        });
      }

      await logCredentialRevealAttempt(request, {
        subscriptionId: subscriptionWithCredentials.id as string,
        success: true,
        metadata: {
          order_id: orderId,
          source: 'subscription_fallback',
        },
      });
      await orderComplianceEvidenceService.recordCredentialRevealEvidence({
        orderId,
        userId,
        customerEmail: order.contact_email ?? null,
        ipAddress: getRequestIp(request),
        success: true,
        evidence: {
          source: 'subscription_fallback',
          subscription_id: subscriptionWithCredentials.id as string,
        },
      });

      return SuccessResponses.ok(reply, {
        order_id: orderId,
        entitlement_id: null,
        subscription_id: subscriptionWithCredentials.id as string,
        credentials: decrypted.plaintext,
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
      const userId = request.user?.userId;
      if (!userId) {
        return ErrorResponses.unauthorized(reply, 'Authentication required');
      }

      const { orderId, subscriptionId } = request.params as {
        orderId: string;
        subscriptionId: string;
      };
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
        [orderId, userId, subscriptionId]
      );
      const row = result.rows[0] || null;
      if (!row) {
        return ErrorResponses.notFound(reply, 'Order item not found');
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
            orderId,
            userId,
            subscriptionId,
            upgradeOptions.strict_rules_version || 1,
          ]
        );
        if (acceptedResult.rows.length === 0) {
          await logCredentialRevealAttempt(request, {
            subscriptionId,
            success: false,
            failureReason: 'strict_rules_not_accepted',
            metadata: {
              order_id: orderId,
              order_item_id: row.order_item_id ?? null,
            },
          });
          return ErrorResponses.badRequest(
            reply,
            'Strict rules must be accepted before revealing credentials'
          );
        }
      }

      if (!row.credentials_encrypted) {
        await logCredentialRevealAttempt(request, {
          subscriptionId,
          success: false,
          failureReason: 'credentials_missing',
          metadata: {
            order_id: orderId,
            order_item_id: row.order_item_id ?? null,
            source: 'subscription_item',
          },
        });
        await orderComplianceEvidenceService.recordCredentialRevealEvidence({
          orderId,
          userId,
          customerEmail: row.contact_email ?? null,
          ipAddress: getRequestIp(request),
          success: false,
          evidence: {
            source: 'subscription_item',
            subscription_id: subscriptionId,
            order_item_id: row.order_item_id ?? null,
            failure_reason: 'credentials_missing',
          },
        });
        return ErrorResponses.notFound(
          reply,
          'Credentials are not available for this item'
        );
      }

      const decrypted = credentialsEncryptionService.decryptFromString(
        row.credentials_encrypted
      );
      if (!decrypted.wasEncrypted && decrypted.migratedPayload) {
        await subscriptionService.updateSubscriptionCredentialsEncryptedValue({
          subscriptionId,
          encryptedValue: decrypted.migratedPayload,
        });
      }

      await logCredentialRevealAttempt(request, {
        subscriptionId,
        success: true,
        metadata: {
          order_id: orderId,
          order_item_id: row.order_item_id ?? null,
          source: 'subscription_item',
        },
      });
      await orderComplianceEvidenceService.recordCredentialRevealEvidence({
        orderId,
        userId,
        customerEmail: row.contact_email ?? null,
        ipAddress: getRequestIp(request),
        success: true,
        evidence: {
          source: 'subscription_item',
          subscription_id: subscriptionId,
          order_item_id: row.order_item_id ?? null,
        },
      });

      return SuccessResponses.ok(reply, {
        order_id: orderId,
        subscription_id: subscriptionId,
        order_item_id: row.order_item_id ?? null,
        credentials: decrypted.plaintext,
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
            user_agent: request.headers['user-agent'] ?? null,
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
      const result = await pool.query(
        `UPDATE subscriptions s
         SET activation_handshake_state = 'customer_ready',
             activation_customer_ready_at = NOW()
         FROM orders o
         WHERE o.id = s.order_id
           AND o.id = $1
           AND o.user_id = $2
           AND s.id = $3
           AND s.activation_handshake_state IN ('instructions_delivered', 'awaiting_customer')
         RETURNING s.id, s.order_item_id, o.contact_email`,
        [orderId, userId, subscriptionId]
      );
      const row = result.rows[0] || null;
      if (!row) {
        return ErrorResponses.badRequest(
          reply,
          'Activation instructions are not awaiting customer confirmation'
        );
      }

      await orderComplianceEvidenceService.recordGenericEvidence({
        orderId,
        eventType: 'activation_customer_ready',
        userId,
        customerEmail: row.contact_email ?? null,
        ipAddress: getRequestIp(request),
        accessEvidence: {
          confirmed: true,
          confirmed_at: new Date().toISOString(),
          user_agent: request.headers['user-agent'] ?? null,
        },
        metadata: {
          subscription_id: subscriptionId,
          order_item_id: row.order_item_id ?? null,
        },
      });

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
            `SELECT id, product_name, variant_name, term_months, metadata
             FROM order_items
             WHERE order_id = $1`,
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
            });
          }

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
            `SELECT id, product_name, variant_name, term_months, metadata
             FROM order_items
             WHERE order_id = $1`,
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
            });
          }

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
