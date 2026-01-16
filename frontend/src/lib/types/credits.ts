export interface CreditBalance {
  userId?: string;
  balance?: number;
  totalBalance?: number;
  availableBalance?: number;
  pendingBalance?: number;
  lastUpdated?: string;
}

export interface CreditTransaction {
  id: string;
  userId: string;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description?: string | null;
  metadata?: Record<string, unknown>;
  paymentId?: string | null;
  paymentStatus?: string | null;
  paymentProvider?: string | null;
  paymentCurrency?: string | null;
  paymentAmount?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreditHistoryResponse {
  transactions: CreditTransaction[];
  totalCount: number;
  hasMore: boolean;
  query?: {
    limit?: number;
    offset?: number;
    type?: string;
  };
}
