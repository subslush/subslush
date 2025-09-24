import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authService } from '../services/auth';
import {
  authRateLimit,
  bruteForceProtection,
  passwordResetRateLimit,
} from '../middleware/rateLimitMiddleware';
import { authPreHandler } from '../middleware/authMiddleware';
import {
  LoginRequestInput,
  RegisterRequestInput,
  LogoutRequestInput,
} from '../schemas/session';

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      message: 'Authentication API',
      version: '2.2',
      endpoints: [
        'POST /auth/register',
        'POST /auth/login',
        'POST /auth/logout',
        'POST /auth/refresh',
        'GET /auth/sessions',
        'DELETE /auth/sessions/:sessionId',
        'POST /auth/password-reset',
      ],
    });
  });

  // Register endpoint with rate limiting and brute force protection
  fastify.register(async fastify => {
    await fastify.register(authRateLimit);
    await fastify.register(bruteForceProtection);

    fastify.post<{
      Body: RegisterRequestInput;
    }>(
      '/register',
      async (
        request: FastifyRequest<{ Body: RegisterRequestInput }>,
        reply: FastifyReply
      ) => {
        try {
          const { email, password, firstName, lastName } = request.body;

          const sessionOptions = {
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
          };

          const result = await authService.register(
            {
              email,
              password,
              firstName: firstName || undefined,
              lastName: lastName || undefined,
            },
            sessionOptions
          );

          if (!result.success) {
            reply.statusCode = 400;
            return reply.send({
              error: 'Registration Failed',
              message: result.error,
            });
          }

          reply.statusCode = 201;
          return reply.send({
            message: 'Registration successful',
            user: result.user,
            accessToken: result.tokens?.accessToken,
            sessionId: result.sessionId,
          });
        } catch {
          reply.statusCode = 500;
          return reply.send({
            error: 'Internal Server Error',
            message: 'Registration failed',
          });
        }
      }
    );
  });

  // Login endpoint with rate limiting and brute force protection
  fastify.register(async fastify => {
    await fastify.register(authRateLimit);
    await fastify.register(bruteForceProtection);

    fastify.post<{
      Body: LoginRequestInput;
    }>(
      '/login',
      async (
        request: FastifyRequest<{ Body: LoginRequestInput }>,
        reply: FastifyReply
      ) => {
        try {
          const { email, password, rememberMe } = request.body;

          const sessionOptions = {
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'] || undefined,
            metadata: { rememberMe },
          };

          const result = await authService.login(
            { email, password, rememberMe },
            sessionOptions
          );

          if (!result.success) {
            reply.statusCode = 401;
            return reply.send({
              error: 'Authentication Failed',
              message: result.error,
            });
          }

          return reply.send({
            message: 'Login successful',
            user: result.user,
            accessToken: result.tokens?.accessToken,
            sessionId: result.sessionId,
          });
        } catch {
          reply.statusCode = 500;
          return reply.send({
            error: 'Internal Server Error',
            message: 'Login failed',
          });
        }
      }
    );
  });

  // Logout endpoint (requires authentication)
  fastify.register(async fastify => {
    fastify.post<{
      Body: LogoutRequestInput;
    }>(
      '/logout',
      {
        preHandler: [authPreHandler],
      },
      async (
        request: FastifyRequest<{ Body: LogoutRequestInput }>,
        reply: FastifyReply
      ) => {
        try {
          const { allDevices = false } = request.body;
          const sessionId = request.user?.sessionId;

          if (!sessionId) {
            reply.statusCode = 400;
            return reply.send({
              error: 'Bad Request',
              message: 'No active session found',
            });
          }

          const result = await authService.logout(sessionId, allDevices);

          if (!result.success) {
            reply.statusCode = 500;
            return reply.send({
              error: 'Logout Failed',
              message: result.error,
            });
          }

          return reply.send({
            message: allDevices
              ? 'Logged out from all devices'
              : 'Logout successful',
          });
        } catch {
          reply.statusCode = 500;
          return reply.send({
            error: 'Internal Server Error',
            message: 'Logout failed',
          });
        }
      }
    );
  });

  // Refresh session endpoint (requires authentication)
  fastify.register(async fastify => {
    fastify.post(
      '/refresh',
      {
        preHandler: [authPreHandler],
      },
      async (request: FastifyRequest, reply: FastifyReply) => {
        try {
          const sessionId = request.user?.sessionId;

          if (!sessionId) {
            reply.statusCode = 400;
            return reply.send({
              error: 'Bad Request',
              message: 'No active session found',
            });
          }

          const result = await authService.refreshSession(sessionId);

          if (!result.success) {
            reply.statusCode = 401;
            return reply.send({
              error: 'Session Refresh Failed',
              message: result.error,
            });
          }

          return reply.send({
            message: 'Session refreshed successfully',
            user: result.user,
            accessToken: result.tokens?.accessToken,
            sessionId: result.sessionId,
          });
        } catch {
          reply.statusCode = 500;
          return reply.send({
            error: 'Internal Server Error',
            message: 'Session refresh failed',
          });
        }
      }
    );
  });

  // Get user sessions endpoint (requires authentication)
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
            reply.statusCode = 400;
            return reply.send({
              error: 'Bad Request',
              message: 'User ID not found',
            });
          }

          const sessions = await authService.getUserSessions(userId);
          const sessionsWithCurrent = sessions.map((session: any) => ({
            ...session,
            isCurrent: session.sessionId === currentSessionId,
          }));

          return reply.send({
            sessions: sessionsWithCurrent,
            totalCount: sessions.length,
            currentSessionId,
          });
        } catch {
          reply.statusCode = 500;
          return reply.send({
            error: 'Internal Server Error',
            message: 'Failed to retrieve sessions',
          });
        }
      }
    );
  });

  // Revoke specific session endpoint (requires authentication)
  fastify.register(async fastify => {
    fastify.delete<{
      Params: { sessionId: string };
    }>(
      '/sessions/:sessionId',
      {
        preHandler: [authPreHandler],
      },
      async (
        request: FastifyRequest<{ Params: { sessionId: string } }>,
        reply: FastifyReply
      ) => {
        try {
          const { sessionId } = request.params;
          const currentSessionId = request.user?.sessionId;

          if (sessionId === currentSessionId) {
            reply.statusCode = 400;
            return reply.send({
              error: 'Bad Request',
              message: 'Cannot revoke current session. Use logout instead.',
            });
          }

          const result = await authService.revokeSession(sessionId);

          if (!result.success) {
            reply.statusCode = 404;
            return reply.send({
              error: 'Session Not Found',
              message: result.error,
            });
          }

          return reply.send({
            message: 'Session revoked successfully',
          });
        } catch {
          reply.statusCode = 500;
          return reply.send({
            error: 'Internal Server Error',
            message: 'Failed to revoke session',
          });
        }
      }
    );
  });

  // Password reset request endpoint with rate limiting
  fastify.register(async fastify => {
    await fastify.register(passwordResetRateLimit);

    fastify.post<{
      Body: { email: string };
    }>(
      '/password-reset',
      async (
        request: FastifyRequest<{ Body: { email: string } }>,
        reply: FastifyReply
      ) => {
        try {
          const { email } = request.body;

          const result = await authService.requestPasswordReset(email);

          if (!result.success) {
            reply.statusCode = 400;
            return reply.send({
              error: 'Password Reset Failed',
              message: result.error,
            });
          }

          return reply.send({
            message: 'Password reset email sent successfully',
          });
        } catch {
          reply.statusCode = 500;
          return reply.send({
            error: 'Internal Server Error',
            message: 'Password reset request failed',
          });
        }
      }
    );
  });
}
