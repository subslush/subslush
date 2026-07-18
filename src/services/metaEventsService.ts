import crypto from 'crypto';
import type { FastifyRequest } from 'fastify';
import { env } from '../config/environment';
import { Logger } from '../utils/logger';

export type MetaEventName =
  | 'AddPaymentInfo'
  | 'AddToCart'
  | 'CompleteRegistration'
  | 'InitiateCheckout'
  | 'Purchase'
  | 'Search'
  | 'ViewContent';

export type MetaRequestContext = {
  ip?: string | null;
  userAgent?: string | null;
  url?: string | null;
  fbp?: string | null;
  fbc?: string | null;
};

type MetaUserInput = {
  email?: string | null;
  phone?: string | null;
  externalId?: string | null;
  context?: MetaRequestContext | null;
};

export type MetaUserData = {
  em?: string[];
  ph?: string[];
  external_id?: string[];
  client_ip_address?: string;
  client_user_agent?: string;
  fbp?: string;
  fbc?: string;
};

export type MetaServerEvent = {
  event_name: MetaEventName;
  event_time: number;
  event_id: string;
  event_source_url: string;
  action_source: 'website';
  user_data: MetaUserData;
  custom_data?: Record<string, unknown>;
};

type MetaEventInput = MetaUserInput & {
  eventName: MetaEventName;
  eventId: string;
  eventTime?: number;
  customData?: Record<string, unknown>;
};

const META_PIXEL_ID_FALLBACK = '2345279372968113';

const cleanObject = <T extends Record<string, unknown>>(input: T): T =>
  Object.fromEntries(
    Object.entries(input).filter(
      ([, value]) => value !== undefined && value !== null && value !== ''
    )
  ) as T;

const normalizeString = (value?: string | null): string | null => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

const normalizeEmail = (value?: string | null): string | null => {
  const normalized = normalizeString(value)?.toLowerCase();
  return normalized || null;
};

const normalizePhone = (value?: string | null): string | null => {
  const normalized = normalizeString(value)?.replace(/[^0-9]/g, '');
  return normalized || null;
};

const sha256 = (value: string): string =>
  crypto.createHash('sha256').update(value).digest('hex');

const readHeader = (request: FastifyRequest, name: string): string | null => {
  const value = request.headers[name] as string | string[] | undefined;
  const resolved = Array.isArray(value) ? value[0] : value;
  return normalizeString(resolved);
};

const readForwardedIp = (request: FastifyRequest): string | null => {
  const forwarded = readHeader(request, 'x-forwarded-for');
  return normalizeString(forwarded?.split(',')[0]);
};

const extractQueryParameter = (
  candidateUrl: string | null,
  parameter: string
): string | null => {
  if (!candidateUrl) return null;
  try {
    return normalizeString(
      new globalThis.URL(candidateUrl).searchParams.get(parameter)
    );
  } catch {
    return null;
  }
};

const buildFbc = (fbclid: string | null): string | null =>
  fbclid ? `fb.1.${Math.floor(Date.now() / 1000)}.${fbclid}` : null;

export const buildMetaRequestContext = (
  request: FastifyRequest
): MetaRequestContext => {
  const referer =
    readHeader(request, 'referer') || readHeader(request, 'referrer');
  const origin = readHeader(request, 'origin');
  const requestQuery = request.query as { fbclid?: unknown } | undefined;
  const queryFbclid =
    typeof requestQuery?.fbclid === 'string'
      ? normalizeString(requestQuery.fbclid)
      : null;
  const fbclid = queryFbclid || extractQueryParameter(referer, 'fbclid');

  return {
    ip: readForwardedIp(request) || request.ip || null,
    userAgent: readHeader(request, 'user-agent'),
    url: referer || origin || env.APP_BASE_URL || null,
    fbp: normalizeString(request.cookies?.['_fbp']),
    fbc: normalizeString(request.cookies?.['_fbc']) || buildFbc(fbclid),
  };
};

export const buildMetaUserData = (input: MetaUserInput): MetaUserData => {
  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);
  const externalId = normalizeString(input.externalId);

  const userData: MetaUserData = {};
  if (email) userData.em = [sha256(email)];
  if (phone) userData.ph = [sha256(phone)];
  if (externalId) userData.external_id = [sha256(externalId)];
  const ip = normalizeString(input.context?.ip);
  if (ip) userData.client_ip_address = ip;
  const userAgent = normalizeString(input.context?.userAgent);
  if (userAgent) userData.client_user_agent = userAgent;
  const fbp = normalizeString(input.context?.fbp);
  if (fbp) userData.fbp = fbp;
  const fbc = normalizeString(input.context?.fbc);
  if (fbc) userData.fbc = fbc;
  return userData;
};

const normalizeCurrency = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toUpperCase();
  return normalized || undefined;
};

const normalizeAmount = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;

const normalizeContents = (
  value: unknown
): Record<string, unknown>[] | undefined => {
  if (!Array.isArray(value)) return undefined;

  const contents = value.reduce<Record<string, unknown>[]>((result, entry) => {
    if (!entry || typeof entry !== 'object') return result;
    const content = entry as Record<string, unknown>;
    const id =
      normalizeString(
        typeof content['id'] === 'string' ? content['id'] : null
      ) ||
      normalizeString(
        typeof content['content_id'] === 'string' ? content['content_id'] : null
      );
    if (!id) return result;

    result.push(
      cleanObject({
        id,
        quantity:
          typeof content['quantity'] === 'number' &&
          Number.isFinite(content['quantity']) &&
          content['quantity'] > 0
            ? content['quantity']
            : 1,
        item_price: normalizeAmount(content['item_price'] ?? content['price']),
      })
    );
    return result;
  }, []);

  return contents.length > 0 ? contents : undefined;
};

export const buildMetaCustomData = (
  input?: Record<string, unknown> | null
): Record<string, unknown> | undefined => {
  if (!input) return undefined;

  const contentId = normalizeString(
    typeof input['content_id'] === 'string' ? input['content_id'] : null
  );
  const contents = normalizeContents(input['contents']);
  const contentIds =
    contents?.map(content => String(content['id'])) ||
    (contentId ? [contentId] : undefined);

  const customData = cleanObject({
    value: normalizeAmount(input['value']),
    currency: normalizeCurrency(input['currency']),
    content_ids: contentIds,
    content_type:
      normalizeString(
        typeof input['content_type'] === 'string' ? input['content_type'] : null
      ) || (contentIds?.length ? 'product' : undefined),
    content_name: normalizeString(
      typeof input['content_name'] === 'string' ? input['content_name'] : null
    ),
    content_category: normalizeString(
      typeof input['content_category'] === 'string'
        ? input['content_category']
        : null
    ),
    search_string: normalizeString(
      typeof input['search_string'] === 'string' ? input['search_string'] : null
    ),
    payment_type: normalizeString(
      typeof input['payment_type'] === 'string' ? input['payment_type'] : null
    ),
    contents,
  });

  return Object.keys(customData).length > 0 ? customData : undefined;
};

export const buildMetaServerEvent = (
  input: MetaEventInput
): MetaServerEvent | null => {
  const eventId = normalizeString(input.eventId);
  const eventSourceUrl =
    normalizeString(input.context?.url) || normalizeString(env.APP_BASE_URL);
  if (!eventId || !eventSourceUrl) return null;

  const userData = buildMetaUserData(input);
  // Meta requires the browser user agent for website events. Failing closed
  // avoids sending a malformed CAPI event that cannot be matched reliably.
  if (!userData.client_user_agent) return null;

  const customData = buildMetaCustomData(input.customData);
  if (
    input.eventName === 'Purchase' &&
    (!customData ||
      typeof customData['value'] !== 'number' ||
      typeof customData['currency'] !== 'string')
  ) {
    return null;
  }

  return {
    event_name: input.eventName,
    event_time: input.eventTime ?? Math.floor(Date.now() / 1000),
    event_id: eventId,
    event_source_url: eventSourceUrl,
    action_source: 'website',
    user_data: userData,
    ...(customData ? { custom_data: customData } : {}),
  };
};

class MetaEventsService {
  private readonly accessToken =
    normalizeString(env.META_CONVERSIONS_API_ACCESS_TOKEN) || null;
  private readonly datasetId =
    normalizeString(env.META_DATASET_ID) || META_PIXEL_ID_FALLBACK;
  private readonly apiVersion =
    normalizeString(env.META_GRAPH_API_VERSION) || 'v25.0';
  private readonly testEventCode =
    normalizeString(env.META_TEST_EVENT_CODE) || null;
  private readonly enabled =
    env.NODE_ENV !== 'test' &&
    Boolean(this.accessToken) &&
    Boolean(this.datasetId);

  async trackCompleteRegistration(
    input: Omit<MetaEventInput, 'eventName' | 'customData'>
  ): Promise<void> {
    await this.trackEvent({ ...input, eventName: 'CompleteRegistration' });
  }

  async trackAddToCart(
    input: Omit<MetaEventInput, 'eventName'>
  ): Promise<void> {
    await this.trackEvent({ ...input, eventName: 'AddToCart' });
  }

  async trackViewContent(
    input: Omit<MetaEventInput, 'eventName'>
  ): Promise<void> {
    await this.trackEvent({ ...input, eventName: 'ViewContent' });
  }

  async trackSearch(input: Omit<MetaEventInput, 'eventName'>): Promise<void> {
    await this.trackEvent({ ...input, eventName: 'Search' });
  }

  async trackInitiateCheckout(
    input: Omit<MetaEventInput, 'eventName'>
  ): Promise<void> {
    await this.trackEvent({ ...input, eventName: 'InitiateCheckout' });
  }

  async trackAddPaymentInfo(
    input: Omit<MetaEventInput, 'eventName'>
  ): Promise<void> {
    await this.trackEvent({ ...input, eventName: 'AddPaymentInfo' });
  }

  async trackPurchase(input: Omit<MetaEventInput, 'eventName'>): Promise<void> {
    await this.trackEvent({ ...input, eventName: 'Purchase' });
  }

  private async trackEvent(input: MetaEventInput): Promise<void> {
    if (!this.enabled || !this.accessToken) return;

    const event = buildMetaServerEvent(input);
    if (!event) {
      Logger.warn(
        'Meta Conversions API event validation failed; event skipped',
        {
          eventName: input.eventName,
          eventId: input.eventId,
        }
      );
      return;
    }

    const endpoint = new globalThis.URL(
      `https://graph.facebook.com/${this.apiVersion}/${this.datasetId}/events`
    );
    endpoint.searchParams.set('access_token', this.accessToken);

    try {
      const response = await globalThis.fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: [event],
          ...(this.testEventCode
            ? { test_event_code: this.testEventCode }
            : {}),
        }),
        signal: globalThis.AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        Logger.warn('Meta Conversions API request failed', {
          eventName: input.eventName,
          eventId: input.eventId,
          status: response.status,
          statusText: response.statusText,
        });
      }
    } catch (error) {
      Logger.warn('Meta Conversions API request error', {
        eventName: input.eventName,
        eventId: input.eventId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export const metaEventsService = new MetaEventsService();
