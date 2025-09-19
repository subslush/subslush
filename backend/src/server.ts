import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { env } from './config/environment';
import {
  createDatabasePool,
  testDatabaseConnection,
  closeDatabasePool,
} from './config/database';
import { errorHandler } from './middleware/errorHandler';
import { healthRoutes } from './routes/health';
import { apiRoutes } from './routes/api';

const fastify = Fastify({
  logger:
    env.NODE_ENV === 'development'
      ? {
          level: 'info',
          transport: {
            target: 'pino-pretty',
            options: {
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname',
            },
          },
        }
      : {
          level: 'warn',
        },
});

async function buildServer(): Promise<typeof fastify> {
  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
  });

  await fastify.register(cors, {
    origin: env.NODE_ENV === 'development' ? true : ['http://localhost:3000'],
    credentials: true,
  });

  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  fastify.setErrorHandler(errorHandler);

  createDatabasePool(env);

  await fastify.register(healthRoutes);
  await fastify.register(apiRoutes, { prefix: '/api/v1' });

  return fastify;
}

async function startServer(): Promise<void> {
  try {
    const server = await buildServer();

    const isDbConnected = await testDatabaseConnection();
    if (!isDbConnected) {
      throw new Error('Failed to connect to database');
    }

    await server.listen({
      port: env.PORT,
      host: '0.0.0.0',
    });

    server.log.info(`Server listening on port ${env.PORT}`);
    server.log.info(`Environment: ${env.NODE_ENV}`);
  } catch (error) {
    fastify.log.error(error);
    process.exit(1);
  }
}

function setupGracefulShutdown(): void {
  const signals = ['SIGINT', 'SIGTERM'];
  let isShuttingDown = false;

  signals.forEach(signal => {
    process.on(signal, async () => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      fastify.log.info(`Received ${signal}, shutting down gracefully`);

      try {
        await fastify.close();
        await closeDatabasePool();
        fastify.log.info('Server closed successfully');
        process.exit(0);
      } catch (error) {
        fastify.log.error(error, 'Error during shutdown');
        process.exit(1);
      }
    });
  });
}

if (require.main === module) {
  setupGracefulShutdown();
  void startServer();
}

export { buildServer };
