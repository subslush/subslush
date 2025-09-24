import { FastifyRequest, FastifyReply, FastifyPluginCallback } from 'fastify';
import { jwtService } from '../services/jwtService';
import { sessionService } from '../services/sessionService';
import { AuthenticatedRequest } from '../types/session';
import { HttpStatus } from '../utils/response';

declare module 'fastify' {
  interface FastifyRequest extends AuthenticatedRequest {}
}

export interface AuthMiddlewareOptions {
  roles?: string[];
  permissions?: string[];
  allowExpired?: boolean;
}

export const authMiddleware = (
  options: AuthMiddlewareOptions = {}
): FastifyPluginCallback => {
  const { roles = [], permissions = [], allowExpired = false } = options;

  return async fastify => {
    fastify.addHook(
      'preHandler',
      async (request: FastifyRequest, reply: FastifyReply) => {
        try {
          const authHeader = request.headers.authorization;
          const token = jwtService.extractBearerToken(authHeader);

          if (!token) {
            return reply.status(HttpStatus.UNAUTHORIZED).send({
              error: 'Unauthorized',
              message: 'Authentication token required',
              code: 'MISSING_TOKEN',
            });
          }

          const tokenValidation = jwtService.verifyToken(token);

          if (!tokenValidation.isValid && !allowExpired) {
            return reply.status(HttpStatus.UNAUTHORIZED).send({
              error: 'Unauthorized',
              message: tokenValidation.error || 'Invalid token',
              code: 'INVALID_TOKEN',
            });
          }

          const payload = tokenValidation.payload;
          if (!payload) {
            return reply.status(HttpStatus.UNAUTHORIZED).send({
              error: 'Unauthorized',
              message: 'Invalid token payload',
              code: 'INVALID_PAYLOAD',
            });
          }

          if (!allowExpired && payload.sessionId) {
            const sessionValidation = await sessionService.validateSession(
              payload.sessionId
            );

            if (!sessionValidation.isValid) {
              return reply.status(HttpStatus.UNAUTHORIZED).send({
                error: 'Unauthorized',
                message: sessionValidation.error || 'Session expired',
                code: 'SESSION_EXPIRED',
              });
            }

            request.session = sessionValidation.session || undefined;
          }

          request.user = {
            userId: payload.userId,
            email: payload.email,
            role: payload.role || undefined,
            sessionId: payload.sessionId,
          };

          if (roles.length > 0 && payload.role) {
            if (!roles.includes(payload.role)) {
              return reply.status(HttpStatus.FORBIDDEN).send({
                error: 'Forbidden',
                message: 'Insufficient role permissions',
                code: 'INSUFFICIENT_ROLE',
                required: roles,
                current: payload.role,
              });
            }
          }

          if (permissions.length > 0) {
            // Permission-based authorization not implemented yet
          }

          const userInfo = {
            userId: payload.userId,
            email: payload.email,
            role: payload.role,
            sessionId: payload.sessionId,
          };

          request.log.info(
            { user: userInfo },
            'User authenticated successfully'
          );
        } catch {
          return reply.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
            error: 'Internal Server Error',
            message: 'Authentication validation failed',
            code: 'AUTH_ERROR',
          });
        }
      }
    );
  };
};

export const requireAuth = authMiddleware();

export const requireRole = (roles: string[]): FastifyPluginCallback =>
  authMiddleware({ roles });

export const requireAdmin = authMiddleware({ roles: ['admin'] });

export const requireUser = authMiddleware({
  roles: ['user', 'premium', 'admin'],
});

export const requirePremium = authMiddleware({ roles: ['premium', 'admin'] });

export const allowExpiredToken = authMiddleware({ allowExpired: true });

// Secure preHandler function for route-level authentication
// Validates both JWT tokens AND Redis sessions
export const authPreHandler = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  try {
    const authHeader = request.headers.authorization;
    const token = jwtService.extractBearerToken(authHeader);

    if (!token) {
      return reply.status(HttpStatus.UNAUTHORIZED).send({
        error: 'Unauthorized',
        message: 'Authentication token required',
        code: 'MISSING_TOKEN',
      });
    }

    const tokenValidation = jwtService.verifyToken(token);

    if (!tokenValidation.isValid) {
      return reply.status(HttpStatus.UNAUTHORIZED).send({
        error: 'Unauthorized',
        message: tokenValidation.error || 'Invalid token',
        code: 'INVALID_TOKEN',
      });
    }

    const payload = tokenValidation.payload;
    if (!payload) {
      return reply.status(HttpStatus.UNAUTHORIZED).send({
        error: 'Unauthorized',
        message: 'Invalid token payload',
        code: 'INVALID_PAYLOAD',
      });
    }

    // SECURITY: Validate session in Redis (mandatory for security)
    if (payload.sessionId) {
      const sessionValidation = await sessionService.validateSession(
        payload.sessionId
      );

      if (!sessionValidation.isValid) {
        return reply.status(HttpStatus.UNAUTHORIZED).send({
          error: 'Unauthorized',
          message: sessionValidation.error || 'Session expired',
          code: 'SESSION_EXPIRED',
        });
      }

      request.session = sessionValidation.session || undefined;
    }

    request.user = {
      userId: payload.userId,
      email: payload.email,
      role: payload.role || undefined,
      sessionId: payload.sessionId,
    };
  } catch {
    return reply.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
      error: 'Internal Server Error',
      message: 'Authentication validation failed',
      code: 'AUTH_ERROR',
    });
  }
};

export default authMiddleware;
