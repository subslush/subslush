import { FastifyRequest, FastifyReply, FastifyPluginCallback } from 'fastify';
import { sessionService } from '../services/sessionService';
import { jwtService } from '../services/jwtService';
import { SessionMiddlewareOptions, AuthenticatedRequest } from '../types/session';

declare module 'fastify' {
  interface FastifyRequest extends AuthenticatedRequest {}
}

export const sessionMiddleware = (options: SessionMiddlewareOptions = {}): FastifyPluginCallback => {
  const {
    required = true,
    autoRefresh = true,
    refreshThreshold = 3600,
  } = options;

  return async (fastify, _options) => {
    fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const authHeader = request.headers.authorization;
        const token = jwtService.extractBearerToken(authHeader);

        if (!token) {
          if (required) {
            return reply.status(401).send({
              error: 'Unauthorized',
              message: 'No authentication token provided',
            });
          }
          return;
        }

        const tokenValidation = jwtService.verifyToken(token);

        if (!tokenValidation.isValid) {
          if (required) {
            return reply.status(401).send({
              error: 'Unauthorized',
              message: tokenValidation.error || 'Invalid token',
            });
          }
          return;
        }

        const { payload } = tokenValidation;
        if (!payload?.sessionId) {
          if (required) {
            return reply.status(401).send({
              error: 'Unauthorized',
              message: 'Invalid token payload',
            });
          }
          return;
        }

        const sessionValidation = await sessionService.validateSession(payload.sessionId);

        if (!sessionValidation.isValid) {
          if (required) {
            return reply.status(401).send({
              error: 'Unauthorized',
              message: sessionValidation.error || 'Invalid session',
            });
          }
          return;
        }

        const { session } = sessionValidation;
        if (!session) {
          if (required) {
            return reply.status(401).send({
              error: 'Unauthorized',
              message: 'Session not found',
            });
          }
          return;
        }

        request.user = {
          userId: session.userId,
          email: session.email || payload.email,
          role: (session.role || payload.role) || undefined,
          sessionId: payload.sessionId,
        };

        request.session = session;

        if (autoRefresh && tokenValidation.needsRefresh) {
          const timeUntilExpiry = jwtService.getTimeUntilExpiry(token);

          if (timeUntilExpiry > 0 && timeUntilExpiry < refreshThreshold) {
            try {
              const refreshResult = jwtService.refreshToken(token, payload.sessionId);

              if (refreshResult.success && refreshResult.tokens) {
                reply.header('X-New-Token', refreshResult.tokens.accessToken);
                reply.header('X-Token-Refreshed', 'true');
              }
            } catch (refreshError) {
              console.error('Error refreshing token:', refreshError);
            }
          }
        }
      } catch (error) {
        console.error('Session middleware error:', error);

        if (required) {
          return reply.status(500).send({
            error: 'Internal Server Error',
            message: 'Session validation failed',
          });
        }
      }
    });
  };
};

export const requireAuth = sessionMiddleware({ required: true });

export const optionalAuth = sessionMiddleware({ required: false });

export const requireAuthWithRefresh = sessionMiddleware({
  required: true,
  autoRefresh: true,
  refreshThreshold: 3600,
});

export default sessionMiddleware;