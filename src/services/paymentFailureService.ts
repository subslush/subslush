import { getDatabasePool } from '../config/database';
import { redisClient } from '../config/redis';
import { env } from '../config/environment';
import { nowpaymentsClient } from '../utils/nowpaymentsClient';
import { Logger } from '../utils/logger';
import { PaymentStatus } from '../types/payment';

export type FailureType = 'expired' | 'failed' | 'network_error' | 'insufficient_payment' | 'monitoring_error' | 'system_error';

export interface PaymentFailureData {
  paymentId: string;
  userId: string;
  failureType: FailureType;
  status: PaymentStatus;
  reason: string;
  retryCount: number;
  canRetry: boolean;
  lastAttempt: Date;
  nextRetryAt?: Date;
  metadata?: Record<string, any>;
}

export interface FailureHandlingResult {
  success: boolean;
  action: 'retried' | 'failed_permanently' | 'user_notified' | 'admin_alerted' | 'cleanup_completed';
  nextRetryAt?: Date;
  error?: string;
}

export interface FailureMetrics {
  totalFailures: number;
  retriedFailures: number;
  permanentFailures: number;
  expiredPayments: number;
  networkErrors: number;
  userNotifications: number;
  adminAlerts: number;
}

export class PaymentFailureService {
  private readonly CACHE_PREFIX = 'payment_failure:';
  private readonly MAX_RETRY_ATTEMPTS = parseInt(process.env.PAYMENT_RETRY_ATTEMPTS || '3');
  private readonly BASE_RETRY_DELAY = parseInt(process.env.PAYMENT_RETRY_DELAY || '5000');
  private readonly MAX_RETRY_DELAY = 300000; // 5 minutes
  private readonly CLEANUP_AFTER_DAYS = 7;

  private metrics: FailureMetrics = {
    totalFailures: 0,
    retriedFailures: 0,
    permanentFailures: 0,
    expiredPayments: 0,
    networkErrors: 0,
    userNotifications: 0,
    adminAlerts: 0
  };

  // Main entry point for handling payment failures
  async handlePaymentFailure(
    paymentId: string,
    status: PaymentStatus,
    reason: string,
    metadata?: Record<string, any>
  ): Promise<FailureHandlingResult> {
    try {
      Logger.info(`Handling payment failure: ${paymentId}`, { status, reason });

      // Get payment information
      const paymentInfo = await this.getPaymentInfo(paymentId);
      if (!paymentInfo) {
        return {
          success: false,
          action: 'failed_permanently',
          error: 'Payment not found'
        };
      }

      // Categorize failure type
      const failureType = this.categorizeFailure(status, reason);

      // Get or create failure record
      const failureData = await this.getOrCreateFailureRecord(
        paymentId,
        paymentInfo.userId,
        failureType,
        status,
        reason,
        metadata
      );

      // Determine appropriate action
      const action = await this.determineFailureAction(failureData);

      // Execute the action
      const result = await this.executeFailureAction(failureData, action);

      // Update metrics
      this.updateMetrics(failureType, action);

      return result;

    } catch (error) {
      Logger.error(`Error handling payment failure for ${paymentId}:`, error);
      return {
        success: false,
        action: 'failed_permanently',
        error: 'System error in failure handling'
      };
    }
  }

  // Handle monitoring failures (when API calls fail)
  async handleMonitoringFailure(paymentId: string, error: string): Promise<void> {
    try {
      Logger.warn(`Monitoring failure for payment ${paymentId}: ${error}`);

      await this.handlePaymentFailure(
        paymentId,
        'pending', // Keep as pending since we don't know actual status
        `Monitoring error: ${error}`,
        { monitoringError: true, originalError: error }
      );

    } catch (err) {
      Logger.error(`Error handling monitoring failure for ${paymentId}:`, err);
    }
  }

  // Categorize the type of failure
  private categorizeFailure(status: PaymentStatus, reason: string): FailureType {
    if (status === 'expired') return 'expired';
    if (status === 'failed') return 'failed';
    if (reason.toLowerCase().includes('network') || reason.toLowerCase().includes('timeout')) {
      return 'network_error';
    }
    if (reason.toLowerCase().includes('insufficient') || reason.toLowerCase().includes('underpaid')) {
      return 'insufficient_payment';
    }
    if (reason.toLowerCase().includes('monitoring')) {
      return 'monitoring_error';
    }
    return 'system_error';
  }

  // Get payment information from database
  private async getPaymentInfo(paymentId: string): Promise<{ userId: string; createdAt: Date } | null> {
    try {
      const pool = getDatabasePool();
      const result = await pool.query(
        'SELECT user_id, created_at FROM credit_transactions WHERE payment_id = $1',
        [paymentId]
      );

      if (result.rows.length === 0) return null;

      return {
        userId: result.rows[0].user_id,
        createdAt: new Date(result.rows[0].created_at)
      };
    } catch (error) {
      Logger.error(`Error getting payment info for ${paymentId}:`, error);
      return null;
    }
  }

  // Get or create failure record
  private async getOrCreateFailureRecord(
    paymentId: string,
    userId: string,
    failureType: FailureType,
    status: PaymentStatus,
    reason: string,
    metadata?: Record<string, any>
  ): Promise<PaymentFailureData> {
    try {
      // Try to get existing failure record from Redis
      const cacheKey = `${this.CACHE_PREFIX}${paymentId}`;
      const cached = await redisClient.getClient().get(cacheKey);

      if (cached) {
        const existing = JSON.parse(cached) as PaymentFailureData;
        // Update with new information
        existing.status = status;
        existing.reason = reason;
        existing.lastAttempt = new Date();
        if (metadata) {
          existing.metadata = { ...existing.metadata, ...metadata };
        }
        return existing;
      }

      // Create new failure record
      const failureData: PaymentFailureData = {
        paymentId,
        userId,
        failureType,
        status,
        reason,
        retryCount: 0,
        canRetry: this.canRetryFailureType(failureType),
        lastAttempt: new Date(),
        metadata: metadata || {}
      };

      // Cache the failure record
      await redisClient.getClient().setex(
        cacheKey,
        86400 * this.CLEANUP_AFTER_DAYS, // TTL in seconds
        JSON.stringify(failureData)
      );

      return failureData;

    } catch (error) {
      Logger.error(`Error getting/creating failure record for ${paymentId}:`, error);
      throw error;
    }
  }

  // Determine if failure type can be retried
  private canRetryFailureType(failureType: FailureType): boolean {
    switch (failureType) {
      case 'network_error':
      case 'monitoring_error':
      case 'system_error':
        return true;
      case 'expired':
      case 'failed':
      case 'insufficient_payment':
        return false;
      default:
        return false;
    }
  }

  // Determine the appropriate action for a failure
  private async determineFailureAction(failureData: PaymentFailureData): Promise<string> {
    // If payment is permanently failed or expired
    if (['expired', 'failed', 'refunded'].includes(failureData.status)) {
      return 'cleanup_completed';
    }

    // If failure can't be retried
    if (!failureData.canRetry) {
      return 'user_notified';
    }

    // If max retries exceeded
    if (failureData.retryCount >= this.MAX_RETRY_ATTEMPTS) {
      return 'admin_alerted';
    }

    // If enough time has passed for next retry
    if (failureData.nextRetryAt && new Date() >= failureData.nextRetryAt) {
      return 'retried';
    }

    // Default to user notification
    return 'user_notified';
  }

  // Execute the determined failure action
  private async executeFailureAction(
    failureData: PaymentFailureData,
    action: string
  ): Promise<FailureHandlingResult> {
    switch (action) {
      case 'retried':
        return await this.retryPaymentMonitoring(failureData);

      case 'user_notified':
        return await this.notifyUserOfFailure(failureData);

      case 'admin_alerted':
        return await this.alertAdminOfFailure(failureData);

      case 'cleanup_completed':
        return await this.cleanupFailedPayment(failureData);

      default:
        return {
          success: false,
          action: 'failed_permanently' as any,
          error: `Unknown action: ${action}`
        };
    }
  }

  // Retry payment monitoring
  private async retryPaymentMonitoring(failureData: PaymentFailureData): Promise<FailureHandlingResult> {
    try {
      Logger.info(`Retrying payment monitoring for ${failureData.paymentId} (attempt ${failureData.retryCount + 1})`);

      // Update retry count and schedule next retry
      failureData.retryCount++;
      const delay = Math.min(
        this.BASE_RETRY_DELAY * Math.pow(2, failureData.retryCount - 1),
        this.MAX_RETRY_DELAY
      );
      failureData.nextRetryAt = new Date(Date.now() + delay);

      // Try to get fresh payment status
      try {
        const paymentStatus = await nowpaymentsClient.getPaymentStatus(failureData.paymentId);

        // If status has changed, let monitoring service handle it
        if (paymentStatus.payment_status !== failureData.status) {
          Logger.info(`Payment status changed during retry: ${failureData.paymentId} now ${paymentStatus.payment_status}`);
          await this.clearFailureRecord(failureData.paymentId);
          return {
            success: true,
            action: 'retried',
            nextRetryAt: undefined
          };
        }
      } catch (error) {
        Logger.warn(`Retry attempt failed for ${failureData.paymentId}:`, error);
      }

      // Update cached failure record
      await this.updateFailureRecord(failureData);

      return {
        success: true,
        action: 'retried',
        nextRetryAt: failureData.nextRetryAt
      };

    } catch (error) {
      Logger.error(`Error retrying payment monitoring for ${failureData.paymentId}:`, error);
      return {
        success: false,
        action: 'retried',
        error: 'Retry failed'
      };
    }
  }

  // Notify user of payment failure
  private async notifyUserOfFailure(failureData: PaymentFailureData): Promise<FailureHandlingResult> {
    try {
      Logger.info(`Notifying user of payment failure: ${failureData.paymentId}`);

      // Create user notification
      const notification = await this.createUserNotification(failureData);

      // Log notification for audit
      await this.logFailureNotification(failureData, 'user', notification);

      return {
        success: true,
        action: 'user_notified'
      };

    } catch (error) {
      Logger.error(`Error notifying user of failure for ${failureData.paymentId}:`, error);
      return {
        success: false,
        action: 'user_notified',
        error: 'User notification failed'
      };
    }
  }

  // Alert admin of critical failure
  private async alertAdminOfFailure(failureData: PaymentFailureData): Promise<FailureHandlingResult> {
    try {
      Logger.error(`Admin alert: Payment failure requires intervention: ${failureData.paymentId}`, failureData);

      // Create admin alert
      const alert = await this.createAdminAlert(failureData);

      // Log alert for audit
      await this.logFailureNotification(failureData, 'admin', alert);

      // Also notify user about the issue
      await this.notifyUserOfFailure(failureData);

      return {
        success: true,
        action: 'admin_alerted'
      };

    } catch (error) {
      Logger.error(`Error alerting admin of failure for ${failureData.paymentId}:`, error);
      return {
        success: false,
        action: 'admin_alerted',
        error: 'Admin alert failed'
      };
    }
  }

  // Cleanup failed/expired payment
  private async cleanupFailedPayment(failureData: PaymentFailureData): Promise<FailureHandlingResult> {
    try {
      Logger.info(`Cleaning up failed payment: ${failureData.paymentId}`);

      // Update database record with final status
      await this.markPaymentAsCleaned(failureData);

      // Clear failure record from cache
      await this.clearFailureRecord(failureData.paymentId);

      // Notify user if needed
      if (failureData.status === 'expired') {
        await this.notifyUserOfExpiry(failureData);
      }

      return {
        success: true,
        action: 'cleanup_completed'
      };

    } catch (error) {
      Logger.error(`Error cleaning up failed payment ${failureData.paymentId}:`, error);
      return {
        success: false,
        action: 'cleanup_completed',
        error: 'Cleanup failed'
      };
    }
  }

  // Create user notification
  private async createUserNotification(failureData: PaymentFailureData): Promise<string> {
    const message = this.generateUserMessage(failureData);

    // Cache notification for retrieval
    const notificationKey = `notification:${failureData.userId}:${Date.now()}`;
    const notification = {
      type: 'payment:failed',
      data: {
        paymentId: failureData.paymentId,
        status: failureData.status,
        message,
        canRetry: failureData.canRetry && failureData.retryCount < this.MAX_RETRY_ATTEMPTS,
        timestamp: new Date().toISOString()
      }
    };

    await redisClient.getClient().setex(
      notificationKey,
      3600, // 1 hour TTL
      JSON.stringify(notification)
    );

    return message;
  }

  // Generate user-friendly failure message
  private generateUserMessage(failureData: PaymentFailureData): string {
    switch (failureData.failureType) {
      case 'expired':
        return 'Your payment has expired. Please create a new payment to continue.';
      case 'failed':
        return 'Your payment has failed. Please try again with a different payment method.';
      case 'insufficient_payment':
        return 'Insufficient payment received. Please send the full amount to complete the transaction.';
      case 'network_error':
        return 'We are experiencing technical difficulties. We will continue monitoring your payment.';
      case 'monitoring_error':
        return 'We are having trouble checking your payment status. Please contact support if this persists.';
      default:
        return 'We encountered an issue with your payment. Our team has been notified and will assist you shortly.';
    }
  }

  // Create admin alert
  private async createAdminAlert(failureData: PaymentFailureData): Promise<string> {
    const alert = {
      type: 'payment_failure_alert',
      severity: 'high',
      paymentId: failureData.paymentId,
      userId: failureData.userId,
      failureType: failureData.failureType,
      retryCount: failureData.retryCount,
      reason: failureData.reason,
      timestamp: new Date().toISOString(),
      action_required: 'Manual intervention needed for payment monitoring'
    };

    // Store alert in Redis for admin dashboard
    const alertKey = `admin_alert:payment_failure:${failureData.paymentId}`;
    await redisClient.getClient().setex(
      alertKey,
      86400 * 7, // 7 days TTL
      JSON.stringify(alert)
    );

    return `Payment failure alert created for ${failureData.paymentId}`;
  }

  // Notify user of payment expiry
  private async notifyUserOfExpiry(failureData: PaymentFailureData): Promise<void> {
    const notification = {
      type: 'payment:expired',
      data: {
        paymentId: failureData.paymentId,
        message: 'Your payment has expired. You can create a new payment to purchase credits.',
        timestamp: new Date().toISOString()
      }
    };

    const notificationKey = `notification:${failureData.userId}:expired:${Date.now()}`;
    await redisClient.getClient().setex(
      notificationKey,
      3600,
      JSON.stringify(notification)
    );
  }

  // Update failure record in cache
  private async updateFailureRecord(failureData: PaymentFailureData): Promise<void> {
    const cacheKey = `${this.CACHE_PREFIX}${failureData.paymentId}`;
    await redisClient.getClient().setex(
      cacheKey,
      86400 * this.CLEANUP_AFTER_DAYS,
      JSON.stringify(failureData)
    );
  }

  // Clear failure record from cache
  private async clearFailureRecord(paymentId: string): Promise<void> {
    const cacheKey = `${this.CACHE_PREFIX}${paymentId}`;
    await redisClient.getClient().del(cacheKey);
  }

  // Mark payment as cleaned in database
  private async markPaymentAsCleaned(failureData: PaymentFailureData): Promise<void> {
    try {
      const pool = getDatabasePool();
      const metadata = {
        cleanedAt: new Date().toISOString(),
        finalStatus: failureData.status,
        failureType: failureData.failureType,
        retryCount: failureData.retryCount
      };

      await pool.query(`
        UPDATE credit_transactions
        SET metadata = COALESCE(metadata, '{}')::jsonb || $1::jsonb,
            updated_at = NOW()
        WHERE payment_id = $2
      `, [JSON.stringify(metadata), failureData.paymentId]);

    } catch (error) {
      Logger.error(`Error marking payment as cleaned ${failureData.paymentId}:`, error);
    }
  }

  // Log failure notification for audit
  private async logFailureNotification(
    failureData: PaymentFailureData,
    recipient: 'user' | 'admin',
    message: string
  ): Promise<void> {
    try {
      const logEntry = {
        paymentId: failureData.paymentId,
        userId: failureData.userId,
        recipient,
        message,
        failureType: failureData.failureType,
        timestamp: new Date().toISOString()
      };

      // Store in Redis for audit trail
      const logKey = `audit:payment_failure:${failureData.paymentId}:${Date.now()}`;
      await redisClient.getClient().setex(
        logKey,
        86400 * 30, // 30 days TTL
        JSON.stringify(logEntry)
      );

    } catch (error) {
      Logger.error('Error logging failure notification:', error);
    }
  }

  // Update metrics
  private updateMetrics(failureType: FailureType, action: string): void {
    this.metrics.totalFailures++;

    switch (failureType) {
      case 'expired':
        this.metrics.expiredPayments++;
        break;
      case 'network_error':
      case 'monitoring_error':
        this.metrics.networkErrors++;
        break;
    }

    switch (action) {
      case 'retried':
        this.metrics.retriedFailures++;
        break;
      case 'user_notified':
        this.metrics.userNotifications++;
        break;
      case 'admin_alerted':
        this.metrics.adminAlerts++;
        break;
      case 'cleanup_completed':
        this.metrics.permanentFailures++;
        break;
    }
  }

  // Get failure metrics
  getMetrics(): FailureMetrics {
    return { ...this.metrics };
  }

  // Reset metrics
  resetMetrics(): void {
    this.metrics = {
      totalFailures: 0,
      retriedFailures: 0,
      permanentFailures: 0,
      expiredPayments: 0,
      networkErrors: 0,
      userNotifications: 0,
      adminAlerts: 0
    };
  }

  // Get all failed payments for admin dashboard
  async getFailedPayments(limit = 50, offset = 0): Promise<PaymentFailureData[]> {
    try {
      // Get from Redis cache
      const pattern = `${this.CACHE_PREFIX}*`;
      const keys = await redisClient.getClient().keys(pattern);

      const failurePromises = keys.slice(offset, offset + limit).map(async key => {
        const data = await redisClient.getClient().get(key);
        return data ? JSON.parse(data) : null;
      });

      const failures = await Promise.all(failurePromises);
      return failures.filter(f => f !== null);

    } catch (error) {
      Logger.error('Error getting failed payments:', error);
      return [];
    }
  }

  // Manual retry for specific payment (admin action)
  async manualRetryPayment(paymentId: string, adminUserId: string): Promise<FailureHandlingResult> {
    try {
      Logger.info(`Manual retry initiated by admin ${adminUserId} for payment ${paymentId}`);

      const failureData = await this.getFailureRecord(paymentId);
      if (!failureData) {
        return {
          success: false,
          action: 'failed_permanently',
          error: 'Failure record not found'
        };
      }

      // Reset retry count for manual retry
      failureData.retryCount = 0;
      failureData.canRetry = true;
      failureData.metadata = {
        ...failureData.metadata,
        manualRetry: true,
        adminUserId,
        manualRetryAt: new Date().toISOString()
      };

      return await this.retryPaymentMonitoring(failureData);

    } catch (error) {
      Logger.error(`Error in manual retry for ${paymentId}:`, error);
      return {
        success: false,
        action: 'failed_permanently',
        error: 'Manual retry failed'
      };
    }
  }

  // Get specific failure record
  private async getFailureRecord(paymentId: string): Promise<PaymentFailureData | null> {
    try {
      const cacheKey = `${this.CACHE_PREFIX}${paymentId}`;
      const data = await redisClient.getClient().get(cacheKey);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      Logger.error(`Error getting failure record for ${paymentId}:`, error);
      return null;
    }
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      await redisClient.getClient().ping();
      const pool = getDatabasePool();
      await pool.query('SELECT 1');
      return true;
    } catch (error) {
      Logger.error('Payment failure service health check failed:', error);
      return false;
    }
  }

  // Cleanup old failure records
  async cleanupOldFailures(): Promise<number> {
    try {
      const cutoffDate = new Date(Date.now() - (86400000 * this.CLEANUP_AFTER_DAYS));
      const pattern = `${this.CACHE_PREFIX}*`;
      const keys = await redisClient.getClient().keys(pattern);

      let cleanedCount = 0;
      for (const key of keys) {
        const data = await redisClient.getClient().get(key);
        if (data) {
          const failureData = JSON.parse(data) as PaymentFailureData;
          if (new Date(failureData.lastAttempt) < cutoffDate) {
            await redisClient.getClient().del(key);
            cleanedCount++;
          }
        }
      }

      Logger.info(`Cleaned up ${cleanedCount} old failure records`);
      return cleanedCount;

    } catch (error) {
      Logger.error('Error cleaning up old failures:', error);
      return 0;
    }
  }
}

// Export singleton instance
export const paymentFailureService = new PaymentFailureService();