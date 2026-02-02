import crypto from 'crypto';
import { URL } from 'url';
import type { FastifyRequest } from 'fastify';
import { env } from '../config/environment';
import { Logger } from '../utils/logger';

type TikTokEventName =
  | 'CompleteRegistration'
  | 'InitiateCheckout'
  | 'Purchase'
  | 'Login';

export type TikTokRequestContext = {
  ip?: string | null;
  userAgent?: string | null;
  url?: string | null;
  referrer?: string | null;
  ttclid?: string | null;
  ttp?: string | null;
};

type TikTokUserInput = {
  email?: string | null;
  phone?: string | null;
  externalId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  ttclid?: string | null;
  ttp?: string | null;
};

type TikTokUserPayload = {
  email?: string;
  phone?: string;
  external_id?: string;
  ip?: string;
  user_agent?: string;
  ttclid?: string;
  ttp?: string;
};

type TikTokEventInput = {
  event: TikTokEventName;
  eventId?: string | null;
  eventTime?: number;
  user: TikTokUserPayload;
  properties?: Record<string, unknown>;
  page?: { url?: string | null; referrer?: string | null };
};

const TIKTOK_EVENTS_URL =
  'https://business-api.tiktok.com/open_api/v1.3/event/track/';

const normalizeEmail = (email?: string | null): string | null => {
  const trimmed = email?.trim().toLowerCase();
  return trimmed ? trimmed : null;
};

const normalizePhone = (phone?: string | null): string | null => {
  const trimmed = phone?.trim();
  if (!trimmed) return null;
  const digitsOnly = trimmed.replace(/[^\d+]/g, '');
  return digitsOnly ? digitsOnly : null;
};

const normalizeExternalId = (externalId?: string | null): string | null => {
  const trimmed = externalId?.trim();
  return trimmed ? trimmed : null;
};

const sha256 = (value: string): string =>
  crypto.createHash('sha256').update(value).digest('hex');

const cleanObject = <T extends Record<string, unknown>>(obj: T): T => {
  const entries = Object.entries(obj).filter(
    ([, value]) => value !== undefined && value !== null && value !== ''
  );
  return Object.fromEntries(entries) as T;
};

const resolveHeader = (
  request: FastifyRequest,
  name: string
): string | null => {
  const value = request.headers[name] as string | string[] | undefined;
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return typeof value === 'string' ? value : null;
};

const resolveForwardedIp = (request: FastifyRequest): string | null => {
  const forwarded = resolveHeader(request, 'x-forwarded-for');
  if (!forwarded) return null;
  const first = forwarded.split(',')[0]?.trim();
  return first || null;
};

const extractTtclidFromUrl = (url?: string | null): string | null => {
  if (!url) return null;
  try {
    return new URL(url).searchParams.get('ttclid');
  } catch {
    return null;
  }
};

export const buildTikTokRequestContext = (
  request: FastifyRequest
): TikTokRequestContext => {
  const url =
    resolveHeader(request, 'referer') ||
    resolveHeader(request, 'referrer') ||
    null;
  const referrer =
    resolveHeader(request, 'origin') ||
    resolveHeader(request, 'referer') ||
    null;
  const queryTtclid =
    typeof (request.query as { ttclid?: string } | undefined)?.ttclid ===
    'string'
      ? (request.query as { ttclid?: string }).ttclid
      : null;
  const urlTtclid = extractTtclidFromUrl(url);
  const cookieTtclid =
    typeof request.cookies?.['ttclid'] === 'string'
      ? request.cookies['ttclid']
      : null;
  const ttclid = queryTtclid || urlTtclid || cookieTtclid || null;
  const ttp =
    typeof request.cookies?.['ttp'] === 'string'
      ? request.cookies['ttp']
      : null;

  return {
    ip: resolveForwardedIp(request) || request.ip || null,
    userAgent: resolveHeader(request, 'user-agent'),
    url,
    referrer,
    ttclid,
    ttp,
  };
};

export const buildTikTokProductProperties = (params: {
  value?: number | null;
  currency?: string | null;
  contentId?: string | null;
  contentName?: string | null;
  contentCategory?: string | null;
  price?: number | null;
  brand?: string | null;
}): Record<string, unknown> =>
  cleanObject({
    value: params.value ?? undefined,
    currency: params.currency?.toUpperCase(),
    content_id: params.contentId ?? undefined,
    content_type: 'product',
    content_name: params.contentName ?? undefined,
    content_category: params.contentCategory ?? undefined,
    price: params.price ?? undefined,
    brand: params.brand ?? undefined,
  });

class TikTokEventsService {
  private readonly accessToken: string | null;
  private readonly pixelId: string | null;
  private readonly testEventCode: string | null;
  private readonly enabled: boolean;

  constructor() {
    const token = env.TIKTOK_EVENTS_ACCESS_TOKEN?.trim();
    const pixelId = env.TIKTOK_PIXEL_ID?.trim();
    const testEventCode = env.TIKTOK_EVENTS_TEST_CODE?.trim();
    this.accessToken = token || null;
    this.pixelId = pixelId || null;
    this.testEventCode = testEventCode || null;
    this.enabled =
      Boolean(this.accessToken) &&
      Boolean(this.pixelId) &&
      env.NODE_ENV !== 'test';
  }

  async trackCompleteRegistration(params: {
    userId: string;
    email?: string | null;
    context?: TikTokRequestContext | null;
  }): Promise<void> {
    const page = this.buildPage(params.context);
    const payload: TikTokEventInput = {
      event: 'CompleteRegistration',
      eventId: `user_${params.userId}_registration`,
      user: this.buildUserPayload({
        email: params.email ?? null,
        externalId: params.userId,
        ip: params.context?.ip ?? null,
        userAgent: params.context?.userAgent ?? null,
        ttclid: params.context?.ttclid ?? null,
        ttp: params.context?.ttp ?? null,
      }),
      ...(page ? { page } : {}),
    };
    await this.trackEvent(payload);
  }

  async trackLogin(params: {
    userId: string;
    email?: string | null;
    context?: TikTokRequestContext | null;
  }): Promise<void> {
    const page = this.buildPage(params.context);
    const payload: TikTokEventInput = {
      event: 'Login',
      eventId: `user_${params.userId}_login`,
      user: this.buildUserPayload({
        email: params.email ?? null,
        externalId: params.userId,
        ip: params.context?.ip ?? null,
        userAgent: params.context?.userAgent ?? null,
        ttclid: params.context?.ttclid ?? null,
        ttp: params.context?.ttp ?? null,
      }),
      ...(page ? { page } : {}),
    };
    await this.trackEvent(payload);
  }

  async trackInitiateCheckout(params: {
    userId: string;
    email?: string | null;
    eventId?: string | null;
    properties?: Record<string, unknown>;
    context?: TikTokRequestContext | null;
  }): Promise<void> {
    const page = this.buildPage(params.context);
    const payload: TikTokEventInput = {
      event: 'InitiateCheckout',
      user: this.buildUserPayload({
        email: params.email ?? null,
        externalId: params.userId,
        ip: params.context?.ip ?? null,
        userAgent: params.context?.userAgent ?? null,
        ttclid: params.context?.ttclid ?? null,
        ttp: params.context?.ttp ?? null,
      }),
      ...(params.eventId ? { eventId: params.eventId } : {}),
      ...(params.properties ? { properties: params.properties } : {}),
      ...(page ? { page } : {}),
    };
    await this.trackEvent(payload);
  }

  async trackPurchase(params: {
    userId: string;
    email?: string | null;
    eventId?: string | null;
    properties?: Record<string, unknown>;
    context?: TikTokRequestContext | null;
  }): Promise<void> {
    const page = this.buildPage(params.context);
    const payload: TikTokEventInput = {
      event: 'Purchase',
      user: this.buildUserPayload({
        email: params.email ?? null,
        externalId: params.userId,
        ip: params.context?.ip ?? null,
        userAgent: params.context?.userAgent ?? null,
        ttclid: params.context?.ttclid ?? null,
        ttp: params.context?.ttp ?? null,
      }),
      ...(params.eventId ? { eventId: params.eventId } : {}),
      ...(params.properties ? { properties: params.properties } : {}),
      ...(page ? { page } : {}),
    };
    await this.trackEvent(payload);
  }

  private buildUserPayload(input: TikTokUserInput): TikTokUserPayload {
    const email = normalizeEmail(input.email);
    const phone = normalizePhone(input.phone);
    const externalId = normalizeExternalId(input.externalId);

    const payload: TikTokUserPayload = {};
    if (email) payload.email = sha256(email);
    if (phone) payload.phone = sha256(phone);
    if (externalId) payload.external_id = sha256(externalId);
    if (input.ip) payload.ip = input.ip;
    if (input.userAgent) payload.user_agent = input.userAgent;
    if (input.ttclid) payload.ttclid = input.ttclid;
    if (input.ttp) payload.ttp = input.ttp;
    return payload;
  }

  private buildPage(
    context?: TikTokRequestContext | null
  ): { url?: string | null; referrer?: string | null } | undefined {
    if (!context) return undefined;
    return {
      url: context.url ?? null,
      referrer: context.referrer ?? null,
    };
  }

  private async trackEvent(params: TikTokEventInput): Promise<void> {
    if (!this.enabled) return;
    if (!this.accessToken || !this.pixelId) return;

    const user = cleanObject(params.user);
    if (!Object.keys(user).length) {
      Logger.warn('TikTok Events API: missing user data, skipping event', {
        event: params.event,
      });
      return;
    }

    const dataPayload = cleanObject({
      event: params.event,
      event_time: params.eventTime ?? Math.floor(Date.now() / 1000),
      event_id: params.eventId ?? undefined,
      user,
      properties: params.properties
        ? cleanObject(params.properties)
        : undefined,
      page: params.page ? cleanObject(params.page) : undefined,
    });

    try {
      const response = await globalThis.fetch(TIKTOK_EVENTS_URL, {
        method: 'POST',
        headers: {
          'Access-Token': this.accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event_source: 'web',
          event_source_id: this.pixelId,
          ...(this.testEventCode
            ? { test_event_code: this.testEventCode }
            : {}),
          data: [dataPayload],
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        Logger.warn('TikTok Events API request failed', {
          status: response.status,
          statusText: response.statusText,
          response: text,
        });
      }
    } catch (error) {
      Logger.warn('TikTok Events API request error', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export const tiktokEventsService = new TikTokEventsService();
