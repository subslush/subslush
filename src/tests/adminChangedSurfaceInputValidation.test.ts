import Fastify, { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { adminOrderRoutes } from '../routes/admin/orders';
import { adminSubscriptionRoutes } from '../routes/admin/subscriptions';
import { adminCouponRoutes } from '../routes/admin/coupons';
import { adminCatalogRoutes } from '../routes/admin/catalog';
import { adminNotificationRoutes } from '../routes/admin/notifications';
import { errorHandler } from '../middleware/errorHandler';

const orderId = '00000000-0000-4000-8000-000000000001';
const subscriptionId = '00000000-0000-4000-8000-000000000002';
const couponId = '00000000-0000-4000-8000-000000000003';

const text = (length: number): string => 'x'.repeat(length);
const dateTimeAtLength = (length: number): string =>
  `2026-07-10T12:00:00.${'0'.repeat(length - 21)}Z`;

const expectSchemaRejection = (
  response: { statusCode: number; json: () => any },
  limit: number
): void => {
  expect(response.statusCode).toBe(400);
  const body = response.json();
  expect(body).toMatchObject({
    error: 'Bad Request',
    message: 'Validation failed',
    code: 'INVALID_REQUEST',
  });
  expect(body.details.errors).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        message: `must NOT have more than ${limit} characters`,
      }),
    ])
  );
};

const expectBoundaryReachedAuth = (response: {
  statusCode: number;
  json: () => any;
}): void => {
  expect(response.statusCode).toBe(401);
  expect(response.json()).toMatchObject({
    error: 'Unauthorized',
    code: 'MISSING_TOKEN',
  });
};

describe('Changed admin-surface field limits', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    app.setErrorHandler(errorHandler);
    await app.register(cookie);
    await app.register(adminOrderRoutes, { prefix: '/admin/orders' });
    await app.register(adminSubscriptionRoutes, {
      prefix: '/admin/subscriptions',
    });
    await app.register(adminCouponRoutes, { prefix: '/admin/coupons' });
    await app.register(adminCatalogRoutes);
    await app.register(adminNotificationRoutes, {
      prefix: '/admin/notifications',
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    {
      name: 'subscription credentials',
      url: `/admin/subscriptions/${subscriptionId}/credentials`,
      payload: (value: string) => ({ credentials: value }),
      limit: 4000,
    },
    {
      name: 'activation instructions',
      url: `/admin/orders/${orderId}/items/${subscriptionId}/activation-instructions`,
      payload: (value: string) => ({ instructions: value }),
      limit: 4000,
    },
    {
      name: 'activation link',
      url: `/admin/orders/${orderId}/items/${subscriptionId}/activation-link`,
      payload: (value: string) => ({ activation_link: value }),
      limit: 4000,
    },
    {
      name: 'activation restart note',
      url: `/admin/orders/${orderId}/items/${subscriptionId}/activation-restart`,
      payload: (value: string) => ({ note: value }),
      limit: 500,
    },
    {
      name: 'per-item delivery reason',
      url: `/admin/orders/${orderId}/items/${subscriptionId}/deliver`,
      payload: (value: string) => ({ reason: value }),
      limit: 500,
    },
    {
      name: 'manual mark-paid note',
      url: `/admin/orders/${orderId}/mark-paid`,
      payload: (value: string) => ({ note: value }),
      limit: 1000,
    },
  ])(
    '$name rejects an oversized body before authentication and accepts the exact boundary schema',
    async ({ url, payload, limit }) => {
      const oversized = await app.inject({
        method: 'POST',
        url,
        payload: payload(text(limit + 1)),
      });
      expectSchemaRejection(oversized, limit);

      const boundary = await app.inject({
        method: 'POST',
        url,
        payload: payload(text(limit)),
      });
      expectBoundaryReachedAuth(boundary);
    }
  );

  it('validates coupon create and edit short fields before authentication', async () => {
    const createOversized = await app.inject({
      method: 'POST',
      url: '/admin/coupons',
      payload: { code: text(201), percent_off: 15, scope: 'global' },
    });
    expectSchemaRejection(createOversized, 200);

    const createBoundary = await app.inject({
      method: 'POST',
      url: '/admin/coupons',
      payload: { code: text(200), percent_off: 15, scope: 'global' },
    });
    expectBoundaryReachedAuth(createBoundary);

    const editOversized = await app.inject({
      method: 'PATCH',
      url: `/admin/coupons/${couponId}`,
      payload: { category: text(201) },
    });
    expectSchemaRejection(editOversized, 200);

    const editBoundary = await app.inject({
      method: 'PATCH',
      url: `/admin/coupons/${couponId}`,
      payload: { category: text(200) },
    });
    expectBoundaryReachedAuth(editBoundary);
  });

  it('validates strict-rules and activation-template metadata before authentication', async () => {
    const strictRulesOversized = await app.inject({
      method: 'PATCH',
      url: `/products/${orderId}`,
      payload: {
        metadata: {
          upgrade_options: { strict_rules_text: text(8001) },
        },
      },
    });
    expectSchemaRejection(strictRulesOversized, 8000);

    const strictRulesBoundary = await app.inject({
      method: 'PATCH',
      url: `/products/${orderId}`,
      payload: {
        metadata: {
          upgrade_options: { strict_rules_text: text(8000) },
        },
      },
    });
    expectBoundaryReachedAuth(strictRulesBoundary);

    const instructionsOversized = await app.inject({
      method: 'POST',
      url: '/products',
      payload: {
        name: 'QA product',
        slug: 'qa-product',
        status: 'inactive',
        metadata: {
          upgradeOptions: { activationInstructionsTemplate: text(4001) },
        },
      },
    });
    expectSchemaRejection(instructionsOversized, 4000);

    const instructionsBoundary = await app.inject({
      method: 'POST',
      url: '/products',
      payload: {
        name: 'QA product',
        slug: 'qa-product',
        status: 'inactive',
        metadata: {
          upgradeOptions: { activationInstructionsTemplate: text(4000) },
        },
      },
    });
    expectBoundaryReachedAuth(instructionsBoundary);
  });

  it('validates announcement expiry length before authentication', async () => {
    const oversized = await app.inject({
      method: 'POST',
      url: '/admin/notifications/announcements',
      payload: { message: 'QA announcement', expires_at: dateTimeAtLength(65) },
    });
    expectSchemaRejection(oversized, 64);

    const boundary = await app.inject({
      method: 'POST',
      url: '/admin/notifications/announcements',
      payload: { message: 'QA announcement', expires_at: dateTimeAtLength(64) },
    });
    expectBoundaryReachedAuth(boundary);
  });
});
