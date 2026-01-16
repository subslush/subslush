import { v4 as uuidv4 } from 'uuid';
import { getDatabasePool } from '../config/database';
import { redisClient } from '../config/redis';
import { creditService } from './creditService';
import { Logger } from '../utils/logger';
import { parseJsonValue } from '../utils/json';

export type RefundStatus =
  | 'pending'
  | 'approved'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'rejected';
export type RefundReason =
  | 'user_request'
  | 'payment_error'
  | 'service_issue'
  | 'overpayment'
  | 'admin_decision'
  | 'dispute';

export interface RefundRequest {
  id: string;
  paymentId: string;
  userId: string;
  amount: number;
  reason: RefundReason;
  description?: string | undefined;
  status: RefundStatus;
  approvedBy?: string | undefined;
  processedAt?: Date | undefined;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

// Interface for local RefundRequest - renamed to avoid conflict
export interface LocalRefundResult {
  success: boolean;
  refund?: RefundRequest;
  transactionId?: string | undefined;
  error?: string | undefined;
}

export interface RefundMetrics {
  totalRequests: number;
  approvedRefunds: number;
  rejectedRefunds: number;
  completedRefunds: number;
  totalAmountRefunded: number;
  averageProcessingTime: number;
  pendingApprovals: number;
}

export class RefundService {
  private readonly CACHE_PREFIX = 'refund:';
  private readonly APPROVAL_REQUIRED = true;
  // Processing timeout available if needed
  // private readonly PROCESSING_TIMEOUT = env.REFUND_PROCESSING_TIMEOUT;
  private readonly MAX_REFUND_AMOUNT = 10000;
  private readonly REFUND_WINDOW_DAYS = 30; // Window for requesting refunds

  private metrics: RefundMetrics = {
    totalRequests: 0,
    approvedRefunds: 0,
    rejectedRefunds: 0,
    completedRefunds: 0,
    totalAmountRefunded: 0,
    averageProcessingTime: 0,
    pendingApprovals: 0,
  };

  private async findRefundReversalTransaction(
    refundId: string
  ): Promise<string | null> {
    const pool = getDatabasePool();
    const result = await pool.query(
      `SELECT id
       FROM credit_transactions
       WHERE type = 'refund_reversal'
         AND metadata->>'refundId' = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [refundId]
    );

    return result.rows[0]?.id || null;
  }

  private async getPaymentRefundContext(paymentId: string): Promise<{
    provider: string | null;
    paymentCurrency: string | null;
    paymentAmount: number | null;
    metadata: Record<string, any>;
  } | null> {
    const pool = getDatabasePool();
    const result = await pool.query(
      `SELECT payment_provider, payment_currency, payment_amount, metadata
       FROM credit_transactions
       WHERE payment_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [paymentId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      provider: row.payment_provider || null,
      paymentCurrency: row.payment_currency || null,
      paymentAmount: row.payment_amount ? parseFloat(row.payment_amount) : null,
      metadata: parseJsonValue<Record<string, any>>(row.metadata, {}),
    };
  }

  private async triggerProviderRefund(params: {
    refundId: string;
    paymentId: string;
    userId: string;
    amount: number;
    reason: RefundReason;
  }): Promise<{
    success: boolean;
    status: 'manual_required';
    taskId?: string;
    error?: string;
  }> {
    const context = await this.getPaymentRefundContext(params.paymentId);
    const payAddress =
      context?.metadata?.['payAddress'] ||
      context?.metadata?.['pay_address'] ||
      null;
    const payCurrency =
      context?.metadata?.['payCurrency'] ||
      context?.metadata?.['pay_currency'] ||
      context?.paymentCurrency ||
      null;

    const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const notes = [
      `Refund approved: ${params.refundId}`,
      `Payment: ${params.paymentId}`,
      `User: ${params.userId}`,
      `Amount: ${params.amount}`,
      `Reason: ${params.reason}`,
      payCurrency ? `Currency: ${payCurrency}` : null,
      payAddress ? `Pay address: ${payAddress}` : null,
    ]
      .filter(Boolean)
      .join(' | ');

    const pool = getDatabasePool();
    const result = await pool.query(
      `INSERT INTO admin_tasks
        (subscription_id, user_id, order_id, task_type, due_date, priority, notes, task_category, sla_due_at)
       SELECT NULL, $1, NULL, 'support', $2, 'high', $3, 'payment_refund', $4
       WHERE NOT EXISTS (
         SELECT 1
         FROM admin_tasks
         WHERE task_category = 'payment_refund'
           AND notes LIKE $5
           AND completed_at IS NULL
       )
       RETURNING id`,
      [params.userId, dueDate, notes, dueDate, `%${params.refundId}%`]
    );

    return {
      success: true,
      status: 'manual_required',
      taskId: result.rows[0]?.id,
    };
  }

  // Initiate a refund request
  async initiateRefund(
    userId: string,
    paymentId: string,
    amount: number,
    reason: RefundReason,
    description?: string
  ): Promise<LocalRefundResult> {
    try {
      Logger.info(`Initiating refund request for payment ${paymentId}`, {
        userId,
        amount,
        reason,
      });

      // Validate refund request
      const validation = await this.validateRefundRequest(
        userId,
        paymentId,
        amount
      );
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error || 'Validation failed',
        };
      }

      // Check for existing refund request
      const existingRefund = await this.getRefundByPaymentId(paymentId);
      if (existingRefund) {
        return {
          success: false,
          error: 'Refund request already exists for this payment',
        };
      }

      // Create refund request
      const refund = await this.createRefundRequest(
        userId,
        paymentId,
        amount,
        reason,
        description
      );

      if (!refund) {
        return {
          success: false,
          error: 'Failed to create refund request',
        };
      }

      // Refunds always require manual approval by support.

      // Update metrics
      this.metrics.totalRequests++;
      if (refund.status === 'pending') {
        this.metrics.pendingApprovals++;
      }

      return {
        success: true,
        refund,
      };
    } catch (error) {
      Logger.error(`Error initiating refund for payment ${paymentId}:`, error);
      return {
        success: false,
        error: 'Failed to initiate refund request',
      };
    }
  }

  // Validate refund request
  private async validateRefundRequest(
    userId: string,
    paymentId: string,
    amount: number
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      // Check if payment exists and belongs to user
      const pool = getDatabasePool();
      const paymentResult = await pool.query(
        `
        SELECT user_id, amount, payment_status, created_at, metadata
        FROM credit_transactions
        WHERE payment_id = $1 AND user_id = $2
      `,
        [paymentId, userId]
      );

      if (paymentResult.rows.length === 0) {
        return { valid: false, error: 'Payment not found or access denied' };
      }

      const payment = paymentResult.rows[0];

      // Check if payment was successful
      if (payment.payment_status !== 'finished') {
        return { valid: false, error: 'Can only refund completed payments' };
      }

      // Check refund window
      const paymentDate = new Date(payment.created_at);
      const cutoffDate = new Date(
        Date.now() - this.REFUND_WINDOW_DAYS * 24 * 60 * 60 * 1000
      );
      if (paymentDate < cutoffDate) {
        return {
          valid: false,
          error: `Refunds can only be requested within ${this.REFUND_WINDOW_DAYS} days of payment`,
        };
      }

      // Validate amount
      if (amount <= 0) {
        return { valid: false, error: 'Refund amount must be positive' };
      }

      if (amount > this.MAX_REFUND_AMOUNT) {
        return {
          valid: false,
          error: `Refund amount cannot exceed ${this.MAX_REFUND_AMOUNT}`,
        };
      }

      const creditAmount = Math.abs(parseFloat(payment.amount));
      if (amount > creditAmount) {
        return {
          valid: false,
          error: 'Refund amount cannot exceed original payment amount',
        };
      }

      // Check if user has sufficient credits to deduct
      const userBalance = await creditService.getUserBalance(userId);
      if (!userBalance || userBalance.totalBalance < amount) {
        return {
          valid: false,
          error: 'Insufficient credit balance for refund',
        };
      }

      return { valid: true };
    } catch (error) {
      Logger.error('Error validating refund request:', error);
      return { valid: false, error: 'Validation failed' };
    }
  }

  // Create refund request in database
  private async createRefundRequest(
    userId: string,
    paymentId: string,
    amount: number,
    reason: RefundReason,
    description?: string
  ): Promise<RefundRequest | null> {
    const pool = getDatabasePool();
    const client = await pool.connect();
    let transactionOpen = false;

    try {
      await client.query('BEGIN');
      transactionOpen = true;

      const refundId = uuidv4();
      const status: RefundStatus = 'pending';

      const refund: RefundRequest = {
        id: refundId,
        paymentId,
        userId,
        amount,
        reason,
        description,
        status,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          requestedAt: new Date().toISOString(),
          approvalRequired: this.APPROVAL_REQUIRED,
        },
      };

      // Insert into payment_refunds table
      await client.query(
        `
        INSERT INTO payment_refunds
        (id, payment_id, user_id, amount, reason, description, status, created_at, updated_at, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
        [
          refund.id,
          refund.paymentId,
          refund.userId,
          refund.amount,
          refund.reason,
          refund.description,
          refund.status,
          refund.createdAt,
          refund.updatedAt,
          JSON.stringify(refund.metadata || {}),
        ]
      );

      await client.query('COMMIT');
      transactionOpen = false;

      // Cache the refund request
      await this.cacheRefund(refund);

      Logger.info(`Created refund request ${refundId}`, {
        paymentId,
        userId,
        amount,
        reason,
        status,
      });

      return refund;
    } catch (error) {
      if (transactionOpen) {
        await client.query('ROLLBACK');
        transactionOpen = false;
      }
      Logger.error('Error creating refund request:', error);
      return null;
    } finally {
      if (transactionOpen) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          Logger.error(
            'Failed to rollback refund request transaction',
            rollbackError
          );
        }
      }
      client.release();
    }
  }

  // Approve refund request (admin action)
  async approveRefund(
    refundId: string,
    adminUserId: string,
    approvalNote?: string
  ): Promise<LocalRefundResult> {
    try {
      Logger.info(`Approving refund ${refundId} by admin ${adminUserId}`);

      const refund = await this.getRefundById(refundId);
      if (!refund) {
        return {
          success: false,
          error: 'Refund request not found',
        };
      }

      if (refund.status !== 'pending') {
        return {
          success: false,
          error: `Cannot approve refund with status: ${refund.status}`,
        };
      }

      // Update refund status
      const updatedRefund = await this.updateRefundStatus(
        refundId,
        'approved',
        {
          approvedBy: adminUserId,
          approvedAt: new Date().toISOString(),
          approvalNote,
        }
      );

      if (!updatedRefund) {
        return {
          success: false,
          error: 'Failed to update refund status',
        };
      }

      // Process the refund immediately
      const processResult = await this.processApprovedRefund(updatedRefund);

      // Update metrics
      this.metrics.approvedRefunds++;
      this.metrics.pendingApprovals = Math.max(
        0,
        this.metrics.pendingApprovals - 1
      );

      return processResult;
    } catch (error) {
      Logger.error(`Error approving refund ${refundId}:`, error);
      return {
        success: false,
        error: 'Failed to approve refund',
      };
    }
  }

  // Reject refund request (admin action)
  async rejectRefund(
    refundId: string,
    adminUserId: string,
    rejectionReason: string
  ): Promise<LocalRefundResult> {
    try {
      Logger.info(`Rejecting refund ${refundId} by admin ${adminUserId}`);

      const refund = await this.getRefundById(refundId);
      if (!refund) {
        return {
          success: false,
          error: 'Refund request not found',
        };
      }

      if (refund.status !== 'pending') {
        return {
          success: false,
          error: `Cannot reject refund with status: ${refund.status}`,
        };
      }

      // Update refund status
      const updatedRefund = await this.updateRefundStatus(
        refundId,
        'rejected',
        {
          rejectedBy: adminUserId,
          rejectedAt: new Date().toISOString(),
          rejectionReason,
        }
      );

      if (!updatedRefund) {
        return {
          success: false,
          error: 'Failed to update refund status',
        };
      }

      // Notify user of rejection
      await this.notifyUserOfRejection(updatedRefund, rejectionReason);

      // Update metrics
      this.metrics.rejectedRefunds++;
      this.metrics.pendingApprovals = Math.max(
        0,
        this.metrics.pendingApprovals - 1
      );

      return {
        success: true,
        refund: updatedRefund,
      };
    } catch (error) {
      Logger.error(`Error rejecting refund ${refundId}:`, error);
      return {
        success: false,
        error: 'Failed to reject refund',
      };
    }
  }

  // Process approved refund
  private async processApprovedRefund(
    refund: RefundRequest
  ): Promise<LocalRefundResult> {
    try {
      Logger.info(`Processing approved refund ${refund.id}`);

      const existingReversalId = await this.findRefundReversalTransaction(
        refund.id
      );
      if (existingReversalId) {
        const completedRefund = await this.updateRefundStatus(
          refund.id,
          'completed',
          {
            completedAt: new Date().toISOString(),
            creditTransactionId: existingReversalId,
            idempotentReplay: true,
          }
        );

        if (completedRefund) {
          await this.notifyUserOfCompletion(completedRefund);
          this.metrics.completedRefunds++;
          this.metrics.totalAmountRefunded += refund.amount;
        }

        return {
          success: true,
          refund: completedRefund!,
          transactionId: existingReversalId,
        };
      }

      // Update status to processing
      await this.updateRefundStatus(refund.id, 'processing');

      // Reverse credits from user balance
      const creditResult = await creditService.reverseCredits(
        refund.userId,
        refund.amount,
        `Refund for payment ${refund.paymentId}: ${refund.reason}`,
        {
          refundId: refund.id,
          paymentId: refund.paymentId,
          refundReason: refund.reason,
          processedAt: new Date().toISOString(),
        }
      );

      if (!creditResult.success) {
        // Mark refund as failed
        await this.updateRefundStatus(refund.id, 'failed', {
          failureReason: creditResult.error,
          failedAt: new Date().toISOString(),
        });

        return {
          success: false,
          error: `Credit reversal failed: ${creditResult.error}`,
        };
      }

      const providerRefund = await this.triggerProviderRefund({
        refundId: refund.id,
        paymentId: refund.paymentId,
        userId: refund.userId,
        amount: refund.amount,
        reason: refund.reason,
      });

      if (!providerRefund.success) {
        await creditService.refundCredits(
          refund.userId,
          refund.amount,
          `Refund reversal rollback for payment ${refund.paymentId}`,
          undefined,
          {
            refundId: refund.id,
            paymentId: refund.paymentId,
            rollbackReason: providerRefund.error,
          }
        );

        await this.updateRefundStatus(refund.id, 'failed', {
          failureReason: providerRefund.error,
          failedAt: new Date().toISOString(),
        });

        return {
          success: false,
          error: providerRefund.error || 'Provider refund failed',
        };
      }

      // Mark refund as completed
      const completedRefund = await this.updateRefundStatus(
        refund.id,
        'completed',
        {
          completedAt: new Date().toISOString(),
          creditTransactionId: creditResult.transaction!.id,
          providerRefundStatus: providerRefund.status,
          providerRefundTaskId: providerRefund.taskId,
        }
      );

      // Notify user of completion
      await this.notifyUserOfCompletion(completedRefund!);

      // Update metrics
      this.metrics.completedRefunds++;
      this.metrics.totalAmountRefunded += refund.amount;

      Logger.info(`Successfully completed refund ${refund.id}`, {
        userId: refund.userId,
        amount: refund.amount,
        transactionId: creditResult.transaction!.id,
      });

      return {
        success: true,
        refund: completedRefund!,
        transactionId: creditResult.transaction!.id,
      };
    } catch (error) {
      Logger.error(`Error processing refund ${refund.id}:`, error);

      // Mark refund as failed
      await this.updateRefundStatus(refund.id, 'failed', {
        failureReason:
          error instanceof Error ? error.message : 'Processing error',
        failedAt: new Date().toISOString(),
      });

      return {
        success: false,
        error: 'Refund processing failed',
      };
    }
  }

  // Update refund status
  private async updateRefundStatus(
    refundId: string,
    status: RefundStatus,
    metadata?: Record<string, any>
  ): Promise<RefundRequest | null> {
    const pool = getDatabasePool();

    try {
      const updates = {
        status,
        updated_at: new Date(),
      };

      let query = `
        UPDATE payment_refunds
        SET status = $1, updated_at = $2
      `;
      const params: (string | Date)[] = [status, updates.updated_at];

      if (metadata) {
        query += `, metadata = COALESCE(metadata, '{}')::jsonb || $3::jsonb`;
        params.push(JSON.stringify(metadata));
      }

      query += ` WHERE id = $${params.length + 1} RETURNING *`;
      params.push(refundId);

      const result = await pool.query(query, params);

      if (result.rows.length === 0) {
        return null;
      }

      const updatedRefund = this.mapRowToRefund(result.rows[0]);

      // Update cache
      await this.cacheRefund(updatedRefund);

      return updatedRefund;
    } catch (error) {
      Logger.error(`Error updating refund status for ${refundId}:`, error);
      return null;
    }
  }

  // Get refund by ID
  async getRefundById(refundId: string): Promise<RefundRequest | null> {
    try {
      // Try cache first
      const cacheKey = `${this.CACHE_PREFIX}${refundId}`;
      const cached = await redisClient.getClient().get(cacheKey);

      if (cached) {
        return JSON.parse(cached);
      }

      // Get from database
      const pool = getDatabasePool();
      const result = await pool.query(
        'SELECT * FROM payment_refunds WHERE id = $1',
        [refundId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const refund = this.mapRowToRefund(result.rows[0]);

      // Cache the result
      await this.cacheRefund(refund);

      return refund;
    } catch (error) {
      Logger.error(`Error getting refund ${refundId}:`, error);
      return null;
    }
  }

  // Get refund by payment ID
  async getRefundByPaymentId(paymentId: string): Promise<RefundRequest | null> {
    try {
      const pool = getDatabasePool();
      const result = await pool.query(
        'SELECT * FROM payment_refunds WHERE payment_id = $1 ORDER BY created_at DESC LIMIT 1',
        [paymentId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToRefund(result.rows[0]);
    } catch (error) {
      Logger.error(`Error getting refund for payment ${paymentId}:`, error);
      return null;
    }
  }

  // Get refunds for user
  async getUserRefunds(
    userId: string,
    limit = 20,
    offset = 0
  ): Promise<RefundRequest[]> {
    try {
      const pool = getDatabasePool();
      const result = await pool.query(
        `
        SELECT * FROM payment_refunds
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
      `,
        [userId, limit, offset]
      );

      return result.rows.map(row => this.mapRowToRefund(row));
    } catch (error) {
      Logger.error(`Error getting refunds for user ${userId}:`, error);
      return [];
    }
  }

  // Get pending refunds for admin dashboard
  async getPendingRefunds(limit = 50, offset = 0): Promise<RefundRequest[]> {
    try {
      const pool = getDatabasePool();
      const result = await pool.query(
        `
        SELECT * FROM payment_refunds
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT $1 OFFSET $2
      `,
        [limit, offset]
      );

      return result.rows.map(row => this.mapRowToRefund(row));
    } catch (error) {
      Logger.error('Error getting pending refunds:', error);
      return [];
    }
  }

  // Get all refunds for admin dashboard
  async getAllRefunds(
    status?: RefundStatus,
    limit = 50,
    offset = 0
  ): Promise<RefundRequest[]> {
    try {
      const pool = getDatabasePool();
      let query = 'SELECT * FROM payment_refunds';
      const params: any[] = [];

      if (status) {
        query += ' WHERE status = $1';
        params.push(status);
      }

      query +=
        ' ORDER BY created_at DESC LIMIT $' +
        (params.length + 1) +
        ' OFFSET $' +
        (params.length + 2);
      params.push(limit, offset);

      const result = await pool.query(query, params);
      return result.rows.map(row => this.mapRowToRefund(row));
    } catch (error) {
      Logger.error('Error getting all refunds:', error);
      return [];
    }
  }

  // Cache refund data
  private async cacheRefund(refund: RefundRequest): Promise<void> {
    try {
      const cacheKey = `${this.CACHE_PREFIX}${refund.id}`;
      await redisClient.getClient().setex(
        cacheKey,
        3600, // 1 hour TTL
        JSON.stringify(refund)
      );
    } catch (error) {
      Logger.error(`Error caching refund ${refund.id}:`, error);
    }
  }

  // Map database row to RefundRequest object
  private mapRowToRefund(row: any): RefundRequest {
    const result: RefundRequest = {
      id: row.id,
      paymentId: row.payment_id,
      userId: row.user_id,
      amount: parseFloat(row.amount),
      reason: row.reason,
      status: row.status,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      metadata: row.metadata || {},
    };

    if (row.description !== null && row.description !== undefined) {
      result.description = row.description;
    }

    if (row.approved_by !== null && row.approved_by !== undefined) {
      result.approvedBy = row.approved_by;
    }

    if (row.processed_at !== null && row.processed_at !== undefined) {
      result.processedAt = new Date(row.processed_at);
    }

    return result;
  }

  // Notify user of refund rejection
  private async notifyUserOfRejection(
    refund: RefundRequest,
    reason: string
  ): Promise<void> {
    try {
      const notification = {
        type: 'refund:rejected',
        data: {
          refundId: refund.id,
          paymentId: refund.paymentId,
          amount: refund.amount,
          reason,
          timestamp: new Date().toISOString(),
        },
      };

      const notificationKey = `notification:${refund.userId}:refund_rejected:${Date.now()}`;
      await redisClient
        .getClient()
        .setex(notificationKey, 3600, JSON.stringify(notification));
    } catch (error) {
      Logger.error(
        `Error notifying user of refund rejection ${refund.id}:`,
        error
      );
    }
  }

  // Notify user of refund completion
  private async notifyUserOfCompletion(refund: RefundRequest): Promise<void> {
    try {
      const notification = {
        type: 'refund:completed',
        data: {
          refundId: refund.id,
          paymentId: refund.paymentId,
          amount: refund.amount,
          timestamp: new Date().toISOString(),
        },
      };

      const notificationKey = `notification:${refund.userId}:refund_completed:${Date.now()}`;
      await redisClient
        .getClient()
        .setex(notificationKey, 3600, JSON.stringify(notification));
    } catch (error) {
      Logger.error(
        `Error notifying user of refund completion ${refund.id}:`,
        error
      );
    }
  }

  // Get refund metrics
  getMetrics(): RefundMetrics {
    return { ...this.metrics };
  }

  // Reset metrics
  resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      approvedRefunds: 0,
      rejectedRefunds: 0,
      completedRefunds: 0,
      totalAmountRefunded: 0,
      averageProcessingTime: 0,
      pendingApprovals: 0,
    };
  }

  // Manual refund processing (admin override)
  async manualRefund(
    userId: string,
    amount: number,
    reason: string,
    adminUserId: string,
    paymentId?: string
  ): Promise<LocalRefundResult> {
    try {
      Logger.info(`Manual refund initiated by admin ${adminUserId}`, {
        userId,
        amount,
        reason,
        paymentId,
      });

      // Reverse credits directly for manual refunds
      const result = await creditService.reverseCredits(
        userId,
        amount,
        `Manual refund by admin: ${reason}`,
        {
          manualRefund: true,
          adminUserId,
          reason,
          paymentId,
        }
      );

      if (result.success && paymentId) {
        const providerRefund = await this.triggerProviderRefund({
          refundId: `manual-${result.transaction?.id ?? 'unknown'}`,
          paymentId,
          userId,
          amount,
          reason: 'admin_decision',
        });

        if (!providerRefund.success) {
          await creditService.refundCredits(
            userId,
            amount,
            `Manual refund rollback for payment ${paymentId}`,
            undefined,
            {
              manualRefund: true,
              adminUserId,
              reason,
              paymentId,
              rollbackReason: providerRefund.error,
            }
          );

          return {
            success: false,
            error: providerRefund.error || 'Provider refund failed',
          };
        }
      }

      if (result.success) {
        this.metrics.completedRefunds++;
        this.metrics.totalAmountRefunded += amount;
      }

      return {
        success: result.success,
        transactionId: result.transaction?.id,
        error: result.error,
      };
    } catch (error) {
      Logger.error('Error in manual refund:', error);
      return {
        success: false,
        error: 'Manual refund failed',
      };
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
      Logger.error('Refund service health check failed:', error);
      return false;
    }
  }

  // Cleanup old refund records
  async cleanupOldRefunds(): Promise<number> {
    try {
      const cutoffDate = new Date(Date.now() - 86400000 * 90); // 90 days
      const pool = getDatabasePool();

      const result = await pool.query(
        `
        DELETE FROM payment_refunds
        WHERE created_at < $1
        AND status IN ('completed', 'rejected', 'failed')
        RETURNING id
      `,
        [cutoffDate]
      );

      Logger.info(`Cleaned up ${result.rows.length} old refund records`);
      return result.rows.length;
    } catch (error) {
      Logger.error('Error cleaning up old refunds:', error);
      return 0;
    }
  }

  // Get refund statistics
  async getRefundStatistics(days = 30): Promise<{
    totalRequests: number;
    approvalRate: number;
    averageAmount: number;
    totalRefunded: number;
    statusBreakdown: Record<RefundStatus, number>;
  }> {
    try {
      const cutoffDate = new Date(Date.now() - 86400000 * days);
      const pool = getDatabasePool();

      const result = await pool.query(
        `
        SELECT
          COUNT(*) as total_requests,
          AVG(amount) as average_amount,
          SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as total_refunded,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
          SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_count,
          SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing_count,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
          SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected_count
        FROM payment_refunds
        WHERE created_at >= $1
      `,
        [cutoffDate]
      );

      const row = result.rows[0];
      const totalRequests = parseInt(row.total_requests);
      const completedCount = parseInt(row.completed_count);

      return {
        totalRequests,
        approvalRate:
          totalRequests > 0 ? (completedCount / totalRequests) * 100 : 0,
        averageAmount: parseFloat(row.average_amount) || 0,
        totalRefunded: parseFloat(row.total_refunded) || 0,
        statusBreakdown: {
          pending: parseInt(row.pending_count),
          approved: parseInt(row.approved_count),
          processing: parseInt(row.processing_count),
          completed: parseInt(row.completed_count),
          failed: parseInt(row.failed_count),
          rejected: parseInt(row.rejected_count),
        },
      };
    } catch (error) {
      Logger.error('Error getting refund statistics:', error);
      return {
        totalRequests: 0,
        approvalRate: 0,
        averageAmount: 0,
        totalRefunded: 0,
        statusBreakdown: {
          pending: 0,
          approved: 0,
          processing: 0,
          completed: 0,
          failed: 0,
          rejected: 0,
        },
      };
    }
  }
}

// Export singleton instance
export const refundService = new RefundService();
