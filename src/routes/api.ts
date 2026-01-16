import { FastifyInstance } from 'fastify';
import { authRoutes } from './auth';
import { subscriptionRoutes } from './subscriptions';
import { paymentRoutes } from './payments';
import { userRoutes } from './users';
import { creditRoutes } from './credits';
import { adminRoutes } from './admin';
import { orderRoutes } from './orders';
import { dashboardRoutes } from './dashboard';
import { notificationRoutes } from './notifications';
import { localeRoutes } from './locale';
import { healthRoutes } from './health';
import { newsletterRoutes } from './newsletter';
import { bisRoutes } from './bis';

export async function apiRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(healthRoutes);
  await fastify.register(authRoutes, { prefix: '/auth' });
  await fastify.register(userRoutes, { prefix: '/users' });
  await fastify.register(subscriptionRoutes, { prefix: '/subscriptions' });
  await fastify.register(paymentRoutes, { prefix: '/payments' });
  await fastify.register(creditRoutes, { prefix: '/credits' });
  await fastify.register(orderRoutes, { prefix: '/orders' });
  await fastify.register(dashboardRoutes, { prefix: '/dashboard' });
  await fastify.register(notificationRoutes, { prefix: '/notifications' });
  await fastify.register(newsletterRoutes, { prefix: '/newsletter' });
  await fastify.register(bisRoutes, { prefix: '/bis' });
  await fastify.register(localeRoutes, { prefix: '/locale' });
  await fastify.register(adminRoutes, { prefix: '/admin' });
}
