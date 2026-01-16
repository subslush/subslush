import type { OrderListItem, PaymentMethodBadge } from './order.js';

export interface DashboardAlert {
  type: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  count?: number;
  metadata?: Record<string, unknown>;
}

export interface DashboardUpcomingRenewal {
  id: string;
  service_type: string;
  service_plan: string;
  price_cents: number | null;
  currency: string | null;
  display_price_cents?: number | null;
  display_currency?: string | null;
  next_billing_at: string | null;
  renewal_date: string | null;
  renewal_method: string | null;
  renewal_state: string;
  days_until_renewal: number | null;
}

export interface DashboardOrderSummary extends OrderListItem {
  payment_method_badge: PaymentMethodBadge;
}

export interface DashboardOverview {
  counts: {
    active_subscriptions: number;
    upcoming_renewals: number;
  };
  credits: {
    available_balance: number;
    pending_balance: number;
    currency: string;
  };
  alerts: DashboardAlert[];
  upcoming_renewals: DashboardUpcomingRenewal[];
  recent_orders: DashboardOrderSummary[];
}
