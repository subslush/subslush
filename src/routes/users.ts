import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { userService } from '../services/userService';
import { authPreHandler } from '../middleware/authMiddleware';
import { rateLimitMiddleware } from '../middleware/rateLimitMiddleware';
import {
  validateUpdateProfileInput,
  validateUpdateUserStatusInput,
  validateProfileQueryInput,
  UpdateProfileInput,
  UpdateUserStatusInput,
  ProfileQueryInput,
} from '../schemas/user';
import { Logger } from '../utils/logger';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      userId: string;
      email: string;
      role?: string | undefined;
      sessionId: string;
    };
  }
}

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
            return reply.status(401).send({
              error: 'Unauthorized',
              message: 'User ID not found',
            });
          }

          // Validate query parameters
          const queryValidation = validateProfileQueryInput(request.query);
          if (!queryValidation.success) {
            return reply.status(400).send({
              error: 'Invalid Query Parameters',
              message: queryValidation.error,
              details: queryValidation.details,
            });
          }

          const { includeMetadata = true, includeSessions = false } =
            queryValidation.data;

          const result = await userService.getUserProfile(userId, {
            includeMetadata,
            includeSessions,
          });

          if (!result.success) {
            return reply.status(404).send({
              error: 'Profile Not Found',
              message: result.error,
            });
          }

          return reply.send({
            message: 'Profile retrieved successfully',
            profile: result.data,
          });
        } catch (error) {
          Logger.error('Get profile endpoint error:', error);
          return reply.status(500).send({
            error: 'Internal Server Error',
            message: 'Failed to retrieve profile',
          });
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
            return reply.status(401).send({
              error: 'Unauthorized',
              message: 'User ID not found',
            });
          }

          // Validate input
          const validation = validateUpdateProfileInput(request.body);
          if (!validation.success) {
            return reply.status(400).send({
              error: 'Invalid Input',
              message: validation.error,
              details: validation.details,
            });
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
            return reply.status(statusCode).send({
              error: 'Profile Update Failed',
              message: result.error,
              details: result.details,
            });
          }

          Logger.info(`User profile updated: ${userId}`);

          return reply.send({
            message: 'Profile updated successfully',
            profile: result.data,
          });
        } catch (error) {
          Logger.error('Update profile endpoint error:', error);
          return reply.status(500).send({
            error: 'Internal Server Error',
            message: 'Failed to update profile',
          });
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
            return reply.status(401).send({
              error: 'Unauthorized',
              message: 'Admin authentication required',
            });
          }

          // Check admin permissions
          if (adminRole !== 'admin' && adminRole !== 'super_admin') {
            return reply.status(403).send({
              error: 'Forbidden',
              message: 'Admin privileges required for status management',
            });
          }

          // Validate input
          const validation = validateUpdateUserStatusInput(request.body);
          if (!validation.success) {
            return reply.status(400).send({
              error: 'Invalid Input',
              message: validation.error,
              details: validation.details,
            });
          }

          const statusData = validation.data;

          // Prevent self-status modification
          if (adminUserId === userId) {
            return reply.status(400).send({
              error: 'Bad Request',
              message: 'Cannot modify your own status',
            });
          }

          const result = await userService.updateUserStatus(
            userId,
            statusData,
            adminUserId,
            request.ip
          );

          if (!result.success) {
            return reply.status(400).send({
              error: 'Status Update Failed',
              message: result.error,
              details: result.details,
            });
          }

          Logger.info(
            `User status updated: ${userId} to ${statusData.status} by admin ${adminUserId}`
          );

          return reply.send({
            message: 'User status updated successfully',
            user: result.data,
          });
        } catch (error) {
          Logger.error('Update user status endpoint error:', error);
          return reply.status(500).send({
            error: 'Internal Server Error',
            message: 'Failed to update user status',
          });
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
            return reply.status(401).send({
              error: 'Unauthorized',
              message: 'User ID not found',
            });
          }

          const result = await userService.getUserSessions(userId);

          if (!result.success) {
            return reply.status(500).send({
              error: 'Sessions Retrieval Failed',
              message: result.error,
            });
          }

          // Mark current session
          const sessionsWithCurrent = result.data?.map((session: any) => ({
            ...session,
            isCurrent: session.sessionId === currentSessionId,
          }));

          return reply.send({
            message: 'User sessions retrieved successfully',
            sessions: sessionsWithCurrent,
            totalCount: sessionsWithCurrent?.length || 0,
            currentSessionId,
          });
        } catch (error) {
          Logger.error('Get user sessions endpoint error:', error);
          return reply.status(500).send({
            error: 'Internal Server Error',
            message: 'Failed to retrieve user sessions',
          });
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
            return reply.status(401).send({
              error: 'Unauthorized',
              message: 'User authentication required',
            });
          }

          // Validate input
          if (!reason || reason.trim().length < 10) {
            return reply.status(400).send({
              error: 'Invalid Input',
              message: 'Deletion reason must be at least 10 characters',
            });
          }

          // Email confirmation for account deletion
          if (confirmEmail && confirmEmail !== userEmail) {
            return reply.status(400).send({
              error: 'Invalid Input',
              message: 'Email confirmation does not match',
            });
          }

          const result = await userService.deleteUserAccount(
            userId,
            reason,
            userId // Self-deletion
          );

          if (!result.success) {
            return reply.status(400).send({
              error: 'Account Deletion Failed',
              message: result.error,
            });
          }

          Logger.info(`User account deleted: ${userId} (self-deletion)`);

          return reply.send({
            message: 'Account deleted successfully',
          });
        } catch (error) {
          Logger.error('Delete account endpoint error:', error);
          return reply.status(500).send({
            error: 'Internal Server Error',
            message: 'Failed to delete account',
          });
        }
      }
    );
  });
}
