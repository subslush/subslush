import { getDatabasePool } from '../config/database';
import type { PoolClient } from 'pg';
import { redisClient } from '../config/redis';
import { creditService } from './creditService';
import { Logger } from '../utils/logger';
import { NowPaymentsPaymentData } from '../types/payment';
import { paymentRepository } from './paymentRepository';
import {
  CreditAllocationResult,
  CreditAllocationResultWithDuplicate,
  createSuccessResult,
  createErrorResult,
} from '../types/service';
import { env } from '../config/environment';
import { parseJsonValue } from '../utils/json';

export interface AllocationMetrics {
  totalAllocations: number;
  totalCreditsAllocated: number;
  duplicatePrevented: number;
  failedAllocations: number;
  averageProcessingTime: number;
  lastAllocationTime: Date;
}

export class CreditAllocationService {
  private readonly CACHE_PREFIX = 'credit_allocation:';
  // Timeout setting available if needed
  // private readonly _ALLOCATION_TIMEOUT = env.CREDIT_ALLOCATION_TIMEOUT;
  private readonly ALLOCATION_RATE = env.CREDIT_ALLOCATION_RATE;
  private readonly DUPLICATE_CHECK_TTL = 86400; // 24 hours
  private readonly FULL_PAYMENT_EPSILON = 1e-8;

  private metrics: AllocationMetrics = {
    totalAllocations: 0,
    totalCreditsAllocated: 0,
    duplicatePrevented: 0,
    failedAllocations: 0,
    averageProcessingTime: 0,
    lastAllocationTime: new Date(),
  };

  private async lockUserCredits(
    client: PoolClient,
    userId: string
  ): Promise<void> {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [userId]);
  }

  private async getBalanceForUpdate(
    client: PoolClient,
    userId: string
  ): Promise<number> {
    const result = await client.query(
      `SELECT COALESCE(SUM(amount), 0) as total_balance
       FROM credit_transactions
       WHERE user_id = $1`,
      [userId]
    );

    return parseFloat(result.rows[0]?.total_balance || '0');
  }

  // Main method to allocate credits for a completed payment
  async allocateCreditsForPayment(
    userId: string,
    paymentId: string,
    usdAmount: number,
    paymentData: NowPaymentsPaymentData
  ): Promise<CreditAllocationResult> {
    const startTime = Date.now();

    try {
      Logger.info(`Starting credit allocation for payment ${paymentId}`, {
        userId,
        usdAmount,
        paymentStatus: paymentData.payment_status,
      });

      // Check for duplicate allocation
      const duplicateCheck = await this.checkForDuplicate(paymentId);
      if (
        duplicateCheck.success &&
        'isDuplicate' in duplicateCheck &&
        duplicateCheck.isDuplicate
      ) {
        this.metrics.duplicatePrevented++;
        return duplicateCheck;
      }
      if (!duplicateCheck.success) {
        return duplicateCheck;
      }

      const requestedUsd =
        Number.isFinite(usdAmount) && usdAmount > 0 ? usdAmount : null;
      if (!requestedUsd) {
        return createErrorResult('Invalid requested USD amount for allocation');
      }

      const paidUsdResolution = this.resolvePaidUsdAmount(
        requestedUsd,
        paymentData
      );
      if (!paidUsdResolution) {
        return createErrorResult(
          'Unable to determine paid USD amount for allocation'
        );
      }

      if (
        !Number.isFinite(paidUsdResolution.paidUsd) ||
        paidUsdResolution.paidUsd <= 0
      ) {
        return createErrorResult('Invalid paid USD amount for allocation');
      }

      if (
        paidUsdResolution.paidUsd + this.FULL_PAYMENT_EPSILON <
        requestedUsd
      ) {
        return createErrorResult(
          'Payment amount below required invoice amount'
        );
      }

      // Calculate credit amount from requested USD value (full payment required)
      const creditAmount = this.calculateCreditAmount(requestedUsd);

      // Validate allocation parameters
      const validation = await this.validateAllocation(
        userId,
        creditAmount,
        paymentData
      );
      if (!validation.valid) {
        return createErrorResult(validation.error || 'Validation failed');
      }

      // Perform atomic credit allocation
      const result = await this.performAtomicAllocation(
        userId,
        paymentId,
        creditAmount,
        {
          requestedUsd,
          paidUsd: paidUsdResolution.paidUsd,
          paidRatio: paidUsdResolution.paidRatio,
          allocationSource: paidUsdResolution.source,
        },
        paymentData
      );

      if (result.success) {
        // Mark allocation as completed to prevent duplicates
        await this.markAllocationCompleted(
          paymentId,
          result.data.transactionId
        );

        // Update metrics
        this.metrics.totalAllocations++;
        this.metrics.totalCreditsAllocated += creditAmount;
        this.metrics.lastAllocationTime = new Date();
        this.metrics.averageProcessingTime =
          (this.metrics.averageProcessingTime + (Date.now() - startTime)) / 2;

        Logger.info(
          `Successfully allocated ${creditAmount} credits for payment ${paymentId}`,
          {
            userId,
            transactionId: result.data.transactionId,
            balanceAfter: result.data.balanceAfter,
          }
        );
      } else {
        this.metrics.failedAllocations++;
      }

      return result;
    } catch (error) {
      this.metrics.failedAllocations++;
      Logger.error(`Error allocating credits for payment ${paymentId}:`, error);
      return createErrorResult('Credit allocation failed due to system error');
    }
  }

  // Check for duplicate allocation
  private async checkForDuplicate(
    paymentId: string
  ): Promise<CreditAllocationResultWithDuplicate> {
    try {
      // Check Redis cache for recent allocation
      const cacheKey = `${this.CACHE_PREFIX}completed:${paymentId}`;
      const cached = await redisClient.getClient().get(cacheKey);

      if (cached) {
        const allocationData = JSON.parse(cached);
        Logger.warn(
          `Duplicate credit allocation prevented for payment ${paymentId}`,
          allocationData
        );
        return {
          success: true,
          data: {
            creditAmount: allocationData.creditAmount,
            transactionId: allocationData.transactionId,
            balanceAfter: allocationData.balanceAfter,
            userId: '',
            paymentId,
          },
          isDuplicate: true,
        } as CreditAllocationResultWithDuplicate;
      }

      // Check database for existing allocation
      const pool = getDatabasePool();
      const result = await pool.query(
        `
        SELECT id, amount, balance_after
        FROM credit_transactions
        WHERE payment_id = $1
        AND amount > 0
        AND metadata->>'paymentCompleted' = 'true'
      `,
        [paymentId]
      );

      if (result.rows.length > 0) {
        const row = result.rows[0];
        Logger.warn(
          `Duplicate credit allocation prevented for payment ${paymentId} (found in database)`
        );

        // Cache the existing allocation
        const allocationData = {
          transactionId: row.id,
          creditAmount: parseFloat(row.amount),
          balanceAfter: parseFloat(row.balance_after),
        };

        await redisClient
          .getClient()
          .setex(
            cacheKey,
            this.DUPLICATE_CHECK_TTL,
            JSON.stringify(allocationData)
          );

        return {
          success: true,
          data: {
            creditAmount: allocationData.creditAmount,
            transactionId: allocationData.transactionId,
            balanceAfter: allocationData.balanceAfter,
            userId: '',
            paymentId,
          },
          isDuplicate: true,
        } as CreditAllocationResultWithDuplicate;
      }

      return {
        success: true,
        data: null as any, // Not applicable for non-duplicate case
        isDuplicate: false,
      } as CreditAllocationResultWithDuplicate;
    } catch (error) {
      Logger.error(
        `Error checking for duplicate allocation ${paymentId}:`,
        error
      );
      return createErrorResult(
        'Error checking for duplicate'
      ) as CreditAllocationResultWithDuplicate;
    }
  }

  // Calculate credit amount based on USD amount and rate
  private calculateCreditAmount(usdAmount: number): number {
    const creditAmount = usdAmount * this.ALLOCATION_RATE;
    return Math.round(creditAmount * 100) / 100; // Round to 2 decimal places
  }

  private resolvePaidUsdAmount(
    requestedUsd: number,
    paymentData: NowPaymentsPaymentData
  ): {
    paidUsd: number;
    paidRatio: number | null;
    source: 'outcome_amount' | 'actually_paid_ratio';
  } | null {
    const requested = Number(requestedUsd);
    const requestedValid =
      Number.isFinite(requested) && requested > 0 ? requested : null;

    const outcomeAmount = Number(paymentData.outcome_amount);
    const outcomeCurrency =
      typeof paymentData.outcome_currency === 'string'
        ? paymentData.outcome_currency.toLowerCase()
        : null;
    if (
      Number.isFinite(outcomeAmount) &&
      outcomeAmount > 0 &&
      outcomeCurrency === 'usd'
    ) {
      return {
        paidUsd: outcomeAmount,
        paidRatio: requestedValid ? outcomeAmount / requestedValid : null,
        source: 'outcome_amount',
      };
    }

    const actuallyPaid = Number(paymentData.actually_paid);
    const payAmount = Number(paymentData.pay_amount);
    if (
      Number.isFinite(actuallyPaid) &&
      actuallyPaid > 0 &&
      Number.isFinite(payAmount) &&
      payAmount > 0
    ) {
      if (!requestedValid) {
        return null;
      }
      const ratio = actuallyPaid / payAmount;
      return {
        paidUsd: requestedValid * ratio,
        paidRatio: ratio,
        source: 'actually_paid_ratio',
      };
    }

    return null;
  }

  // Validate allocation parameters
  private async validateAllocation(
    userId: string,
    creditAmount: number,
    paymentData: NowPaymentsPaymentData
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      // Validate user exists
      const pool = getDatabasePool();
      const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [
        userId,
      ]);
      if (userCheck.rows.length === 0) {
        return { valid: false, error: 'User not found' };
      }

      // Validate credit amount
      if (creditAmount <= 0) {
        return { valid: false, error: 'Invalid credit amount' };
      }

      if (creditAmount > 10000) {
        // Max allocation limit
        return { valid: false, error: 'Credit amount exceeds maximum limit' };
      }

      // Validate payment status
      if (paymentData.payment_status !== 'finished') {
        return {
          valid: false,
          error: `Invalid payment status for allocation: ${paymentData.payment_status}`,
        };
      }

      // Validate full payment amount when crypto amounts are provided
      if (
        paymentData.actually_paid !== undefined &&
        paymentData.actually_paid !== null &&
        Number.isFinite(paymentData.pay_amount) &&
        paymentData.pay_amount > 0 &&
        paymentData.actually_paid + this.FULL_PAYMENT_EPSILON <
          paymentData.pay_amount
      ) {
        return {
          valid: false,
          error: 'Payment amount below required invoice amount',
        };
      }

      return { valid: true };
    } catch (error) {
      Logger.error('Error validating allocation:', error);
      return { valid: false, error: 'Validation failed' };
    }
  }

  // Perform atomic credit allocation with transaction safety
  private async performAtomicAllocation(
    userId: string,
    paymentId: string,
    creditAmount: number,
    allocationContext: {
      requestedUsd: number | null;
      paidUsd: number;
      paidRatio: number | null;
      allocationSource: 'outcome_amount' | 'actually_paid_ratio';
    },
    paymentData: NowPaymentsPaymentData
  ): Promise<CreditAllocationResult> {
    const pool = getDatabasePool();
    const client = await pool.connect();
    let transactionOpen = false;

    try {
      await client.query('BEGIN');
      transactionOpen = true;
      await this.lockUserCredits(client, userId);

      // Get current user balance
      const balanceBefore = await this.getBalanceForUpdate(client, userId);
      const balanceAfter = balanceBefore + creditAmount;

      // Find the original payment transaction
      const paymentTxResult = await client.query(
        'SELECT id, metadata FROM credit_transactions WHERE payment_id = $1',
        [paymentId]
      );

      if (paymentTxResult.rows.length === 0) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return createErrorResult('Original payment transaction not found');
      }

      const originalTx = paymentTxResult.rows[0];
      const originalMetadata = parseJsonValue<Record<string, any>>(
        originalTx.metadata,
        {}
      );

      // Check if already allocated
      if (originalMetadata['paymentCompleted']) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return createErrorResult('Credits already allocated for this payment');
      }

      // Update the original transaction with credit allocation
      const originalRequestedUsd = Number(
        originalMetadata['requestedUsd'] ??
          originalMetadata['creditAmountUsd'] ??
          originalMetadata['priceAmount']
      );
      const resolvedRequestedUsd =
        allocationContext.requestedUsd ??
        (Number.isFinite(originalRequestedUsd) && originalRequestedUsd > 0
          ? originalRequestedUsd
          : null);

      const updatedMetadata = {
        ...originalMetadata,
        paymentCompleted: true,
        completedAt: new Date().toISOString(),
        blockchainHash: paymentData.payin_hash,
        actuallyPaid: paymentData.actually_paid,
        requestedUsd: resolvedRequestedUsd,
        paidUsd: allocationContext.paidUsd,
        paidRatio: allocationContext.paidRatio,
        allocationSource: allocationContext.allocationSource,
        creditAllocationRate: this.ALLOCATION_RATE,
        allocationTimestamp: new Date().toISOString(),
      };

      await client.query(
        `
        UPDATE credit_transactions
        SET amount = $1,
            balance_before = $2,
            balance_after = $3,
            description = $4,
            metadata = $5,
            updated_at = NOW()
        WHERE id = $6
      `,
        [
          creditAmount, // Positive amount for credit allocation
          balanceBefore,
          balanceAfter,
          `Cryptocurrency payment completed - ${paymentData.pay_currency.toUpperCase()} (${paymentData.actually_paid || paymentData.pay_amount})`,
          JSON.stringify(updatedMetadata),
          originalTx.id,
        ]
      );

      await client.query('COMMIT');
      transactionOpen = false;

      // Clear user's balance cache
      await this.clearUserBalanceCache(userId);

      // Send real-time notification (if WebSocket system exists)
      await this.sendCreditAllocationNotification(
        userId,
        creditAmount,
        paymentId
      );

      return createSuccessResult({
        creditAmount,
        transactionId: originalTx.id,
        balanceAfter,
        userId,
        paymentId,
      });
    } catch (error) {
      if (transactionOpen) {
        await client.query('ROLLBACK');
        transactionOpen = false;
      }
      Logger.error('Error in atomic credit allocation:', error);
      return createErrorResult('Database transaction failed');
    } finally {
      if (transactionOpen) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          Logger.error(
            'Failed to rollback credit allocation transaction',
            rollbackError
          );
        }
      }
      client.release();
    }
  }

  // Mark allocation as completed in cache
  private async markAllocationCompleted(
    paymentId: string,
    transactionId: string
  ): Promise<void> {
    try {
      const cacheKey = `${this.CACHE_PREFIX}completed:${paymentId}`;
      const allocationData = {
        transactionId,
        completedAt: new Date().toISOString(),
        timestamp: Date.now(),
      };

      await redisClient
        .getClient()
        .setex(
          cacheKey,
          this.DUPLICATE_CHECK_TTL,
          JSON.stringify(allocationData)
        );
    } catch (error) {
      Logger.error(
        `Error marking allocation completed for ${paymentId}:`,
        error
      );
    }
  }

  // Clear user balance cache to force recalculation
  private async clearUserBalanceCache(userId: string): Promise<void> {
    try {
      const cacheKey = `credit:balance:${userId}`;
      await redisClient.getClient().del(cacheKey);
    } catch (error) {
      Logger.error(`Error clearing balance cache for user ${userId}:`, error);
    }
  }

  // Send real-time notification for credit allocation
  private async sendCreditAllocationNotification(
    userId: string,
    creditAmount: number,
    paymentId: string
  ): Promise<void> {
    try {
      // This would integrate with your WebSocket notification system
      // For now, just log the notification
      Logger.info(`Credit allocation notification should be sent`, {
        userId,
        creditAmount,
        paymentId,
        event: 'payment:credits_allocated',
      });

      // Cache notification for later retrieval if WebSocket fails
      const notificationKey = `${this.CACHE_PREFIX}notification:${userId}:${Date.now()}`;
      const notification = {
        type: 'payment:credits_allocated',
        data: {
          creditAmount,
          paymentId,
          timestamp: new Date().toISOString(),
        },
      };

      await redisClient.getClient().setex(
        notificationKey,
        3600, // 1 hour TTL
        JSON.stringify(notification)
      );
    } catch (error) {
      Logger.error('Error sending credit allocation notification:', error);
    }
  }

  // Manual credit allocation for admin use
  async manualCreditAllocation(
    userId: string,
    paymentId: string,
    creditAmount: number,
    adminUserId: string,
    reason: string
  ): Promise<CreditAllocationResult> {
    const pool = getDatabasePool();
    let client: PoolClient | null = null;
    let transactionOpen = false;

    try {
      Logger.info(
        `Manual credit allocation initiated by admin ${adminUserId}`,
        {
          userId,
          paymentId,
          creditAmount,
          reason,
        }
      );

      if (!Number.isFinite(creditAmount) || creditAmount <= 0) {
        return createErrorResult('Invalid credit amount');
      }
      if (creditAmount > 10000) {
        return createErrorResult('Credit amount exceeds maximum limit');
      }

      // Check for existing allocation
      const duplicateCheck = await this.checkForDuplicate(paymentId);
      if (
        duplicateCheck.success &&
        'isDuplicate' in duplicateCheck &&
        duplicateCheck.isDuplicate
      ) {
        return duplicateCheck;
      }
      if (!duplicateCheck.success) {
        return duplicateCheck;
      }

      const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [
        userId,
      ]);
      if (userCheck.rows.length === 0) {
        return createErrorResult('User not found');
      }

      client = await pool.connect();
      await client.query('BEGIN');
      transactionOpen = true;
      await this.lockUserCredits(client, userId);

      const balanceBefore = await this.getBalanceForUpdate(client, userId);
      const balanceAfter = balanceBefore + creditAmount;

      const paymentTxResult = await client.query(
        `SELECT id, user_id, metadata, payment_provider
         FROM credit_transactions
         WHERE payment_id = $1
         ORDER BY created_at DESC
         LIMIT 1
         FOR UPDATE`,
        [paymentId]
      );

      if (paymentTxResult.rows.length === 0) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return createErrorResult('Original payment transaction not found');
      }

      const paymentTx = paymentTxResult.rows[0];
      if (paymentTx.user_id !== userId) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return createErrorResult('Payment does not belong to specified user');
      }

      const originalMetadata = parseJsonValue<Record<string, any>>(
        paymentTx.metadata,
        {}
      );
      if (originalMetadata['paymentCompleted']) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return createErrorResult('Credits already allocated for this payment');
      }

      const requestedUsd = Number(
        originalMetadata['creditAmountUsd'] ?? originalMetadata['priceAmount']
      );
      const paidRatio =
        Number.isFinite(requestedUsd) && requestedUsd > 0
          ? creditAmount / requestedUsd
          : null;

      const updatedMetadata = {
        ...originalMetadata,
        paymentCompleted: true,
        completedAt: new Date().toISOString(),
        manualAllocation: true,
        manualCreditAmount: creditAmount,
        manualReason: reason,
        adminUserId,
        requestedUsd:
          Number.isFinite(requestedUsd) && requestedUsd > 0
            ? requestedUsd
            : null,
        paidUsd: creditAmount,
        paidRatio,
        allocationSource: 'manual',
        creditAllocationRate: this.ALLOCATION_RATE,
        allocationTimestamp: new Date().toISOString(),
      };

      await client.query(
        `UPDATE credit_transactions
         SET amount = $1,
             balance_before = $2,
             balance_after = $3,
             description = $4,
             metadata = $5,
             payment_status = 'finished',
             monitoring_status = 'completed',
             updated_at = NOW()
         WHERE id = $6`,
        [
          creditAmount,
          balanceBefore,
          balanceAfter,
          `Manual allocation for payment ${paymentId}: ${reason}`,
          JSON.stringify(updatedMetadata),
          paymentTx.id,
        ]
      );

      const updatedPayment =
        await paymentRepository.updateStatusByProviderPaymentId(
          paymentTx.payment_provider || 'nowpayments',
          paymentId,
          'succeeded',
          'manual_approved',
          updatedMetadata,
          client
        );
      if (!updatedPayment) {
        Logger.warn(
          'Manual allocation completed without updating payment record',
          {
            paymentId,
            userId,
          }
        );
      }

      await client.query('COMMIT');
      transactionOpen = false;

      // Clear user's balance cache
      await this.clearUserBalanceCache(userId);

      // Mark as completed to prevent duplicates
      await this.markAllocationCompleted(paymentId, paymentTx.id);

      // Update metrics
      this.metrics.totalAllocations++;
      this.metrics.totalCreditsAllocated += creditAmount;
      this.metrics.lastAllocationTime = new Date();

      return createSuccessResult({
        creditAmount,
        transactionId: paymentTx.id,
        balanceAfter,
        userId,
        paymentId,
      });
    } catch (error) {
      if (client && transactionOpen) {
        await client.query('ROLLBACK');
        transactionOpen = false;
      }
      Logger.error('Error in manual credit allocation:', error);
      return createErrorResult('Manual allocation failed due to system error');
    } finally {
      if (client) {
        if (transactionOpen) {
          try {
            await client.query('ROLLBACK');
          } catch (rollbackError) {
            Logger.error(
              'Failed to rollback manual credit allocation transaction',
              rollbackError
            );
          }
        }
        client.release();
      }
    }
  }

  // Get allocation metrics
  getMetrics(): AllocationMetrics {
    return { ...this.metrics };
  }

  // Reset metrics
  resetMetrics(): void {
    this.metrics = {
      totalAllocations: 0,
      totalCreditsAllocated: 0,
      duplicatePrevented: 0,
      failedAllocations: 0,
      averageProcessingTime: 0,
      lastAllocationTime: new Date(),
    };
  }

  // Get allocation history for a user
  async getAllocationHistory(
    userId: string,
    limit = 20,
    offset = 0
  ): Promise<
    Array<{
      transactionId: string;
      paymentId: string;
      creditAmount: number;
      allocatedAt: Date;
      status: string;
    }>
  > {
    try {
      const pool = getDatabasePool();
      const result = await pool.query(
        `
        SELECT id, amount, metadata, created_at, payment_id
        FROM credit_transactions
        WHERE user_id = $1
        AND payment_id IS NOT NULL
        AND amount > 0
        AND metadata->>'paymentCompleted' = 'true'
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
      `,
        [userId, limit, offset]
      );

      return result.rows.map(row => {
        // Parse metadata if needed for future use
        // const metadata = row.metadata ? JSON.parse(row.metadata) : {};
        return {
          transactionId: row.id,
          paymentId: row.payment_id,
          creditAmount: parseFloat(row.amount),
          allocatedAt: new Date(row.created_at),
          status: 'completed',
        };
      });
    } catch (error) {
      Logger.error(
        `Error getting allocation history for user ${userId}:`,
        error
      );
      return [];
    }
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      // Check Redis connection
      await redisClient.getClient().ping();

      // Check database connection
      const pool = getDatabasePool();
      await pool.query('SELECT 1');

      // Check credit service
      return await creditService.healthCheck();
    } catch (error) {
      Logger.error('Credit allocation service health check failed:', error);
      return false;
    }
  }

  // Get pending allocations (for monitoring/debugging)
  async getPendingAllocations(): Promise<
    Array<{
      paymentId: string;
      userId: string;
      usdAmount: number;
      createdAt: Date;
    }>
  > {
    try {
      const pool = getDatabasePool();
      const result = await pool.query(`
        SELECT payment_id, user_id, metadata, created_at
        FROM credit_transactions
        WHERE payment_id IS NOT NULL
        AND payment_status = 'finished'
        AND amount = 0
        AND (metadata->>'paymentCompleted' IS NULL OR metadata->>'paymentCompleted' = 'false')
        ORDER BY created_at ASC
      `);

      return result.rows.map(row => {
        const _metadata = parseJsonValue<Record<string, any>>(row.metadata, {});
        return {
          paymentId: row.payment_id,
          userId: row.user_id,
          usdAmount: Number(
            _metadata['creditAmountUsd'] ?? _metadata['priceAmount'] ?? 0
          ),
          createdAt: new Date(row.created_at),
        };
      });
    } catch (error) {
      Logger.error('Error getting pending allocations:', error);
      return [];
    }
  }
}

// Export singleton instance
export const creditAllocationService = new CreditAllocationService();
