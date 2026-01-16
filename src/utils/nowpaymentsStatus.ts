import { NOWPaymentsPaymentStatus } from '../types/payment';

const TERMINAL_STATUSES = new Set<NOWPaymentsPaymentStatus['payment_status']>([
  'finished',
  'failed',
  'expired',
  'refunded',
]);

const NON_TERMINAL_STATUSES = new Set<
  NOWPaymentsPaymentStatus['payment_status']
>([
  'pending',
  'waiting',
  'confirming',
  'confirmed',
  'sending',
  'partially_paid',
]);

export function isTerminalNowPaymentsStatus(
  status?: NOWPaymentsPaymentStatus['payment_status'] | null
): boolean {
  return Boolean(status && TERMINAL_STATUSES.has(status));
}

export function isNonTerminalNowPaymentsStatus(
  status?: NOWPaymentsPaymentStatus['payment_status'] | null
): boolean {
  return Boolean(status && NON_TERMINAL_STATUSES.has(status));
}

export function shouldIgnoreNowPaymentsStatusRegression(
  previousStatus?: NOWPaymentsPaymentStatus['payment_status'] | null,
  nextStatus?: NOWPaymentsPaymentStatus['payment_status'] | null
): boolean {
  return (
    isTerminalNowPaymentsStatus(previousStatus) &&
    isNonTerminalNowPaymentsStatus(nextStatus)
  );
}
