import { FastifyRequest } from 'fastify';

const getHeaderValue = (
  value: string | string[] | undefined
): string | null => {
  if (!value) return null;
  if (Array.isArray(value)) {
    const first = value[0];
    return first ?? null;
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
    const firstForwarded = forwardedFor.split(',')[0];
    if (firstForwarded) {
      return firstForwarded.trim();
    }
  }

  return request.ip;
};
