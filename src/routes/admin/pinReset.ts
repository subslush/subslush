import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authPreHandler } from '../../middleware/authMiddleware';
import { adminPreHandler } from '../../middleware/adminMiddleware';
import { createRateLimitHandler } from '../../middleware/rateLimitMiddleware';
import { logAdminAction } from '../../services/auditLogService';
import { pinResetService } from '../../services/pinResetService';
import {
  validateAdminPinResetRequestInput,
  validateAdminPinResetConfirmInput,
} from '../../schemas/adminPinReset';
import {
  ErrorResponses,
  SuccessResponses,
  sendError,
  HttpStatus,
} from '../../utils/response';
import { Logger } from '../../utils/logger';

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

export async function adminPinResetRoutes(
  fastify: FastifyInstance
): Promise<void> {
  fastify.post(
    '/request',
    {
      preHandler: [pinResetRequestRateLimit, authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const adminUserId = request.user?.userId;
        if (!adminUserId) {
          return ErrorResponses.unauthorized(
            reply,
            'Admin authentication required'
          );
        }

        const validation = validateAdminPinResetRequestInput(request.body);
        if (!validation.success) {
          return sendError(
            reply,
            HttpStatus.BAD_REQUEST,
            'Invalid Input',
            validation.error,
            'INVALID_INPUT',
            validation.details
          );
        }

        const { user_id: userId } = validation.data;
        const result = await pinResetService.requestReset(userId, adminUserId);

        if (!result.success) {
          if (result.error === 'user_not_found') {
            return ErrorResponses.notFound(reply, 'User not found');
          }
          if (result.error === 'email_failed') {
            return ErrorResponses.serviceUnavailable(
              reply,
              'Failed to send verification email'
            );
          }
          if (result.error === 'request_failed') {
            return ErrorResponses.internalError(
              reply,
              'Failed to create PIN reset request'
            );
          }
          return ErrorResponses.internalError(
            reply,
            'Failed to create PIN reset request'
          );
        }

        await logAdminAction(request, {
          action: 'pin_reset_requested',
          entityType: 'user',
          entityId: userId,
          metadata: {
            request_id: result.data.requestId,
            expires_at: result.data.expiresAt.toISOString(),
          },
        });

        return SuccessResponses.ok(
          reply,
          {
            request_id: result.data.requestId,
            user_id: result.data.userId,
            email_masked: result.data.emailMasked,
            expires_at: result.data.expiresAt.toISOString(),
          },
          'Verification code sent'
        );
      } catch (error) {
        Logger.error('Admin PIN reset request failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to create PIN reset request'
        );
      }
    }
  );

  fastify.post(
    '/confirm',
    {
      preHandler: [pinResetConfirmRateLimit, authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const adminUserId = request.user?.userId;
        if (!adminUserId) {
          return ErrorResponses.unauthorized(
            reply,
            'Admin authentication required'
          );
        }

        const validation = validateAdminPinResetConfirmInput(request.body);
        if (!validation.success) {
          return sendError(
            reply,
            HttpStatus.BAD_REQUEST,
            'Invalid Input',
            validation.error,
            'INVALID_INPUT',
            validation.details
          );
        }

        const { user_id: userId, code } = validation.data;
        const result = await pinResetService.confirmReset(
          userId,
          code,
          adminUserId
        );

        if (!result.success) {
          if (result.error === 'user_not_found') {
            return ErrorResponses.notFound(reply, 'User not found');
          }
          if (result.error === 'no_pending_request') {
            return sendError(
              reply,
              HttpStatus.CONFLICT,
              'No Active Request',
              'No active PIN reset request found for this user.',
              'PIN_RESET_NOT_FOUND'
            );
          }
          if (result.error === 'invalid_code') {
            return sendError(
              reply,
              HttpStatus.BAD_REQUEST,
              'Invalid Code',
              'The verification code is invalid.',
              'PIN_RESET_INVALID_CODE'
            );
          }
          return ErrorResponses.internalError(
            reply,
            'Failed to confirm PIN reset'
          );
        }

        await logAdminAction(request, {
          action: 'pin_reset_confirmed',
          entityType: 'user',
          entityId: userId,
          metadata: {
            had_pin: result.data.hadPin,
            reset_at: result.data.resetAt.toISOString(),
          },
        });

        return SuccessResponses.ok(
          reply,
          {
            reset: true,
            user_id: result.data.userId,
            had_pin: result.data.hadPin,
            reset_at: result.data.resetAt.toISOString(),
          },
          'PIN reset confirmed'
        );
      } catch (error) {
        Logger.error('Admin PIN reset confirmation failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to confirm PIN reset'
        );
      }
    }
  );
}
