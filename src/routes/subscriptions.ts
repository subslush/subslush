import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { subscriptionService } from '../services/subscriptionService';
import { serviceHandlerRegistry } from '../services/handlers';
import { creditService } from '../services/creditService';
import { authPreHandler } from '../middleware/authMiddleware';
import {
  ErrorResponses,
  SuccessResponses,
  sendError,
  HttpStatus,
} from '../utils/response';
import { rateLimitMiddleware } from '../middleware/rateLimitMiddleware';
import { Logger } from '../utils/logger';
import { validateSubscriptionId } from '../schemas/subscription';
import {
  ServiceType,
  ServicePlan,
  SubscriptionMetadata,
  CreateSubscriptionInput,
} from '../types/subscription';

// Rate limiting configurations
const subscriptionQueryRateLimit = rateLimitMiddleware({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 50,
  keyGenerator: (request: FastifyRequest) => {
    const userId = request.user?.userId || request.ip;
    return `sub_query:${userId}`;
  },
});

const subscriptionValidationRateLimit = rateLimitMiddleware({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 20,
  keyGenerator: (request: FastifyRequest) => {
    const userId = request.user?.userId || request.ip;
    return `sub_validation:${userId}`;
  },
});

const subscriptionPurchaseRateLimit = rateLimitMiddleware({
  windowMs: 5 * 60 * 1000, // 5 minutes
  maxRequests: 10,
  keyGenerator: (request: FastifyRequest) => {
    const userId = request.user?.userId || request.ip;
    return `sub_purchase:${userId}`;
  },
});

const subscriptionOperationRateLimit = rateLimitMiddleware({
  windowMs: 5 * 60 * 1000, // 5 minutes
  maxRequests: 10,
  keyGenerator: (request: FastifyRequest) => {
    const userId = request.user?.userId || request.ip;
    return `sub_operation:${userId}`;
  },
});

// Fastify JSON Schema definitions
const FastifySchemas = {
  // Parameter schemas
  subscriptionIdParam: {
    type: 'object',
    properties: {
      subscriptionId: { type: 'string', format: 'uuid' },
    },
    required: ['subscriptionId'],
  } as const,

  // Body schemas
  purchaseSubscriptionInput: {
    type: 'object',
    required: ['service_type', 'service_plan'],
    properties: {
      service_type: {
        type: 'string',
        enum: ['spotify', 'netflix', 'tradingview'],
      },
      service_plan: {
        type: 'string',
        enum: ['premium', 'family', 'basic', 'standard', 'pro', 'individual'],
      },
      duration_months: {
        type: 'number',
        minimum: 1,
        maximum: 12,
        default: 1,
      },
      metadata: {
        type: 'object',
        additionalProperties: true,
      },
      auto_renew: {
        type: 'boolean',
        default: false,
      },
    },
  } as const,

  validatePurchaseInput: {
    type: 'object',
    required: ['service_type', 'service_plan'],
    properties: {
      service_type: {
        type: 'string',
        enum: ['spotify', 'netflix', 'tradingview'],
      },
      service_plan: {
        type: 'string',
        enum: ['premium', 'family', 'basic', 'standard', 'pro', 'individual'],
      },
      duration_months: {
        type: 'number',
        minimum: 1,
        maximum: 12,
        default: 1,
      },
    },
  } as const,

  mySubscriptionsQuery: {
    type: 'object',
    properties: {
      service_type: {
        type: 'string',
        enum: ['spotify', 'netflix', 'tradingview'],
      },
      status: {
        type: 'string',
        enum: ['active', 'expired', 'cancelled', 'pending'],
      },
      limit: {
        type: 'number',
        minimum: 1,
        maximum: 100,
        default: 20,
      },
      offset: {
        type: 'number',
        minimum: 0,
        default: 0,
      },
      include_expired: {
        type: 'boolean',
        default: false,
      },
    },
  } as const,

  cancelSubscriptionInput: {
    type: 'object',
    required: ['reason'],
    properties: {
      reason: {
        type: 'string',
        minLength: 10,
        maxLength: 500,
      },
    },
  } as const,
};

// Helper functions
function calculateEndDate(durationMonths: number): Date {
  const now = new Date();
  const endDate = new Date(now);
  endDate.setMonth(endDate.getMonth() + durationMonths);
  return endDate;
}

function calculateRenewalDate(durationMonths: number): Date {
  const endDate = calculateEndDate(durationMonths);
  const renewalDate = new Date(endDate);
  renewalDate.setDate(renewalDate.getDate() - 7);
  return renewalDate;
}

// Main route handler
export async function subscriptionRoutes(
  fastify: FastifyInstance
): Promise<void> {
  // API info endpoint (no auth required)
  fastify.get('/', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      message: 'Subscription Management API',
      version: '1.0',
      endpoints: [
        'GET /subscriptions/available',
        'POST /subscriptions/validate-purchase',
        'POST /subscriptions/purchase',
        'GET /subscriptions/my-subscriptions',
        'GET /subscriptions/:subscriptionId',
        'DELETE /subscriptions/:subscriptionId',
        'GET /subscriptions/health',
      ],
    });
  });

  // Get available subscription plans (no auth required)
  fastify.get(
    '/available',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        Logger.info('Fetching available subscription plans');

        const serviceQuery = _request.query as {
          service_type?: ServiceType;
          region?: string;
        };
        const handlers = serviceHandlerRegistry.getAllHandlers();

        const services: Record<string, any[]> = {};
        let totalPlans = 0;

        for (const handler of handlers) {
          // Filter by service type if specified
          if (
            serviceQuery.service_type &&
            handler.serviceType !== serviceQuery.service_type
          ) {
            continue;
          }

          const plans = handler.getAvailablePlans();
          services[handler.serviceType] = plans;
          totalPlans += plans.length;
        }

        return SuccessResponses.ok(reply, {
          services,
          total_plans: totalPlans,
        });
      } catch (error) {
        Logger.error('Failed to fetch available plans:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to fetch available plans'
        );
      }
    }
  );

  // Validate purchase eligibility (requires auth)
  fastify.register(async fastify => {
    await fastify.register(subscriptionValidationRateLimit);

    fastify.post<{
      Body: {
        service_type: ServiceType;
        service_plan: ServicePlan;
        duration_months?: number;
      };
    }>(
      '/validate-purchase',
      {
        preHandler: authPreHandler,
        schema: {
          body: FastifySchemas.validatePurchaseInput,
        },
      },
      async (
        request: FastifyRequest<{
          Body: {
            service_type: ServiceType;
            service_plan: ServicePlan;
            duration_months?: number;
          };
        }>,
        reply: FastifyReply
      ) => {
        try {
          const userId = request.user?.userId;
          if (!userId) {
            return ErrorResponses.unauthorized(
              reply,
              'Authentication required'
            );
          }

          const {
            service_type,
            service_plan,
            duration_months = 1,
          } = request.body;

          Logger.info('Validating purchase eligibility', {
            userId,
            serviceType: service_type,
            servicePlan: service_plan,
            duration: duration_months,
          });

          // Get handler for pricing
          const handler = serviceHandlerRegistry.getHandler(service_type);
          if (!handler) {
            return ErrorResponses.badRequest(reply, 'Invalid service type');
          }

          // Get pricing
          let price: number;
          try {
            price = handler.getPlanPricing(service_plan);
          } catch {
            return ErrorResponses.badRequest(
              reply,
              'Invalid service plan for this service'
            );
          }

          // Check if user can purchase
          const validation = await subscriptionService.canPurchaseSubscription(
            userId,
            service_type,
            service_plan
          );

          if (!validation.canPurchase) {
            return SuccessResponses.ok(reply, {
              can_purchase: false,
              reason: validation.reason,
              required_credits: price,
              existing_subscription: validation.existing_subscription,
            });
          }

          // Get user balance
          const balance = await creditService.getUserBalance(userId);
          if (!balance) {
            return ErrorResponses.internalError(
              reply,
              'Failed to retrieve user balance'
            );
          }

          // Check if user has enough credits
          if (balance.availableBalance < price) {
            return SuccessResponses.ok(reply, {
              can_purchase: false,
              reason: `Insufficient credits. Required: ${price}, Available: ${balance.availableBalance}`,
              required_credits: price,
              user_balance: balance.availableBalance,
            });
          }

          // Calculate dates
          const startDate = new Date();
          const endDate = calculateEndDate(duration_months);
          const renewalDate = calculateRenewalDate(duration_months);

          return SuccessResponses.ok(reply, {
            can_purchase: true,
            plan_details: handler.getPlanDetails(service_plan),
            required_credits: price,
            user_balance: balance.availableBalance,
            balance_after: balance.availableBalance - price,
            subscription_details: {
              start_date: startDate,
              end_date: endDate,
              renewal_date: renewalDate,
            },
          });
        } catch (error) {
          Logger.error('Purchase validation failed:', error);
          return ErrorResponses.internalError(
            reply,
            'Failed to validate purchase'
          );
        }
      }
    );
  });

  // Purchase subscription (requires auth) - CRITICAL ENDPOINT
  fastify.register(async fastify => {
    await fastify.register(subscriptionPurchaseRateLimit);

    fastify.post<{
      Body: {
        service_type: ServiceType;
        service_plan: ServicePlan;
        duration_months?: number;
        metadata?: SubscriptionMetadata;
        auto_renew?: boolean;
      };
    }>(
      '/purchase',
      {
        preHandler: authPreHandler,
        schema: {
          body: FastifySchemas.purchaseSubscriptionInput,
        },
      },
      async (
        request: FastifyRequest<{
          Body: {
            service_type: ServiceType;
            service_plan: ServicePlan;
            duration_months?: number;
            metadata?: SubscriptionMetadata;
            auto_renew?: boolean;
          };
        }>,
        reply: FastifyReply
      ) => {
        try {
          const userId = request.user?.userId;
          if (!userId) {
            return ErrorResponses.unauthorized(
              reply,
              'Authentication required'
            );
          }

          const {
            service_type,
            service_plan,
            duration_months = 1,
            metadata,
          } = request.body;

          Logger.info('Processing subscription purchase', {
            userId,
            serviceType: service_type,
            servicePlan: service_plan,
            duration: duration_months,
          });

          // Re-validate purchase eligibility to prevent race conditions
          const validation = await subscriptionService.canPurchaseSubscription(
            userId,
            service_type,
            service_plan
          );

          if (!validation.canPurchase) {
            return sendError(
              reply,
              HttpStatus.CONFLICT,
              'Purchase Not Allowed',
              validation.reason || 'Purchase validation failed',
              'PURCHASE_VALIDATION_FAILED',
              { existingSubscription: validation.existing_subscription }
            );
          }

          // Get handler and pricing
          const handler = serviceHandlerRegistry.getHandler(service_type);
          if (!handler) {
            return ErrorResponses.badRequest(reply, 'Invalid service type');
          }

          let price: number;
          try {
            price = handler.getPlanPricing(service_plan);
          } catch {
            return ErrorResponses.badRequest(
              reply,
              'Invalid service plan for this service'
            );
          }

          // Step 1: Deduct credits (atomic operation)
          const creditResult = await creditService.spendCredits(
            userId,
            price,
            `Subscription purchase: ${service_type} ${service_plan}`,
            {
              service_type,
              service_plan,
              duration_months,
              purchase_type: 'subscription',
            }
          );

          if (!creditResult.success) {
            Logger.error('Credit deduction failed', {
              userId,
              price,
              error: creditResult.error,
            });

            if (creditResult.error?.includes('Insufficient')) {
              return sendError(
                reply,
                HttpStatus.PAYMENT_REQUIRED,
                'Insufficient Credits',
                creditResult.error,
                'INSUFFICIENT_CREDITS',
                { required: price }
              );
            }

            return ErrorResponses.badRequest(
              reply,
              creditResult.error || 'Credit deduction failed'
            );
          }

          // Step 2: Create subscription
          const subscriptionInput: CreateSubscriptionInput = {
            service_type,
            service_plan,
            start_date: new Date(),
            end_date: calculateEndDate(duration_months),
            renewal_date: calculateRenewalDate(duration_months),
            ...(metadata && { metadata }),
          };

          const subResult = await subscriptionService.createSubscription(
            userId,
            subscriptionInput
          );

          // Step 3: If subscription creation fails, REFUND credits
          if (!subResult.success) {
            Logger.error('Subscription creation failed, refunding credits', {
              userId,
              transactionId: creditResult.transaction!.id,
              error: subResult.error,
            });

            await creditService.refundCredits(
              userId,
              price,
              'Subscription creation failed - automatic refund',
              creditResult.transaction!.id,
              {
                original_transaction_id: creditResult.transaction!.id,
                reason: 'automatic_rollback',
                service_type,
                service_plan,
              }
            );

            return ErrorResponses.internalError(
              reply,
              'Subscription creation failed, credits refunded'
            );
          }

          Logger.info('Subscription purchased successfully', {
            userId,
            subscriptionId: subResult.data!.id,
            price,
            transactionId: creditResult.transaction!.id,
          });

          return SuccessResponses.created(
            reply,
            {
              subscription: subResult.data,
              transaction: {
                transaction_id: creditResult.transaction!.id,
                amount_debited: price,
                balance_after: creditResult.balance!.availableBalance,
              },
            },
            'Subscription purchased successfully'
          );
        } catch (error) {
          Logger.error('Purchase flow error:', error);
          return ErrorResponses.internalError(
            reply,
            'Failed to process purchase'
          );
        }
      }
    );
  });

  // Get user's subscriptions (requires auth)
  fastify.register(async fastify => {
    await fastify.register(subscriptionQueryRateLimit);

    fastify.get<{
      Querystring: {
        service_type?: ServiceType;
        status?: string;
        limit?: number;
        offset?: number;
        include_expired?: boolean;
      };
    }>(
      '/my-subscriptions',
      {
        preHandler: authPreHandler,
        schema: {
          querystring: FastifySchemas.mySubscriptionsQuery,
        },
      },
      async (
        request: FastifyRequest<{
          Querystring: {
            service_type?: ServiceType;
            status?: string;
            limit?: number;
            offset?: number;
            include_expired?: boolean;
          };
        }>,
        reply: FastifyReply
      ) => {
        try {
          const userId = request.user?.userId;
          if (!userId) {
            return ErrorResponses.unauthorized(
              reply,
              'Authentication required'
            );
          }

          const query = {
            ...(request.query.service_type && {
              service_type: request.query.service_type,
            }),
            ...(request.query.status && {
              status: request.query.status as any,
            }),
            limit: request.query.limit || 20,
            offset: request.query.offset || 0,
            include_expired: request.query.include_expired || false,
          };

          Logger.info('Fetching user subscriptions', { userId, query });

          const result = await subscriptionService.getUserSubscriptions(
            userId,
            query
          );

          if (!result.success) {
            return ErrorResponses.internalError(
              reply,
              'Failed to retrieve subscriptions'
            );
          }

          const subscriptions = result.data;

          // For now, we'll calculate count from the returned data
          // In a production scenario, you'd implement a separate count method
          const totalCount = subscriptions?.length || 0;

          const hasMore = query.offset + subscriptions!.length < totalCount;

          return SuccessResponses.ok(reply, {
            subscriptions: subscriptions || [],
            count: subscriptions?.length || 0,
            total: totalCount,
            has_more: hasMore,
          });
        } catch (error) {
          Logger.error('Failed to fetch user subscriptions:', error);
          return ErrorResponses.internalError(
            reply,
            'Failed to retrieve subscriptions'
          );
        }
      }
    );
  });

  // Get specific subscription (requires auth + ownership)
  fastify.register(async fastify => {
    await fastify.register(subscriptionQueryRateLimit);

    fastify.get<{
      Params: { subscriptionId: string };
    }>(
      '/:subscriptionId',
      {
        preHandler: authPreHandler,
        schema: {
          params: FastifySchemas.subscriptionIdParam,
        },
      },
      async (
        request: FastifyRequest<{ Params: { subscriptionId: string } }>,
        reply: FastifyReply
      ) => {
        try {
          const userId = request.user?.userId;
          if (!userId) {
            return ErrorResponses.unauthorized(
              reply,
              'Authentication required'
            );
          }

          const { subscriptionId } = request.params;

          if (!validateSubscriptionId(subscriptionId)) {
            return ErrorResponses.badRequest(
              reply,
              'Invalid subscription ID format'
            );
          }

          Logger.info('Fetching subscription by ID', {
            userId,
            subscriptionId,
          });

          const result = await subscriptionService.getSubscriptionById(
            subscriptionId,
            userId
          );

          if (!result.success || !result.data) {
            return ErrorResponses.notFound(reply, 'Subscription not found');
          }

          return SuccessResponses.ok(reply, {
            subscription: result.data,
          });
        } catch (error) {
          Logger.error('Failed to fetch subscription:', error);
          return ErrorResponses.internalError(
            reply,
            'Failed to retrieve subscription'
          );
        }
      }
    );
  });

  // Cancel subscription (requires auth + ownership)
  fastify.register(async fastify => {
    await fastify.register(subscriptionOperationRateLimit);

    fastify.delete<{
      Params: { subscriptionId: string };
      Body: { reason: string };
    }>(
      '/:subscriptionId',
      {
        preHandler: authPreHandler,
        schema: {
          params: FastifySchemas.subscriptionIdParam,
          body: FastifySchemas.cancelSubscriptionInput,
        },
      },
      async (
        request: FastifyRequest<{
          Params: { subscriptionId: string };
          Body: { reason: string };
        }>,
        reply: FastifyReply
      ) => {
        try {
          const userId = request.user?.userId;
          if (!userId) {
            return ErrorResponses.unauthorized(
              reply,
              'Authentication required'
            );
          }

          const { subscriptionId } = request.params;
          const { reason } = request.body;

          if (!validateSubscriptionId(subscriptionId)) {
            return ErrorResponses.badRequest(
              reply,
              'Invalid subscription ID format'
            );
          }

          Logger.info('Cancelling subscription', {
            userId,
            subscriptionId,
            reason,
          });

          const result = await subscriptionService.cancelSubscription(
            subscriptionId,
            userId,
            reason
          );

          if (!result.success) {
            if (result.error?.includes('not found')) {
              return ErrorResponses.notFound(reply, 'Subscription not found');
            }
            return ErrorResponses.badRequest(
              reply,
              result.error || 'Failed to cancel subscription'
            );
          }

          return SuccessResponses.ok(reply, {
            message: 'Subscription cancelled successfully',
            subscription_id: subscriptionId,
          });
        } catch (error) {
          Logger.error('Failed to cancel subscription:', error);
          return ErrorResponses.internalError(
            reply,
            'Failed to cancel subscription'
          );
        }
      }
    );
  });

  // Health check endpoint
  fastify.get(
    '/health',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const [serviceHealth, handlerHealth] = await Promise.all([
          subscriptionService.healthCheck(),
          serviceHandlerRegistry.healthCheck(),
        ]);

        const isHealthy =
          serviceHealth && Object.values(handlerHealth).every(Boolean);

        return SuccessResponses.ok(reply, {
          status: isHealthy ? 'healthy' : 'unhealthy',
          service: serviceHealth,
          handlers: handlerHealth,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        Logger.error('Health check failed:', error);
        return sendError(
          reply,
          HttpStatus.SERVICE_UNAVAILABLE,
          'Service Unavailable',
          'Health check failed',
          'HEALTH_CHECK_ERROR',
          {
            status: 'error',
            timestamp: new Date().toISOString(),
          }
        );
      }
    }
  );
}
