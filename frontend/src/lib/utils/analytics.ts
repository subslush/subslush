import { browser } from '$app/environment';
import type { User as AuthUser } from '$lib/types/auth.js';

export type AnalyticsItem = {
  item_id?: string;
  item_name?: string;
  item_category?: string;
  item_variant?: string;
  item_list_name?: string;
  item_list_id?: string;
  price?: number;
  currency?: string;
  quantity?: number;
  index?: number;
};

type AnalyticsParams = Record<string, unknown>;

type GtagFunction = (...args: unknown[]) => void;
type TikTokPixel = {
  page: (params?: Record<string, unknown>) => void;
  track: (event: string, params?: Record<string, unknown>) => void;
  identify: (params: Record<string, string>) => void;
};

const getGtag = (): GtagFunction | null => {
  if (!browser) return null;
  if (typeof window.gtag === 'function') return window.gtag;
  window.dataLayer = window.dataLayer || [];
  return (...args: unknown[]) => {
    window.dataLayer?.push(args);
  };
};

const getTtq = (): TikTokPixel | null => {
  if (!browser) return null;
  const ttq = window.ttq;
  if (!ttq || typeof ttq.track !== 'function') return null;
  return ttq;
};

const cleanParams = <T extends AnalyticsParams>(params: T): T => {
  const cleanedEntries = Object.entries(params).filter(
    ([, value]) => value !== undefined && value !== null
  );
  return Object.fromEntries(cleanedEntries) as T;
};

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

const hashSha256 = async (value: string): Promise<string | null> => {
  if (!browser) return null;
  if (!value) return null;
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle) return null;
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const hashBuffer = await cryptoApi.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
};

let lastIdentifyKey = '';
let identifyInFlight: Promise<void> | null = null;
let hasTrackedTikTokPageView = false;

export const identifyTikTokUser = async (user: AuthUser | null): Promise<void> => {
  if (!browser) return;
  const ttq = getTtq();
  if (!ttq || typeof ttq.identify !== 'function') return;
  if (identifyInFlight) {
    await identifyInFlight;
    return;
  }

  const email = normalizeEmail(user?.email);
  const externalId = normalizeExternalId(user?.id);
  const phone =
    normalizePhone((user as { phone?: string | null })?.phone) ||
    normalizePhone((user as { phoneNumber?: string | null })?.phoneNumber);

  if (!email && !externalId && !phone) {
    lastIdentifyKey = '';
    return;
  }

  const identifyKey = `${email || ''}|${externalId || ''}|${phone || ''}`;
  if (identifyKey === lastIdentifyKey) return;

  identifyInFlight = (async () => {
    const payload: Record<string, string> = {};
    const hashedEmail = email ? await hashSha256(email) : null;
    if (hashedEmail) payload.email = hashedEmail;
    const hashedPhone = phone ? await hashSha256(phone) : null;
    if (hashedPhone) payload.phone_number = hashedPhone;
    const hashedExternal = externalId ? await hashSha256(externalId) : null;
    if (hashedExternal) payload.external_id = hashedExternal;
    if (!Object.keys(payload).length) return;
    ttq.identify(payload);
    lastIdentifyKey = identifyKey;
  })();

  try {
    await identifyInFlight;
  } finally {
    identifyInFlight = null;
  }
};

const cleanItems = (items: AnalyticsItem[]): AnalyticsItem[] =>
  items
    .filter(item => Boolean(item && (item.item_id || item.item_name)))
    .map(item => cleanParams(item));

const trackEvent = (eventName: string, params?: AnalyticsParams): void => {
  const gtag = getGtag();
  if (!gtag) return;
  gtag('event', eventName, params ? cleanParams(params) : {});
};

const trackTikTokEvent = (eventName: string, params?: AnalyticsParams): void => {
  const ttq = getTtq();
  if (!ttq) return;
  if (
    eventName !== 'Login' &&
    eventName !== 'CompleteRegistration' &&
    eventName !== 'AddToCart'
  )
    return;
  ttq.track(eventName, params ? cleanParams(params) : {});
};

const trackTikTokPageView = (): void => {
  if (!hasTrackedTikTokPageView) {
    hasTrackedTikTokPageView = true;
  }
};

type TikTokContentType = 'product' | 'product_group';

const buildTikTokContents = (
  items: AnalyticsItem[],
  contentType: TikTokContentType
): Record<string, unknown>[] =>
  items
    .filter(item => Boolean(item && (item.item_id || item.item_name)))
    .map(item =>
      cleanParams({
        content_id: item.item_id || item.item_name,
        content_type: contentType,
        content_name: item.item_name || item.item_id,
        content_category: item.item_category,
        price: item.price
      })
    )
    .filter(content => Boolean(content.content_id));

const resolveCurrency = (currency: string | undefined, items: AnalyticsItem[]): string | undefined =>
  currency || items.find(item => item.currency)?.currency;

export const trackPageView = (pagePath: string, pageTitle?: string): void => {
  if (!browser) return;
  trackEvent('page_view', {
    page_path: pagePath,
    page_title: pageTitle || document.title,
    page_location: window.location.href
  });
  trackTikTokPageView();
};

export const trackViewItemList = (listName: string, items: AnalyticsItem[]): void => {
  const normalizedItems = cleanItems(items);
  if (!normalizedItems.length) return;
  trackEvent('view_item_list', {
    item_list_name: listName,
    items: normalizedItems
  });
  const contents = buildTikTokContents(normalizedItems, 'product_group');
  if (!contents.length) return;
  trackTikTokEvent('ViewContent', {
    contents,
    currency: resolveCurrency(undefined, normalizedItems)
  });
};

export const trackSelectItem = (
  listName: string | null,
  items: AnalyticsItem[]
): void => {
  const normalizedItems = cleanItems(items);
  if (!normalizedItems.length) return;
  trackEvent(
    'select_item',
    cleanParams({
      item_list_name: listName || undefined,
      items: normalizedItems
    })
  );
};

export const trackViewItem = (item: AnalyticsItem): void => {
  const normalizedItems = cleanItems([item]);
  if (!normalizedItems.length) return;
  const primaryItem = normalizedItems[0];
  trackEvent(
    'view_item',
    cleanParams({
      items: normalizedItems,
      currency: primaryItem.currency,
      value: primaryItem.price
    })
  );
  const contents = buildTikTokContents(normalizedItems, 'product');
  if (!contents.length) return;
  trackTikTokEvent('ViewContent', {
    contents,
    value: primaryItem.price,
    currency: resolveCurrency(primaryItem.currency, normalizedItems)
  });
};

export const trackBeginCheckout = (
  currency: string | undefined,
  value: number | undefined,
  items: AnalyticsItem[]
): void => {
  const normalizedItems = cleanItems(items);
  if (!normalizedItems.length) return;
  trackEvent(
    'begin_checkout',
    cleanParams({
      currency,
      value,
      items: normalizedItems
    })
  );
  const contents = buildTikTokContents(normalizedItems, 'product');
  if (!contents.length) return;
  trackTikTokEvent('InitiateCheckout', {
    contents,
    value,
    currency: resolveCurrency(currency, normalizedItems)
  });
};

export const trackAddToCart = (
  currency: string | undefined,
  value: number | undefined,
  items: AnalyticsItem[]
): void => {
  const normalizedItems = cleanItems(items);
  if (!normalizedItems.length) return;
  const contents = buildTikTokContents(normalizedItems, 'product');
  if (!contents.length) return;
  trackTikTokEvent('AddToCart', {
    contents,
    value,
    currency: resolveCurrency(currency, normalizedItems)
  });
};

export const trackAddPaymentInfo = (
  paymentType: string,
  currency: string | undefined,
  value: number | undefined,
  items: AnalyticsItem[]
): void => {
  const normalizedItems = cleanItems(items);
  if (!normalizedItems.length) return;
  trackEvent(
    'add_payment_info',
    cleanParams({
      payment_type: paymentType,
      currency,
      value,
      items: normalizedItems
    })
  );
  const contents = buildTikTokContents(normalizedItems, 'product');
  if (!contents.length) return;
  trackTikTokEvent('AddPaymentInfo', {
    contents,
    value,
    currency: resolveCurrency(currency, normalizedItems)
  });
};

export const trackTikTokInitiateCheckout = (
  currency: string | undefined,
  value: number | undefined,
  items: AnalyticsItem[]
): void => {
  const normalizedItems = cleanItems(items);
  if (!normalizedItems.length) return;
  const contents = buildTikTokContents(normalizedItems, 'product');
  if (!contents.length) return;
  trackTikTokEvent('InitiateCheckout', {
    contents,
    value,
    currency: resolveCurrency(currency, normalizedItems)
  });
};

export const trackTikTokAddPaymentInfo = (
  currency: string | undefined,
  value: number | undefined,
  items: AnalyticsItem[]
): void => {
  const normalizedItems = cleanItems(items);
  if (!normalizedItems.length) return;
  const contents = buildTikTokContents(normalizedItems, 'product');
  if (!contents.length) return;
  trackTikTokEvent('AddPaymentInfo', {
    contents,
    value,
    currency: resolveCurrency(currency, normalizedItems)
  });
};

export const trackPlaceAnOrder = (
  currency: string | undefined,
  value: number | undefined,
  items: AnalyticsItem[]
): void => {
  const normalizedItems = cleanItems(items);
  if (!normalizedItems.length) return;
  const contents = buildTikTokContents(normalizedItems, 'product');
  if (!contents.length) return;
  trackTikTokEvent('PlaceAnOrder', {
    contents,
    value,
    currency: resolveCurrency(currency, normalizedItems)
  });
};

export const trackTikTokPurchase = (
  currency: string | undefined,
  value: number | undefined,
  items: AnalyticsItem[]
): void => {
  const normalizedItems = cleanItems(items);
  if (!normalizedItems.length) return;
  const contents = buildTikTokContents(normalizedItems, 'product');
  if (!contents.length) return;
  trackTikTokEvent('Purchase', {
    contents,
    value,
    currency: resolveCurrency(currency, normalizedItems)
  });
};

export const trackPurchase = (
  transactionId: string,
  currency: string,
  value: number,
  items: AnalyticsItem[]
): void => {
  const normalizedItems = cleanItems(items);
  if (!normalizedItems.length) return;
  trackEvent(
    'purchase',
    cleanParams({
      transaction_id: transactionId,
      currency,
      value,
      items: normalizedItems
    })
  );
  const contents = buildTikTokContents(normalizedItems, 'product');
  if (!contents.length) return;
  trackTikTokEvent('Purchase', {
    contents,
    value,
    currency: resolveCurrency(currency, normalizedItems)
  });
};

export const trackSearch = (searchTerm: string, items: AnalyticsItem[] = []): void => {
  const trimmedTerm = searchTerm.trim();
  if (!trimmedTerm) return;
  trackEvent('search', { search_term: trimmedTerm });
  const normalizedItems = cleanItems(items);
  const contents = normalizedItems.length
    ? buildTikTokContents(normalizedItems, 'product_group')
    : [];
  trackTikTokEvent('Search', cleanParams({
    search_string: trimmedTerm,
    contents: contents.length ? contents : undefined
  }));
};

export const trackCompleteRegistration = (method?: string): void => {
  trackEvent('sign_up', cleanParams({ method }));
  trackTikTokEvent('CompleteRegistration', {
    content_name: 'Account Registration'
  });
};

export const trackLogin = (method?: string): void => {
  trackEvent('login', cleanParams({ method }));
  trackTikTokEvent('Login', {
    content_name: 'Account Login'
  });
};

declare global {
  interface Window {
    gtag?: GtagFunction;
    dataLayer?: unknown[];
    ttq?: TikTokPixel;
  }
}

export {};
