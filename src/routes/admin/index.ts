import { FastifyInstance } from 'fastify';
import { adminPaymentRoutes } from './payments';
import { adminCatalogRoutes } from './catalog';
import { adminOrderRoutes } from './orders';
import { adminSubscriptionRoutes } from './subscriptions';
import { adminCreditRoutes } from './credits';
import { adminRewardRoutes } from './rewards';
import { adminTaskRoutes } from './tasks';
import { adminMigrationRoutes } from './migration';
import { adminUserRoutes } from './users';
import { adminCouponRoutes } from './coupons';
import { adminNotificationRoutes } from './notifications';
import { adminNewsletterRoutes } from './newsletter';
import { adminBisRoutes } from './bis';
import { adminPinResetRoutes } from './pinReset';
import { adminOverviewRoutes } from './overview';
import { adminSecurityMiddleware } from '../../middleware/adminSecurityMiddleware';

export async function adminRoutes(fastify: FastifyInstance): Promise<void> {
  adminSecurityMiddleware(fastify);
  await fastify.register(adminOverviewRoutes, { prefix: '/overview' });
  await fastify.register(adminCatalogRoutes);
  await fastify.register(adminOrderRoutes, { prefix: '/orders' });
  await fastify.register(adminPaymentRoutes, { prefix: '/payments' });
  await fastify.register(adminSubscriptionRoutes, { prefix: '/subscriptions' });
  await fastify.register(adminCreditRoutes, { prefix: '/credits' });
  await fastify.register(adminRewardRoutes, { prefix: '/rewards' });
  await fastify.register(adminTaskRoutes, { prefix: '/tasks' });
  await fastify.register(adminMigrationRoutes, { prefix: '/migration' });
  await fastify.register(adminUserRoutes, { prefix: '/users' });
  await fastify.register(adminCouponRoutes, { prefix: '/coupons' });
  await fastify.register(adminNotificationRoutes, { prefix: '/notifications' });
  await fastify.register(adminNewsletterRoutes, { prefix: '/newsletter' });
  await fastify.register(adminBisRoutes, { prefix: '/bis' });
  await fastify.register(adminPinResetRoutes, { prefix: '/pin-reset' });
}
