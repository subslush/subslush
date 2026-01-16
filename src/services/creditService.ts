import { v4 as uuidv4 } from 'uuid';
import type { PoolClient } from 'pg';
import { getDatabasePool } from '../config/database';
import { redisClient } from '../config/redis';
import {
  CreditTransaction,
  CreditBalance,
  CreditBalanceSummary,
  CreditOperationResult,
  CreditTransactionQuery,
  CreditSettings,
} from '../types/credit';
import { Logger } from '../utils/logger';

export class CreditService {
  private readonly CACHE_PREFIX = 'credit:';
  private readonly BALANCE_CACHE_TTL = 300; // 5 minutes
  // private readonly TRANSACTION_CACHE_TTL = 3600; // 1 hour

  private readonly defaultSettings: CreditSettings = {
    minBalance: 0,
    maxBalance: 100000,
    maxTransactionAmount: 10000,
    allowNegativeBalance: false,
  };

  private normalizeCurrency(currency?: string): string | null {
    if (!currency) return null;
    return currency.toLowerCase();
  }

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

  // Get user balance with Redis caching
  async getUserBalance(userId: string): Promise<CreditBalance | null> {
    try {
      // Try cache first
      const cacheKey = `${this.CACHE_PREFIX}balance:${userId}`;
      let cached: string | null = null;
      if (redisClient.isConnected()) {
        try {
          cached = await redisClient.getClient().get(cacheKey);
        } catch (error) {
          Logger.warn('Failed to read credit balance cache', { userId, error });
        }
      }

      if (cached) {
        return JSON.parse(cached);
      }

      // Calculate from database
      const pool = getDatabasePool();
      const result = await pool.query(
        `SELECT
           COALESCE(SUM(amount), 0) as total_balance
         FROM credit_transactions
         WHERE user_id = $1`,
        [userId]
      );

      const totalBalance = parseFloat(result.rows[0]?.total_balance || '0');
      const balance: CreditBalance = {
        userId,
        totalBalance,
        availableBalance: totalBalance, // For now, all balance is available
        pendingBalance: 0,
        lastUpdated: new Date(),
      };

      // Cache the result
      if (redisClient.isConnected()) {
        try {
          await redisClient
            .getClient()
            .setex(cacheKey, this.BALANCE_CACHE_TTL, JSON.stringify(balance));
        } catch (error) {
          Logger.warn('Failed to write credit balance cache', {
            userId,
            error,
          });
        }
      }

      return balance;
    } catch (error) {
      Logger.error('Error getting user balance:', error);
      throw error;
    }
  }

  // Get balance summary with recent transactions
  async getBalanceSummary(
    userId: string,
    limit = 5
  ): Promise<CreditBalanceSummary> {
    try {
      const [balance, recentTransactions, transactionCount] = await Promise.all(
        [
          this.getUserBalance(userId),
          this.getTransactionHistory({
            userId,
            limit,
            offset: 0,
          }),
          this.getTransactionCount(userId),
        ]
      );

      if (!balance) {
        throw new Error('User balance not found');
      }

      return {
        totalBalance: balance.totalBalance,
        availableBalance: balance.availableBalance,
        pendingBalance: balance.pendingBalance,
        recentTransactions,
        transactionCount,
      };
    } catch (error) {
      Logger.error('Error getting balance summary:', error);
      throw error;
    }
  }

  // Add credits (deposit or bonus)
  async addCredits(
    userId: string,
    amount: number,
    type: 'deposit' | 'bonus',
    description: string,
    metadata?: Record<string, any>,
    context?: {
      orderId?: string;
      productVariantId?: string;
      priceCents?: number;
      basePriceCents?: number;
      discountPercent?: number;
      termMonths?: number;
      currency?: string;
      autoRenew?: boolean;
      nextBillingAt?: Date;
      renewalMethod?: string;
      statusReason?: string;
      referralRewardId?: string;
      preLaunchRewardId?: string;
    }
  ): Promise<CreditOperationResult> {
    const pool = getDatabasePool();
    const client = await pool.connect();
    let transactionOpen = false;

    try {
      await client.query('BEGIN');
      transactionOpen = true;
      await this.lockUserCredits(client, userId);

      // Validate amount
      if (amount <= 0 || amount > this.defaultSettings.maxTransactionAmount) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return {
          success: false,
          error: `Invalid amount. Must be between 0 and ${this.defaultSettings.maxTransactionAmount}`,
        };
      }

      // Get current balance
      const balanceBefore = await this.getBalanceForUpdate(client, userId);

      // Check max balance limit
      const balanceAfter = balanceBefore + amount;
      if (balanceAfter > this.defaultSettings.maxBalance) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return {
          success: false,
          error: `Transaction would exceed maximum balance limit of ${this.defaultSettings.maxBalance}`,
        };
      }

      // Create transaction record
      const transactionId = uuidv4();
      const resolvedMetadata = { ...(metadata || {}) };
      if (context?.basePriceCents !== undefined) {
        resolvedMetadata['base_price_cents'] = context.basePriceCents;
      }
      if (context?.discountPercent !== undefined) {
        resolvedMetadata['discount_percent'] = context.discountPercent;
      }
      if (context?.termMonths !== undefined) {
        resolvedMetadata['term_months'] = context.termMonths;
      }

      const transaction: Partial<CreditTransaction> = {
        id: transactionId,
        userId,
        type,
        amount,
        balanceBefore,
        balanceAfter,
        description,
        metadata: resolvedMetadata,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      if (context?.orderId !== undefined) {
        transaction.orderId = context.orderId;
      }
      if (context?.productVariantId !== undefined) {
        transaction.productVariantId = context.productVariantId;
      }
      if (context?.priceCents !== undefined) {
        transaction.priceCents = context.priceCents;
      }

      const normalizedCurrency = this.normalizeCurrency(context?.currency);
      if (normalizedCurrency) {
        transaction.currency = normalizedCurrency;
      }

      if (context?.autoRenew !== undefined) {
        transaction.autoRenew = context.autoRenew;
      }
      if (context?.nextBillingAt !== undefined) {
        transaction.nextBillingAt = context.nextBillingAt;
      }
      if (context?.renewalMethod !== undefined) {
        transaction.renewalMethod = context.renewalMethod;
      }
      if (context?.statusReason !== undefined) {
        transaction.statusReason = context.statusReason;
      }
      if (context?.referralRewardId !== undefined) {
        transaction.referralRewardId = context.referralRewardId;
      }
      if (context?.preLaunchRewardId !== undefined) {
        transaction.preLaunchRewardId = context.preLaunchRewardId;
      }

      await client.query(
        `INSERT INTO credit_transactions
         (id, user_id, type, amount, balance_before, balance_after, description, metadata,
          created_at, updated_at, order_id, product_variant_id, price_cents, currency,
          auto_renew, next_billing_at, renewal_method, status_reason,
          referral_reward_id, pre_launch_reward_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                 $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
        [
          transaction.id,
          transaction.userId,
          transaction.type,
          transaction.amount,
          transaction.balanceBefore,
          transaction.balanceAfter,
          transaction.description,
          JSON.stringify(transaction.metadata || {}),
          transaction.createdAt,
          transaction.updatedAt,
          context?.orderId || null,
          context?.productVariantId || null,
          context?.priceCents ?? null,
          this.normalizeCurrency(context?.currency),
          context?.autoRenew ?? null,
          context?.nextBillingAt || null,
          context?.renewalMethod || null,
          context?.statusReason || null,
          context?.referralRewardId || null,
          context?.preLaunchRewardId || null,
        ]
      );

      await client.query('COMMIT');
      transactionOpen = false;

      // Clear cache
      await this.clearBalanceCache(userId);

      // Get updated balance
      const updatedBalance = await this.getUserBalance(userId);

      Logger.info(`Added ${amount} credits to user ${userId}`, {
        transactionId,
        type,
        balanceBefore,
        balanceAfter,
      });

      return {
        success: true,
        transaction: transaction as CreditTransaction,
        balance: updatedBalance!,
      };
    } catch (error) {
      if (transactionOpen) {
        await client.query('ROLLBACK');
        transactionOpen = false;
      }
      Logger.error('Error adding credits:', error);
      return {
        success: false,
        error: 'Failed to add credits',
      };
    } finally {
      if (transactionOpen) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          Logger.error(
            'Failed to rollback credit add transaction',
            rollbackError
          );
        }
      }
      client.release();
    }
  }

  // Spend credits (purchase or withdrawal)
  async spendCredits(
    userId: string,
    amount: number,
    description: string,
    metadata?: Record<string, any>,
    context?: {
      orderId?: string;
      productVariantId?: string;
      priceCents?: number;
      basePriceCents?: number;
      discountPercent?: number;
      termMonths?: number;
      currency?: string;
      autoRenew?: boolean;
      nextBillingAt?: Date;
      renewalMethod?: string;
      statusReason?: string;
      referralRewardId?: string;
      preLaunchRewardId?: string;
    }
  ): Promise<CreditOperationResult> {
    return this.applyDebitTransaction(
      userId,
      amount,
      'purchase',
      description,
      metadata,
      context
    );
  }

  // Reverse credits (used for refunds/chargebacks)
  async reverseCredits(
    userId: string,
    amount: number,
    description: string,
    metadata?: Record<string, any>,
    context?: {
      orderId?: string;
      productVariantId?: string;
      priceCents?: number;
      basePriceCents?: number;
      discountPercent?: number;
      termMonths?: number;
      currency?: string;
      autoRenew?: boolean;
      nextBillingAt?: Date;
      renewalMethod?: string;
      statusReason?: string;
      referralRewardId?: string;
      preLaunchRewardId?: string;
    }
  ): Promise<CreditOperationResult> {
    return this.applyDebitTransaction(
      userId,
      amount,
      'refund_reversal',
      description,
      metadata,
      context
    );
  }

  private async applyDebitTransaction(
    userId: string,
    amount: number,
    type: 'purchase' | 'withdrawal' | 'refund_reversal',
    description: string,
    metadata?: Record<string, any>,
    context?: {
      orderId?: string;
      productVariantId?: string;
      priceCents?: number;
      basePriceCents?: number;
      discountPercent?: number;
      termMonths?: number;
      currency?: string;
      autoRenew?: boolean;
      nextBillingAt?: Date;
      renewalMethod?: string;
      statusReason?: string;
      referralRewardId?: string;
      preLaunchRewardId?: string;
    }
  ): Promise<CreditOperationResult> {
    const pool = getDatabasePool();
    const client = await pool.connect();
    let transactionOpen = false;

    try {
      await client.query('BEGIN');
      transactionOpen = true;
      await this.lockUserCredits(client, userId);

      const normalizedAmount = Math.abs(amount);

      // Validate amount
      if (
        normalizedAmount <= 0 ||
        normalizedAmount > this.defaultSettings.maxTransactionAmount
      ) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return {
          success: false,
          error: `Invalid amount. Must be between 0 and ${this.defaultSettings.maxTransactionAmount}`,
        };
      }

      // Get current balance
      const balanceBefore = await this.getBalanceForUpdate(client, userId);

      // Check sufficient balance
      const balanceAfter = balanceBefore - normalizedAmount;
      if (
        !this.defaultSettings.allowNegativeBalance &&
        balanceAfter < this.defaultSettings.minBalance
      ) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return {
          success: false,
          error: 'Insufficient balance',
        };
      }

      // Create transaction record
      const transactionId = uuidv4();
      const resolvedMetadata = { ...(metadata || {}) };
      if (context?.basePriceCents !== undefined) {
        resolvedMetadata['base_price_cents'] = context.basePriceCents;
      }
      if (context?.discountPercent !== undefined) {
        resolvedMetadata['discount_percent'] = context.discountPercent;
      }
      if (context?.termMonths !== undefined) {
        resolvedMetadata['term_months'] = context.termMonths;
      }

      const transaction: Partial<CreditTransaction> = {
        id: transactionId,
        userId,
        type,
        amount: normalizedAmount,
        balanceBefore,
        balanceAfter,
        description,
        metadata: resolvedMetadata,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      if (context?.orderId !== undefined) {
        transaction.orderId = context.orderId;
      }
      if (context?.productVariantId !== undefined) {
        transaction.productVariantId = context.productVariantId;
      }
      if (context?.priceCents !== undefined) {
        transaction.priceCents = context.priceCents;
      }

      const normalizedCurrency = this.normalizeCurrency(context?.currency);
      if (normalizedCurrency) {
        transaction.currency = normalizedCurrency;
      }

      if (context?.autoRenew !== undefined) {
        transaction.autoRenew = context.autoRenew;
      }
      if (context?.nextBillingAt !== undefined) {
        transaction.nextBillingAt = context.nextBillingAt;
      }
      if (context?.renewalMethod !== undefined) {
        transaction.renewalMethod = context.renewalMethod;
      }
      if (context?.statusReason !== undefined) {
        transaction.statusReason = context.statusReason;
      }
      if (context?.referralRewardId !== undefined) {
        transaction.referralRewardId = context.referralRewardId;
      }
      if (context?.preLaunchRewardId !== undefined) {
        transaction.preLaunchRewardId = context.preLaunchRewardId;
      }

      await client.query(
        `INSERT INTO credit_transactions
         (id, user_id, type, amount, balance_before, balance_after, description, metadata,
          created_at, updated_at, order_id, product_variant_id, price_cents, currency,
          auto_renew, next_billing_at, renewal_method, status_reason,
          referral_reward_id, pre_launch_reward_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                 $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
        [
          transaction.id,
          transaction.userId,
          transaction.type,
          -normalizedAmount, // Store as negative for spending
          transaction.balanceBefore,
          transaction.balanceAfter,
          transaction.description,
          JSON.stringify(transaction.metadata || {}),
          transaction.createdAt,
          transaction.updatedAt,
          context?.orderId || null,
          context?.productVariantId || null,
          context?.priceCents ?? null,
          this.normalizeCurrency(context?.currency),
          context?.autoRenew ?? null,
          context?.nextBillingAt || null,
          context?.renewalMethod || null,
          context?.statusReason || null,
          context?.referralRewardId || null,
          context?.preLaunchRewardId || null,
        ]
      );

      await client.query('COMMIT');
      transactionOpen = false;

      // Clear cache
      await this.clearBalanceCache(userId);

      // Get updated balance
      let updatedBalance: CreditBalance | null = null;
      try {
        updatedBalance = await this.getUserBalance(userId);
      } catch (error) {
        Logger.warn('Failed to refresh balance after debit', { userId, error });
        updatedBalance = {
          userId,
          totalBalance: balanceAfter,
          availableBalance: balanceAfter,
          pendingBalance: 0,
          lastUpdated: new Date(),
        };
      }

      Logger.info(`Debited ${normalizedAmount} credits for user ${userId}`, {
        transactionId,
        type,
        balanceBefore,
        balanceAfter,
      });

      return {
        success: true,
        transaction: transaction as CreditTransaction,
        balance: updatedBalance!,
      };
    } catch (error) {
      if (transactionOpen) {
        await client.query('ROLLBACK');
        transactionOpen = false;
      }
      Logger.error('Error debiting credits:', error);
      return {
        success: false,
        error: 'Failed to debit credits',
      };
    } finally {
      if (transactionOpen) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          Logger.error(
            'Failed to rollback credit debit transaction',
            rollbackError
          );
        }
      }
      client.release();
    }
  }

  // Refund credits
  async refundCredits(
    userId: string,
    amount: number,
    description: string,
    originalTransactionId?: string,
    metadata?: Record<string, any>,
    context?: {
      orderId?: string;
      productVariantId?: string;
      priceCents?: number;
      basePriceCents?: number;
      discountPercent?: number;
      termMonths?: number;
      currency?: string;
      autoRenew?: boolean;
      nextBillingAt?: Date;
      renewalMethod?: string;
      statusReason?: string;
      referralRewardId?: string;
      preLaunchRewardId?: string;
    }
  ): Promise<CreditOperationResult> {
    const pool = getDatabasePool();
    const client = await pool.connect();
    let transactionOpen = false;

    try {
      await client.query('BEGIN');
      transactionOpen = true;
      await this.lockUserCredits(client, userId);

      // Validate amount
      if (amount <= 0 || amount > this.defaultSettings.maxTransactionAmount) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return {
          success: false,
          error: `Invalid amount. Must be between 0 and ${this.defaultSettings.maxTransactionAmount}`,
        };
      }

      // Verify original transaction if provided
      if (originalTransactionId) {
        const originalTxResult = await client.query(
          'SELECT id, user_id, amount FROM credit_transactions WHERE id = $1 AND user_id = $2',
          [originalTransactionId, userId]
        );

        if (originalTxResult.rows.length === 0) {
          await client.query('ROLLBACK');
          transactionOpen = false;
          return {
            success: false,
            error: 'Original transaction not found',
          };
        }
      }

      // Get current balance
      const balanceBefore = await this.getBalanceForUpdate(client, userId);
      const balanceAfter = balanceBefore + amount;

      // Check max balance limit
      if (balanceAfter > this.defaultSettings.maxBalance) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return {
          success: false,
          error: `Refund would exceed maximum balance limit of ${this.defaultSettings.maxBalance}`,
        };
      }

      // Create refund transaction
      const transactionId = uuidv4();
      const transaction: Partial<CreditTransaction> = {
        id: transactionId,
        userId,
        type: 'refund',
        amount,
        balanceBefore,
        balanceAfter,
        description,
        metadata: {
          ...(metadata || {}),
          ...(originalTransactionId && { originalTransactionId }),
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      if (context?.orderId !== undefined) {
        transaction.orderId = context.orderId;
      }
      if (context?.productVariantId !== undefined) {
        transaction.productVariantId = context.productVariantId;
      }
      if (context?.priceCents !== undefined) {
        transaction.priceCents = context.priceCents;
      }

      const normalizedCurrency = this.normalizeCurrency(context?.currency);
      if (normalizedCurrency) {
        transaction.currency = normalizedCurrency;
      }

      if (context?.autoRenew !== undefined) {
        transaction.autoRenew = context.autoRenew;
      }
      if (context?.nextBillingAt !== undefined) {
        transaction.nextBillingAt = context.nextBillingAt;
      }
      if (context?.renewalMethod !== undefined) {
        transaction.renewalMethod = context.renewalMethod;
      }
      if (context?.statusReason !== undefined) {
        transaction.statusReason = context.statusReason;
      }
      if (context?.referralRewardId !== undefined) {
        transaction.referralRewardId = context.referralRewardId;
      }
      if (context?.preLaunchRewardId !== undefined) {
        transaction.preLaunchRewardId = context.preLaunchRewardId;
      }

      await client.query(
        `INSERT INTO credit_transactions
         (id, user_id, type, amount, balance_before, balance_after, description, metadata,
          created_at, updated_at, order_id, product_variant_id, price_cents, currency,
          auto_renew, next_billing_at, renewal_method, status_reason,
          referral_reward_id, pre_launch_reward_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                 $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
        [
          transaction.id,
          transaction.userId,
          transaction.type,
          transaction.amount,
          transaction.balanceBefore,
          transaction.balanceAfter,
          transaction.description,
          JSON.stringify(transaction.metadata || {}),
          transaction.createdAt,
          transaction.updatedAt,
          context?.orderId || null,
          context?.productVariantId || null,
          context?.priceCents ?? null,
          this.normalizeCurrency(context?.currency),
          context?.autoRenew ?? null,
          context?.nextBillingAt || null,
          context?.renewalMethod || null,
          context?.statusReason || null,
          context?.referralRewardId || null,
          context?.preLaunchRewardId || null,
        ]
      );

      await client.query('COMMIT');
      transactionOpen = false;

      // Clear cache
      await this.clearBalanceCache(userId);

      // Get updated balance
      const updatedBalance = await this.getUserBalance(userId);

      Logger.info(`Refunded ${amount} credits to user ${userId}`, {
        transactionId,
        originalTransactionId,
        balanceBefore,
        balanceAfter,
      });

      return {
        success: true,
        transaction: transaction as CreditTransaction,
        balance: updatedBalance!,
      };
    } catch (error) {
      if (transactionOpen) {
        await client.query('ROLLBACK');
        transactionOpen = false;
      }
      Logger.error('Error refunding credits:', error);
      return {
        success: false,
        error: 'Failed to refund credits',
      };
    } finally {
      if (transactionOpen) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          Logger.error(
            'Failed to rollback credit refund transaction',
            rollbackError
          );
        }
      }
      client.release();
    }
  }

  // Get transaction history
  async getTransactionHistory(
    query: CreditTransactionQuery
  ): Promise<CreditTransaction[]> {
    try {
      const pool = getDatabasePool();
      let sql = `
        SELECT id, user_id, type, amount, balance_before, balance_after,
               description, metadata, created_at, updated_at,
               payment_id, payment_status, payment_provider, payment_currency, payment_amount
        FROM credit_transactions
        WHERE user_id = $1
      `;
      const params: any[] = [query.userId];
      let paramIndex = 2;

      // Add optional filters
      if (query.type) {
        sql += ` AND type = $${paramIndex}`;
        params.push(query.type);
        paramIndex++;
      }

      if (query.startDate) {
        sql += ` AND created_at >= $${paramIndex}`;
        params.push(query.startDate);
        paramIndex++;
      }

      if (query.endDate) {
        sql += ` AND created_at <= $${paramIndex}`;
        params.push(query.endDate);
        paramIndex++;
      }

      // Add ordering and pagination
      sql += ` ORDER BY created_at DESC`;

      if (query.limit) {
        sql += ` LIMIT $${paramIndex}`;
        params.push(query.limit);
        paramIndex++;
      }

      if (query.offset) {
        sql += ` OFFSET $${paramIndex}`;
        params.push(query.offset);
        paramIndex++;
      }

      const result = await pool.query(sql, params);

      return result.rows.map(row => ({
        id: row.id,
        userId: row.user_id,
        type: row.type,
        amount: Math.abs(parseFloat(row.amount)), // Always return positive amount
        balanceBefore: parseFloat(row.balance_before),
        balanceAfter: parseFloat(row.balance_after),
        description: row.description,
        metadata: row.metadata || {},
        paymentId: row.payment_id || null,
        paymentStatus: row.payment_status || null,
        paymentProvider: row.payment_provider || null,
        paymentCurrency: row.payment_currency || null,
        paymentAmount:
          row.payment_amount !== null && row.payment_amount !== undefined
            ? parseFloat(row.payment_amount)
            : null,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      }));
    } catch (error) {
      Logger.error('Error getting transaction history:', error);
      throw error;
    }
  }

  // Get transaction count
  async getTransactionCount(userId: string, type?: string): Promise<number> {
    try {
      const pool = getDatabasePool();
      let sql =
        'SELECT COUNT(*) as count FROM credit_transactions WHERE user_id = $1';
      const params: any[] = [userId];

      if (type) {
        sql += ' AND type = $2';
        params.push(type);
      }

      const result = await pool.query(sql, params);
      return parseInt(result.rows[0]?.count || '0');
    } catch (error) {
      Logger.error('Error getting transaction count:', error);
      throw error;
    }
  }

  // Get specific transaction
  async getTransaction(
    transactionId: string,
    userId?: string
  ): Promise<CreditTransaction | null> {
    try {
      const pool = getDatabasePool();
      let sql = `
        SELECT id, user_id, type, amount, balance_before, balance_after,
               description, metadata, created_at, updated_at,
               payment_id, payment_status, payment_provider, payment_currency, payment_amount
        FROM credit_transactions
        WHERE id = $1
      `;
      const params: any[] = [transactionId];

      if (userId) {
        sql += ' AND user_id = $2';
        params.push(userId);
      }

      const result = await pool.query(sql, params);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        userId: row.user_id,
        type: row.type,
        amount: Math.abs(parseFloat(row.amount)),
        balanceBefore: parseFloat(row.balance_before),
        balanceAfter: parseFloat(row.balance_after),
        description: row.description,
        metadata: row.metadata || {},
        paymentId: row.payment_id || null,
        paymentStatus: row.payment_status || null,
        paymentProvider: row.payment_provider || null,
        paymentCurrency: row.payment_currency || null,
        paymentAmount:
          row.payment_amount !== null && row.payment_amount !== undefined
            ? parseFloat(row.payment_amount)
            : null,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      };
    } catch (error) {
      Logger.error('Error getting transaction:', error);
      throw error;
    }
  }

  // Admin: Get all user balances (paginated)
  async getAllUserBalances(limit = 50, offset = 0): Promise<CreditBalance[]> {
    try {
      const pool = getDatabasePool();
      const result = await pool.query(
        `SELECT
           user_id,
           COALESCE(SUM(amount), 0) as total_balance,
           MAX(created_at) as last_updated
         FROM credit_transactions
         GROUP BY user_id
         ORDER BY total_balance DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      return result.rows.map(row => ({
        userId: row.user_id,
        totalBalance: parseFloat(row.total_balance),
        availableBalance: parseFloat(row.total_balance),
        pendingBalance: 0,
        lastUpdated: new Date(row.last_updated),
      }));
    } catch (error) {
      Logger.error('Error getting all user balances:', error);
      throw error;
    }
  }

  // Clear balance cache
  private async clearBalanceCache(userId: string): Promise<void> {
    try {
      const cacheKey = `${this.CACHE_PREFIX}balance:${userId}`;
      await redisClient.getClient().del(cacheKey);
    } catch (error) {
      Logger.error('Error clearing balance cache:', error);
      // Don't throw - cache clearing is not critical
    }
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      const pool = getDatabasePool();
      await pool.query('SELECT 1');

      if (redisClient.isConnected()) {
        await redisClient.getClient().ping();
      }

      return true;
    } catch (error) {
      Logger.error('Credit service health check failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const creditService = new CreditService();
