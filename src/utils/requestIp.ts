import { FastifyRequest } from 'fastify';

const getHeaderValue = (
  value: string | string[] | undefined
): string | null => {
  if (!value) return null;
  if (Array.isArray(value)) {
    return value.length > 0 ? value[0] : null;
  }
  return value;
};

export const getRequestIp = (request: FastifyRequest): string => {
  const cfConnectingIp = getHeaderValue(request.headers['cf-connecting-ip']);
  if (cfConnectingIp && cfConnectingIp.trim()) {
    return cfConnectingIp.trim();
  }

  const forwardedFor = getHeaderValue(request.headers['x-forwarded-for']);
  if (forwardedFor && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }

  return request.ip;
};
