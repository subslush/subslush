import { FastifyInstance } from 'fastify';
import { authRoutes } from './auth';
import { subscriptionRoutes } from './subscriptions';
import { paymentRoutes } from './payments';

export async function apiRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(authRoutes, { prefix: '/auth' });
  await fastify.register(subscriptionRoutes, { prefix: '/subscriptions' });
  await fastify.register(paymentRoutes, { prefix: '/payments' });
}
