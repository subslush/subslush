import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { userService } from '../services/userService';
import { authPreHandler } from '../middleware/authMiddleware';
import { rateLimitMiddleware } from '../middleware/rateLimitMiddleware';
import { ErrorResponses, SuccessResponses, sendError } from '../utils/response';
import {
  validateUpdateProfileInput,
  validateUpdateUserStatusInput,
  validateProfileQueryInput,
  UpdateProfileInput,
  UpdateUserStatusInput,
  ProfileQueryInput,
} from '../schemas/user';
import { Logger } from '../utils/logger';
import '../types/fastify';

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

          // Check if user is trying to update their own profile
          if (updates.email && updates.email !== userEmail) {
            // Additional validation could be added here for email change confirmations
            Logger.info(
              `User ${userId} attempting to change email from ${userEmail} to ${updates.email}`
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
        preHandler: [authPreHandler],
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
