import { randomBytes } from 'crypto';
import { FastifyReply } from 'fastify';

export const CSRF_COOKIE_NAME = 'csrf_token';
export const CSRF_HEADER_NAME = 'x-csrf-token';

const CSRF_TOKEN_BYTES = 32;
const CSRF_COOKIE_MAX_AGE = 60 * 60 * 24; // 24 hours

type CsrfCookieOptions = {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax';
  path: string;
  maxAge: number;
  domain?: string;
};

export const createCsrfToken = (): string =>
  randomBytes(CSRF_TOKEN_BYTES).toString('hex');

export const getCsrfCookieOptions = (options?: {
  domain?: string;
}): CsrfCookieOptions => ({
  httpOnly: false,
  secure: process.env['NODE_ENV'] === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: CSRF_COOKIE_MAX_AGE,
  ...(options?.domain ? { domain: options.domain } : {}),
});

export const setCsrfCookie = (
  reply: FastifyReply,
  options?: { domain?: string }
): string => {
  const token = createCsrfToken();
  reply.setCookie(CSRF_COOKIE_NAME, token, getCsrfCookieOptions(options));
  return token;
};

export const clearCsrfCookie = (
  reply: FastifyReply,
  options?: { domain?: string }
): void => {
  reply.clearCookie(CSRF_COOKIE_NAME, {
    ...getCsrfCookieOptions(options),
    maxAge: 0,
  });
};
