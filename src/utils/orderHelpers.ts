import { Order } from '../types/order';

export type PaymentMethodBadgeType = 'credits' | 'stripe' | 'other' | 'unknown';

export interface PaymentMethodBadge {
  type: PaymentMethodBadgeType;
  label: string;
}

export const getPaymentMethodBadge = (order: Order): PaymentMethodBadge => {
  if (order.paid_with_credits || order.payment_provider === 'credits') {
    return { type: 'credits', label: 'Credits' };
  }

  if (order.payment_provider === 'stripe') {
    return { type: 'stripe', label: 'Stripe' };
  }

  if (order.payment_provider) {
    return { type: 'other', label: order.payment_provider };
  }

  return { type: 'unknown', label: 'Unknown' };
};
