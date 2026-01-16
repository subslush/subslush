export interface CreditTransaction {
  id: string;
  userId: string;
  type:
    | 'deposit'
    | 'purchase'
    | 'refund'
    | 'bonus'
    | 'withdrawal'
    | 'refund_reversal';
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string;
  metadata?: Record<string, any>;
  paymentId?: string | null;
  paymentStatus?: string | null;
  paymentProvider?: string | null;
  paymentCurrency?: string | null;
  paymentAmount?: number | null;
  orderId?: string;
  productVariantId?: string;
  priceCents?: number;
  currency?: string;
  autoRenew?: boolean;
  nextBillingAt?: Date;
  renewalMethod?: string;
  statusReason?: string;
  referralRewardId?: string;
  preLaunchRewardId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreditBalance {
  userId: string;
  totalBalance: number;
  availableBalance: number;
  pendingBalance: number;
  lastUpdated: Date;
}

export interface CreditBalanceSummary {
  totalBalance: number;
  availableBalance: number;
  pendingBalance: number;
  recentTransactions: CreditTransaction[];
  transactionCount: number;
}

export interface CreditOperationResult {
  success: boolean;
  transaction?: CreditTransaction;
  balance?: CreditBalance;
  error?: string;
}

export interface CreditTransactionQuery {
  userId: string;
  type?: CreditTransaction['type'] | undefined;
  startDate?: Date | undefined;
  endDate?: Date | undefined;
  limit?: number;
  offset?: number;
}

export interface CreditSettings {
  minBalance: number;
  maxBalance: number;
  maxTransactionAmount: number;
  allowNegativeBalance: boolean;
}
