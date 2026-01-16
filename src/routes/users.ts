import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { userService } from '../services/userService';
import { pinService } from '../services/pinService';
import { authPreHandler } from '../middleware/authMiddleware';
import {
  rateLimitMiddleware,
  createRateLimitHandler,
} from '../middleware/rateLimitMiddleware';
import { enforceCsrfForCookieAuth } from '../middleware/csrfMiddleware';
import {
  ErrorResponses,
  SuccessResponses,
  sendError,
  HttpStatus,
} from '../utils/response';
import {
  validateUpdateProfileInput,
  validateUpdateUserStatusInput,
  validateProfileQueryInput,
  UpdateProfileInput,
  UpdateUserStatusInput,
  ProfileQueryInput,
} from '../schemas/user';
import { validatePinInput } from '../schemas/pin';
import { Logger } from '../utils/logger';
import { logAdminAction } from '../services/auditLogService';

const pinSetRateLimit = createRateLimitHandler({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 5,
  keyGenerator: (request: FastifyRequest) => {
    const userId = request.user?.userId || request.ip;
    return `pin_set:${userId}`;
  },
});

const pinVerifyRateLimit = createRateLimitHandler({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 20,
  keyGenerator: (request: FastifyRequest) => {
    const userId = request.user?.userId || request.ip;
    return `pin_verify:${userId}`;
  },
});

const pinResetRateLimit = createRateLimitHandler({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 3,
  keyGenerator: (request: FastifyRequest) => {
    const userId = request.user?.userId || request.ip;
    return `pin_reset:${userId}`;
  },
});

export async function userRoutes(fastify: FastifyInstance): Promise<void> {
  // API info endpoint
  fastify.get('/', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      message: 'User Management API',
      version: '2.3',
      endpoints: [
        'GET /users/profile',
        'PUT /users/profile',
        'PATCH /users/status',
        'GET /users/sessions',
        'DELETE /users/account',
        'GET /users/pin/status',
        'POST /users/pin/set',
        'POST /users/pin/verify',
        'POST /users/pin/reset-request',
      ],
    });
  });

  // Get current user's profile
  fastify.register(async fastify => {
    fastify.get<{
      Querystring: ProfileQueryInput;
    }>(
      '/profile',
      {
        preHandler: [authPreHandler],
      },
      async (
        request: FastifyRequest<{ Querystring: ProfileQueryInput }>,
        reply: FastifyReply
      ) => {
        try {
          const userId = request.user?.userId;

          if (!userId) {
            return ErrorResponses.unauthorized(reply, 'User ID not found');
          }

          // Validate query parameters
          const queryValidation = validateProfileQueryInput(request.query);
          if (!queryValidation.success) {
            return sendError(
              reply,
              400,
              'Invalid Query Parameters',
              queryValidation.error,
              'INVALID_QUERY',
              queryValidation.details
            );
          }

          const { includeMetadata = true, includeSessions = false } =
            queryValidation.data;

          const result = await userService.getUserProfile(userId, {
            includeMetadata,
            includeSessions,
          });

          if (!result.success) {
            return ErrorResponses.notFound(reply, result.error);
          }

          return SuccessResponses.ok(
            reply,
            { profile: result.data },
            'Profile retrieved successfully'
          );
        } catch (error) {
          Logger.error('Get profile endpoint error:', error);
          return ErrorResponses.internalError(
            reply,
            'Failed to retrieve profile'
          );
        }
      }
    );
  });

  // Update current user's profile
  fastify.register(async fastify => {
    await fastify.register(
      rateLimitMiddleware({
        windowMs: 15 * 60 * 1000,
        maxRequests: 10,
      })
    );

    fastify.put<{
      Body: UpdateProfileInput;
    }>(
      '/profile',
      {
        preHandler: [authPreHandler],
      },
      async (
        request: FastifyRequest<{ Body: UpdateProfileInput }>,
        reply: FastifyReply
      ) => {
        try {
          const userId = request.user?.userId;
          const userEmail = request.user?.email;

          if (!userId || !userEmail) {
            return ErrorResponses.unauthorized(reply, 'User ID not found');
          }

          // Validate input
          const validation = validateUpdateProfileInput(request.body);
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

          const updates = validation.data;

          if (updates.email || updates.displayName) {
            return ErrorResponses.badRequest(
              reply,
              'Email and username updates are disabled. Contact support if you need to make changes.'
            );
          }

          const result = await userService.updateUserProfile(
            userId,
            updates,
            userId // User is updating their own profile
          );

          if (!result.success) {
            const statusCode = result.error?.includes('already in use')
              ? 409
              : 400;
            return sendError(
              reply,
              statusCode,
              'Profile Update Failed',
              result.error || 'Update failed',
              'UPDATE_FAILED',
              result.details
            );
          }

          Logger.info(`User profile updated: ${userId}`);

          return SuccessResponses.ok(
            reply,
            { profile: result.data },
            'Profile updated successfully'
          );
        } catch (error) {
          Logger.error('Update profile endpoint error:', error);
          return ErrorResponses.internalError(
            reply,
            'Failed to update profile'
          );
        }
      }
    );
  });

  // Set user PIN (requires first paid order)
  fastify.get(
    '/pin/status',
    {
      preHandler: [authPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = request.user?.userId;
        if (!userId) {
          return ErrorResponses.unauthorized(reply, 'Authentication required');
        }

        const result = await pinService.getPinStatus(userId);
        if (!result.success || !result.data) {
          return ErrorResponses.notFound(reply, 'User not found');
        }

        reply.header('Cache-Control', 'no-store, max-age=0');
        return SuccessResponses.ok(reply, {
          has_pin: result.data.hasPin,
          pin_set_at: result.data.pinSetAt,
        });
      } catch (error) {
        Logger.error('PIN status endpoint error:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to fetch PIN status'
        );
      }
    }
  );

  // Set user PIN (requires first paid order)
  fastify.post<{
    Body: { pin: string };
  }>(
    '/pin/set',
    {
      preHandler: [pinSetRateLimit, authPreHandler],
    },
    async (
      request: FastifyRequest<{ Body: { pin: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const userId = request.user?.userId;
        if (!userId) {
          return ErrorResponses.unauthorized(reply, 'Authentication required');
        }

        const validation = validatePinInput(request.body);
        if (!validation.success) {
          return sendError(
            reply,
            HttpStatus.BAD_REQUEST,
            'Invalid PIN',
            validation.error,
            'INVALID_PIN',
            validation.details
          );
        }

        const result = await pinService.setPin(userId, validation.data.pin);
        if (!result.success) {
          if (result.reason === 'pin_already_set') {
            return sendError(
              reply,
              HttpStatus.CONFLICT,
              'PIN Already Set',
              'PIN is already configured for this account',
              'PIN_ALREADY_SET'
            );
          }

          if (result.reason === 'no_paid_order') {
            return ErrorResponses.forbidden(
              reply,
              'PIN setup requires a completed paid order'
            );
          }

          if (result.reason === 'user_not_found') {
            return ErrorResponses.notFound(reply, 'User not found');
          }

          return ErrorResponses.internalError(reply, 'Failed to set PIN');
        }

        await logAdminAction(request, {
          action: 'pin_set',
          entityType: 'user',
          entityId: userId,
          after: { pin_set_at: result.pinSetAt },
          metadata: { source: 'self_service' },
        });

        return SuccessResponses.ok(
          reply,
          { pin_set_at: result.pinSetAt },
          'PIN set successfully'
        );
      } catch (error) {
        Logger.error('Set PIN endpoint error:', error);
        return ErrorResponses.internalError(reply, 'Failed to set PIN');
      }
    }
  );

  // Verify PIN and issue short-lived token
  fastify.post<{
    Body: { pin: string };
  }>(
    '/pin/verify',
    {
      preHandler: [pinVerifyRateLimit, authPreHandler],
    },
    async (
      request: FastifyRequest<{ Body: { pin: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const userId = request.user?.userId;
        if (!userId) {
          return ErrorResponses.unauthorized(reply, 'Authentication required');
        }

        const validation = validatePinInput(request.body);
        if (!validation.success) {
          return sendError(
            reply,
            HttpStatus.BAD_REQUEST,
            'Invalid PIN',
            validation.error,
            'INVALID_PIN',
            validation.details
          );
        }

        const verifyResult = await pinService.verifyPin(
          userId,
          validation.data.pin
        );

        if (!verifyResult.success) {
          if (verifyResult.reason === 'not_set') {
            return ErrorResponses.badRequest(reply, 'PIN has not been set');
          }

          if (verifyResult.reason === 'locked') {
            if (verifyResult.lockoutTriggered) {
              await logAdminAction(request, {
                action: 'pin_lockout',
                entityType: 'user',
                entityId: userId,
                metadata: {
                  locked_until: verifyResult.lockedUntil
                    ? verifyResult.lockedUntil.toISOString()
                    : undefined,
                  failed_attempts: verifyResult.failedAttempts,
                },
              });
            }
            return sendError(
              reply,
              HttpStatus.TOO_MANY_REQUESTS,
              'PIN Locked',
              'Too many failed PIN attempts. Try again later.',
              'PIN_LOCKED',
              {
                locked_until: verifyResult.lockedUntil
                  ? verifyResult.lockedUntil.toISOString()
                  : undefined,
              }
            );
          }

          if (verifyResult.reason === 'invalid') {
            return sendError(
              reply,
              HttpStatus.UNAUTHORIZED,
              'Invalid PIN',
              'The PIN you entered is incorrect',
              'PIN_INVALID',
              {
                attempts_remaining: verifyResult.attemptsRemaining,
              }
            );
          }

          if (verifyResult.reason === 'user_not_found') {
            return ErrorResponses.notFound(reply, 'User not found');
          }

          return ErrorResponses.internalError(reply, 'Failed to verify PIN');
        }

        const tokenResult = await pinService.issuePinToken(userId);
        if (!tokenResult.success) {
          return sendError(
            reply,
            HttpStatus.SERVICE_UNAVAILABLE,
            'Service Unavailable',
            tokenResult.error || 'PIN verification unavailable',
            'PIN_TOKEN_UNAVAILABLE'
          );
        }

        return SuccessResponses.ok(reply, {
          pin_token: tokenResult.data.token,
          expires_at: tokenResult.data.expiresAt.toISOString(),
          expires_in_seconds: tokenResult.data.expiresInSeconds,
        });
      } catch (error) {
        Logger.error('Verify PIN endpoint error:', error);
        return ErrorResponses.internalError(reply, 'Failed to verify PIN');
      }
    }
  );

  // PIN reset request (support flow)
  fastify.post(
    '/pin/reset-request',
    {
      preHandler: [pinResetRateLimit, authPreHandler],
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return SuccessResponses.ok(
        reply,
        { support_url: '/help' },
        'PIN reset requires support assistance'
      );
    }
  );

  // Update user status (admin only)
  fastify.register(async fastify => {
    await fastify.register(
      rateLimitMiddleware({
        windowMs: 10 * 60 * 1000,
        maxRequests: 5,
      })
    );

    fastify.patch<{
      Params: { userId: string };
      Body: UpdateUserStatusInput;
    }>(
      '/status/:userId',
      {
        preHandler: [authPreHandler, enforceCsrfForCookieAuth],
      },
      async (
        request: FastifyRequest<{
          Params: { userId: string };
          Body: UpdateUserStatusInput;
        }>,
        reply: FastifyReply
      ) => {
        try {
          const adminUserId = request.user?.userId;
          const adminRole = request.user?.role;
          const { userId } = request.params;

          if (!adminUserId) {
            return ErrorResponses.unauthorized(
              reply,
              'Admin authentication required'
            );
          }

          // Check admin permissions
          if (adminRole !== 'admin' && adminRole !== 'super_admin') {
            return ErrorResponses.forbidden(
              reply,
              'Admin privileges required for status management'
            );
          }

          // Validate input
          const validation = validateUpdateUserStatusInput(request.body);
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

          const statusData = validation.data;

          // Prevent self-status modification
          if (adminUserId === userId) {
            return ErrorResponses.badRequest(
              reply,
              'Cannot modify your own status'
            );
          }

          const result = await userService.updateUserStatus(
            userId,
            statusData,
            adminUserId,
            request.ip
          );

          if (!result.success) {
            return sendError(
              reply,
              400,
              'Status Update Failed',
              result.error || 'Status update failed',
              'UPDATE_FAILED',
              result.details
            );
          }

          Logger.info(
            `User status updated: ${userId} to ${statusData.status} by admin ${adminUserId}`
          );

          return SuccessResponses.ok(
            reply,
            { user: result.data },
            'User status updated successfully'
          );
        } catch (error) {
          Logger.error('Update user status endpoint error:', error);
          return ErrorResponses.internalError(
            reply,
            'Failed to update user status'
          );
        }
      }
    );
  });

  // Get current user's active sessions
  fastify.register(async fastify => {
    fastify.get(
      '/sessions',
      {
        preHandler: [authPreHandler],
      },
      async (request: FastifyRequest, reply: FastifyReply) => {
        try {
          const userId = request.user?.userId;
          const currentSessionId = request.user?.sessionId;

          if (!userId) {
            return ErrorResponses.unauthorized(reply, 'User ID not found');
          }

          const result = await userService.getUserSessions(userId);

          if (!result.success) {
            return ErrorResponses.internalError(reply, result.error);
          }

          // Mark current session
          const sessionsWithCurrent = result.data?.map((session: any) => ({
            ...session,
            isCurrent: session.sessionId === currentSessionId,
          }));

          return SuccessResponses.ok(
            reply,
            {
              sessions: sessionsWithCurrent,
              totalCount: sessionsWithCurrent?.length || 0,
              currentSessionId,
            },
            'User sessions retrieved successfully'
          );
        } catch (error) {
          Logger.error('Get user sessions endpoint error:', error);
          return ErrorResponses.internalError(
            reply,
            'Failed to retrieve user sessions'
          );
        }
      }
    );
  });

  // Delete user account (self or admin)
  fastify.register(async fastify => {
    await fastify.register(
      rateLimitMiddleware({
        windowMs: 60 * 60 * 1000,
        maxRequests: 3,
      })
    );

    fastify.delete<{
      Body: { reason: string; confirmEmail?: string };
    }>(
      '/account',
      {
        preHandler: [authPreHandler],
      },
      async (
        request: FastifyRequest<{
          Body: { reason: string; confirmEmail?: string };
        }>,
        reply: FastifyReply
      ) => {
        try {
          const userId = request.user?.userId;
          const userEmail = request.user?.email;
          const { reason, confirmEmail } = request.body;

          if (!userId || !userEmail) {
            return ErrorResponses.unauthorized(
              reply,
              'User authentication required'
            );
          }

          // Validate input
          if (!reason || reason.trim().length < 10) {
            return ErrorResponses.badRequest(
              reply,
              'Deletion reason must be at least 10 characters'
            );
          }

          // Email confirmation for account deletion
          if (confirmEmail && confirmEmail !== userEmail) {
            return ErrorResponses.badRequest(
              reply,
              'Email confirmation does not match'
            );
          }

          const result = await userService.deleteUserAccount(
            userId,
            reason,
            userId // Self-deletion
          );

          if (!result.success) {
            return ErrorResponses.badRequest(
              reply,
              result.error || 'Account deletion failed'
            );
          }

          Logger.info(`User account deleted: ${userId} (self-deletion)`);

          return SuccessResponses.ok(
            reply,
            undefined,
            'Account deleted successfully'
          );
        } catch (error) {
          Logger.error('Delete account endpoint error:', error);
          return ErrorResponses.internalError(
            reply,
            'Failed to delete account'
          );
        }
      }
    );
  });
}
