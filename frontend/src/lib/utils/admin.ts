import { formatDate } from '$lib/utils/formatters.js';
import type { AdminStatusTone } from '$lib/types/admin.js';

export const pickValue = <T>(...values: Array<T | null | undefined>): T | null => {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return null;
};

export const formatCents = (cents?: number | null, currency: string = 'USD'): string => {
  if (cents === undefined || cents === null) {
    return '--';
  }
  const amount = cents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2
  }).format(amount);
};

export const formatOptionalDate = (value?: string | null): string => {
  if (!value) {
    return '--';
  }
  return formatDate(value);
};

export const statusToneFromMap = (
  status: string | null | undefined,
  map: Record<string, AdminStatusTone>,
  fallback: AdminStatusTone = 'neutral'
): AdminStatusTone => {
  if (!status) {
    return fallback;
  }
  return map[status] || fallback;
};

export const getBooleanLabel = (value?: boolean | null): string => {
  if (value === undefined || value === null) {
    return '--';
  }
  return value ? 'Yes' : 'No';
};
