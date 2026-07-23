import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { testDatabaseConnection } from '../config/database';
import {
  redisClient,
  rateLimitRedisClient,
  type RedisHealthInfo,
} from '../config/redis';

type DependencyHealth = {
  ready: boolean;
  database: { status: 'connected' | 'disconnected' };
  redis: RedisHealthInfo;
  redisRateLimit: RedisHealthInfo;
};

const readDependencyHealth = async (): Promise<DependencyHealth> => {
  const [dbStatus, redisHealth, rateLimitRedisHealth] = await Promise.all([
    testDatabaseConnection(),
    redisClient.getHealthInfo(),
    rateLimitRedisClient.getHealthInfo(),
  ]);

  return {
    ready:
      dbStatus &&
      redisHealth.status === 'connected' &&
      rateLimitRedisHealth.status === 'connected',
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
  };
};

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/health',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const dependencies = await readDependencyHealth();

      const healthCheck = {
        status: dependencies.ready ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: dependencies.database,
        redis: dependencies.redis,
        redisRateLimit: dependencies.redisRateLimit,
        memory: process.memoryUsage(),
        version: process.version,
      };

      const statusCode = dependencies.ready ? 200 : 503;
      return reply.status(statusCode).send(healthCheck);
    }
  );

  fastify.get(
    '/ready',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const dependencies = await readDependencyHealth();
      reply.header('Cache-Control', 'no-store');
      return reply.status(dependencies.ready ? 200 : 503).send({
        status: dependencies.ready ? 'ready' : 'not_ready',
        timestamp: new Date().toISOString(),
        database: dependencies.database,
        redis: dependencies.redis,
        redisRateLimit: dependencies.redisRateLimit,
      });
    }
  );
}
