import { FastifyRequest, FastifyReply, FastifyPluginCallback } from 'fastify';
import { jwtService } from '../services/jwtService';
import { sessionService } from '../services/sessionService';
import { getDatabasePool } from '../config/database';
import { Logger } from '../utils/logger';
import { HttpStatus, sendError } from '../utils/response';
import { CSRF_COOKIE_NAME, setCsrfCookie } from '../utils/csrf';

export interface AuthMiddlewareOptions {
  roles?: string[];
  permissions?: string[];
  allowExpired?: boolean;
}

const statusMessages: Record<string, string> = {
  suspended: 'Account is suspended. Please contact support.',
  inactive: 'Account is inactive. Please contact support.',
  deleted: 'Account is deleted. Please contact support.',
};

const resolveStatusMessage = (status: string | null): string => {
  if (!status) {
    return 'Account status could not be verified. Please contact support.';
  }
  return (
    statusMessages[status] || 'Account is not active. Please contact support.'
  );
};

const ensureActiveUser = async (
  userId: string,
  sessionId: string | undefined,
  reply: FastifyReply
): Promise<boolean> => {
  try {
    const pool = getDatabasePool();
    const result = await pool.query('SELECT status FROM users WHERE id = $1', [
      userId,
    ]);
    const status = result.rows[0]?.status as string | undefined;

    if (status !== 'active') {
      if (sessionId) {
        try {
          await sessionService.deleteSession(sessionId);
        } catch (error) {
          Logger.warn('Failed to revoke session for inactive user', error);
        }
      }

      sendError(
        reply,
        HttpStatus.FORBIDDEN,
        'Forbidden',
        resolveStatusMessage(status || null),
        'ACCOUNT_INACTIVE',
        { status }
      );
      return false;
    }

    return true;
  } catch (error) {
    Logger.error('Failed to verify account status:', error);
    sendError(
      reply,
      HttpStatus.SERVICE_UNAVAILABLE,
      'Service Unavailable',
      'Account status verification failed',
      'ACCOUNT_STATUS_UNAVAILABLE'
    );
    return false;
  }
};

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
          const bearerToken = jwtService.extractBearerToken(authHeader);
          const cookieToken =
            typeof request.cookies?.['auth_token'] === 'string'
              ? request.cookies['auth_token']
              : undefined;
          const token = bearerToken || cookieToken;

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

          const activeStatus = await ensureActiveUser(
            payload.userId,
            payload.sessionId,
            reply
          );
          if (!activeStatus) {
            return;
          }

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
    // CRITICAL: Check cookies first (HTTP-only auth tokens)
    let token: string | undefined = request.cookies['auth_token'];

    // Fallback to Authorization header for API clients
    if (!token) {
      const authHeader = request.headers.authorization;
      const bearerToken = jwtService.extractBearerToken(authHeader);
      token = bearerToken || undefined;
    }

    Logger.debug('Auth token source', {
      source: token
        ? request.cookies['auth_token']
          ? 'cookie'
          : 'header'
        : 'none',
    });
    Logger.debug('Auth cookie presence', {
      present: !!request.cookies['auth_token'],
    });

    if (!token) {
      Logger.warn('No auth token found in cookies or headers');
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
      Logger.warn('Invalid auth token', { error: tokenValidation.error });
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

    // Get full user data including firstName/lastName from auth service
    let userWithProfile = null;
    if (payload.sessionId) {
      try {
        const { authService } = require('../services/auth');
        const userResult = await authService.validateSession(payload.sessionId);
        if (userResult.success && userResult.user) {
          userWithProfile = userResult.user;
        }
      } catch (error) {
        Logger.warn(
          'Failed to get full user profile in authMiddleware:',
          error
        );
      }
    }

    request.user = {
      userId: payload.userId,
      email: payload.email,
      firstName: userWithProfile?.firstName,
      lastName: userWithProfile?.lastName,
      role: payload.role || undefined,
      sessionId: payload.sessionId,
      isAdmin: payload.role === 'admin',
    };

    const activeStatus = await ensureActiveUser(
      payload.userId,
      payload.sessionId,
      reply
    );
    if (!activeStatus) {
      return;
    }

    const cookies = request.cookies || {};
    if (cookies['auth_token'] && !cookies[CSRF_COOKIE_NAME]) {
      setCsrfCookie(reply);
    }

    Logger.debug('User authenticated', {
      userId: request.user.userId,
      email: request.user.email,
    });
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

// Optional auth preHandler: populate request.user if valid, but don't block if missing/invalid.
export const optionalAuthPreHandler = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  try {
    let token: string | undefined = request.cookies['auth_token'];

    if (!token) {
      const authHeader = request.headers.authorization;
      const bearerToken = jwtService.extractBearerToken(authHeader);
      token = bearerToken || undefined;
    }

    if (!token) {
      return;
    }

    const tokenValidation = jwtService.verifyToken(token);
    if (!tokenValidation.isValid || !tokenValidation.payload) {
      return;
    }

    const payload = tokenValidation.payload;
    if (!payload.sessionId) {
      return;
    }

    const sessionValidation = await sessionService.validateSession(
      payload.sessionId
    );

    if (!sessionValidation.isValid) {
      return;
    }

    request.session = sessionValidation.session || undefined;

    let userWithProfile = null;
    try {
      const { authService } = require('../services/auth');
      const userResult = await authService.validateSession(payload.sessionId);
      if (userResult.success && userResult.user) {
        userWithProfile = userResult.user;
      }
    } catch (error) {
      Logger.warn(
        'Failed to get full user profile in optionalAuthPreHandler:',
        error
      );
    }

    request.user = {
      userId: payload.userId,
      email: payload.email,
      firstName: userWithProfile?.firstName,
      lastName: userWithProfile?.lastName,
      role: payload.role || undefined,
      sessionId: payload.sessionId,
      isAdmin: payload.role === 'admin',
    };

    const activeStatus = await ensureActiveUser(
      payload.userId,
      payload.sessionId,
      reply
    );
    if (!activeStatus) {
      return;
    }

    const cookies = request.cookies || {};
    if (cookies['auth_token'] && !cookies[CSRF_COOKIE_NAME]) {
      setCsrfCookie(reply);
    }
  } catch {
    return;
  }
};

export default authMiddleware;
