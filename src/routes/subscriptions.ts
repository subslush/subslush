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
import { createRateLimitHandler } from '../middleware/rateLimitMiddleware';
import { Logger } from '../utils/logger';
import { validateSubscriptionId } from '../schemas/subscription';
import {
  ServiceType,
  ServicePlan,
  SubscriptionMetadata,
  CreateSubscriptionInput,
} from '../types/subscription';

// Rate limiting handlers (fixes plugin encapsulation issues)
const subscriptionQueryRateLimit = createRateLimitHandler({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 50,
  keyGenerator: (request: FastifyRequest) => {
    const userId = request.user?.userId || request.ip;
    return `sub_query:${userId}`;
  },
});

const subscriptionValidationRateLimit = createRateLimitHandler({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 20,
  keyGenerator: (request: FastifyRequest) => {
    const userId = request.user?.userId || request.ip;
    return `sub_validation:${userId}`;
  },
});

const subscriptionPurchaseRateLimit = createRateLimitHandler({
  windowMs: 5 * 60 * 1000, // 5 minutes
  maxRequests: 10,
  keyGenerator: (request: FastifyRequest) => {
    const userId = request.user?.userId || request.ip;
    return `sub_purchase:${userId}`;
  },
});

const subscriptionOperationRateLimit = createRateLimitHandler({
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
        'GET /subscriptions/:serviceType/:planId',
        'GET /subscriptions/related/:serviceType',
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

  // Get subscription details by service type and plan ID (no auth required for browse)
  fastify.get<{
    Params: { serviceType: string; planId: string };
  }>(
    '/:serviceType/:planId',
    async (
      request: FastifyRequest<{
        Params: { serviceType: string; planId: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { serviceType, planId } = request.params;

        Logger.info('Fetching subscription details', { serviceType, planId });

        // Validate service type
        const handler = serviceHandlerRegistry.getHandler(
          serviceType as ServiceType
        );
        if (!handler) {
          return ErrorResponses.notFound(reply, 'Service type not found');
        }

        // Get available plans for this service
        const plans = handler.getAvailablePlans();

        // Find the specific plan
        const plan = plans.find(p => p.plan === planId);
        if (!plan) {
          return ErrorResponses.notFound(reply, 'Subscription plan not found');
        }

        // Build detailed subscription response for the frontend
        const subscriptionDetail = {
          id: `${serviceType}-${planId}`,
          serviceType: serviceType,
          serviceName:
            serviceType.charAt(0).toUpperCase() + serviceType.slice(1),
          planName:
            plan.name || plan.plan.charAt(0).toUpperCase() + plan.plan.slice(1),
          planType: plan.plan,
          description: plan.description,
          longDescription:
            plan.description +
            '\n\nThis is a shared subscription plan that allows you to split costs with other users while maintaining individual access to your account.',
          price: plan.price,
          originalPrice: plan.price * 1.5, // Mock original price for discount display
          currency: 'EUR',
          features: plan.features,
          ratings: {
            average: 4.5 + Math.random() * 0.5, // Mock rating between 4.5-5.0
            count: Math.floor(Math.random() * 300) + 50, // Mock review count 50-350
          },
          host: {
            id: 'host-' + Math.random().toString(36).substr(2, 9),
            name: 'Verified Host',
            isVerified: true,
            joinDate: new Date(
              Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000
            ).toISOString(),
          },
          availability: {
            totalSeats: 6,
            occupiedSeats: Math.floor(Math.random() * 4) + 1,
            availableSeats: 6 - (Math.floor(Math.random() * 4) + 1),
          },
          reviews: [
            {
              id: 'review-1',
              author: 'John Doe',
              isVerified: true,
              rating: 5,
              comment:
                'Excellent service, very reliable and great value for money.',
              createdAt: new Date(
                Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000
              ).toISOString(),
            },
            {
              id: 'review-2',
              author: 'Sarah Smith',
              isVerified: false,
              rating: 4,
              comment:
                'Good experience overall, minor issues but responsive support.',
              createdAt: new Date(
                Date.now() - Math.random() * 60 * 24 * 60 * 60 * 1000
              ).toISOString(),
            },
          ],
          durationOptions: [
            { months: 1, totalPrice: plan.price, isRecommended: false },
            {
              months: 3,
              totalPrice: plan.price * 2.7,
              discount: 10,
              isRecommended: true,
            },
            {
              months: 6,
              totalPrice: plan.price * 5.1,
              discount: 15,
              isRecommended: false,
            },
            {
              months: 12,
              totalPrice: plan.price * 9.6,
              discount: 20,
              isRecommended: false,
            },
          ],
          badges: ['streaming', 'shared_plan', 'verified'],
        };

        return SuccessResponses.ok(reply, subscriptionDetail);
      } catch (error) {
        Logger.error('Failed to fetch subscription details:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to fetch subscription details'
        );
      }
    }
  );

  // Get related subscription plans by service type (no auth required)
  fastify.get<{
    Params: { serviceType: string };
    Querystring: { limit?: number; exclude?: string };
  }>(
    '/related/:serviceType',
    async (
      request: FastifyRequest<{
        Params: { serviceType: string };
        Querystring: { limit?: number; exclude?: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { serviceType } = request.params;
        const { limit = 4, exclude } = request.query;

        Logger.info('Fetching related plans', { serviceType, limit, exclude });

        const handlers = serviceHandlerRegistry.getAllHandlers();
        const relatedPlans = [];

        for (const handler of handlers) {
          // Skip the current service type for true "related" plans
          if (handler.serviceType === serviceType) {
            continue;
          }

          const plans = handler.getAvailablePlans();
          for (const plan of plans) {
            if (exclude && plan.plan === exclude) {
              continue;
            }

            relatedPlans.push({
              id: `${handler.serviceType}-${plan.plan}`,
              serviceType: handler.serviceType,
              serviceName:
                handler.serviceType.charAt(0).toUpperCase() +
                handler.serviceType.slice(1),
              planName:
                plan.name ||
                plan.plan.charAt(0).toUpperCase() + plan.plan.slice(1),
              price: plan.price,
            });

            if (relatedPlans.length >= limit) {
              break;
            }
          }

          if (relatedPlans.length >= limit) {
            break;
          }
        }

        return SuccessResponses.ok(reply, relatedPlans);
      } catch (error) {
        Logger.error('Failed to fetch related plans:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to fetch related plans'
        );
      }
    }
  );

  // Validate purchase eligibility (requires auth)
  fastify.post<{
    Body: {
      service_type: ServiceType;
      service_plan: ServicePlan;
      duration_months?: number;
    };
  }>(
    '/validate-purchase',
    {
      preHandler: [
        subscriptionValidationRateLimit, // Rate limit BEFORE auth
        authPreHandler,
      ],
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
          return ErrorResponses.unauthorized(reply, 'Authentication required');
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

  // Purchase subscription (requires auth) - CRITICAL ENDPOINT
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
      preHandler: [
        subscriptionPurchaseRateLimit, // Rate limit BEFORE auth
        authPreHandler,
      ],
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
          return ErrorResponses.unauthorized(reply, 'Authentication required');
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

  // Get user's subscriptions (requires auth)
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
      preHandler: [
        subscriptionQueryRateLimit, // Rate limit BEFORE auth
        authPreHandler,
      ],
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
          return ErrorResponses.unauthorized(reply, 'Authentication required');
        }

        // Handle page-based pagination (frontend sends 'page', backend uses 'offset')
        const page = (request.query as any).page || 1;
        const limit = request.query.limit || 10;
        const offset = (page - 1) * limit;

        const query = {
          ...(request.query.service_type && {
            service_type: request.query.service_type,
          }),
          ...(request.query.status && {
            status: request.query.status as any,
          }),
          limit,
          offset,
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

        const subscriptions = result.data || [];

        // Calculate proper pagination values
        // Note: In production, you'd get total count from database query
        const currentCount = subscriptions.length;
        const totalCount = currentCount; // Simplified for now
        const totalPages = Math.ceil(totalCount / limit);
        const hasNext = page < totalPages;
        const hasPrevious = page > 1;

        return SuccessResponses.ok(reply, {
          subscriptions,
          pagination: {
            page,
            limit,
            total: totalCount,
            totalPages,
            hasNext,
            hasPrevious,
          },
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

  // Get specific subscription (requires auth + ownership)
  fastify.get<{
    Params: { subscriptionId: string };
  }>(
    '/:subscriptionId',
    {
      preHandler: [
        subscriptionQueryRateLimit, // Rate limit BEFORE auth
        authPreHandler,
      ],
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
          return ErrorResponses.unauthorized(reply, 'Authentication required');
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

  // Cancel subscription (requires auth + ownership)
  fastify.delete<{
    Params: { subscriptionId: string };
    Body: { reason: string };
  }>(
    '/:subscriptionId',
    {
      preHandler: [
        subscriptionOperationRateLimit, // Rate limit BEFORE auth
        authPreHandler,
      ],
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
          return ErrorResponses.unauthorized(reply, 'Authentication required');
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
