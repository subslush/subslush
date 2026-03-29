import { isIP } from 'net';
import type { FastifyRequest } from 'fastify';
import geoip from 'geoip-lite';
import { getRequestIp } from './requestIp';

const normalizeCountryCode = (value?: string | null): string | null => {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return null;
  if (normalized === 'XX' || normalized === 'T1') return null;
  return normalized;
};

const getHeaderValue = (
  value: string | string[] | undefined
): string | null => {
  if (!value) return null;
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value;
};

const normalizeIpCandidate = (value?: string | null): string | null => {
  if (!value) return null;

  const primary = value.split(',')[0]?.trim();
  if (!primary) return null;

  let candidate = primary;
  if (candidate.startsWith('[')) {
    const closingBracketIndex = candidate.indexOf(']');
    if (closingBracketIndex > 1) {
      candidate = candidate.slice(1, closingBracketIndex);
    }
  } else if (candidate.includes('.') && candidate.includes(':')) {
    const segments = candidate.split(':');
    if (segments.length === 2 && segments[0]) {
      candidate = segments[0];
    }
  }

  const cleaned = candidate.trim();
  return isIP(cleaned) ? cleaned : null;
};

const resolveExplicitClientIp = (request: FastifyRequest): string | null => {
  const headerValue = getHeaderValue(request.headers['x-client-ip']);
  return normalizeIpCandidate(headerValue);
};

export const resolveCountryCodeFromRequestIp = (
  request: FastifyRequest
): string | null => {
  const explicitClientIp = resolveExplicitClientIp(request);
  const fallbackIp = normalizeIpCandidate(getRequestIp(request));
  const clientIp = explicitClientIp || fallbackIp;
  if (!clientIp) return null;

  const geo = geoip.lookup(clientIp);
  return normalizeCountryCode(geo?.country);
};
