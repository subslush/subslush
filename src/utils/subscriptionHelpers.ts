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
  const serviceNames: Record<ServiceType, string> = {
    spotify: 'Spotify',
    netflix: 'Netflix',
    tradingview: 'TradingView',
  };

  const planNames: Record<ServicePlan, string> = {
    premium: 'Premium',
    family: 'Family',
    basic: 'Basic',
    standard: 'Standard',
    pro: 'Pro',
    individual: 'Individual',
  };

  return `${serviceNames[serviceType]} ${planNames[servicePlan]}`;
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
  if (durationMonths === 12) {
    return '1 year';
  }
  return `${durationMonths} months`;
}

/**
 * Get renewal reminder date (7 days before end)
 */
export function getRenewalReminderDate(endDate: Date): Date {
  const reminderDate = new Date(endDate);
  reminderDate.setDate(reminderDate.getDate() - 7);
  return reminderDate;
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
