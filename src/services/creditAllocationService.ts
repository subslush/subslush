import { v4 as uuidv4 } from 'uuid';
import { getDatabasePool } from '../config/database';
import { redisClient } from '../config/redis';
import { env } from '../config/environment';
import { creditService } from './creditService';
import { Logger } from '../utils/logger';
import { NOWPaymentsPaymentStatus } from '../types/payment';

export interface CreditAllocationResult {
  success: boolean;
  transactionId?: string;
  creditAmount?: number;
  balanceAfter?: number;
  error?: string;
  isDuplicate?: boolean;
}

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
  private readonly ALLOCATION_TIMEOUT = parseInt(process.env.CREDIT_ALLOCATION_TIMEOUT || '30000');
  private readonly ALLOCATION_RATE = parseFloat(process.env.CREDIT_ALLOCATION_RATE || '1.0');
  private readonly DUPLICATE_CHECK_TTL = 86400; // 24 hours

  private metrics: AllocationMetrics = {
    totalAllocations: 0,
    totalCreditsAllocated: 0,
    duplicatePrevented: 0,
    failedAllocations: 0,
    averageProcessingTime: 0,
    lastAllocationTime: new Date()
  };

  // Main method to allocate credits for a completed payment
  async allocateCreditsForPayment(
    userId: string,
    paymentId: string,
    usdAmount: number,
    paymentData: NOWPaymentsPaymentStatus
  ): Promise<CreditAllocationResult> {
    const startTime = Date.now();

    try {
      Logger.info(`Starting credit allocation for payment ${paymentId}`, {
        userId,
        usdAmount,
        paymentStatus: paymentData.payment_status
      });

      // Check for duplicate allocation
      const duplicateCheck = await this.checkForDuplicate(paymentId);
      if (duplicateCheck.isDuplicate) {
        this.metrics.duplicatePrevented++;
        return duplicateCheck;
      }

      // Calculate credit amount
      const creditAmount = this.calculateCreditAmount(usdAmount);

      // Validate allocation parameters
      const validation = await this.validateAllocation(userId, creditAmount, paymentData);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error
        };
      }

      // Perform atomic credit allocation
      const result = await this.performAtomicAllocation(
        userId,
        paymentId,
        creditAmount,
        usdAmount,
        paymentData
      );

      if (result.success) {
        // Mark allocation as completed to prevent duplicates
        await this.markAllocationCompleted(paymentId, result.transactionId!);

        // Update metrics
        this.metrics.totalAllocations++;
        this.metrics.totalCreditsAllocated += creditAmount;
        this.metrics.lastAllocationTime = new Date();
        this.metrics.averageProcessingTime =
          (this.metrics.averageProcessingTime + (Date.now() - startTime)) / 2;

        Logger.info(`Successfully allocated ${creditAmount} credits for payment ${paymentId}`, {
          userId,
          transactionId: result.transactionId,
          balanceAfter: result.balanceAfter
        });
      } else {
        this.metrics.failedAllocations++;
      }

      return result;

    } catch (error) {
      this.metrics.failedAllocations++;
      Logger.error(`Error allocating credits for payment ${paymentId}:`, error);
      return {
        success: false,
        error: 'Credit allocation failed due to system error'
      };
    }
  }

  // Check for duplicate allocation
  private async checkForDuplicate(paymentId: string): Promise<CreditAllocationResult> {
    try {
      // Check Redis cache for recent allocation
      const cacheKey = `${this.CACHE_PREFIX}completed:${paymentId}`;
      const cached = await redisClient.getClient().get(cacheKey);

      if (cached) {
        const allocationData = JSON.parse(cached);
        Logger.warn(`Duplicate credit allocation prevented for payment ${paymentId}`, allocationData);
        return {
          success: true,
          isDuplicate: true,
          transactionId: allocationData.transactionId,
          creditAmount: allocationData.creditAmount,
          balanceAfter: allocationData.balanceAfter
        };
      }

      // Check database for existing allocation
      const pool = getDatabasePool();
      const result = await pool.query(`
        SELECT id, amount, balance_after
        FROM credit_transactions
        WHERE payment_id = $1
        AND amount > 0
        AND metadata->>'paymentCompleted' = 'true'
      `, [paymentId]);

      if (result.rows.length > 0) {
        const row = result.rows[0];
        Logger.warn(`Duplicate credit allocation prevented for payment ${paymentId} (found in database)`);

        // Cache the existing allocation
        const allocationData = {
          transactionId: row.id,
          creditAmount: parseFloat(row.amount),
          balanceAfter: parseFloat(row.balance_after)
        };

        await redisClient.getClient().setex(
          cacheKey,
          this.DUPLICATE_CHECK_TTL,
          JSON.stringify(allocationData)
        );

        return {
          success: true,
          isDuplicate: true,
          ...allocationData
        };
      }

      return { success: false, isDuplicate: false };

    } catch (error) {
      Logger.error(`Error checking for duplicate allocation ${paymentId}:`, error);
      return { success: false, isDuplicate: false };
    }
  }

  // Calculate credit amount based on USD amount and rate
  private calculateCreditAmount(usdAmount: number): number {
    const creditAmount = usdAmount * this.ALLOCATION_RATE;
    return Math.round(creditAmount * 100) / 100; // Round to 2 decimal places
  }

  // Validate allocation parameters
  private async validateAllocation(
    userId: string,
    creditAmount: number,
    paymentData: NOWPaymentsPaymentStatus
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      // Validate user exists
      const pool = getDatabasePool();
      const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
      if (userCheck.rows.length === 0) {
        return { valid: false, error: 'User not found' };
      }

      // Validate credit amount
      if (creditAmount <= 0) {
        return { valid: false, error: 'Invalid credit amount' };
      }

      if (creditAmount > 10000) { // Max allocation limit
        return { valid: false, error: 'Credit amount exceeds maximum limit' };
      }

      // Validate payment status
      if (paymentData.payment_status !== 'finished') {
        return { valid: false, error: `Invalid payment status for allocation: ${paymentData.payment_status}` };
      }

      // Validate actually paid amount
      if (paymentData.actually_paid && paymentData.actually_paid < paymentData.price_amount * 0.95) {
        return { valid: false, error: 'Insufficient payment amount received' };
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
    usdAmount: number,
    paymentData: NOWPaymentsPaymentStatus
  ): Promise<CreditAllocationResult> {
    const pool = getDatabasePool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get current user balance
      const currentBalance = await creditService.getUserBalance(userId);
      const balanceBefore = currentBalance?.totalBalance || 0;
      const balanceAfter = balanceBefore + creditAmount;

      // Find the original payment transaction
      const paymentTxResult = await client.query(
        'SELECT id, metadata FROM credit_transactions WHERE payment_id = $1',
        [paymentId]
      );

      if (paymentTxResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: 'Original payment transaction not found'
        };
      }

      const originalTx = paymentTxResult.rows[0];
      const originalMetadata = originalTx.metadata ? JSON.parse(originalTx.metadata) : {};

      // Check if already allocated
      if (originalMetadata.paymentCompleted) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: 'Credits already allocated for this payment',
          isDuplicate: true
        };
      }

      // Update the original transaction with credit allocation
      const updatedMetadata = {
        ...originalMetadata,
        paymentCompleted: true,
        completedAt: new Date().toISOString(),
        blockchainHash: paymentData.payin_hash,
        actuallyPaid: paymentData.actually_paid,
        creditAllocationRate: this.ALLOCATION_RATE,
        allocationTimestamp: new Date().toISOString()
      };

      await client.query(`
        UPDATE credit_transactions
        SET amount = $1,
            balance_before = $2,
            balance_after = $3,
            description = $4,
            metadata = $5,
            updated_at = NOW()
        WHERE id = $6
      `, [
        creditAmount, // Positive amount for credit allocation
        balanceBefore,
        balanceAfter,
        `Cryptocurrency payment completed - ${paymentData.pay_currency.toUpperCase()} (${paymentData.actually_paid || paymentData.pay_amount})`,
        JSON.stringify(updatedMetadata),
        originalTx.id
      ]);

      await client.query('COMMIT');

      // Clear user's balance cache
      await this.clearUserBalanceCache(userId);

      // Send real-time notification (if WebSocket system exists)
      await this.sendCreditAllocationNotification(userId, creditAmount, paymentId);

      return {
        success: true,
        transactionId: originalTx.id,
        creditAmount,
        balanceAfter
      };

    } catch (error) {
      await client.query('ROLLBACK');
      Logger.error('Error in atomic credit allocation:', error);
      return {
        success: false,
        error: 'Database transaction failed'
      };
    } finally {
      client.release();
    }
  }

  // Mark allocation as completed in cache
  private async markAllocationCompleted(paymentId: string, transactionId: string): Promise<void> {
    try {
      const cacheKey = `${this.CACHE_PREFIX}completed:${paymentId}`;
      const allocationData = {
        transactionId,
        completedAt: new Date().toISOString(),
        timestamp: Date.now()
      };

      await redisClient.getClient().setex(
        cacheKey,
        this.DUPLICATE_CHECK_TTL,
        JSON.stringify(allocationData)
      );

    } catch (error) {
      Logger.error(`Error marking allocation completed for ${paymentId}:`, error);
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
        event: 'payment:credits_allocated'
      });

      // Cache notification for later retrieval if WebSocket fails
      const notificationKey = `${this.CACHE_PREFIX}notification:${userId}:${Date.now()}`;
      const notification = {
        type: 'payment:credits_allocated',
        data: {
          creditAmount,
          paymentId,
          timestamp: new Date().toISOString()
        }
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
    try {
      Logger.info(`Manual credit allocation initiated by admin ${adminUserId}`, {
        userId,
        paymentId,
        creditAmount,
        reason
      });

      // Check for existing allocation
      const duplicateCheck = await this.checkForDuplicate(paymentId);
      if (duplicateCheck.isDuplicate) {
        return duplicateCheck;
      }

      // Use creditService for manual allocation
      const result = await creditService.addCredits(
        userId,
        creditAmount,
        'bonus',
        `Manual allocation for payment ${paymentId}: ${reason}`,
        {
          paymentId,
          manualAllocation: true,
          adminUserId,
          reason,
          allocationRate: this.ALLOCATION_RATE
        }
      );

      if (result.success) {
        // Mark as completed to prevent duplicates
        await this.markAllocationCompleted(paymentId, result.transaction!.id);

        // Update metrics
        this.metrics.totalAllocations++;
        this.metrics.totalCreditsAllocated += creditAmount;
        this.metrics.lastAllocationTime = new Date();

        return {
          success: true,
          transactionId: result.transaction!.id,
          creditAmount,
          balanceAfter: result.balance!.totalBalance
        };
      }

      return {
        success: false,
        error: result.error || 'Manual allocation failed'
      };

    } catch (error) {
      Logger.error('Error in manual credit allocation:', error);
      return {
        success: false,
        error: 'Manual allocation failed due to system error'
      };
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
      lastAllocationTime: new Date()
    };
  }

  // Get allocation history for a user
  async getAllocationHistory(
    userId: string,
    limit = 20,
    offset = 0
  ): Promise<Array<{
    transactionId: string;
    paymentId: string;
    creditAmount: number;
    allocatedAt: Date;
    status: string;
  }>> {
    try {
      const pool = getDatabasePool();
      const result = await pool.query(`
        SELECT id, amount, metadata, created_at, payment_id
        FROM credit_transactions
        WHERE user_id = $1
        AND payment_id IS NOT NULL
        AND amount > 0
        AND metadata->>'paymentCompleted' = 'true'
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
      `, [userId, limit, offset]);

      return result.rows.map(row => {
        const metadata = row.metadata ? JSON.parse(row.metadata) : {};
        return {
          transactionId: row.id,
          paymentId: row.payment_id,
          creditAmount: parseFloat(row.amount),
          allocatedAt: new Date(row.created_at),
          status: 'completed'
        };
      });

    } catch (error) {
      Logger.error(`Error getting allocation history for user ${userId}:`, error);
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
  async getPendingAllocations(): Promise<Array<{
    paymentId: string;
    userId: string;
    usdAmount: number;
    createdAt: Date;
  }>> {
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
        const metadata = row.metadata ? JSON.parse(row.metadata) : {};
        return {
          paymentId: row.payment_id,
          userId: row.user_id,
          usdAmount: metadata.priceAmount || 0,
          createdAt: new Date(row.created_at)
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