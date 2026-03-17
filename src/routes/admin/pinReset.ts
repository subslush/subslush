import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authPreHandler } from '../../middleware/authMiddleware';
import { adminPreHandler } from '../../middleware/adminMiddleware';
import { createRateLimitHandler } from '../../middleware/rateLimitMiddleware';
import {
  ErrorResponses,
  sendError,
  HttpStatus,
} from '../../utils/response';

const PIN_DEPRECATED_ON = '2026-03-12';

const pinResetRequestRateLimit = createRateLimitHandler({
  windowMs: 15 * 60 * 1000,
  maxRequests: 10,
  keyGenerator: (request: FastifyRequest) => {
    const adminId = request.user?.userId || request.ip;
    return `admin_pin_reset_request:${adminId}`;
  },
});

const pinResetConfirmRateLimit = createRateLimitHandler({
  windowMs: 15 * 60 * 1000,
  maxRequests: 20,
  keyGenerator: (request: FastifyRequest) => {
    const adminId = request.user?.userId || request.ip;
    return `admin_pin_reset_confirm:${adminId}`;
  },
});

function sendAdminPinDeprecated(reply: FastifyReply): FastifyReply {
  return sendError(
    reply,
    HttpStatus.GONE,
    'Gone',
    'PIN reset is deprecated. Credential reveal is now available directly from Orders.',
    'PIN_DEPRECATED',
    {
      deprecated_on: PIN_DEPRECATED_ON,
      replacement: 'POST /orders/:orderId/credentials/reveal',
    }
  );
}

export async function adminPinResetRoutes(
  fastify: FastifyInstance
): Promise<void> {
  fastify.post(
    '/request',
    {
      preHandler: [pinResetRequestRateLimit, authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const adminUserId = request.user?.userId;
      if (!adminUserId) {
        return ErrorResponses.unauthorized(
          reply,
          'Admin authentication required'
        );
      }

      return sendAdminPinDeprecated(reply);
    }
  );

  fastify.post(
    '/confirm',
    {
      preHandler: [pinResetConfirmRateLimit, authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const adminUserId = request.user?.userId;
      if (!adminUserId) {
        return ErrorResponses.unauthorized(
          reply,
          'Admin authentication required'
        );
      }

      return sendAdminPinDeprecated(reply);
    }
  );
}
