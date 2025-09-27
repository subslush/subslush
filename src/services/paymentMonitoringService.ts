import { getDatabasePool } from '../config/database';
import { redisClient } from '../config/redis';
import { env } from '../config/environment';
import { nowpaymentsClient } from '../utils/nowpaymentsClient';
import { Logger } from '../utils/logger';
import { NOWPaymentsPaymentStatus } from '../types/payment';
import { creditAllocationService } from './creditAllocationService';
import { paymentFailureService } from './paymentFailureService';

export interface MonitoringMetrics {
  totalPaymentsMonitored: number;
  successfulUpdates: number;
  failedUpdates: number;
  creditsAllocated: number;
  lastRunTime: Date;
  averageProcessingTime: number;
}

export class PaymentMonitoringService {
  private isRunning = false;
  private monitoringInterval?: NodeJS.Timeout;
  private readonly MONITORING_INTERVAL = parseInt(process.env.PAYMENT_MONITORING_INTERVAL || '30000');
  private readonly BATCH_SIZE = parseInt(process.env.PAYMENT_MONITORING_BATCH_SIZE || '50');
  private readonly RETRY_ATTEMPTS = parseInt(process.env.PAYMENT_RETRY_ATTEMPTS || '3');
  private readonly RETRY_DELAY = parseInt(process.env.PAYMENT_RETRY_DELAY || '5000');
  private readonly CACHE_PREFIX = 'payment_monitoring:';
  private readonly PENDING_PAYMENTS_KEY = 'pending_payments';

  private metrics: MonitoringMetrics = {
    totalPaymentsMonitored: 0,
    successfulUpdates: 0,
    failedUpdates: 0,
    creditsAllocated: 0,
    lastRunTime: new Date(),
    averageProcessingTime: 0
  };

  // Start the monitoring service
  async startMonitoring(): Promise<void> {
    if (this.isRunning) {
      Logger.warn('Payment monitoring service is already running');
      return;
    }

    Logger.info('Starting payment monitoring service', {
      interval: this.MONITORING_INTERVAL,
      batchSize: this.BATCH_SIZE
    });

    this.isRunning = true;

    // Initialize pending payments tracking
    await this.initializePendingPayments();

    // Start the monitoring loop
    this.monitoringInterval = setInterval(() => {
      this.monitorPendingPayments().catch(error => {
        Logger.error('Error in monitoring loop:', error);
      });
    }, this.MONITORING_INTERVAL);

    // Run initial monitoring cycle
    await this.monitorPendingPayments();

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

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

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
        AND payment_status IN ('pending', 'waiting', 'confirming', 'confirmed', 'sending', 'partially_paid')
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
        createdAt: row.created_at
      }));

      await redisClient.getClient().setex(
        `${this.CACHE_PREFIX}${this.PENDING_PAYMENTS_KEY}`,
        3600, // 1 hour TTL
        JSON.stringify(pendingPayments)
      );

      Logger.info(`Initialized monitoring for ${pendingPayments.length} pending payments`);
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
  private async processBatch(batch: Array<{ paymentId: string; userId: string }>): Promise<void> {
    const promises = batch.map(payment =>
      this.monitorPayment(payment.paymentId).catch(error => {
        Logger.error(`Error monitoring payment ${payment.paymentId}:`, error);
        return null;
      })
    );

    await Promise.allSettled(promises);
  }

  // Monitor a specific payment
  async monitorPayment(paymentId: string): Promise<void> {
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < this.RETRY_ATTEMPTS) {
      try {
        await this.pollPaymentStatus(paymentId);
        return; // Success, exit retry loop
      } catch (error) {
        lastError = error as Error;
        attempt++;

        if (attempt < this.RETRY_ATTEMPTS) {
          const delay = this.RETRY_DELAY * Math.pow(2, attempt - 1); // Exponential backoff
          Logger.warn(`Payment ${paymentId} monitoring attempt ${attempt} failed, retrying in ${delay}ms:`, error);
          await this.sleep(delay);
        }
      }
    }

    // All retries failed
    Logger.error(`Failed to monitor payment ${paymentId} after ${this.RETRY_ATTEMPTS} attempts:`, lastError);
    await paymentFailureService.handleMonitoringFailure(paymentId, lastError?.message || 'Unknown error');
    this.metrics.failedUpdates++;
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
  async processPaymentUpdate(paymentData: NOWPaymentsPaymentStatus): Promise<void> {
    const pool = getDatabasePool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get current payment record
      const currentPayment = await client.query(
        'SELECT * FROM credit_transactions WHERE payment_id = $1',
        [paymentData.payment_id]
      );

      if (currentPayment.rows.length === 0) {
        Logger.warn(`Payment not found in database: ${paymentData.payment_id}`);
        return;
      }

      const payment = currentPayment.rows[0];
      const previousStatus = payment.payment_status;

      // Check if status has changed
      if (previousStatus === paymentData.payment_status) {
        Logger.debug(`No status change for payment ${paymentData.payment_id}: ${paymentData.payment_status}`);
        await client.query('COMMIT');
        return;
      }

      Logger.info(`Payment status changed: ${paymentData.payment_id} from ${previousStatus} to ${paymentData.payment_status}`);

      // Update payment status and metadata
      const metadata = payment.metadata ? JSON.parse(payment.metadata) : {};
      metadata.actuallyPaid = paymentData.actually_paid;
      metadata.lastMonitoredAt = new Date().toISOString();

      await client.query(`
        UPDATE credit_transactions
        SET payment_status = $1,
            blockchain_hash = $2,
            updated_at = NOW(),
            metadata = $3
        WHERE payment_id = $4
      `, [
        paymentData.payment_status,
        paymentData.payin_hash,
        JSON.stringify(metadata),
        paymentData.payment_id
      ]);

      await client.query('COMMIT');

      // Handle specific status transitions
      if (paymentData.payment_status === 'finished' && previousStatus !== 'finished') {
        await this.handlePaymentSuccess(paymentData);
      } else if (['failed', 'expired', 'refunded'].includes(paymentData.payment_status)) {
        await this.handlePaymentFailure(paymentData);
      }

      // Remove from pending if payment is final
      if (['finished', 'failed', 'expired', 'refunded'].includes(paymentData.payment_status)) {
        await this.removePendingPayment(paymentData.payment_id);
      }

    } catch (error) {
      await client.query('ROLLBACK');
      Logger.error('Error processing payment update:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Handle successful payment
  private async handlePaymentSuccess(paymentData: NOWPaymentsPaymentStatus): Promise<void> {
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
      const parsedMetadata = metadata ? JSON.parse(metadata) : {};
      const creditAmount = parsedMetadata.priceAmount || paymentData.price_amount;

      // Allocate credits to user
      await creditAllocationService.allocateCreditsForPayment(
        user_id,
        paymentData.payment_id,
        creditAmount,
        paymentData
      );

      this.metrics.creditsAllocated++;

      Logger.info(`Successfully allocated ${creditAmount} credits for payment ${paymentData.payment_id} to user ${user_id}`);

    } catch (error) {
      Logger.error(`Error handling successful payment ${paymentData.payment_id}:`, error);
      throw error;
    }
  }

  // Handle failed payment
  private async handlePaymentFailure(paymentData: NOWPaymentsPaymentStatus): Promise<void> {
    try {
      Logger.info(`Processing failed payment: ${paymentData.payment_id} (status: ${paymentData.payment_status})`);

      await paymentFailureService.handlePaymentFailure(
        paymentData.payment_id,
        paymentData.payment_status,
        'Payment failed during monitoring'
      );

    } catch (error) {
      Logger.error(`Error handling failed payment ${paymentData.payment_id}:`, error);
      throw error;
    }
  }

  // Get pending payments from Redis cache
  private async getPendingPayments(): Promise<Array<{ paymentId: string; userId: string }>> {
    try {
      const cached = await redisClient.getClient().get(
        `${this.CACHE_PREFIX}${this.PENDING_PAYMENTS_KEY}`
      );

      if (cached) {
        return JSON.parse(cached);
      }

      // Refresh from database if cache is empty
      await this.initializePendingPayments();
      const refreshed = await redisClient.getClient().get(
        `${this.CACHE_PREFIX}${this.PENDING_PAYMENTS_KEY}`
      );

      return refreshed ? JSON.parse(refreshed) : [];
    } catch (error) {
      Logger.error('Error getting pending payments:', error);
      return [];
    }
  }

  // Add payment to pending monitoring
  async addPendingPayment(paymentId: string, userId: string): Promise<void> {
    try {
      const pendingPayments = await this.getPendingPayments();

      // Avoid duplicates
      if (!pendingPayments.find(p => p.paymentId === paymentId)) {
        pendingPayments.push({ paymentId, userId });

        await redisClient.getClient().setex(
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

      await redisClient.getClient().setex(
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
    return new Promise(resolve => setTimeout(resolve, ms));
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
      await this.monitorPayment(paymentId);
      return true;
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
      averageProcessingTime: 0
    };
  }
}

// Export singleton instance
export const paymentMonitoringService = new PaymentMonitoringService();