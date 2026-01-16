import { FastifyRequest, FastifyReply } from 'fastify';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '../utils/csrf';
import { ErrorResponses } from '../utils/response';

const getHeaderValue = (
  headerValue: string | string[] | undefined
): string | undefined => {
  if (Array.isArray(headerValue)) {
    return headerValue[0];
  }
  return headerValue;
};

// Enforce CSRF only when cookie-based auth is used.
export const enforceCsrfForCookieAuth = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const cookies = request.cookies || {};
  const authCookie =
    typeof cookies['auth_token'] === 'string' ? cookies['auth_token'] : null;
  const authHeader = getHeaderValue(request.headers.authorization);
  const hasBearerAuth =
    typeof authHeader === 'string' &&
    authHeader.trim().toLowerCase().startsWith('bearer ');

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
};
