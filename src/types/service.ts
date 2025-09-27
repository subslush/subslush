/**
 * Standardized Service Result Types
 *
 * This module provides type-safe result patterns that work with TypeScript strict mode
 * and exactOptionalPropertyTypes. Uses discriminated unions to eliminate conditional
 * property assignment issues.
 */

// Base service result pattern using discriminated unions
export type ServiceResult<TSuccess, TError = string> =
  | { success: true; data: TSuccess }
  | { success: false; error: TError };

// Alternative pattern for services that return additional metadata
export type ServiceResultWithMeta<TSuccess, TMeta, TError = string> =
  | { success: true; data: TSuccess; meta: TMeta }
  | { success: false; error: TError };

// For operations that may have warnings but still succeed
export type ServiceResultWithWarnings<TSuccess, TError = string> =
  | { success: true; data: TSuccess; warnings?: string[] }
  | { success: false; error: TError };

// Credit Allocation specific result types
export interface CreditAllocationData {
  creditAmount: number;
  transactionId: string;
  balanceAfter: number;
  userId: string;
  paymentId: string;
}

export type CreditAllocationResult = ServiceResult<CreditAllocationData>;

// Extended type for duplicate checking (used in creditAllocationService.checkForDuplicate)
export type CreditAllocationResultWithDuplicate = CreditAllocationResult & {
  isDuplicate?: boolean;
};

export interface ManualCreditAllocationData extends CreditAllocationData {
  allocatedBy: string;
  reason: string;
  approvalRequired: boolean;
}

export type ManualCreditAllocationResult =
  ServiceResult<ManualCreditAllocationData>;

// Payment Failure specific result types
export interface FailureHandlingData {
  action:
    | 'retried'
    | 'user_notified'
    | 'admin_alerted'
    | 'marked_failed'
    | 'cleanup_completed';
  retryCount?: number;
  nextRetryAt?: Date;
  notificationSent?: boolean;
  alertLevel?: 'low' | 'medium' | 'high' | 'critical';
}

export type FailureHandlingResult = ServiceResult<FailureHandlingData>;

// Refund specific result types
export interface RefundData {
  refundId: string;
  amount: number;
  status:
    | 'pending'
    | 'approved'
    | 'processing'
    | 'completed'
    | 'failed'
    | 'rejected';
  transactionId?: string;
  processedBy?: string;
  approvedBy?: string;
  reason: string;
}

export type RefundResult = ServiceResult<RefundData>;

export interface RefundRequestData {
  id: string;
  userId: string;
  amount: number;
  reason: string;
  status:
    | 'pending'
    | 'approved'
    | 'processing'
    | 'completed'
    | 'failed'
    | 'rejected';
  paymentId?: string;
  requestedBy: string;
  requestedAt: Date;
  approvedBy?: string;
  approvedAt?: Date;
  processedAt?: Date;
  rejectedBy?: string;
  rejectedAt?: Date;
  rejectionReason?: string;
  metadata: Record<string, unknown>;
}

export type RefundRequestResult = ServiceResult<RefundRequestData>;

// Payment Monitoring specific result types
export interface MonitoringMetrics {
  totalPaymentsMonitored: number;
  successfulUpdates: number;
  failedUpdates: number;
  creditsAllocated: number;
  lastRunTime: Date;
  averageProcessingTime: number;
  isActive: boolean;
}

export type MonitoringResult = ServiceResult<MonitoringMetrics>;

// Health check result types
export interface HealthCheckData {
  service: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: Date;
  details?: Record<string, unknown>;
  dependencies?: Record<string, boolean>;
}

export type HealthCheckResult = ServiceResult<HealthCheckData>;

// Generic pagination result
export interface PaginationMeta {
  limit: number;
  offset: number;
  total: number;
  hasMore: boolean;
}

export type PaginatedResult<T> = ServiceResultWithMeta<T[], PaginationMeta>;

// Builder functions for creating results
export const createSuccessResult = <T>(data: T): ServiceResult<T> => ({
  success: true,
  data,
});

export const createErrorResult = <T>(error: string): ServiceResult<T> => ({
  success: false,
  error,
});

export const createSuccessWithMeta = <T, M>(
  data: T,
  meta: M
): ServiceResultWithMeta<T, M> => ({
  success: true,
  data,
  meta,
});

export const createErrorWithMeta = <T, M>(
  error: string
): ServiceResultWithMeta<T, M> => ({
  success: false,
  error,
});

// Type guards for result checking
export const isSuccessResult = <T>(
  result: ServiceResult<T>
): result is { success: true; data: T } => {
  return result.success === true;
};

export const isErrorResult = <T>(
  result: ServiceResult<T>
): result is { success: false; error: string } => {
  return result.success === false;
};

// Utility type for extracting data type from service result
export type ExtractResultData<T> = T extends ServiceResult<infer U> ? U : never;

// Async result type for promises
export type AsyncServiceResult<T, E = string> = Promise<ServiceResult<T, E>>;

// Type-safe helper functions for testing and backward compatibility
export const assertSuccess = <T>(
  result: ServiceResult<T>
): asserts result is { success: true; data: T } => {
  if (!result.success) {
    throw new Error(`Expected success result, got error: ${result.error}`);
  }
};

export const assertError = <T>(
  result: ServiceResult<T>
): asserts result is { success: false; error: string } => {
  if (result.success) {
    throw new Error('Expected error result, got success');
  }
};

// Backward compatibility helpers for legacy property access patterns
export const getResultData = <T>(result: ServiceResult<T>): T | undefined => {
  return result.success ? result.data : undefined;
};

export const getResultError = <T>(
  result: ServiceResult<T>
): string | undefined => {
  return result.success ? undefined : result.error;
};
