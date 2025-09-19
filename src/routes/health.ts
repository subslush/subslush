import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { testDatabaseConnection } from '../config/database';
import { redisClient } from '../config/redis';

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/health',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const [dbStatus, redisHealth] = await Promise.all([
        testDatabaseConnection(),
        redisClient.getHealthInfo(),
      ]);

      const isHealthy = dbStatus && redisHealth.status === 'connected';

      const healthCheck = {
        status: isHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: {
          status: dbStatus ? 'connected' : 'disconnected',
        },
        redis: {
          status: redisHealth.status,
          ...(redisHealth.latency !== undefined && { latency: redisHealth.latency }),
        },
        memory: process.memoryUsage(),
        version: process.version,
      };

      const statusCode = isHealthy ? 200 : 503;
      return reply.status(statusCode).send(healthCheck);
    }
  );
}
