import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authService } from '../services/auth';
import {
  buildTikTokRequestContext,
  tiktokEventsService,
} from '../services/tiktokEventsService';
import { userService } from '../services/userService';
import { createRateLimitHandler } from '../middleware/rateLimitMiddleware';
import { authPreHandler } from '../middleware/authMiddleware';
import {
  LoginRequestInput,
  RegisterRequestInput,
  LogoutRequestInput,
} from '../schemas/session';
import { validatePasswordResetConfirmInput } from '../schemas/auth';
import { setCsrfCookie, clearCsrfCookie } from '../utils/csrf';
import { Logger } from '../utils/logger';

// Rate limiting handlers (fixes plugin encapsulation issues)
const authRateLimit = createRateLimitHandler({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5,
  keyGenerator: (request: FastifyRequest) => {
    const body = request.body as any;
    const email = body?.email || 'unknown';
    return `auth:${request.ip}:${email}`;
  },
});

const bruteForceProtection = createRateLimitHandler({
  windowMs: 30 * 60 * 1000, // 30 minutes
  maxRequests: 20,
  keyGenerator: (request: FastifyRequest) => {
    const body = request.body as any;
    const email = body?.email || 'unknown';
    return `brute_force:${email}`;
  },
});

const passwordResetRateLimit = createRateLimitHandler({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 3,
  keyGenerator: (request: FastifyRequest) => {
    const body = request.body as any;
    const email = body?.email || 'unknown';
    return `password_reset:${request.ip}:${email}`;
  },
});

const passwordResetConfirmRateLimit = createRateLimitHandler({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 5,
  keyGenerator: (request: FastifyRequest) => {
    return `password_reset_confirm:${request.ip}`;
  },
});

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
        'POST /auth/confirm',
        'POST /auth/verified/track',
        'GET /auth/profile',
        'GET /auth/sessions',
        'DELETE /auth/sessions/:sessionId',
        'POST /auth/password-reset',
        'POST /auth/password-reset/confirm',
      ],
    });
  });

  // Register endpoint with rate limiting and brute force protection
  fastify.post<{
    Body: RegisterRequestInput;
  }>(
    '/register',
    {
      preHandler: [authRateLimit, bruteForceProtection],
    },
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
          const payload: {
            error: string;
            message?: string;
            code?: string;
            details?: { loginText: string; loginUrl: string };
          } = {
            error: 'Registration Failed',
          };
          if (result.error) {
            payload.message = result.error;
          }
          if (result.code) {
            payload.code = result.code;
          }
          if (result.login) {
            payload.details = {
              loginText: result.login.text,
              loginUrl: result.login.url,
            };
          }
          return reply.send(payload);
        }

        // Set HTTP-only cookie with access token (skip when email verification required)
        if (result.tokens?.accessToken && !result.requiresEmailVerification) {
          reply.setCookie('auth_token', result.tokens.accessToken, {
            httpOnly: true,
            secure: process.env['NODE_ENV'] === 'production',
            sameSite: 'lax', // CHANGE: 'strict' blocks cookies in cross-origin dev scenarios
            path: '/',
            maxAge: 60 * 60 * 24, // 24 hours
          });
          setCsrfCookie(reply);
        }

        reply.statusCode = result.requiresEmailVerification ? 202 : 201;
        return reply.send({
          message: result.requiresEmailVerification
            ? 'Registration successful. Please verify your email before logging in.'
            : 'Registration successful',
          user: result.user,
          sessionId: result.sessionId,
          requiresEmailVerification: result.requiresEmailVerification ?? false,
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

  // Track verified registration (requires authentication)
  fastify.register(async fastify => {
    fastify.post(
      '/verified/track',
      {
        preHandler: [authPreHandler],
      },
      async (request: FastifyRequest, reply: FastifyReply) => {
        try {
          const user = request.user;
          if (!user?.userId) {
            reply.statusCode = 400;
            return reply.send({
              error: 'Bad Request',
              message: 'User ID not found',
            });
          }

          void tiktokEventsService.trackCompleteRegistration({
            userId: user.userId,
            email: user.email,
            context: buildTikTokRequestContext(request),
          });

          return reply.send({
            message: 'Verification tracked',
          });
        } catch (error) {
          Logger.error('Verified tracking failed:', error);
          reply.statusCode = 500;
          return reply.send({
            error: 'Internal Server Error',
            message: 'Failed to track verification',
          });
        }
      }
    );
  });

  fastify.post<{
    Body: { accessToken: string; refreshToken?: string | null };
  }>(
    '/confirm',
    async (
      request: FastifyRequest<{
        Body: { accessToken: string; refreshToken?: string | null };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { accessToken, refreshToken } = request.body;
        if (!accessToken) {
          reply.statusCode = 400;
          return reply.send({
            error: 'Bad Request',
            message: 'Confirmation token is required',
          });
        }

        const sessionOptions = {
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
        };

        const tokenPayload = {
          accessToken,
          ...(refreshToken !== undefined ? { refreshToken } : {}),
        };

        const result = await authService.confirmEmail(
          tokenPayload,
          sessionOptions
        );

        if (!result.success) {
          reply.statusCode = 400;
          return reply.send({
            error: 'Email Confirmation Failed',
            message: result.error,
          });
        }

        if (result.tokens?.accessToken) {
          reply.setCookie('auth_token', result.tokens.accessToken, {
            httpOnly: true,
            secure: process.env['NODE_ENV'] === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 60 * 60 * 24,
          });
          setCsrfCookie(reply);
        }

        if (result.user) {
          void tiktokEventsService.trackCompleteRegistration({
            userId: result.user.id,
            email: result.user.email,
            context: buildTikTokRequestContext(request),
          });
        }

        return reply.send({
          message: 'Email confirmed successfully',
          user: result.user,
          sessionId: result.sessionId,
        });
      } catch (error) {
        Logger.error('Email confirmation failed:', error);
        reply.statusCode = 500;
        return reply.send({
          error: 'Internal Server Error',
          message: 'Email confirmation failed',
        });
      }
    }
  );

  // Login endpoint with rate limiting and brute force protection
  fastify.post<{
    Body: LoginRequestInput;
  }>(
    '/login',
    {
      preHandler: [authRateLimit, bruteForceProtection],
    },
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

        // Set HTTP-only cookie with access token
        if (result.tokens?.accessToken) {
          reply.setCookie('auth_token', result.tokens.accessToken, {
            httpOnly: true,
            secure: process.env['NODE_ENV'] === 'production',
            sameSite: 'lax', // CHANGE: 'strict' blocks cookies in cross-origin dev scenarios
            path: '/',
            maxAge: 60 * 60 * 24, // 24 hours
          });
          setCsrfCookie(reply);
        }

        if (result.user) {
          void tiktokEventsService.trackLogin({
            userId: result.user.id,
            email: result.user.email,
            context: buildTikTokRequestContext(request),
          });
        }

        return reply.send({
          message: 'Login successful',
          user: result.user,
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
          const { allDevices = false } = request.body ?? {};
          const user = request.user;
          if (!user?.sessionId) {
            reply.statusCode = 400;
            return reply.send({
              error: 'Bad Request',
              message: 'No active session found',
            });
          }

          const result = await authService.logout(user.sessionId, allDevices);

          if (!result.success) {
            reply.statusCode = 500;
            return reply.send({
              error: 'Logout Failed',
              message: result.error,
            });
          }

          // Clear auth cookie
          reply.clearCookie('auth_token', {
            httpOnly: true,
            secure: process.env['NODE_ENV'] === 'production',
            sameSite: 'lax', // CHANGE: 'strict' blocks cookies in cross-origin dev scenarios
            path: '/',
          });
          clearCsrfCookie(reply);

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
          const user = request.user;
          if (!user?.sessionId) {
            reply.statusCode = 400;
            return reply.send({
              error: 'Bad Request',
              message: 'No active session found',
            });
          }

          const result = await authService.refreshSession(user.sessionId);

          if (!result.success) {
            reply.statusCode = 401;
            return reply.send({
              error: 'Session Refresh Failed',
              message: result.error,
            });
          }

          // Update HTTP-only cookie with new access token
          if (result.tokens?.accessToken) {
            reply.setCookie('auth_token', result.tokens.accessToken, {
              httpOnly: true,
              secure: process.env['NODE_ENV'] === 'production',
              sameSite: 'lax', // CHANGE: 'strict' blocks cookies in cross-origin dev scenarios
              path: '/',
              maxAge: 60 * 60 * 24, // 24 hours
            });
            setCsrfCookie(reply);
          }

          return reply.send({
            message: 'Session refreshed successfully',
            user: result.user,
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

  // Get user profile endpoint (requires authentication)
  fastify.register(async fastify => {
    fastify.get(
      '/profile',
      {
        preHandler: [authPreHandler],
      },
      async (request: FastifyRequest, reply: FastifyReply) => {
        try {
          const user = request.user;
          if (!user?.userId) {
            reply.statusCode = 400;
            return reply.send({
              error: 'Bad Request',
              message: 'User ID not found',
            });
          }

          const profileResult = await userService.getUserProfile(user.userId, {
            includeMetadata: true,
            includeSessions: false,
          });

          if (profileResult.success && profileResult.data) {
            return reply.send({
              user: {
                id: profileResult.data.id,
                email: profileResult.data.email,
                firstName: profileResult.data.firstName || null,
                lastName: profileResult.data.lastName || null,
                role: profileResult.data.role,
                displayName: profileResult.data.displayName || null,
                status: profileResult.data.status,
                pinSetAt: profileResult.data.pinSetAt || null,
                createdAt: profileResult.data.createdAt,
                lastLoginAt: profileResult.data.lastLoginAt,
                profileUpdatedAt: profileResult.data.profileUpdatedAt,
              },
            });
          }

          Logger.error(
            'Profile lookup failed while fetching profile:',
            profileResult.error
          );

          // Fallback to auth service session lookup without assuming status
          const userResult = await authService.validateSession(user.sessionId);
          if (userResult.success && userResult.user) {
            return reply.send({
              user: {
                id: userResult.user.id,
                email: userResult.user.email,
                firstName: userResult.user.firstName || null,
                lastName: userResult.user.lastName || null,
                role: userResult.user.role,
                displayName: userResult.user.displayName || null,
                status: null,
                pinSetAt: null,
                createdAt: userResult.user.createdAt,
                lastLoginAt: userResult.user.lastLoginAt,
                profileUpdatedAt: userResult.user.createdAt,
              },
            });
          }

          // Final fallback to request.user data
          return reply.send({
            user: {
              id: user.userId,
              email: user.email,
              firstName: user.firstName || null,
              lastName: user.lastName || null,
              role: user.role || 'user',
              displayName: null,
              status: null,
              pinSetAt: null,
              createdAt: null,
              lastLoginAt: null,
              profileUpdatedAt: null,
            },
          });
        } catch (error) {
          Logger.error('Profile fetch failed:', error);
          reply.statusCode = 500;
          return reply.send({
            error: 'Internal Server Error',
            message: 'Failed to retrieve profile',
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
          const user = request.user;
          if (!user?.userId) {
            reply.statusCode = 400;
            return reply.send({
              error: 'Bad Request',
              message: 'User ID not found',
            });
          }

          const currentSessionId = user.sessionId;

          const sessions = await authService.getUserSessions(user.userId);
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
  fastify.post<{
    Body: { email: string };
  }>(
    '/password-reset',
    {
      preHandler: [passwordResetRateLimit],
    },
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

  fastify.post<{
    Body: {
      accessToken: string;
      refreshToken?: string;
      password: string;
      confirmPassword: string;
    };
  }>(
    '/password-reset/confirm',
    {
      preHandler: [passwordResetConfirmRateLimit],
    },
    async (
      request: FastifyRequest<{
        Body: {
          accessToken: string;
          refreshToken?: string;
          password: string;
          confirmPassword: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const validation = validatePasswordResetConfirmInput(request.body);
        if (!validation.success) {
          reply.statusCode = 400;
          return reply.send({
            error: 'Invalid Input',
            message: validation.error.error,
          });
        }

        const { accessToken, refreshToken, password } = validation.data;
        const result = await authService.confirmPasswordReset({
          accessToken,
          ...(refreshToken ? { refreshToken } : {}),
          password,
        });

        if (!result.success) {
          reply.statusCode = 400;
          return reply.send({
            error: 'Password Reset Failed',
            message: result.error,
          });
        }

        return reply.send({
          message: 'Password updated successfully',
        });
      } catch (error) {
        Logger.error('Password reset confirmation failed:', error);
        reply.statusCode = 500;
        return reply.send({
          error: 'Internal Server Error',
          message: 'Password reset confirmation failed',
        });
      }
    }
  );
}
