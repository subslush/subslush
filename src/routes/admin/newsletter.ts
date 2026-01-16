import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authPreHandler } from '../../middleware/authMiddleware';
import { adminPreHandler } from '../../middleware/adminMiddleware';
import { newsletterService } from '../../services/newsletterService';
import { ErrorResponses, SuccessResponses } from '../../utils/response';
import { Logger } from '../../utils/logger';
import type { NewsletterSubscriberStatus } from '../../services/newsletterService';

export async function adminNewsletterRoutes(
  fastify: FastifyInstance
): Promise<void> {
  fastify.get(
    '/subscribers',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['subscribed', 'unsubscribed'] },
            search: { type: 'string' },
            limit: { type: 'number', minimum: 1, maximum: 500 },
            offset: { type: 'number', minimum: 0 },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const {
          status,
          search,
          limit = 50,
          offset = 0,
        } = request.query as {
          status?: NewsletterSubscriberStatus;
          search?: string;
          limit?: number;
          offset?: number;
        };

        const filters: {
          status?: NewsletterSubscriberStatus;
          search?: string;
          limit?: number;
          offset?: number;
        } = {
          limit,
          offset,
        };
        if (status) {
          filters.status = status;
        }
        if (search) {
          filters.search = search;
        }

        const result = await newsletterService.listSubscribers(filters);

        return SuccessResponses.ok(reply, {
          subscribers: result.subscribers,
          pagination: {
            limit,
            offset,
            total: result.total,
            hasMore: offset + limit < result.total,
          },
        });
      } catch (error) {
        Logger.error('Admin list newsletter subscribers failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to retrieve newsletter subscribers'
        );
      }
    }
  );
}
