export interface BalanceResponse {
  userId?: string;
  balance?: number | {
    total?: number;
    totalBalance?: number;
    available?: number;
    availableBalance?: number;
    pending?: number;
    pendingBalance?: number;
  };
  totalBalance?: number;
  availableBalance?: number;
  pendingBalance?: number;
}

export function extractBalance(data: BalanceResponse | null | undefined): number {
  if (!data) {
    console.log('🏦 [CREDITS] No balance data provided');
    return 0;
  }

  console.log('🏦 [CREDITS] Extracting balance from:', JSON.stringify(data, null, 2));

  // Direct number
  if (typeof data.balance === 'number') {
    console.log('🏦 [CREDITS] Using direct balance:', data.balance);
    return data.balance;
  }

  // Nested object
  if (typeof data.balance === 'object' && data.balance !== null) {
    const balance = data.balance.available
      || data.balance.availableBalance
      || data.balance.total
      || data.balance.totalBalance
      || 0;
    console.log('🏦 [CREDITS] Using nested balance:', balance);
    return balance;
  }

  // Flat structure
  if (typeof data.availableBalance === 'number') {
    console.log('🏦 [CREDITS] Using flat availableBalance:', data.availableBalance);
    return data.availableBalance;
  }

  if (typeof data.totalBalance === 'number') {
    console.log('🏦 [CREDITS] Using flat totalBalance:', data.totalBalance);
    return data.totalBalance;
  }

  console.log('🏦 [CREDITS] No balance found, defaulting to 0');
  return 0;
}

export function extractTotalBalance(data: BalanceResponse | null | undefined): number {
  if (!data) return 0;

  if (typeof data.totalBalance === 'number') {
    return data.totalBalance;
  }

  if (typeof data.balance === 'object' && data.balance !== null) {
    return data.balance.totalBalance || data.balance.total || 0;
  }

  return extractBalance(data);
}

export function extractAvailableBalance(data: BalanceResponse | null | undefined): number {
  if (!data) return 0;

  if (typeof data.availableBalance === 'number') {
    return data.availableBalance;
  }

  if (typeof data.balance === 'object' && data.balance !== null) {
    return data.balance.availableBalance || data.balance.available || 0;
  }

  return extractBalance(data);
}

export function extractPendingBalance(data: BalanceResponse | null | undefined): number {
  if (!data) return 0;

  if (typeof data.pendingBalance === 'number') {
    return data.pendingBalance;
  }

  if (typeof data.balance === 'object' && data.balance !== null) {
    return data.balance.pendingBalance || data.balance.pending || 0;
  }

  return 0;
}

export function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}