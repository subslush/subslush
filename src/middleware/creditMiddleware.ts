import { FastifyRequest, FastifyReply, FastifyPluginCallback } from 'fastify';
import { createRateLimitHandler } from './rateLimitMiddleware';
import { authPreHandler } from './authMiddleware';
import { enforceCsrfForCookieAuth } from './csrfMiddleware';
import { Logger } from '../utils/logger';
import { HttpStatus, ErrorResponses, sendError } from '../utils/response';

// Credit operations rate limiting
export const creditOperationRateLimit = createRateLimitHandler({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10, // 10 credit operations per minute
  keyGenerator: (request: FastifyRequest) => {
    const userId = request.user?.userId || request.ip;
    return `credit_ops:${userId}`;
  },
});

// Heavy credit operations rate limiting (spending, refunds)
export const heavyCreditOperationRateLimit = createRateLimitHandler({
  windowMs: 5 * 60 * 1000, // 5 minutes
  maxRequests: 20, // 20 operations per 5 minutes
  keyGenerator: (request: FastifyRequest) => {
    const userId = request.user?.userId || request.ip;
    return `heavy_credit_ops:${userId}`;
  },
});

// Admin credit operations rate limiting
export const adminCreditOperationRateLimit = createRateLimitHandler({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100, // 100 admin operations per minute
  keyGenerator: (request: FastifyRequest) => {
    const userId = request.user?.userId || request.ip;
    return `admin_credit_ops:${userId}`;
  },
});

// Credit query rate limiting (viewing balances, history)
export const creditQueryRateLimit = createRateLimitHandler({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 50, // 50 queries per minute
  keyGenerator: (request: FastifyRequest) => {
    const userId = request.user?.userId || request.ip;
    return `credit_query:${userId}`;
  },
});

const validateCreditAmountHandler = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const body = request.body as any;

  if (body && typeof body.amount !== 'undefined') {
    const amount = parseFloat(body.amount);

    // Validate amount is a positive number
    if (isNaN(amount) || amount <= 0) {
      return ErrorResponses.badRequest(
        reply,
        'Amount must be a positive number'
      );
    }

    // Validate maximum amount (configurable limit)
    const maxAmount = 10000; // $10,000 limit
    if (amount > maxAmount) {
      return sendError(
        reply,
        HttpStatus.BAD_REQUEST,
        'Bad Request',
        `Amount cannot exceed ${maxAmount}`,
        'AMOUNT_TOO_LARGE',
        { maxAmount }
      );
    }

    // Validate minimum amount
    const minAmount = 0.01; // $0.01 minimum
    if (amount < minAmount) {
      return sendError(
        reply,
        HttpStatus.BAD_REQUEST,
        'Bad Request',
        `Amount must be at least ${minAmount}`,
        'AMOUNT_TOO_SMALL',
        { minAmount }
      );
    }
  }
};

// Middleware to validate credit operation amounts
export const validateCreditAmount: FastifyPluginCallback = async fastify => {
  fastify.addHook('preHandler', validateCreditAmountHandler);
};

const validateCreditUserAccessHandler = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const params = request.params as any;
  const body =
    request.body && typeof request.body === 'object'
      ? (request.body as any)
      : undefined;
  const user = request.user;

  if (!user) {
    return ErrorResponses.unauthorized(reply, 'Authentication required');
  }

  // Check if user is admin (can access any user's data)
  if (user.role === 'admin') {
    return; // Allow access
  }

  // For non-admin users, ensure they can only access their own data
  const targetUserId = params.userId || body?.userId;

  if (targetUserId && targetUserId !== user.userId) {
    return ErrorResponses.forbidden(
      reply,
      'Cannot access other users credit data'
    );
  }

  // If no userId in params/body, add current user's ID to body for operations
  if (!targetUserId && body) {
    body.userId = user.userId;
  }
};

// Middleware to ensure user can only access their own credit data
export const validateCreditUserAccess: FastifyPluginCallback =
  async fastify => {
    fastify.addHook('preHandler', validateCreditUserAccessHandler);
  };

const requireAdminForCreditOpsHandler = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const user = request.user;

  if (!user) {
    return ErrorResponses.unauthorized(reply, 'Authentication required');
  }

  if (user.role !== 'admin') {
    return sendError(
      reply,
      HttpStatus.FORBIDDEN,
      'Forbidden',
      'Admin role required for this operation',
      'ADMIN_REQUIRED',
      { userRole: user.role }
    );
  }
};

// Middleware to validate admin role for admin operations
export const requireAdminForCreditOps: FastifyPluginCallback =
  async fastify => {
    fastify.addHook('preHandler', requireAdminForCreditOpsHandler);
  };

const auditCreditOperationHandler = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
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
};

// Middleware for audit logging credit operations
export const auditCreditOperation: FastifyPluginCallback = async fastify => {
  fastify.addHook('onResponse', auditCreditOperationHandler);
};

// Combined middleware for standard credit operations
export const creditOperationMiddleware = async (
  fastify: any
): Promise<void> => {
  fastify.addHook('preHandler', authPreHandler);
  fastify.addHook('preHandler', creditOperationRateLimit);
  fastify.addHook('preHandler', validateCreditAmountHandler);
  fastify.addHook('preHandler', validateCreditUserAccessHandler);
  fastify.addHook('onResponse', auditCreditOperationHandler);
};

// Combined middleware for heavy credit operations (spending, large deposits)
export const heavyCreditOperationMiddleware = async (
  fastify: any
): Promise<void> => {
  fastify.addHook('preHandler', authPreHandler);
  fastify.addHook('preHandler', heavyCreditOperationRateLimit);
  fastify.addHook('preHandler', validateCreditAmountHandler);
  fastify.addHook('preHandler', validateCreditUserAccessHandler);
  fastify.addHook('onResponse', auditCreditOperationHandler);
};

// Combined middleware for admin credit operations
export const adminCreditOperationMiddleware = async (
  fastify: any
): Promise<void> => {
  fastify.addHook('preHandler', authPreHandler);
  fastify.addHook('preHandler', requireAdminForCreditOpsHandler);
  fastify.addHook('preHandler', enforceCsrfForCookieAuth);
  fastify.addHook('preHandler', adminCreditOperationRateLimit);
  fastify.addHook('preHandler', validateCreditAmountHandler);
  fastify.addHook('onResponse', auditCreditOperationHandler);
};

// Combined middleware for credit queries (read-only operations)
export const creditQueryMiddleware = async (fastify: any): Promise<void> => {
  fastify.addHook('preHandler', authPreHandler);
  fastify.addHook('preHandler', validateCreditUserAccessHandler);
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
