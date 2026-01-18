import { FastifyRequest, FastifyReply, FastifyPluginCallback } from 'fastify';
import { rateLimitRedisClient } from '../config/redis';
import { Logger } from '../utils/logger';
import { getRequestIp } from '../utils/requestIp';

export interface RateLimitOptions {
  windowMs?: number;
  maxRequests?: number;
  keyGenerator?: (request: FastifyRequest) => string;
  skipFailedRequests?: boolean;
  skipSuccessfulRequests?: boolean;
  onLimitReached?: (request: FastifyRequest, reply?: FastifyReply) => void;
}

type RateLimitState = {
  count: number;
  ttlMs: number;
  limited: boolean;
};

const RATE_LIMIT_SCRIPT = `
local key = KEYS[1]
local window = tonumber(ARGV[1])
local max = tonumber(ARGV[2])

local current = redis.call('GET', key)
if not current then
  redis.call('SET', key, 1, 'PX', window)
  return {1, window, 0}
end

current = tonumber(current)
if current >= max then
  local ttl = redis.call('PTTL', key)
  if ttl < 0 then
    redis.call('PEXPIRE', key, window)
    ttl = window
  end
  return {current, ttl, 1}
end

local newCount = redis.call('INCR', key)
local ttl = redis.call('PTTL', key)
if ttl < 0 then
  redis.call('PEXPIRE', key, window)
  ttl = window
end
return {newCount, ttl, 0}
`;

const parseNumber = (value: unknown): number => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  const parsed = parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

const evaluateRateLimit = async (
  key: string,
  windowMs: number,
  maxRequests: number
): Promise<RateLimitState> => {
  const client = rateLimitRedisClient.getClient();
  const normalizedWindowMs = Math.max(1, Math.ceil(windowMs));
  const result = (await client.eval(
    RATE_LIMIT_SCRIPT,
    1,
    key,
    normalizedWindowMs,
    maxRequests
  )) as unknown as [unknown, unknown, unknown];

  const count = parseNumber(result?.[0]);
  let ttlMs = parseNumber(result?.[1]);
  const limited = parseNumber(result?.[2]) === 1;

  if (ttlMs <= 0) {
    ttlMs = normalizedWindowMs;
  }

  return { count, ttlMs, limited };
};

export const rateLimitMiddleware = (
  options: RateLimitOptions = {}
): FastifyPluginCallback => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    maxRequests = 100,
    keyGenerator = (request: FastifyRequest): string => getRequestIp(request),
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
          if (!rateLimitRedisClient.isConnected()) {
            Logger.error('Redis client not ready for rate limiting');
            // FAIL CLOSED - block request if Redis unavailable
            return reply.code(503).send({
              error: 'Service Unavailable',
              message: 'Rate limiting service unavailable',
            });
          }

          const { count, ttlMs, limited } = await evaluateRateLimit(
            key,
            windowMs,
            maxRequests
          );

          if (limited) {
            if (onLimitReached) {
              onLimitReached(request, reply);
            }

            const resetTime = new Date(
              Date.now() + (ttlMs > 0 ? ttlMs : windowMs)
            );

            reply.headers({
              'X-RateLimit-Limit': maxRequests.toString(),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': resetTime.toISOString(),
              'X-RateLimit-Window': windowMs.toString(),
            });

            // CRITICAL: Use return reply.code().send() pattern to halt execution
            return reply.code(429).send({
              error: 'Too Many Requests',
              message: 'Rate limit exceeded',
              retryAfter:
                ttlMs > 0
                  ? Math.max(1, Math.ceil(ttlMs / 1000))
                  : Math.ceil(windowMs / 1000),
              resetTime: resetTime.toISOString(),
              limit: maxRequests,
              windowMs,
            });
          }
          const resetTime = new Date(
            Date.now() + (ttlMs > 0 ? ttlMs : windowMs)
          );

          // Add rate limit headers
          reply.headers({
            'X-RateLimit-Limit': maxRequests.toString(),
            'X-RateLimit-Remaining': Math.max(
              0,
              maxRequests - count
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
              const client = rateLimitRedisClient.getClient();
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
    keyGenerator = (request: FastifyRequest): string => getRequestIp(request),
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
      if (!rateLimitRedisClient.isConnected()) {
        Logger.error('Redis client not ready for rate limiting');
        // FAIL CLOSED - block request if Redis unavailable
        reply.code(503).send({
          error: 'Service Unavailable',
          message: 'Rate limiting service unavailable',
        });
        return; // CRITICAL: return to halt execution
      }

      const { count, ttlMs, limited } = await evaluateRateLimit(
        key,
        windowMs,
        maxRequests
      );

      if (limited) {
        if (onLimitReached) {
          onLimitReached(request, reply);
        }

        const resetTime = new Date(Date.now() + (ttlMs > 0 ? ttlMs : windowMs));

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
          retryAfter:
            ttlMs > 0
              ? Math.max(1, Math.ceil(ttlMs / 1000))
              : Math.ceil(windowMs / 1000),
          resetTime: resetTime.toISOString(),
          limit: maxRequests,
          windowMs,
        });
        return; // CRITICAL: return to halt execution
      }
      const resetTime = new Date(Date.now() + (ttlMs > 0 ? ttlMs : windowMs));

      // Add rate limit headers
      reply.headers({
        'X-RateLimit-Limit': maxRequests.toString(),
        'X-RateLimit-Remaining': Math.max(0, maxRequests - count).toString(),
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
