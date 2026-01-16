import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ErrorResponses } from '../utils/response';
import { createRateLimitHandler } from './rateLimitMiddleware';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '../utils/csrf';

const getRouteKey = (request: FastifyRequest): string => {
  const routePath =
    (request as any).routerPath ||
    (request.routeOptions as any)?.url ||
    request.url.split('?')[0];
  return `${request.method}:${routePath}`;
};

const adminRateLimitHandler = createRateLimitHandler({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 120,
  keyGenerator: (request: FastifyRequest) => {
    const userId = request.user?.userId || request.ip;
    return `admin_rate:${userId}:${getRouteKey(request)}`;
  },
});

const isSafeMethod = (method: string): boolean =>
  ['GET', 'HEAD', 'OPTIONS'].includes(method);

const getHeaderValue = (
  headerValue: string | string[] | undefined
): string | undefined => {
  if (Array.isArray(headerValue)) {
    return headerValue[0];
  }
  return headerValue;
};

export const adminSecurityMiddleware = (fastify: FastifyInstance): void => {
  fastify.addHook(
    'preHandler',
    async (request: FastifyRequest, reply: FastifyReply) => {
      await adminRateLimitHandler(request, reply);
      if (reply.sent) {
        return;
      }

      if (isSafeMethod(request.method)) {
        return;
      }

      const cookies = request.cookies || {};
      const authCookie =
        typeof cookies['auth_token'] === 'string'
          ? cookies['auth_token']
          : null;
      const authHeader = getHeaderValue(request.headers.authorization);
      const hasBearerAuth =
        typeof authHeader === 'string' &&
        authHeader.trim().toLowerCase().startsWith('bearer ');

      // Enforce CSRF only for cookie-authenticated requests.
      // Explicitly allow bearer-token auth (Authorization header) to bypass CSRF.
      if (!authCookie) {
        if (hasBearerAuth) {
          return;
        }
        return;
      }

      const csrfCookie =
        typeof cookies[CSRF_COOKIE_NAME] === 'string'
          ? cookies[CSRF_COOKIE_NAME]
          : null;
      const csrfHeader = getHeaderValue(
        (request.headers[CSRF_HEADER_NAME] as string | string[] | undefined) ||
          (request.headers[CSRF_HEADER_NAME.toLowerCase()] as
            | string
            | string[]
            | undefined)
      );

      if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
        return ErrorResponses.forbidden(reply, 'Invalid or missing CSRF token');
      }
    }
  );
};

export default adminSecurityMiddleware;
