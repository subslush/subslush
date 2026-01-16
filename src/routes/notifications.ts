import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authPreHandler } from '../middleware/authMiddleware';
import { createRateLimitHandler } from '../middleware/rateLimitMiddleware';
import { notificationService } from '../services/notificationService';
import { ErrorResponses, SuccessResponses } from '../utils/response';
import { Logger } from '../utils/logger';

const notificationsRateLimit = createRateLimitHandler({
  windowMs: 60 * 1000,
  maxRequests: 60,
  keyGenerator: (request: FastifyRequest) => {
    const userId = request.user?.userId || request.ip;
    return `notifications:${userId}`;
  },
});

const parseBoolean = (value: unknown): boolean | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return undefined;
};

export async function notificationRoutes(
  fastify: FastifyInstance
): Promise<void> {
  fastify.get(
    '/',
    {
      preHandler: [notificationsRateLimit, authPreHandler],
      schema: {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'number', minimum: 1, maximum: 100 },
            offset: { type: 'number', minimum: 0 },
            unread_only: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = request.user?.userId;
        if (!userId) {
          return ErrorResponses.unauthorized(reply, 'Authentication required');
        }

        const query = request.query as {
          limit?: number;
          offset?: number;
          unread_only?: string;
        };

        const limit = Number(query.limit ?? 10);
        const offset = Number(query.offset ?? 0);
        const unreadOnly = parseBoolean(query.unread_only) ?? false;

        const result = await notificationService.listNotificationsForUser({
          userId,
          limit,
          offset,
          unreadOnly,
        });

        if (!result.success) {
          return ErrorResponses.internalError(
            reply,
            result.error || 'Failed to list notifications'
          );
        }

        return SuccessResponses.ok(reply, {
          notifications: result.data.notifications,
          pagination: {
            limit,
            offset,
            total: result.data.total,
            hasMore: offset + limit < result.data.total,
          },
          unread_count: result.data.unreadCount,
        });
      } catch (error) {
        Logger.error('Notifications list failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to list notifications'
        );
      }
    }
  );

  fastify.post(
    '/read',
    {
      preValidation: (request: FastifyRequest, _reply: FastifyReply, done) => {
        if (request.body === undefined) {
          request.body = {};
        }
        done();
      },
      preHandler: [notificationsRateLimit, authPreHandler],
      schema: {
        body: {
          type: 'object',
          properties: {
            ids: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = request.user?.userId;
        if (!userId) {
          return ErrorResponses.unauthorized(reply, 'Authentication required');
        }

        const body = request.body as { ids?: string[] } | undefined;
        const ids = body?.ids?.filter(Boolean);

        const result = await notificationService.markNotificationsRead({
          userId,
          ...(ids ? { ids } : {}),
        });

        if (!result.success) {
          return ErrorResponses.internalError(
            reply,
            result.error || 'Failed to update notifications'
          );
        }

        return SuccessResponses.ok(reply, {
          updated: result.data.updated,
        });
      } catch (error) {
        Logger.error('Notifications mark read failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to update notifications'
        );
      }
    }
  );

  fastify.delete(
    '/',
    {
      preValidation: (request: FastifyRequest, _reply: FastifyReply, done) => {
        if (request.body === undefined) {
          request.body = {};
        }
        done();
      },
      preHandler: [notificationsRateLimit, authPreHandler],
      schema: {
        body: {
          type: 'object',
          properties: {
            ids: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = request.user?.userId;
        if (!userId) {
          return ErrorResponses.unauthorized(reply, 'Authentication required');
        }

        const body = request.body as { ids?: string[] } | undefined;
        const ids = body?.ids?.filter(Boolean);

        const result = await notificationService.clearNotificationsForUser({
          userId,
          ...(ids ? { ids } : {}),
        });

        if (!result.success) {
          return ErrorResponses.internalError(
            reply,
            result.error || 'Failed to clear notifications'
          );
        }

        const clearedCount = result.data.cleared;
        return SuccessResponses.ok(reply, {
          cleared: clearedCount,
          deleted: clearedCount,
        });
      } catch (error) {
        Logger.error('Notifications clear failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to clear notifications'
        );
      }
    }
  );
}
