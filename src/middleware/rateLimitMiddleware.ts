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

// Handler function for preHandler arrays (fixes plugin encapsulation issues)
export const createRateLimitHandler = (options: RateLimitOptions = {}) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    maxRequests = 100,
    keyGenerator = (request: FastifyRequest): string => request.ip,
    onLimitReached,
  } = options;

  return async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> => {
    try {
      const key = `rate_limit:${keyGenerator(request)}`;
      Logger.debug(`Rate limit check for key: ${key}`);

      // Verify Redis client is available and ready
      if (!redisClient.isConnected()) {
        Logger.error('Redis client not ready for rate limiting');
        // FAIL CLOSED - block request if Redis unavailable
        reply.code(503).send({
          error: 'Service Unavailable',
          message: 'Rate limiting service unavailable',
        });
        return; // CRITICAL: return to halt execution
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

        // CRITICAL: Set rate limit headers for blocked requests
        reply.headers({
          'X-RateLimit-Limit': maxRequests.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': resetTime.toISOString(),
          'X-RateLimit-Window': windowMs.toString(),
        });

        // CRITICAL: Use reply.code().send() pattern to halt execution
        reply.code(429).send({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded',
          retryAfter: ttl > 0 ? ttl : Math.ceil(windowMs / 1000),
          resetTime: resetTime.toISOString(),
          limit: maxRequests,
          windowMs,
        });
        return; // CRITICAL: return to halt execution
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
        'X-RateLimit-Remaining': Math.max(0, maxRequests - newCount).toString(),
        'X-RateLimit-Reset': resetTime.toISOString(),
        'X-RateLimit-Window': windowMs.toString(),
      });

      // CRITICAL: No return - let request continue to next handler
    } catch (error) {
      Logger.error('Rate limit handler error:', error);
      // FAIL CLOSED - block request on any error
      reply.code(503).send({
        error: 'Service Unavailable',
        message: 'Rate limiting error - request blocked for security',
      });
      return; // CRITICAL: return to halt on error
    }
  };
};

export default rateLimitMiddleware;
