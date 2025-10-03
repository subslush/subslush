import { FastifyRequest, FastifyReply, FastifyPluginCallback } from 'fastify';
import { redisClient } from '../config/redis';
import { Logger } from '../utils/logger';

export interface RateLimitOptions {
  windowMs?: number;
  maxRequests?: number;
  keyGenerator?: (request: FastifyRequest) => string;
  skipFailedRequests?: boolean;
  skipSuccessfulRequests?: boolean;
  onLimitReached?: (request: FastifyRequest, reply?: FastifyReply) => void;
}

export const rateLimitMiddleware = (
  options: RateLimitOptions = {}
): FastifyPluginCallback => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    maxRequests = 100,
    keyGenerator = (request: FastifyRequest): string => request.ip,
    skipFailedRequests = false,
    skipSuccessfulRequests = false,
    onLimitReached,
  } = options;

  return async (fastify, _options): Promise<void> => {
    Logger.info(
      `Rate limit middleware registered for window: ${windowMs}ms, max: ${maxRequests}`
    );

    fastify.addHook(
      'preHandler',
      async (request: FastifyRequest, reply: FastifyReply) => {
        try {
          const key = `rate_limit:${keyGenerator(request)}`;
          Logger.debug(`Rate limit check for key: ${key}`);

          // Verify Redis client is available and ready
          if (!redisClient.isConnected()) {
            Logger.error('Redis client not ready for rate limiting');
            // FAIL CLOSED - block request if Redis unavailable
            return reply.code(503).send({
              error: 'Service Unavailable',
              message: 'Rate limiting service unavailable',
            });
          }

          const client = redisClient.getClient();

          // CRITICAL: Check current count BEFORE incrementing
          const currentValue = await client.get(key);
          const currentCount = currentValue ? parseInt(currentValue, 10) : 0;

          // Block BEFORE incrementing if limit exceeded
          if (currentCount >= maxRequests) {
            if (onLimitReached) {
              onLimitReached(request, reply);
            }

            const ttl = await client.ttl(key);
            const resetTime = new Date(
              Date.now() + (ttl > 0 ? ttl * 1000 : windowMs)
            );

            // CRITICAL: Use return reply.code().send() pattern to halt execution
            return reply.code(429).send({
              error: 'Too Many Requests',
              message: 'Rate limit exceeded',
              retryAfter: ttl > 0 ? ttl : Math.ceil(windowMs / 1000),
              resetTime: resetTime.toISOString(),
              limit: maxRequests,
              windowMs,
            });
          }

          // Only increment AFTER checking limit
          const newCount = await client.incr(key);

          // Set expiry only on first request
          if (newCount === 1) {
            await client.expire(key, Math.ceil(windowMs / 1000));
          }

          // Get TTL for response headers
          const ttl = await client.ttl(key);
          const resetTime = new Date(
            Date.now() + (ttl > 0 ? ttl * 1000 : windowMs)
          );

          // Add rate limit headers
          reply.headers({
            'X-RateLimit-Limit': maxRequests.toString(),
            'X-RateLimit-Remaining': Math.max(
              0,
              maxRequests - newCount
            ).toString(),
            'X-RateLimit-Reset': resetTime.toISOString(),
            'X-RateLimit-Window': windowMs.toString(),
          });
        } catch (error) {
          Logger.error('Rate limit middleware error:', error);
          // FAIL CLOSED - block request on any error
          return reply.code(503).send({
            error: 'Service Unavailable',
            message: 'Rate limiting error - request blocked for security',
          });
        }
      }
    );

    if (skipFailedRequests || skipSuccessfulRequests) {
      fastify.addHook(
        'onResponse',
        async (request: FastifyRequest, reply: FastifyReply) => {
          try {
            const shouldSkip =
              (skipFailedRequests && reply.statusCode >= 400) ||
              (skipSuccessfulRequests && reply.statusCode < 400);

            if (shouldSkip) {
              const key = `rate_limit:${keyGenerator(request)}`;
              const client = redisClient.getClient();
              await client.decr(key);
            }
          } catch (error) {
            Logger.error('Rate limit response hook error:', error);
          }
        }
      );
    }
  };
};

export const authRateLimit = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5, // 5 attempts per 15 minutes
  keyGenerator: (request: FastifyRequest) => {
    const body = request.body as any;
    const email = body?.email || 'unknown';
    return `auth:${request.ip}:${email}`;
  },
  skipSuccessfulRequests: true,
});

export const strictAuthRateLimit = rateLimitMiddleware({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 3, // 3 attempts per hour
  keyGenerator: (request: FastifyRequest) => {
    const body = request.body as any;
    const email = body?.email || 'unknown';
    return `strict_auth:${request.ip}:${email}`;
  },
  skipSuccessfulRequests: true,
});

export const sessionRateLimit = rateLimitMiddleware({
  windowMs: 5 * 60 * 1000, // 5 minutes
  maxRequests: 10, // 10 session operations per 5 minutes
  keyGenerator: (request: FastifyRequest) => `session:${request.ip}`,
});

export const generalRateLimit = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 100, // 100 requests per 15 minutes
  keyGenerator: (request: FastifyRequest) => `general:${request.ip}`,
});

export const passwordResetRateLimit = rateLimitMiddleware({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 3, // 3 password reset attempts per hour
  keyGenerator: (request: FastifyRequest) => {
    const body = request.body as any;
    const email = body?.email || 'unknown';
    return `password_reset:${request.ip}:${email}`;
  },
});

export const bruteForceProtection = rateLimitMiddleware({
  windowMs: 30 * 60 * 1000, // 30 minutes
  maxRequests: 20, // 20 attempts per 30 minutes
  keyGenerator: (request: FastifyRequest): string => {
    const body = request.body as any;
    const email = body?.email || 'unknown';
    return `brute_force:${email}`;
  },
  onLimitReached: (request: FastifyRequest): void => {
    const body = request.body as any;
    const email = body?.email || 'unknown';
    Logger.warn(
      `Brute force attack detected for email: ${email} from IP: ${request.ip}`
    );
  },
});

export default rateLimitMiddleware;
