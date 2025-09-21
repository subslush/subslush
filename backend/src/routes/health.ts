import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { testDatabaseConnection } from '../config/database';

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/health',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const dbStatus = await testDatabaseConnection();

      const healthCheck = {
        status: dbStatus ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: {
          status: dbStatus ? 'connected' : 'disconnected',
        },
        memory: process.memoryUsage(),
        version: process.version,
      };

      const statusCode = dbStatus ? 200 : 503;
      return reply.status(statusCode).send(healthCheck);
    }
  );
}
