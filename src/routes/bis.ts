import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createRateLimitHandler } from '../middleware/rateLimitMiddleware';
import { validateBisInquiryInput } from '../schemas/bis';
import { bisService } from '../services/bisService';
import { ErrorResponses, SuccessResponses, sendError } from '../utils/response';
import { Logger } from '../utils/logger';

const bisRateLimit = createRateLimitHandler({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 5,
  keyGenerator: (request: FastifyRequest) => {
    const body = request.body as { email?: string } | undefined;
    const email = body?.email ? String(body.email).toLowerCase() : 'unknown';
    return `bis:${request.ip}:${email}`;
  },
});

export async function bisRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    '/inquiries',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email', 'topic', 'message'],
          properties: {
            email: { type: 'string' },
            topic: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
      preHandler: [bisRateLimit],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const validation = validateBisInquiryInput(request.body);
        if (!validation.success) {
          return sendError(
            reply,
            400,
            'Invalid Input',
            validation.error,
            'INVALID_INPUT',
            validation.details
          );
        }

        const result = await bisService.createInquiry({
          email: validation.data.email,
          topic: validation.data.topic,
          message: validation.data.message,
        });

        if (!result.success) {
          return ErrorResponses.internalError(
            reply,
            result.error || 'Failed to submit inquiry'
          );
        }

        return SuccessResponses.created(
          reply,
          { inquiryId: result.inquiry.id },
          'Thanks for the feedback. We appreciate the help.'
        );
      } catch (error) {
        Logger.error('BIS inquiry submission failed:', error);
        return ErrorResponses.internalError(reply, 'Failed to submit inquiry');
      }
    }
  );
}
