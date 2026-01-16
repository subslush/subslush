export type PaymentMethodProvider = 'stripe';

export type PaymentMethodStatus =
  | 'active'
  | 'revoked'
  | 'expired'
  | 'requires_action';

export interface UserPaymentMethod {
  id: string;
  user_id: string;
  provider: PaymentMethodProvider;
  provider_customer_id?: string | null;
  provider_payment_method_id: string;
  brand?: string | null;
  last4?: string | null;
  exp_month?: number | null;
  exp_year?: number | null;
  status: PaymentMethodStatus;
  is_default: boolean;
  setup_intent_id?: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface UpsertPaymentMethodInput {
  user_id: string;
  provider: PaymentMethodProvider;
  provider_customer_id?: string | null;
  provider_payment_method_id: string;
  brand?: string | null;
  last4?: string | null;
  exp_month?: number | null;
  exp_year?: number | null;
  status?: PaymentMethodStatus;
  is_default?: boolean;
  setup_intent_id?: string | null;
}
