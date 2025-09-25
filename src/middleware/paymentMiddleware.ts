import { FastifyRequest, FastifyReply, FastifyPluginCallback } from 'fastify';
import { nowpaymentsClient } from '../utils/nowpaymentsClient';
import { Logger } from '../utils/logger';
import { ErrorResponses } from '../utils/response';
import { rateLimitMiddleware } from './rateLimitMiddleware';

// Payment-specific rate limiting middleware
export const paymentRateLimit = rateLimitMiddleware({
  windowMs: 10 * 60 * 1000, // 10 minutes
  maxRequests: 5, // 5 payment creation attempts per 10 minutes
  keyGenerator: (request: FastifyRequest) => `payment:${request.ip}:${(request as any).user?.id || 'anonymous'}`,
  skipSuccessfulRequests: false,
  onLimitReached: (request: FastifyRequest) => {
    Logger.warn(`Payment rate limit exceeded for IP: ${request.ip}`, {
      ip: request.ip,
      userId: (request as any).user?.id,
    });
  },
});

// Webhook rate limiting (more restrictive)
export const webhookRateLimit = rateLimitMiddleware({
  windowMs: 1 * 60 * 1000, // 1 minute
  maxRequests: 50, // 50 webhook requests per minute (NOWPayments can send multiple)
  keyGenerator: (request: FastifyRequest) => `webhook:${request.ip}`,
  skipSuccessfulRequests: true,
});

// Validation middleware for webhook signatures
export const validateWebhookSignature: FastifyPluginCallback = async (fastify) => {
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    // Only apply to webhook routes
    if (!request.url.includes('/webhook')) {
      return;
    }

    try {
      const signature = request.headers['x-nowpayments-sig'] as string;

      if (!signature) {
        Logger.error('Missing webhook signature');
        return ErrorResponses.unauthorized(reply, 'Missing webhook signature');
      }

      // Get raw body for signature verification
      const rawBody = JSON.stringify(request.body);

      // Verify signature
      const isValidSignature = nowpaymentsClient.verifyIPNSignature(rawBody, signature);

      if (!isValidSignature) {
        Logger.error('Invalid webhook signature', {
          signature,
          ip: request.ip,
        });
        return ErrorResponses.unauthorized(reply, 'Invalid webhook signature');
      }

      Logger.debug('Webhook signature validated successfully');
    } catch (error) {
      Logger.error('Error validating webhook signature:', error);
      return ErrorResponses.internalError(reply, 'Webhook validation failed');
    }
  });
};

// Payment amount validation middleware
export const validatePaymentAmount: FastifyPluginCallback = async (fastify) => {
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    // Only apply to payment creation routes
    if (!request.url.includes('/create-invoice') || request.method !== 'POST') {
      return;
    }

    try {
      const body = request.body as any;
      const creditAmount = body?.creditAmount;

      if (!creditAmount || typeof creditAmount !== 'number') {
        return ErrorResponses.badRequest(reply, 'Invalid credit amount');
      }

      // Validate amount limits
      if (creditAmount < 1) {
        return ErrorResponses.badRequest(reply, 'Credit amount must be at least $1');
      }

      if (creditAmount > 10000) {
        return ErrorResponses.badRequest(reply, 'Credit amount cannot exceed $10,000');
      }

      // Validate currency if provided
      if (body.currency) {
        const currency = body.currency.toLowerCase();
        const isSupported = await nowpaymentsClient.isCurrencySupported(currency);

        if (!isSupported) {
          return ErrorResponses.badRequest(reply, `Currency ${currency.toUpperCase()} is not supported`);
        }
      }
    } catch (error) {
      Logger.error('Error validating payment amount:', error);
      return ErrorResponses.internalError(reply, 'Payment validation failed');
    }
  });
};

// User balance check middleware (optional - warn if user has high balance)
export const checkUserBalance: FastifyPluginCallback = async (fastify) => {
  fastify.addHook('preHandler', async (request: FastifyRequest, _reply: FastifyReply) => {
    // Only apply to payment creation routes
    if (!request.url.includes('/create-invoice') || request.method !== 'POST') {
      return;
    }

    try {
      const user = (request as any).user;
      if (!user) {
        return; // Will be caught by auth middleware
      }

      // Import credit service here to avoid circular dependencies
      const { creditService } = await import('../services/creditService');
      const balance = await creditService.getUserBalance(user.id);

      if (balance && balance.totalBalance > 5000) {
        Logger.info(`User with high balance creating payment`, {
          userId: user.id,
          currentBalance: balance.totalBalance,
          requestedAmount: (request.body as any)?.creditAmount,
        });

        // Could add additional validation or warnings here
        // For now, just log and continue
      }
    } catch (error) {
      Logger.error('Error checking user balance:', error);
      // Don't block the request for balance check failures
    }
  });
};

// Audit logging middleware for payment operations
export const auditPaymentOperations: FastifyPluginCallback = async (fastify) => {
  fastify.addHook('preHandler', async (request: FastifyRequest) => {
    // Store request timestamp for audit
    (request as any).requestStartTime = Date.now();
  });

  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const duration = Date.now() - ((request as any).requestStartTime || 0);
      const user = (request as any).user;

      // Log all payment-related operations
      if (request.url.includes('/api/v1/payments/')) {
        Logger.info('Payment operation completed', {
          method: request.method,
          url: request.url,
          userId: user?.id,
          ip: request.ip,
          userAgent: request.headers['user-agent'],
          statusCode: reply.statusCode,
          duration,
          requestBody: request.method === 'POST' ? request.body : undefined,
        });
      }

      // Special logging for webhook operations
      if (request.url.includes('/webhook')) {
        Logger.info('Webhook processed', {
          ip: request.ip,
          statusCode: reply.statusCode,
          duration,
          paymentId: (request.body as any)?.payment_id,
          paymentStatus: (request.body as any)?.payment_status,
        });
      }
    } catch (error) {
      Logger.error('Error in audit logging:', error);
    }
  });
};

// Security headers for payment endpoints
export const paymentSecurityHeaders: FastifyPluginCallback = async (fastify) => {
  fastify.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply) => {
    // Add security headers for payment routes
    if (request.url.includes('/api/v1/payments/')) {
      reply.headers({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      });
    }

    // Special headers for webhook endpoints (less restrictive for NOWPayments)
    if (request.url.includes('/webhook')) {
      reply.headers({
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
      });
    }
  });
};

// Error handling for payment-specific errors
export const paymentErrorHandler: FastifyPluginCallback = async (fastify) => {
  fastify.setErrorHandler(async (error: any, request: FastifyRequest, reply: FastifyReply) => {
    // Handle payment-specific errors
    if (request.url.includes('/api/v1/payments/')) {
      Logger.error('Payment endpoint error:', {
        error: error.message,
        stack: error.stack,
        url: request.url,
        method: request.method,
        userId: (request as any).user?.id,
        ip: request.ip,
      });

      // Don't expose internal errors to users
      if (error.statusCode >= 500) {
        return ErrorResponses.internalError(reply, 'Payment service temporarily unavailable');
      }
    }

    // Re-throw to let global error handler deal with it
    throw error;
  });
};

// Combined payment middleware plugin
export const paymentMiddleware: FastifyPluginCallback = async (fastify) => {
  // Register all payment middleware
  await fastify.register(paymentSecurityHeaders);
  await fastify.register(auditPaymentOperations);
  await fastify.register(validatePaymentAmount);
  await fastify.register(checkUserBalance);
  await fastify.register(paymentErrorHandler);
};

// Webhook-specific middleware plugin
export const webhookMiddleware: FastifyPluginCallback = async (fastify) => {
  await fastify.register(paymentSecurityHeaders);
  await fastify.register(auditPaymentOperations);
  await fastify.register(validateWebhookSignature);
};

export default paymentMiddleware;