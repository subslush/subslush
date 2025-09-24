import { FastifyRequest, FastifyReply, FastifyPluginCallback } from 'fastify';
import { rateLimitMiddleware } from './rateLimitMiddleware';
import { authPreHandler } from './authMiddleware';
import { Logger } from '../utils/logger';

// Credit operations rate limiting
export const creditOperationRateLimit = rateLimitMiddleware({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10, // 10 credit operations per minute
  keyGenerator: (request: FastifyRequest) => {
    const userId = request.user?.userId || request.ip;
    return `credit_ops:${userId}`;
  },
  skipFailedRequests: false,
});

// Heavy credit operations rate limiting (spending, refunds)
export const heavyCreditOperationRateLimit = rateLimitMiddleware({
  windowMs: 5 * 60 * 1000, // 5 minutes
  maxRequests: 20, // 20 operations per 5 minutes
  keyGenerator: (request: FastifyRequest) => {
    const userId = request.user?.userId || request.ip;
    return `heavy_credit_ops:${userId}`;
  },
  skipFailedRequests: false,
});

// Admin credit operations rate limiting
export const adminCreditOperationRateLimit = rateLimitMiddleware({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100, // 100 admin operations per minute
  keyGenerator: (request: FastifyRequest) => {
    const userId = request.user?.userId || request.ip;
    return `admin_credit_ops:${userId}`;
  },
  skipFailedRequests: false,
});

// Credit query rate limiting (viewing balances, history)
export const creditQueryRateLimit = rateLimitMiddleware({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 50, // 50 queries per minute
  keyGenerator: (request: FastifyRequest) => {
    const userId = request.user?.userId || request.ip;
    return `credit_query:${userId}`;
  },
  skipSuccessfulRequests: false,
});

// Middleware to validate credit operation amounts
export const validateCreditAmount: FastifyPluginCallback = async fastify => {
  fastify.addHook(
    'preHandler',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as any;

      if (body && typeof body.amount !== 'undefined') {
        const amount = parseFloat(body.amount);

        // Validate amount is a positive number
        if (isNaN(amount) || amount <= 0) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: 'Amount must be a positive number',
            code: 'INVALID_AMOUNT',
          });
        }

        // Validate maximum amount (configurable limit)
        const maxAmount = 10000; // $10,000 limit
        if (amount > maxAmount) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: `Amount cannot exceed ${maxAmount}`,
            code: 'AMOUNT_TOO_LARGE',
            maxAmount,
          });
        }

        // Validate minimum amount
        const minAmount = 0.01; // $0.01 minimum
        if (amount < minAmount) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: `Amount must be at least ${minAmount}`,
            code: 'AMOUNT_TOO_SMALL',
            minAmount,
          });
        }
      }
    }
  );
};

// Middleware to ensure user can only access their own credit data
export const validateCreditUserAccess: FastifyPluginCallback =
  async fastify => {
    fastify.addHook(
      'preHandler',
      async (request: FastifyRequest, reply: FastifyReply) => {
        const params = request.params as any;
        const body = request.body as any;
        const user = request.user;

        if (!user) {
          return reply.status(401).send({
            error: 'Unauthorized',
            message: 'Authentication required',
            code: 'AUTH_REQUIRED',
          });
        }

        // Check if user is admin (can access any user's data)
        if (user.role === 'admin') {
          return; // Allow access
        }

        // For non-admin users, ensure they can only access their own data
        const targetUserId = params.userId || body.userId;

        if (targetUserId && targetUserId !== user.userId) {
          return reply.status(403).send({
            error: 'Forbidden',
            message: 'Cannot access other users credit data',
            code: 'ACCESS_DENIED',
          });
        }

        // If no userId in params/body, add current user's ID to body for operations
        if (!targetUserId && body && typeof body === 'object') {
          body.userId = user.userId;
        }
      }
    );
  };

// Middleware to validate admin role for admin operations
export const requireAdminForCreditOps: FastifyPluginCallback =
  async fastify => {
    fastify.addHook(
      'preHandler',
      async (request: FastifyRequest, reply: FastifyReply) => {
        const user = request.user;

        if (!user) {
          return reply.status(401).send({
            error: 'Unauthorized',
            message: 'Authentication required',
            code: 'AUTH_REQUIRED',
          });
        }

        if (user.role !== 'admin') {
          return reply.status(403).send({
            error: 'Forbidden',
            message: 'Admin role required for this operation',
            code: 'ADMIN_REQUIRED',
            userRole: user.role,
          });
        }
      }
    );
  };

// Middleware for audit logging credit operations
export const auditCreditOperation: FastifyPluginCallback = async fastify => {
  fastify.addHook(
    'onResponse',
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Only log successful operations (2xx status codes)
      if (reply.statusCode >= 200 && reply.statusCode < 300) {
        const user = request.user;
        const body = request.body as any;
        const params = request.params as any;

        // Log the operation for audit purposes
        const auditData = {
          userId: user?.userId,
          userEmail: user?.email,
          operation: `${request.method} ${request.url}`,
          amount: body?.amount,
          targetUserId: params?.userId || body?.userId,
          timestamp: new Date().toISOString(),
          ip: request.ip,
          userAgent: request.headers['user-agent'],
        };

        Logger.info('Credit operation completed', auditData);
      }
    }
  );
};

// Combined middleware for standard credit operations
export const creditOperationMiddleware = async (
  fastify: any
): Promise<void> => {
  await fastify.register(authPreHandler);
  await fastify.register(creditOperationRateLimit);
  await fastify.register(validateCreditAmount);
  await fastify.register(validateCreditUserAccess);
  await fastify.register(auditCreditOperation);
};

// Combined middleware for heavy credit operations (spending, large deposits)
export const heavyCreditOperationMiddleware = async (
  fastify: any
): Promise<void> => {
  await fastify.register(authPreHandler);
  await fastify.register(heavyCreditOperationRateLimit);
  await fastify.register(validateCreditAmount);
  await fastify.register(validateCreditUserAccess);
  await fastify.register(auditCreditOperation);
};

// Combined middleware for admin credit operations
export const adminCreditOperationMiddleware = async (
  fastify: any
): Promise<void> => {
  await fastify.register(authPreHandler);
  await fastify.register(adminCreditOperationRateLimit);
  await fastify.register(requireAdminForCreditOps);
  await fastify.register(validateCreditAmount);
  await fastify.register(auditCreditOperation);
};

// Combined middleware for credit queries (read-only operations)
export const creditQueryMiddleware = async (fastify: any): Promise<void> => {
  await fastify.register(authPreHandler);
  await fastify.register(creditQueryRateLimit);
  await fastify.register(validateCreditUserAccess);
};

export default {
  creditOperationRateLimit,
  heavyCreditOperationRateLimit,
  adminCreditOperationRateLimit,
  creditQueryRateLimit,
  validateCreditAmount,
  validateCreditUserAccess,
  requireAdminForCreditOps,
  auditCreditOperation,
  creditOperationMiddleware,
  heavyCreditOperationMiddleware,
  adminCreditOperationMiddleware,
  creditQueryMiddleware,
};
