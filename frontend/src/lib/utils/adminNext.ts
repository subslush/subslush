import type {
  AdminNextFulfillmentDetailItem,
  AdminNextFulfillmentOrder,
  AdminNextFulfillmentQueueItem,
} from '$lib/types/adminNext.js';

export const toNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const formatMoney = (
  centsOrMinorUnits: number | string | null | undefined,
  currency = 'USD'
): string => {
  const amount = toNumber(centsOrMinorUnits, 0) / 100;
  const normalizedCurrency = String(currency || 'USD').toUpperCase();
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: normalizedCurrency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${normalizedCurrency} ${amount.toFixed(2)}`;
  }
};

export const formatDateTime = (value?: string | null): string => {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

export const formatDate = (value?: string | null): string => {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
};

export const relativeTime = (value?: string | null): string => {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  const diffMs = date.getTime() - Date.now();
  const absMs = Math.abs(diffMs);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['day', 86400000],
    ['hour', 3600000],
    ['minute', 60000],
  ];
  const formatter = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });
  for (const [unit, ms] of units) {
    if (absMs >= ms) {
      return formatter.format(Math.round(diffMs / ms), unit);
    }
  }
  return 'just now';
};

export const shortId = (value?: string | null): string =>
  value ? String(value).slice(0, 8) : '--';

export const termLabel = (months?: number | string | null): string => {
  const parsed = toNumber(months, 0);
  if (!parsed) return '--';
  return `${parsed} month${parsed === 1 ? '' : 's'}`;
};

export const statusLabel = (value?: string | null): string =>
  (value || 'unknown').replace(/_/g, ' ');

export const isGuestEmail = (email?: string | null): boolean =>
  Boolean(email && /^guest\+.+@guest\.local$/i.test(email));

export const isDeliveredItem = (
  item: AdminNextFulfillmentQueueItem | AdminNextFulfillmentDetailItem
): boolean => {
  const handshakeState =
    'handshake_state' in item ? item.handshake_state : null;
  if (
    handshakeState === 'instructions_delivered' ||
    handshakeState === 'awaiting_customer' ||
    handshakeState === 'customer_ready'
  ) {
    return false;
  }
  return item.status === 'delivered' || item.status === 'active' || Boolean('delivered_at' in item && item.delivered_at);
};

export const orderItemCount = (order: AdminNextFulfillmentOrder): number =>
  order.items?.length || 0;

export const orderOpenCount = (orders: AdminNextFulfillmentOrder[]): number =>
  orders.reduce((total, order) => {
    return total + (order.items || []).filter(item => !isDeliveredItem(item)).length;
  }, 0);

export const productLine = (
  item: AdminNextFulfillmentQueueItem | AdminNextFulfillmentDetailItem
): string => {
  const parts = [item.product_name, item.variant_name].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Item';
};
