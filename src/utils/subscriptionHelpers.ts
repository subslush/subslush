import { ServiceType, ServicePlan } from '../types/subscription';

/**
 * Calculate subscription end date based on duration
 */
export function calculateEndDate(durationMonths: number): Date {
  const now = new Date();
  const endDate = new Date(now);
  endDate.setMonth(endDate.getMonth() + durationMonths);
  return endDate;
}

/**
 * Calculate renewal date (7 days before end date)
 */
export function calculateRenewalDate(durationMonths: number): Date {
  const endDate = calculateEndDate(durationMonths);
  const renewalDate = new Date(endDate);
  renewalDate.setDate(renewalDate.getDate() - 7);
  return renewalDate;
}

/**
 * Calculate prorated refund for cancelled subscription
 * Returns 0 if no refund applicable (more than 50% used)
 */
export function calculateProratedRefund(
  originalPrice: number,
  startDate: Date,
  endDate: Date,
  cancelDate: Date = new Date()
): number {
  const totalDuration = endDate.getTime() - startDate.getTime();
  const usedDuration = cancelDate.getTime() - startDate.getTime();
  const remainingDuration = endDate.getTime() - cancelDate.getTime();

  // If more than 50% used, no refund
  if (usedDuration > totalDuration * 0.5) {
    return 0;
  }

  // Calculate prorated refund based on remaining time
  const refundPercentage = remainingDuration / totalDuration;
  return Math.round(originalPrice * refundPercentage * 100) / 100;
}

/**
 * Format subscription display name
 */
export function formatSubscriptionName(
  serviceType: ServiceType,
  servicePlan: ServicePlan
): string {
  const serviceNames: Record<string, string> = {
    spotify: 'Spotify',
    netflix: 'Netflix',
    tradingview: 'TradingView',
  };

  const planNames: Record<string, string> = {
    premium: 'Premium',
    family: 'Family',
    basic: 'Basic',
    standard: 'Standard',
    pro: 'Pro',
    individual: 'Individual',
  };

  const normalizeLabel = (value: string): string => {
    const trimmed = value.trim();
    if (!trimmed) return '';
    return trimmed
      .split(/[-_\s]+/)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  };

  const serviceLabel = serviceNames[serviceType] || normalizeLabel(serviceType);
  const planLabel = planNames[servicePlan] || normalizeLabel(servicePlan);

  if (planLabel && serviceLabel) {
    const normalizedService = serviceLabel.toLowerCase();
    if (planLabel.toLowerCase().startsWith(normalizedService)) {
      return planLabel.trim();
    }
  }

  return [serviceLabel, planLabel].filter(Boolean).join(' ').trim();
}

/**
 * Get subscription duration in months
 */
export function getSubscriptionDurationMonths(
  startDate: Date,
  endDate: Date
): number {
  const start = new Date(startDate);
  const end = new Date(endDate);

  const months =
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth());

  return months;
}

/**
 * Check if subscription is expiring soon (within 7 days)
 */
export function isExpiringSoon(endDate: Date): boolean {
  const now = new Date();
  const daysUntilExpiry = Math.ceil(
    (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );
  return daysUntilExpiry <= 7 && daysUntilExpiry > 0;
}

/**
 * Check if subscription is expired
 */
export function isExpired(endDate: Date): boolean {
  const now = new Date();
  return endDate.getTime() < now.getTime();
}

/**
 * Get days remaining in subscription
 */
export function getDaysRemaining(endDate: Date): number {
  const now = new Date();
  const daysRemaining = Math.ceil(
    (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );
  return Math.max(0, daysRemaining);
}

/**
 * Get subscription status based on dates
 */
export function getSubscriptionStatus(
  startDate: Date,
  endDate: Date,
  currentStatus: string
): 'pending' | 'active' | 'expired' | 'cancelled' {
  if (currentStatus === 'cancelled') {
    return 'cancelled';
  }

  const now = new Date();

  if (now < startDate) {
    return 'pending';
  }

  if (now > endDate) {
    return 'expired';
  }

  return 'active';
}

/**
 * Format subscription duration for display
 */
export function formatDuration(durationMonths: number): string {
  if (durationMonths === 1) {
    return '1 month';
  }
  return `${durationMonths} months`;
}

export function formatSubscriptionDisplayName(params: {
  productName?: string | null;
  variantName?: string | null;
  serviceType?: ServiceType | null;
  servicePlan?: ServicePlan | null;
  termMonths?: number | null;
}): string {
  const productName = params.productName?.trim() || '';
  const variantName = params.variantName?.trim() || '';
  let baseLabel = '';

  if (productName && variantName) {
    baseLabel = variantName.toLowerCase().startsWith(productName.toLowerCase())
      ? variantName
      : `${productName} ${variantName}`;
  } else if (productName || variantName) {
    baseLabel = productName || variantName;
  } else if (params.serviceType || params.servicePlan) {
    baseLabel = formatSubscriptionName(
      (params.serviceType || '') as ServiceType,
      (params.servicePlan || '') as ServicePlan
    );
  } else {
    baseLabel = 'subscription';
  }

  const durationLabel =
    params.termMonths &&
    Number.isFinite(params.termMonths) &&
    params.termMonths > 0
      ? formatDuration(Math.floor(params.termMonths))
      : null;

  return durationLabel ? `${baseLabel} (${durationLabel})` : baseLabel;
}

export const formatSubscriptionShortId = (
  subscriptionId?: string | null,
  length = 8
): string => {
  if (!subscriptionId) return 'Subscription';
  const trimmed = subscriptionId.trim();
  if (!trimmed) return 'Subscription';
  const safeLength = Number.isFinite(length) && length > 0 ? length : 8;
  return `Subscription ${trimmed.slice(0, safeLength)}`;
};

/**
 * Get renewal reminder date (7 days before end)
 */
export function getRenewalReminderDate(endDate: Date): Date {
  const reminderDate = new Date(endDate);
  reminderDate.setDate(reminderDate.getDate() - 7);
  return reminderDate;
}

export type RenewalState =
  | 'scheduled'
  | 'due_soon'
  | 'overdue'
  | 'manual'
  | 'unknown';

export function resolveBillingDate(
  nextBillingAt?: Date | string | null,
  renewalDate?: Date | string | null
): Date | null {
  const toDate = (value?: Date | string | null): Date | null => {
    if (!value) return null;
    return value instanceof Date ? value : new Date(value);
  };

  return toDate(nextBillingAt) || toDate(renewalDate);
}

export function calculateDaysUntil(date: Date, now: Date = new Date()): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const diffMs = date.getTime() - now.getTime();
  if (diffMs < 0) {
    return Math.floor(diffMs / msPerDay);
  }
  return Math.ceil(diffMs / msPerDay);
}

export function getRenewalState(options: {
  autoRenew?: boolean | null;
  nextBillingAt?: Date | string | null;
  renewalDate?: Date | string | null;
  now?: Date;
}): { state: RenewalState; daysUntil: number | null } {
  const { autoRenew, nextBillingAt, renewalDate, now = new Date() } = options;

  if (autoRenew === false) {
    return { state: 'manual', daysUntil: null };
  }

  const billingDate = resolveBillingDate(nextBillingAt, renewalDate);
  if (!billingDate) {
    return { state: 'unknown', daysUntil: null };
  }

  const daysUntil = calculateDaysUntil(billingDate, now);
  if (daysUntil < 0) {
    return { state: 'overdue', daysUntil };
  }

  if (daysUntil <= 7) {
    return { state: 'due_soon', daysUntil };
  }

  return { state: 'scheduled', daysUntil };
}

export function computeNextRenewalDates(options: {
  endDate: Date;
  termMonths: number;
  autoRenew: boolean;
  now?: Date;
}): { endDate: Date; renewalDate: Date; nextBillingAt: Date | null } {
  const now = options.now ?? new Date();
  const baseDate = options.endDate > now ? options.endDate : now;
  const nextEndDate = new Date(baseDate);
  nextEndDate.setMonth(nextEndDate.getMonth() + options.termMonths);
  const nextRenewalDate = new Date(nextEndDate);
  nextRenewalDate.setDate(nextRenewalDate.getDate() - 7);

  return {
    endDate: nextEndDate,
    renewalDate: nextRenewalDate,
    nextBillingAt: options.autoRenew ? nextRenewalDate : null,
  };
}

const STRIPE_RENEWAL_ATTEMPT_OFFSETS_DAYS = [7, 3, 1, 0];

export function getStripeRenewalSchedule(endDate: Date): Date[] {
  return STRIPE_RENEWAL_ATTEMPT_OFFSETS_DAYS.map(offset => {
    const date = new Date(endDate);
    date.setDate(date.getDate() - offset);
    return date;
  });
}

export function getNextStripeRenewalAttemptDate(
  endDate: Date,
  currentAttemptAt?: Date | string | null
): Date | null {
  const schedule = getStripeRenewalSchedule(endDate).sort(
    (a, b) => a.getTime() - b.getTime()
  );
  if (!currentAttemptAt) {
    return schedule[0] ?? null;
  }

  const current =
    currentAttemptAt instanceof Date
      ? currentAttemptAt
      : new Date(currentAttemptAt);
  const currentTime = current.getTime();

  const next = schedule.find(date => date.getTime() > currentTime);
  return next || null;
}

/**
 * Calculate subscription value (price per month)
 */
export function calculateMonthlyValue(
  totalPrice: number,
  durationMonths: number
): number {
  return Math.round((totalPrice / durationMonths) * 100) / 100;
}

/**
 * Check if subscription can be cancelled (not already cancelled or expired)
 */
export function canBeCancelled(status: string, endDate: Date): boolean {
  if (status === 'cancelled') {
    return false;
  }

  if (isExpired(endDate)) {
    return false;
  }

  return true;
}

/**
 * Get subscription progress percentage (0-100)
 */
export function getSubscriptionProgress(
  startDate: Date,
  endDate: Date
): number {
  const now = new Date();
  const totalDuration = endDate.getTime() - startDate.getTime();
  const elapsed = now.getTime() - startDate.getTime();

  if (elapsed <= 0) return 0;
  if (elapsed >= totalDuration) return 100;

  return Math.round((elapsed / totalDuration) * 100);
}

/**
 * Validate subscription dates
 */
export function validateSubscriptionDates(
  startDate: Date,
  endDate: Date,
  renewalDate?: Date
): { valid: boolean; error?: string } {
  if (startDate >= endDate) {
    return { valid: false, error: 'Start date must be before end date' };
  }

  if (renewalDate && renewalDate < startDate) {
    return { valid: false, error: 'Renewal date must be after start date' };
  }

  if (renewalDate && renewalDate > endDate) {
    return {
      valid: false,
      error: 'Renewal date must be before or equal to end date',
    };
  }

  return { valid: true };
}

/**
 * Get subscription health status
 */
export function getSubscriptionHealth(
  status: string,
  endDate: Date
): 'healthy' | 'warning' | 'expired' | 'cancelled' {
  if (status === 'cancelled') {
    return 'cancelled';
  }

  if (isExpired(endDate)) {
    return 'expired';
  }

  if (isExpiringSoon(endDate)) {
    return 'warning';
  }

  return 'healthy';
}
