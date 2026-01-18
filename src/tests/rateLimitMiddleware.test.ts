import fastify, { FastifyInstance } from 'fastify';
import { rateLimitRedisClient } from '../config/redis';
import { createRateLimitHandler } from '../middleware/rateLimitMiddleware';

describe('Rate Limiting Middleware Security Tests', () => {
  let app: FastifyInstance;
  let client: any;

  beforeAll(async () => {
    // Connect to Redis
    await rateLimitRedisClient.connect();
    client = rateLimitRedisClient.getClient();
  });

  afterAll(async () => {
    // Clean up and disconnect
    await rateLimitRedisClient.disconnect();
  });

  beforeEach(async () => {
    // Create fresh Fastify instance for each test
    app = fastify({ logger: false });

    // Ensure Redis is connected before each test
    if (!rateLimitRedisClient.isConnected()) {
      await rateLimitRedisClient.connect();
      client = rateLimitRedisClient.getClient();
    }

    // Clear all rate limit keys before each test
    const keys = await client.keys('rate_limit:*');
    if (keys.length > 0) {
      await client.del(...keys);
    }
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Critical Security: Request Blocking Enforcement', () => {
    it('should allow requests under the limit', async () => {
      // Configure rate limit handler: 5 requests per minute
      const rateLimitHandler = createRateLimitHandler({
        windowMs: 60 * 1000,
        maxRequests: 5,
        keyGenerator: () => 'test-user-under-limit',
      });

      app.get('/test', { preHandler: [rateLimitHandler] }, async () => ({
        success: true,
      }));
      await app.ready();

      // Test 5 requests (all should succeed)
      for (let i = 1; i <= 5; i++) {
        const response = await app.inject({
          method: 'GET',
          url: '/test',
        });

        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body)).toEqual({ success: true });

        // Verify rate limit headers (using correct PascalCase)
        expect(response.headers['x-ratelimit-limit']).toBe('5');
        expect(response.headers['x-ratelimit-remaining']).toBe(
          (5 - i).toString()
        );
        expect(response.headers['x-ratelimit-reset']).toBeDefined();
        expect(response.headers['x-ratelimit-window']).toBe('60000');
      }
    });

    it('should block requests that exceed the limit with 429 status', async () => {
      // Configure rate limit handler: 3 requests per minute
      const rateLimitHandler = createRateLimitHandler({
        windowMs: 60 * 1000,
        maxRequests: 3,
        keyGenerator: () => 'test-user-over-limit',
      });

      app.get('/test', { preHandler: [rateLimitHandler] }, async () => ({
        success: true,
      }));
      await app.ready();

      // First 3 requests should succeed
      for (let i = 1; i <= 3; i++) {
        const response = await app.inject({
          method: 'GET',
          url: '/test',
        });
        expect(response.statusCode).toBe(200);
        expect(response.headers['x-ratelimit-remaining']).toBe(
          (3 - i).toString()
        );
      }

      // 4th and 5th requests should be blocked with 429
      for (let i = 4; i <= 5; i++) {
        const response = await app.inject({
          method: 'GET',
          url: '/test',
        });

        expect(response.statusCode).toBe(429);

        const body = JSON.parse(response.body);
        expect(body.error).toBe('Too Many Requests');
        expect(body.message).toBe('Rate limit exceeded');
        expect(body.limit).toBe(3);
        expect(body.windowMs).toBe(60000);
        expect(body.retryAfter).toBeGreaterThan(0);
        expect(body.resetTime).toBeDefined();
      }
    });

    it('should handle rapid sequential requests correctly', async () => {
      // Configure rate limit handler: 3 requests per minute (small limit for testing)
      const rateLimitHandler = createRateLimitHandler({
        windowMs: 60 * 1000,
        maxRequests: 3,
        keyGenerator: () => 'test-user-rapid',
      });

      app.get('/test', { preHandler: [rateLimitHandler] }, async () => ({
        success: true,
      }));
      await app.ready();

      // Send requests rapidly in sequence to test rate limiting
      const responses = [];
      for (let i = 0; i < 6; i++) {
        const response = await app.inject({
          method: 'GET',
          url: '/test',
        });
        responses.push(response);
      }

      // Count successful vs rate-limited responses
      const successCount = responses.filter(r => r.statusCode === 200).length;
      const rateLimitedCount = responses.filter(
        r => r.statusCode === 429
      ).length;

      // Should have exactly 3 successes and 3 rate-limited
      expect(successCount).toBe(3);
      expect(rateLimitedCount).toBe(3);
      expect(successCount + rateLimitedCount).toBe(6);

      // Verify all 429 responses have correct error structure
      responses
        .filter(r => r.statusCode === 429)
        .forEach(response => {
          const body = JSON.parse(response.body);
          expect(body.error).toBe('Too Many Requests');
          expect(body.message).toBe('Rate limit exceeded');
          expect(body.limit).toBe(3);
        });
    });

    it('should enforce limits under concurrent load', async () => {
      const maxRequests = 5;
      const totalRequests = 25;
      const rateLimitHandler = createRateLimitHandler({
        windowMs: 60 * 1000,
        maxRequests,
        keyGenerator: () => 'test-user-concurrent',
      });

      app.get('/test', { preHandler: [rateLimitHandler] }, async () => ({
        success: true,
      }));
      await app.ready();

      const responses = await Promise.all(
        Array.from({ length: totalRequests }, () =>
          app.inject({
            method: 'GET',
            url: '/test',
          })
        )
      );

      const successCount = responses.filter(r => r.statusCode === 200).length;
      const rateLimitedCount = responses.filter(
        r => r.statusCode === 429
      ).length;

      expect(successCount).toBeLessThanOrEqual(maxRequests);
      expect(rateLimitedCount).toBeGreaterThanOrEqual(
        totalRequests - maxRequests
      );
    });

    it('should track limits per user correctly', async () => {
      const rateLimitHandler = createRateLimitHandler({
        windowMs: 60 * 1000,
        maxRequests: 2,
        keyGenerator: request =>
          `user:${request.headers['user-id'] || 'anonymous'}`,
      });

      app.get('/test', { preHandler: [rateLimitHandler] }, async () => ({
        success: true,
      }));
      await app.ready();

      // User A: 2 requests (should succeed)
      for (let i = 1; i <= 2; i++) {
        const response = await app.inject({
          method: 'GET',
          url: '/test',
          headers: { 'user-id': 'user-a' },
        });
        expect(response.statusCode).toBe(200);
      }

      // User A: 3rd request (should be blocked)
      const userAThirdRequest = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { 'user-id': 'user-a' },
      });
      expect(userAThirdRequest.statusCode).toBe(429);

      // User B: 2 requests (should succeed - separate limit)
      for (let i = 1; i <= 2; i++) {
        const response = await app.inject({
          method: 'GET',
          url: '/test',
          headers: { 'user-id': 'user-b' },
        });
        expect(response.statusCode).toBe(200);
      }

      // User B: 3rd request (should be blocked)
      const userBThirdRequest = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { 'user-id': 'user-b' },
      });
      expect(userBThirdRequest.statusCode).toBe(429);
    });

    it('should reset limits after window expires', async () => {
      // Use short window for testing: 1 second
      const windowMs = 1000;
      const rateLimitHandler = createRateLimitHandler({
        windowMs,
        maxRequests: 2,
        keyGenerator: () => 'test-user-reset',
      });

      app.get('/test', { preHandler: [rateLimitHandler] }, async () => ({
        success: true,
      }));
      await app.ready();

      // Use up the limit
      for (let i = 1; i <= 2; i++) {
        const response = await app.inject({
          method: 'GET',
          url: '/test',
        });
        expect(response.statusCode).toBe(200);
      }

      // 3rd request should be blocked
      const blockedResponse = await app.inject({
        method: 'GET',
        url: '/test',
      });
      expect(blockedResponse.statusCode).toBe(429);

      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, windowMs + 250));

      // Should be able to make requests again
      for (let i = 1; i <= 2; i++) {
        const response = await app.inject({
          method: 'GET',
          url: '/test',
        });
        expect(response.statusCode).toBe(200);
      }
    });
  });

  describe('Critical Security: Fail-Closed Error Handling', () => {
    it('should block requests when Redis is unavailable', async () => {
      // Mock Redis isConnected to return false
      jest.spyOn(rateLimitRedisClient, 'isConnected').mockReturnValue(false);

      const rateLimitHandler = createRateLimitHandler({
        windowMs: 60 * 1000,
        maxRequests: 10,
        keyGenerator: () => 'test-user-unavailable',
      });

      app.get('/test', { preHandler: [rateLimitHandler] }, async () => ({
        success: true,
      }));
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/test',
      });

      // Should fail closed with 503
      expect(response.statusCode).toBe(503);

      const body = JSON.parse(response.body);
      expect(body.error).toBe('Service Unavailable');
      expect(body.message).toBe('Rate limiting service unavailable');

      // Restore mock
      jest.restoreAllMocks();
    });

    it('should block requests on Redis operation errors', async () => {
      // Mock Redis client to throw errors but maintain connection status
      const mockClient = {
        status: 'ready',
        eval: jest.fn().mockRejectedValue(new Error('Redis operation failed')),
      };

      jest
        .spyOn(rateLimitRedisClient, 'getClient')
        .mockReturnValue(mockClient as any);
      jest.spyOn(rateLimitRedisClient, 'isConnected').mockReturnValue(true);

      const rateLimitHandler = createRateLimitHandler({
        windowMs: 60 * 1000,
        maxRequests: 10,
        keyGenerator: () => 'test-user-error',
      });

      app.get('/test', { preHandler: [rateLimitHandler] }, async () => ({
        success: true,
      }));
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/test',
      });

      // Should fail closed with 503
      expect(response.statusCode).toBe(503);

      const body = JSON.parse(response.body);
      expect(body.error).toBe('Service Unavailable');
      expect(body.message).toBe(
        'Rate limiting error - request blocked for security'
      );

      // Restore original methods
      jest.restoreAllMocks();
    });
  });

  describe('Subscription Route Rate Limits', () => {
    it('should enforce subscription validation rate limit (20/min)', async () => {
      const rateLimitHandler = createRateLimitHandler({
        windowMs: 60 * 1000,
        maxRequests: 20,
        keyGenerator: request => `sub_validation:${request.ip}`,
      });

      app.post(
        '/api/v1/subscriptions/validate-purchase',
        { preHandler: [rateLimitHandler] },
        async () => ({
          can_purchase: true,
        })
      );
      await app.ready();

      // Test exactly the limit
      for (let i = 1; i <= 20; i++) {
        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/subscriptions/validate-purchase',
          payload: { service_type: 'spotify', service_plan: 'premium' },
        });
        expect(response.statusCode).toBe(200);
      }

      // 21st request should be blocked
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/subscriptions/validate-purchase',
        payload: { service_type: 'spotify', service_plan: 'premium' },
      });
      expect(response.statusCode).toBe(429);
    });

    it('should enforce subscription purchase rate limit (10/5min)', async () => {
      const rateLimitHandler = createRateLimitHandler({
        windowMs: 5 * 60 * 1000,
        maxRequests: 10,
        keyGenerator: request => `sub_purchase:${request.ip}`,
      });

      app.post(
        '/api/v1/subscriptions/purchase',
        { preHandler: [rateLimitHandler] },
        async () => ({
          subscription_id: 'test-123',
        })
      );
      await app.ready();

      // Test exactly the limit
      for (let i = 1; i <= 10; i++) {
        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/subscriptions/purchase',
          payload: { service_type: 'netflix', service_plan: 'standard' },
        });
        expect(response.statusCode).toBe(200);
      }

      // 11th request should be blocked
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/subscriptions/purchase',
        payload: { service_type: 'netflix', service_plan: 'standard' },
      });
      expect(response.statusCode).toBe(429);

      const body = JSON.parse(response.body);
      expect(body.windowMs).toBe(5 * 60 * 1000);
    });
  });

  describe('Auth Route Rate Limits', () => {
    it('should enforce auth rate limit (5/15min)', async () => {
      const rateLimitHandler = createRateLimitHandler({
        windowMs: 15 * 60 * 1000,
        maxRequests: 5,
        keyGenerator: request => {
          const body = request.body as any;
          const email = body?.email || 'unknown';
          return `auth:${request.ip}:${email}`;
        },
      });

      app.post(
        '/api/v1/auth/login',
        { preHandler: [rateLimitHandler] },
        async () => ({
          access_token: 'test-token',
        })
      );
      await app.ready();

      // Test exactly the limit
      for (let i = 1; i <= 5; i++) {
        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          payload: { email: 'test@example.com', password: 'password123' },
        });
        expect(response.statusCode).toBe(200);
      }

      // 6th request should be blocked
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'test@example.com', password: 'password123' },
      });
      expect(response.statusCode).toBe(429);

      const body = JSON.parse(response.body);
      expect(body.limit).toBe(5);
      expect(body.windowMs).toBe(15 * 60 * 1000);
    });

    it('should enforce strict auth rate limit (3/hour)', async () => {
      const rateLimitHandler = createRateLimitHandler({
        windowMs: 60 * 60 * 1000,
        maxRequests: 3,
        keyGenerator: request => {
          const body = request.body as any;
          const email = body?.email || 'unknown';
          return `strict_auth:${request.ip}:${email}`;
        },
      });

      app.post(
        '/api/v1/auth/reset-password',
        { preHandler: [rateLimitHandler] },
        async () => ({
          message: 'Reset email sent',
        })
      );
      await app.ready();

      // Test exactly the limit
      for (let i = 1; i <= 3; i++) {
        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/auth/reset-password',
          payload: { email: 'test@example.com' },
        });
        expect(response.statusCode).toBe(200);
      }

      // 4th request should be blocked
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/reset-password',
        payload: { email: 'test@example.com' },
      });
      expect(response.statusCode).toBe(429);

      const body = JSON.parse(response.body);
      expect(body.limit).toBe(3);
      expect(body.windowMs).toBe(60 * 60 * 1000);
    });
  });

  describe('Rate Limit Headers', () => {
    it('should include all required rate limit headers', async () => {
      const rateLimitHandler = createRateLimitHandler({
        windowMs: 60 * 1000,
        maxRequests: 10,
        keyGenerator: () => 'test-user-headers',
      });

      app.get('/test', { preHandler: [rateLimitHandler] }, async () => ({
        success: true,
      }));
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/test',
      });

      expect(response.statusCode).toBe(200);

      // Verify all required headers are present (correct case)
      expect(response.headers['x-ratelimit-limit']).toBe('10');
      expect(response.headers['x-ratelimit-remaining']).toBe('9');
      expect(response.headers['x-ratelimit-reset']).toBeDefined();
      expect(response.headers['x-ratelimit-window']).toBe('60000');

      // Verify header values are correct
      const resetTime = new Date(
        response.headers['x-ratelimit-reset'] as string
      );
      expect(resetTime.getTime()).toBeGreaterThan(Date.now());
    });

    it('should show decreasing remaining count', async () => {
      const rateLimitHandler = createRateLimitHandler({
        windowMs: 60 * 1000,
        maxRequests: 5,
        keyGenerator: () => 'test-user-decreasing',
      });

      app.get('/test', { preHandler: [rateLimitHandler] }, async () => ({
        success: true,
      }));
      await app.ready();

      // Test decreasing remaining count
      for (let i = 1; i <= 5; i++) {
        const response = await app.inject({
          method: 'GET',
          url: '/test',
        });

        expect(response.statusCode).toBe(200);
        expect(response.headers['x-ratelimit-remaining']).toBe(
          (5 - i).toString()
        );
      }
    });
  });

  describe('OnLimitReached Callback', () => {
    it('should call onLimitReached when limit is exceeded', async () => {
      const onLimitReached = jest.fn();

      const rateLimitHandler = createRateLimitHandler({
        windowMs: 60 * 1000,
        maxRequests: 2,
        keyGenerator: () => 'test-user-callback',
        onLimitReached,
      });

      app.get('/test', { preHandler: [rateLimitHandler] }, async () => ({
        success: true,
      }));
      await app.ready();

      // Use up the limit
      for (let i = 1; i <= 2; i++) {
        await app.inject({ method: 'GET', url: '/test' });
      }

      // This should trigger the callback
      const response = await app.inject({
        method: 'GET',
        url: '/test',
      });

      expect(response.statusCode).toBe(429);
      expect(onLimitReached).toHaveBeenCalledTimes(1);
      expect(onLimitReached).toHaveBeenCalledWith(
        expect.any(Object), // request
        expect.any(Object) // reply
      );
    });
  });
});
