import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authPreHandler } from '../../middleware/authMiddleware';
import { adminPreHandler } from '../../middleware/adminMiddleware';
import { bisService, BisInquiryStatus } from '../../services/bisService';
import { ErrorResponses, SuccessResponses } from '../../utils/response';
import { Logger } from '../../utils/logger';

const BIS_STATUSES: BisInquiryStatus[] = [
  'active',
  'issue',
  'cancelled',
  'solved',
];

export async function adminBisRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: BIS_STATUSES },
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
          limit = 50,
          offset = 0,
        } = request.query as {
          status?: BisInquiryStatus;
          limit?: number;
          offset?: number;
        };

        const filters: {
          status?: BisInquiryStatus;
          limit?: number;
          offset?: number;
        } = {
          limit,
          offset,
        };
        if (status) {
          filters.status = status;
        }

        const result = await bisService.listInquiries(filters);

        return SuccessResponses.ok(reply, {
          inquiries: result.inquiries,
          pagination: {
            limit,
            offset,
            total: result.total,
            hasMore: offset + limit < result.total,
          },
        });
      } catch (error) {
        Logger.error('Admin list BIS inquiries failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to retrieve inquiries'
        );
      }
    }
  );

  fastify.get(
    '/:inquiryId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['inquiryId'],
          properties: {
            inquiryId: { type: 'string' },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { inquiryId } = request.params as { inquiryId: string };
        const inquiry = await bisService.getInquiryById(inquiryId);
        if (!inquiry) {
          return ErrorResponses.notFound(reply, 'Inquiry not found');
        }

        return SuccessResponses.ok(reply, { inquiry });
      } catch (error) {
        Logger.error('Admin get BIS inquiry failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to retrieve inquiry'
        );
      }
    }
  );

  fastify.patch(
    '/:inquiryId/status',
    {
      schema: {
        params: {
          type: 'object',
          required: ['inquiryId'],
          properties: {
            inquiryId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['status'],
          properties: {
            status: { type: 'string', enum: BIS_STATUSES },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { inquiryId } = request.params as { inquiryId: string };
        const { status } = request.body as { status: BisInquiryStatus };

        const result = await bisService.updateInquiryStatus(inquiryId, status);
        if (!result.success) {
          if (result.error === 'Inquiry not found') {
            return ErrorResponses.notFound(reply, 'Inquiry not found');
          }
          return ErrorResponses.internalError(reply, result.error);
        }

        return SuccessResponses.ok(
          reply,
          { inquiry: result.inquiry },
          'Inquiry updated'
        );
      } catch (error) {
        Logger.error('Admin update BIS inquiry failed:', error);
        return ErrorResponses.internalError(reply, 'Failed to update inquiry');
      }
    }
  );
}
