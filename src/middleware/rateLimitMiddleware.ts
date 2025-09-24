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
    fastify.addHook(
      'preHandler',
      async (request: FastifyRequest, reply: FastifyReply) => {
        try {
          const key = `rate_limit:${keyGenerator(request)}`;
          const client = redisClient.getClient();

          const current = await client.incr(key);

          if (current === 1) {
            await client.expire(key, Math.ceil(windowMs / 1000));
          }

          if (current > maxRequests) {
            if (onLimitReached) {
              onLimitReached(request, reply);
            }

            const ttl = await client.ttl(key);
            const resetTime = new Date(Date.now() + ttl * 1000);

            reply.statusCode = 429;
            return reply.send({
              error: 'Too Many Requests',
              message: 'Rate limit exceeded',
              retryAfter: ttl,
              resetTime: resetTime.toISOString(),
              limit: maxRequests,
              windowMs,
            });
          }

          const ttl = await client.ttl(key);
          const resetTime = new Date(Date.now() + ttl * 1000);

          reply.headers({
            'X-RateLimit-Limit': maxRequests.toString(),
            'X-RateLimit-Remaining': Math.max(
              0,
              maxRequests - current
            ).toString(),
            'X-RateLimit-Reset': resetTime.toISOString(),
            'X-RateLimit-Window': windowMs.toString(),
          });
        } catch (error) {
          Logger.error('Rate limit middleware error:', error);
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
