import { FastifyRequest, FastifyReply, FastifyPluginCallback } from 'fastify';
import { jwtService } from '../services/jwtService';
import { sessionService } from '../services/sessionService';
import { HttpStatus, sendError } from '../utils/response';

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
            return sendError(
              reply,
              HttpStatus.UNAUTHORIZED,
              'Unauthorized',
              'Authentication token required',
              'MISSING_TOKEN'
            );
          }

          const tokenValidation = jwtService.verifyToken(token);

          if (!tokenValidation.isValid && !allowExpired) {
            return sendError(
              reply,
              HttpStatus.UNAUTHORIZED,
              'Unauthorized',
              tokenValidation.error || 'Invalid token',
              'INVALID_TOKEN'
            );
          }

          const payload = tokenValidation.payload;
          if (!payload) {
            return sendError(
              reply,
              HttpStatus.UNAUTHORIZED,
              'Unauthorized',
              'Invalid token payload',
              'INVALID_PAYLOAD'
            );
          }

          if (!allowExpired && payload.sessionId) {
            const sessionValidation = await sessionService.validateSession(
              payload.sessionId
            );

            if (!sessionValidation.isValid) {
              return sendError(
                reply,
                HttpStatus.UNAUTHORIZED,
                'Unauthorized',
                sessionValidation.error || 'Session expired',
                'SESSION_EXPIRED'
              );
            }

            request.session = sessionValidation.session || undefined;
          }

          request.user = {
            userId: payload.userId,
            email: payload.email,
            role: payload.role || undefined,
            sessionId: payload.sessionId,
            isAdmin: payload.role === 'admin',
          };

          if (roles.length > 0 && payload.role) {
            if (!roles.includes(payload.role)) {
              return sendError(
                reply,
                HttpStatus.FORBIDDEN,
                'Forbidden',
                'Insufficient role permissions',
                'INSUFFICIENT_ROLE',
                { required: roles, current: payload.role }
              );
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
          return sendError(
            reply,
            HttpStatus.INTERNAL_SERVER_ERROR,
            'Internal Server Error',
            'Authentication validation failed',
            'AUTH_ERROR'
          );
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
      return sendError(
        reply,
        HttpStatus.UNAUTHORIZED,
        'Unauthorized',
        'Authentication token required',
        'MISSING_TOKEN'
      );
    }

    const tokenValidation = jwtService.verifyToken(token);

    if (!tokenValidation.isValid) {
      return sendError(
        reply,
        HttpStatus.UNAUTHORIZED,
        'Unauthorized',
        tokenValidation.error || 'Invalid token',
        'INVALID_TOKEN'
      );
    }

    const payload = tokenValidation.payload;
    if (!payload) {
      return sendError(
        reply,
        HttpStatus.UNAUTHORIZED,
        'Unauthorized',
        'Invalid token payload',
        'INVALID_PAYLOAD'
      );
    }

    // SECURITY: Validate session in Redis (mandatory for security)
    if (payload.sessionId) {
      const sessionValidation = await sessionService.validateSession(
        payload.sessionId
      );

      if (!sessionValidation.isValid) {
        return sendError(
          reply,
          HttpStatus.UNAUTHORIZED,
          'Unauthorized',
          sessionValidation.error || 'Session expired',
          'SESSION_EXPIRED'
        );
      }

      request.session = sessionValidation.session || undefined;
    }

    request.user = {
      userId: payload.userId,
      email: payload.email,
      role: payload.role || undefined,
      sessionId: payload.sessionId,
      isAdmin: payload.role === 'admin',
    };
  } catch {
    return sendError(
      reply,
      HttpStatus.INTERNAL_SERVER_ERROR,
      'Internal Server Error',
      'Authentication validation failed',
      'AUTH_ERROR'
    );
  }
};

export default authMiddleware;
