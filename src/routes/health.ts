import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { testDatabaseConnection } from '../config/database';
import { redisClient, rateLimitRedisClient } from '../config/redis';

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/health',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const [dbStatus, redisHealth, rateLimitRedisHealth] = await Promise.all([
        testDatabaseConnection(),
        redisClient.getHealthInfo(),
        rateLimitRedisClient.getHealthInfo(),
      ]);

      const isHealthy =
        dbStatus &&
        redisHealth.status === 'connected' &&
        rateLimitRedisHealth.status === 'connected';

      const healthCheck = {
        status: isHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: {
          status: dbStatus ? 'connected' : 'disconnected',
        },
        redis: {
          status: redisHealth.status,
          ...(redisHealth.latency !== undefined && {
            latency: redisHealth.latency,
          }),
        },
        redisRateLimit: {
          status: rateLimitRedisHealth.status,
          ...(rateLimitRedisHealth.latency !== undefined && {
            latency: rateLimitRedisHealth.latency,
          }),
        },
        memory: process.memoryUsage(),
        version: process.version,
      };

      const statusCode = isHealthy ? 200 : 503;
      return reply.status(statusCode).send(healthCheck);
    }
  );
}
