import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authPreHandler } from '../middleware/authMiddleware';
import { createRateLimitHandler } from '../middleware/rateLimitMiddleware';
import { orderService } from '../services/orderService';
import { subscriptionService } from '../services/subscriptionService';
import { catalogService } from '../services/catalogService';
import { getDatabasePool } from '../config/database';
import { ErrorResponses, SuccessResponses } from '../utils/response';
import { Logger } from '../utils/logger';
import { getPaymentMethodBadge } from '../utils/orderHelpers';
import type { OrderStatus } from '../types/order';
import type { PriceHistory } from '../types/catalog';
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
        };

        const limit = Number(query.limit ?? 20);
        const offset = Number(query.offset ?? 0);
        const includeItems = parseBoolean(query.include_items) ?? false;
        const includeCart = parseBoolean(query.include_cart) ?? false;
        const preferredCurrency = resolveRequestCurrency(request);

        const result = await orderService.listOrdersForUser({
          userId,
          limit,
          offset,
          includeItems,
          includeCart,
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
}
