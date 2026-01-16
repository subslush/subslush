import { getDatabasePool } from '../config/database';
import { redisClient } from '../config/redis';
import { nowpaymentsClient } from '../utils/nowpaymentsClient';
import { Logger } from '../utils/logger';
import {
  NOWPaymentsPaymentStatus,
  UnifiedPaymentStatus,
} from '../types/payment';
import { creditAllocationService } from './creditAllocationService';
import { paymentFailureService } from './paymentFailureService';
import { paymentRepository } from './paymentRepository';
import { env } from '../config/environment';
import { parseJsonValue } from '../utils/json';
import { shouldIgnoreNowPaymentsStatusRegression } from '../utils/nowpaymentsStatus';

export interface MonitoringMetrics {
  totalPaymentsMonitored: number;
  successfulUpdates: number;
  failedUpdates: number;
  creditsAllocated: number;
  lastRunTime: Date;
  averageProcessingTime: number;
  isActive: boolean;
}

export class PaymentMonitoringService {
  private isRunning = false;
  private monitoringInterval: ReturnType<typeof global.setInterval> | undefined;
  private readonly MONITORING_INTERVAL = env.PAYMENT_MONITORING_INTERVAL;
  private readonly BATCH_SIZE = env.PAYMENT_MONITORING_BATCH_SIZE;
  private readonly RETRY_ATTEMPTS = env.PAYMENT_RETRY_ATTEMPTS;
  private readonly RETRY_DELAY = env.PAYMENT_RETRY_DELAY;
  private readonly CACHE_PREFIX = 'payment_monitoring:';
  private readonly PENDING_PAYMENTS_KEY = 'pending_payments';
  private readonly NOWPAYMENTS_ID_REGEX = /^\d+$/;

  private metrics: MonitoringMetrics = {
    totalPaymentsMonitored: 0,
    successfulUpdates: 0,
    failedUpdates: 0,
    creditsAllocated: 0,
    lastRunTime: new Date(),
    averageProcessingTime: 0,
    isActive: false,
  };

  private mapNowPaymentsStatus(
    status: NOWPaymentsPaymentStatus['payment_status']
  ): UnifiedPaymentStatus {
    switch (status) {
      case 'finished':
        return 'succeeded';
      case 'failed':
      case 'refunded':
        return 'failed';
      case 'expired':
        return 'expired';
      case 'pending':
      case 'waiting':
      case 'confirming':
      case 'confirmed':
      case 'sending':
      case 'partially_paid':
      default:
        return 'processing';
    }
  }

  private resolveCreditAmountUsd(
    metadata: Record<string, any>,
    fallbackAmount?: number,
    fallbackCurrency?: string
  ): number | null {
    const paidUsd = Number(metadata['paidUsd'] ?? metadata['paid_usd']);
    if (Number.isFinite(paidUsd) && paidUsd > 0) {
      return paidUsd;
    }

    const metadataCurrency =
      typeof metadata['priceCurrency'] === 'string'
        ? metadata['priceCurrency'].toLowerCase()
        : null;
    const metadataAmount = Number(metadata['creditAmountUsd']);
    if (Number.isFinite(metadataAmount) && metadataAmount > 0) {
      return metadataAmount;
    }
    const legacyAmount = Number(metadata['priceAmount']);
    if (
      Number.isFinite(legacyAmount) &&
      legacyAmount > 0 &&
      metadataCurrency === 'usd'
    ) {
      return legacyAmount;
    }

    if (fallbackCurrency && fallbackCurrency.toLowerCase() !== 'usd') {
      return null;
    }

    const fallbackValue = Number(fallbackAmount);
    if (Number.isFinite(fallbackValue) && fallbackValue > 0) {
      return fallbackValue;
    }

    return null;
  }

  // Start the monitoring service
  async startMonitoring(): Promise<void> {
    if (this.isRunning) {
      Logger.warn('Payment monitoring service is already running');
      return;
    }

    Logger.info('Starting payment monitoring service', {
      interval: this.MONITORING_INTERVAL,
      batchSize: this.BATCH_SIZE,
    });

    this.isRunning = true;
    this.metrics.isActive = true;

    // Initialize pending payments tracking
    await this.initializePendingPayments();

    // Start the monitoring loop
    this.monitoringInterval = global.setInterval(() => {
      this.monitorPendingPayments().catch(error => {
        Logger.error('Error in monitoring loop:', error);
      });
    }, this.MONITORING_INTERVAL);

    // Run initial monitoring cycle without blocking startup
    void this.monitorPendingPayments().catch(error => {
      Logger.error('Error in initial monitoring cycle:', error);
    });

    Logger.info('Payment monitoring service started successfully');
  }

  // Stop the monitoring service
  async stopMonitoring(): Promise<void> {
    if (!this.isRunning) {
      Logger.warn('Payment monitoring service is not running');
      return;
    }

    Logger.info('Stopping payment monitoring service');

    this.isRunning = false;
    this.metrics.isActive = false;

    if (this.monitoringInterval) {
      global.clearInterval(this.monitoringInterval);
    }
    this.monitoringInterval = undefined;

    Logger.info('Payment monitoring service stopped');
  }

  // Check if monitoring service is running
  isMonitoringActive(): boolean {
    return this.isRunning;
  }

  // Get monitoring metrics
  getMetrics(): MonitoringMetrics {
    return { ...this.metrics };
  }

  // Initialize pending payments from database
  private async initializePendingPayments(): Promise<void> {
    try {
      const pool = getDatabasePool();
      const result = await pool.query(`
        SELECT payment_id, user_id, created_at
        FROM credit_transactions
        WHERE payment_id IS NOT NULL
        AND payment_provider = 'nowpayments'
        AND payment_id ~ '^[0-9]+$'
        AND payment_status IN ('pending', 'waiting', 'confirming', 'confirmed', 'sending', 'partially_paid')
        AND monitoring_status IS DISTINCT FROM 'skipped'
        AND created_at > NOW() - INTERVAL '7 days'
        ORDER BY created_at DESC
      `);

      if (result.rows.length === 0) {
        Logger.info('No pending payments found for monitoring');
        return;
      }

      // Store pending payment IDs in Redis
      const pendingPayments = result.rows.map(row => ({
        paymentId: row.payment_id,
        userId: row.user_id,
        createdAt: row.created_at,
      }));

      await redisClient.getClient().setex(
        `${this.CACHE_PREFIX}${this.PENDING_PAYMENTS_KEY}`,
        3600, // 1 hour TTL
        JSON.stringify(pendingPayments)
      );

      Logger.info(
        `Initialized monitoring for ${pendingPayments.length} pending payments`
      );
    } catch (error) {
      Logger.error('Error initializing pending payments:', error);
      throw error;
    }
  }

  // Monitor pending payments
  private async monitorPendingPayments(): Promise<void> {
    const startTime = Date.now();

    try {
      const pendingPayments = await this.getPendingPayments();
      if (pendingPayments.length === 0) {
        Logger.debug('No pending payments to monitor');
        return;
      }

      Logger.info(`Monitoring ${pendingPayments.length} pending payments`);

      // Process payments in batches
      for (let i = 0; i < pendingPayments.length; i += this.BATCH_SIZE) {
        const batch = pendingPayments.slice(i, i + this.BATCH_SIZE);
        await this.processBatch(batch);
      }

      // Update metrics
      this.metrics.totalPaymentsMonitored += pendingPayments.length;
      this.metrics.lastRunTime = new Date();
      this.metrics.averageProcessingTime = Date.now() - startTime;
    } catch (error) {
      Logger.error('Error monitoring pending payments:', error);
      this.metrics.failedUpdates++;
    }
  }

  // Process a batch of payments
  private async processBatch(
    batch: Array<{ paymentId: string; userId: string }>
  ): Promise<void> {
    const promises = batch.map(payment =>
      this.monitorPayment(payment.paymentId).catch(error => {
        Logger.error(`Error monitoring payment ${payment.paymentId}:`, error);
        return null;
      })
    );

    await Promise.allSettled(promises);
  }

  // Monitor a specific payment
  async monitorPayment(paymentId: string): Promise<boolean> {
    let attempt = 0;
    let lastError: Error | null = null;

    if (!this.isNowPaymentsPaymentId(paymentId)) {
      Logger.warn('Skipping monitoring for non-NOWPayments payment ID', {
        paymentId,
      });
      await this.markMonitoringSkipped(paymentId, 'invalid_payment_id');
      await this.removePendingPayment(paymentId);
      return false;
    }

    while (attempt < this.RETRY_ATTEMPTS) {
      try {
        await this.pollPaymentStatus(paymentId);
        return true; // Success, exit retry loop
      } catch (error) {
        lastError = error as Error;
        attempt++;

        if (attempt < this.RETRY_ATTEMPTS) {
          const delay = this.RETRY_DELAY * Math.pow(2, attempt - 1); // Exponential backoff
          Logger.warn(
            `Payment ${paymentId} monitoring attempt ${attempt} failed, retrying in ${delay}ms:`,
            error
          );
          await this.sleep(delay);
        }
      }
    }

    // All retries failed
    Logger.error(
      `Failed to monitor payment ${paymentId} after ${this.RETRY_ATTEMPTS} attempts:`,
      lastError
    );
    await paymentFailureService.handleMonitoringFailure(
      paymentId,
      lastError?.message || 'Unknown error'
    );
    this.metrics.failedUpdates++;
    return false;
  }

  // Poll payment status from NOWPayments API
  private async pollPaymentStatus(paymentId: string): Promise<void> {
    try {
      // Get current payment status from NOWPayments
      const paymentStatus = await nowpaymentsClient.getPaymentStatus(paymentId);

      // Process the payment update
      await this.processPaymentUpdate(paymentStatus);

      this.metrics.successfulUpdates++;
    } catch (error) {
      Logger.error(`Error polling payment status for ${paymentId}:`, error);
      throw error;
    }
  }

  // Process payment status update
  async processPaymentUpdate(
    paymentData: NOWPaymentsPaymentStatus
  ): Promise<void> {
    const pool = getDatabasePool();
    const client = await pool.connect();
    let transactionOpen = false;

    try {
      await client.query('BEGIN');
      transactionOpen = true;

      // Get current payment record
      const currentPayment = await client.query(
        'SELECT * FROM credit_transactions WHERE payment_id = $1',
        [paymentData.payment_id]
      );

      if (currentPayment.rows.length === 0) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        Logger.warn(`Payment not found in database: ${paymentData.payment_id}`);
        return;
      }

      const payment = currentPayment.rows[0];
      const previousStatus = payment.payment_status;

      if (
        shouldIgnoreNowPaymentsStatusRegression(
          previousStatus,
          paymentData.payment_status
        )
      ) {
        Logger.warn(
          `Ignoring NOWPayments status regression for ${paymentData.payment_id}`,
          {
            previousStatus,
            newStatus: paymentData.payment_status,
          }
        );
        await client.query('COMMIT');
        transactionOpen = false;
        try {
          await this.removePendingPayment(paymentData.payment_id);
        } catch (error) {
          Logger.warn(
            `Failed to remove ${paymentData.payment_id} from monitoring queue`,
            error
          );
        }
        return;
      }

      // Check if status has changed
      if (previousStatus === paymentData.payment_status) {
        Logger.debug(
          `No status change for payment ${paymentData.payment_id}: ${paymentData.payment_status}`
        );
        await client.query('COMMIT');
        transactionOpen = false;
        return;
      }

      Logger.info(
        `Payment status changed: ${paymentData.payment_id} from ${previousStatus} to ${paymentData.payment_status}`
      );

      // Update payment status and metadata
      const metadata = parseJsonValue<Record<string, any>>(
        payment.metadata,
        {}
      );
      metadata['actuallyPaid'] = paymentData.actually_paid;
      metadata['lastMonitoredAt'] = new Date().toISOString();

      await client.query(
        `
        UPDATE credit_transactions
        SET payment_status = $1,
            blockchain_hash = $2,
            updated_at = NOW(),
            metadata = $3
        WHERE payment_id = $4
      `,
        [
          paymentData.payment_status,
          paymentData.payin_hash,
          JSON.stringify(metadata),
          paymentData.payment_id,
        ]
      );

      await paymentRepository.updateStatusByProviderPaymentId(
        'nowpayments',
        paymentData.payment_id,
        this.mapNowPaymentsStatus(paymentData.payment_status),
        paymentData.payment_status,
        metadata,
        client
      );

      await client.query('COMMIT');
      transactionOpen = false;

      // Handle specific status transitions
      if (
        paymentData.payment_status === 'finished' &&
        previousStatus !== 'finished'
      ) {
        await this.handlePaymentSuccess(paymentData);
      } else if (
        ['failed', 'expired', 'refunded'].includes(paymentData.payment_status)
      ) {
        await this.handlePaymentFailure(paymentData);
      }

      // Remove from pending if payment is final
      if (
        ['finished', 'failed', 'expired', 'refunded'].includes(
          paymentData.payment_status
        )
      ) {
        await this.removePendingPayment(paymentData.payment_id);
      }
    } catch (error) {
      if (transactionOpen) {
        await client.query('ROLLBACK');
        transactionOpen = false;
      }
      Logger.error('Error processing payment update:', error);
      throw error;
    } finally {
      if (transactionOpen) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          Logger.error(
            'Failed to rollback payment update transaction',
            rollbackError
          );
        }
      }
      client.release();
    }
  }

  // Handle successful payment
  private async handlePaymentSuccess(
    paymentData: NOWPaymentsPaymentStatus
  ): Promise<void> {
    try {
      Logger.info(`Processing successful payment: ${paymentData.payment_id}`);

      // Get payment details from database
      const pool = getDatabasePool();
      const result = await pool.query(
        'SELECT user_id, metadata FROM credit_transactions WHERE payment_id = $1',
        [paymentData.payment_id]
      );

      if (result.rows.length === 0) {
        throw new Error(`Payment not found: ${paymentData.payment_id}`);
      }

      const { user_id, metadata } = result.rows[0];
      const parsedMetadata = parseJsonValue<Record<string, any>>(metadata, {});
      const creditAmount = this.resolveCreditAmountUsd(
        parsedMetadata,
        paymentData.price_amount,
        paymentData.price_currency
      );

      if (
        creditAmount === null ||
        !Number.isFinite(creditAmount) ||
        creditAmount <= 0
      ) {
        Logger.error('Invalid USD amount for monitoring allocation', {
          paymentId: paymentData.payment_id,
          userId: user_id,
          creditAmount,
        });
        await paymentFailureService.handlePaymentFailure(
          paymentData.payment_id,
          paymentData.payment_status,
          'Invalid payment amount for allocation',
          { monitoring: true }
        );
        return;
      }

      // Allocate credits to user
      const allocationResult =
        await creditAllocationService.allocateCreditsForPayment(
          user_id,
          paymentData.payment_id,
          creditAmount,
          paymentData
        );

      if (!allocationResult.success) {
        Logger.error(
          `Credit allocation failed for payment ${paymentData.payment_id}`,
          {
            userId: user_id,
            error: allocationResult.error,
          }
        );
        return;
      }

      this.metrics.creditsAllocated++;
      await paymentFailureService.resolveFailure(
        paymentData.payment_id,
        'payment_finished'
      );

      Logger.info(
        `Successfully allocated ${creditAmount} credits for payment ${paymentData.payment_id} to user ${user_id}`
      );
    } catch (error) {
      Logger.error(
        `Error handling successful payment ${paymentData.payment_id}:`,
        error
      );
      throw error;
    }
  }

  // Handle failed payment
  private async handlePaymentFailure(
    paymentData: NOWPaymentsPaymentStatus
  ): Promise<void> {
    try {
      Logger.info(
        `Processing failed payment: ${paymentData.payment_id} (status: ${paymentData.payment_status})`
      );

      await paymentFailureService.handlePaymentFailure(
        paymentData.payment_id,
        paymentData.payment_status,
        'Payment failed during monitoring'
      );
    } catch (error) {
      Logger.error(
        `Error handling failed payment ${paymentData.payment_id}:`,
        error
      );
      throw error;
    }
  }

  // Get pending payments from Redis cache
  private async getPendingPayments(): Promise<
    Array<{ paymentId: string; userId: string }>
  > {
    try {
      const cached = await redisClient
        .getClient()
        .get(`${this.CACHE_PREFIX}${this.PENDING_PAYMENTS_KEY}`);

      if (cached) {
        const pending = JSON.parse(cached) as Array<{
          paymentId: string;
          userId: string;
        }>;
        const filtered = pending.filter(p =>
          this.isNowPaymentsPaymentId(p.paymentId)
        );
        if (filtered.length !== pending.length) {
          await redisClient
            .getClient()
            .setex(
              `${this.CACHE_PREFIX}${this.PENDING_PAYMENTS_KEY}`,
              3600,
              JSON.stringify(filtered)
            );
        }
        return filtered;
      }

      // Refresh from database if cache is empty
      await this.initializePendingPayments();
      const refreshed = await redisClient
        .getClient()
        .get(`${this.CACHE_PREFIX}${this.PENDING_PAYMENTS_KEY}`);

      return refreshed ? JSON.parse(refreshed) : [];
    } catch (error) {
      Logger.error('Error getting pending payments:', error);
      return [];
    }
  }

  // Add payment to pending monitoring
  async addPendingPayment(paymentId: string, userId: string): Promise<void> {
    try {
      if (!this.isNowPaymentsPaymentId(paymentId)) {
        Logger.warn('Skipping non-NOWPayments payment ID for monitoring', {
          paymentId,
        });
        return;
      }

      const pendingPayments = await this.getPendingPayments();

      // Avoid duplicates
      if (!pendingPayments.find(p => p.paymentId === paymentId)) {
        pendingPayments.push({ paymentId, userId });

        await redisClient
          .getClient()
          .setex(
            `${this.CACHE_PREFIX}${this.PENDING_PAYMENTS_KEY}`,
            3600,
            JSON.stringify(pendingPayments)
          );

        Logger.info(`Added payment ${paymentId} to monitoring queue`);
      }
    } catch (error) {
      Logger.error(`Error adding pending payment ${paymentId}:`, error);
    }
  }

  // Remove payment from pending monitoring
  private async removePendingPayment(paymentId: string): Promise<void> {
    try {
      const pendingPayments = await this.getPendingPayments();
      const filtered = pendingPayments.filter(p => p.paymentId !== paymentId);

      await redisClient
        .getClient()
        .setex(
          `${this.CACHE_PREFIX}${this.PENDING_PAYMENTS_KEY}`,
          3600,
          JSON.stringify(filtered)
        );

      Logger.info(`Removed payment ${paymentId} from monitoring queue`);
    } catch (error) {
      Logger.error(`Error removing pending payment ${paymentId}:`, error);
    }
  }

  // Utility method for delays
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => global.setTimeout(resolve, ms));
  }

  private isNowPaymentsPaymentId(paymentId: string): boolean {
    return this.NOWPAYMENTS_ID_REGEX.test(paymentId);
  }

  private async markMonitoringSkipped(
    paymentId: string,
    reason: string
  ): Promise<void> {
    try {
      const pool = getDatabasePool();
      await pool.query(
        `UPDATE credit_transactions
         SET monitoring_status = 'skipped',
             updated_at = NOW(),
             metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('monitoringSkipReason', $2)
         WHERE payment_id = $1`,
        [paymentId, reason]
      );
    } catch (error) {
      Logger.error('Failed to mark monitoring skipped', { paymentId, error });
    }
  }

  // Health check for monitoring service
  async healthCheck(): Promise<boolean> {
    try {
      // Check if Redis is accessible
      await redisClient.getClient().ping();

      // Check if database is accessible
      const pool = getDatabasePool();
      await pool.query('SELECT 1');

      // Check if NOWPayments API is accessible
      await nowpaymentsClient.healthCheck();

      return true;
    } catch (error) {
      Logger.error('Payment monitoring service health check failed:', error);
      return false;
    }
  }

  // Manual trigger for monitoring specific payment
  async triggerPaymentCheck(paymentId: string): Promise<boolean> {
    try {
      Logger.info(`Manually triggering payment check for ${paymentId}`);
      const success = await this.monitorPayment(paymentId);
      if (!success) {
        Logger.warn(`Manual payment check failed for ${paymentId}`);
      }
      return success;
    } catch (error) {
      Logger.error(`Manual payment check failed for ${paymentId}:`, error);
      return false;
    }
  }

  // Reset monitoring metrics
  resetMetrics(): void {
    this.metrics = {
      totalPaymentsMonitored: 0,
      successfulUpdates: 0,
      failedUpdates: 0,
      creditsAllocated: 0,
      lastRunTime: new Date(),
      averageProcessingTime: 0,
      isActive: this.isRunning,
    };
  }
}

// Export singleton instance
export const paymentMonitoringService = new PaymentMonitoringService();
