import { UnifiedPaymentStatus } from '../../types/payment';

export interface ProviderPaymentCreateRequest {
  userId: string;
  amount: number;
  priceCurrency: string;
  payCurrency: string;
  description?: string;
  orderId?: string;
  customerId?: string;
  metadata?: Record<string, any>;
}

export interface ProviderPaymentDetails {
  providerPaymentId: string;
  providerStatus: string;
  normalizedStatus: UnifiedPaymentStatus;
  amount: number;
  priceCurrency: string;
  payAmount?: number;
  payCurrency: string;
  amountUsd?: number;
  payAddress?: string;
  expiresAt?: Date;
  clientSecret?: string;
  metadata?: Record<string, any>;
  raw?: any;
}

export interface PaymentProvider {
  createPayment(
    request: ProviderPaymentCreateRequest
  ): Promise<ProviderPaymentDetails>;
  getPaymentStatus(providerPaymentId: string): Promise<ProviderPaymentDetails>;
  supportsCurrency(currency: string): Promise<boolean>;
}
