import { browser } from '$app/environment';

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

const getGtag = (): GtagFunction | null => {
  if (!browser) return null;
  if (typeof window.gtag === 'function') return window.gtag;
  window.dataLayer = window.dataLayer || [];
  return (...args: unknown[]) => {
    window.dataLayer?.push(args);
  };
};

const cleanParams = <T extends AnalyticsParams>(params: T): T => {
  const cleanedEntries = Object.entries(params).filter(
    ([, value]) => value !== undefined && value !== null
  );
  return Object.fromEntries(cleanedEntries) as T;
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

export const trackPageView = (pagePath: string, pageTitle?: string): void => {
  if (!browser) return;
  trackEvent('page_view', {
    page_path: pagePath,
    page_title: pageTitle || document.title,
    page_location: window.location.href
  });
};

export const trackViewItemList = (listName: string, items: AnalyticsItem[]): void => {
  const normalizedItems = cleanItems(items);
  if (!normalizedItems.length) return;
  trackEvent('view_item_list', {
    item_list_name: listName,
    items: normalizedItems
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
};

declare global {
  interface Window {
    gtag?: GtagFunction;
    dataLayer?: unknown[];
  }
}

export {};
