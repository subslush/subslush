import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createRateLimitHandler } from '../middleware/rateLimitMiddleware';
import { validateNewsletterSubscribeInput } from '../schemas/newsletter';
import { newsletterService } from '../services/newsletterService';
import { ErrorResponses, SuccessResponses, sendError } from '../utils/response';
import { Logger } from '../utils/logger';

const newsletterRateLimit = createRateLimitHandler({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 5,
  keyGenerator: (request: FastifyRequest) => {
    const body = request.body as { email?: string } | undefined;
    const email = body?.email ? String(body.email).toLowerCase() : 'unknown';
    return `newsletter:${request.ip}:${email}`;
  },
});

export async function newsletterRoutes(
  fastify: FastifyInstance
): Promise<void> {
  fastify.post(
    '/subscribe',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email'],
          properties: {
            email: { type: 'string' },
            source: { type: 'string' },
          },
        },
      },
      preHandler: [newsletterRateLimit],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const validation = validateNewsletterSubscribeInput(request.body);
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

        const result = await newsletterService.subscribe({
          email: validation.data.email,
          source: validation.data.source ?? 'homepage',
        });

        if (!result.success) {
          return ErrorResponses.internalError(
            reply,
            result.error || 'Failed to subscribe to newsletter'
          );
        }

        let message =
          'Thanks for subscribing! Check your email for your 12% off coupon.';
        if (result.alreadySubscribed) {
          message = result.emailSent
            ? 'You were already subscribed. We resent your coupon details.'
            : 'You are already subscribed to the newsletter.';
        } else if (result.emailSent === false) {
          message =
            'Subscription saved, but we could not send the coupon email. Please try again shortly.';
        }

        return SuccessResponses.ok(
          reply,
          {
            alreadySubscribed: result.alreadySubscribed ?? false,
            emailSent: result.emailSent ?? false,
          },
          message
        );
      } catch (error) {
        Logger.error('Newsletter subscribe failed:', error);
        return ErrorResponses.internalError(reply, 'Failed to subscribe');
      }
    }
  );
}
