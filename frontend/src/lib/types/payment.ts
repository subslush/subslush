export type PaymentStatus =
  | 'waiting'
  | 'confirming'
  | 'confirmed'
  | 'sending'
  | 'partially_paid'
  | 'finished'
  | 'failed'
  | 'refunded'
  | 'expired';

export interface CreatePaymentRequest {
  creditAmount: number;
  currency?: string;
  orderDescription?: string;
}

export interface CreatePaymentResponse {
  paymentId: string;
  payAddress: string;
  payAmount: number;
  payCurrency: string;
  expiresAt: string;
  status: PaymentStatus;
}

export interface PaymentStatusResponse {
  paymentId: string;
  status: PaymentStatus;
  creditAmount: number;
  payAmount: number;
  payCurrency: string;
  actuallyPaid?: number;
  blockchainHash?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Currency {
  code: string;
  name: string;
  network?: string;
  fullName?: string;
}

export interface PaymentEstimate {
  estimatedAmount: number;
  currency: string;
}