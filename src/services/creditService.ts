import { v4 as uuidv4 } from 'uuid';
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

  // Get user balance with Redis caching
  async getUserBalance(userId: string): Promise<CreditBalance | null> {
    try {
      // Try cache first
      const cacheKey = `${this.CACHE_PREFIX}balance:${userId}`;
      const cached = await redisClient.getClient().get(cacheKey);

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
      await redisClient
        .getClient()
        .setex(cacheKey, this.BALANCE_CACHE_TTL, JSON.stringify(balance));

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
    metadata?: Record<string, any>
  ): Promise<CreditOperationResult> {
    const pool = getDatabasePool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Validate amount
      if (amount <= 0 || amount > this.defaultSettings.maxTransactionAmount) {
        return {
          success: false,
          error: `Invalid amount. Must be between 0 and ${this.defaultSettings.maxTransactionAmount}`,
        };
      }

      // Get current balance
      const currentBalance = await this.getUserBalance(userId);
      const balanceBefore = currentBalance?.totalBalance || 0;

      // Check max balance limit
      const balanceAfter = balanceBefore + amount;
      if (balanceAfter > this.defaultSettings.maxBalance) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: `Transaction would exceed maximum balance limit of ${this.defaultSettings.maxBalance}`,
        };
      }

      // Create transaction record
      const transactionId = uuidv4();
      const transaction: Partial<CreditTransaction> = {
        id: transactionId,
        userId,
        type,
        amount,
        balanceBefore,
        balanceAfter,
        description,
        metadata: metadata || {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await client.query(
        `INSERT INTO credit_transactions
         (id, user_id, type, amount, balance_before, balance_after, description, metadata, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
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
        ]
      );

      await client.query('COMMIT');

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
      await client.query('ROLLBACK');
      Logger.error('Error adding credits:', error);
      return {
        success: false,
        error: 'Failed to add credits',
      };
    } finally {
      client.release();
    }
  }

  // Spend credits (purchase or withdrawal)
  async spendCredits(
    userId: string,
    amount: number,
    description: string,
    metadata?: Record<string, any>
  ): Promise<CreditOperationResult> {
    const pool = getDatabasePool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Validate amount
      if (amount <= 0 || amount > this.defaultSettings.maxTransactionAmount) {
        return {
          success: false,
          error: `Invalid amount. Must be between 0 and ${this.defaultSettings.maxTransactionAmount}`,
        };
      }

      // Get current balance
      const currentBalance = await this.getUserBalance(userId);
      const balanceBefore = currentBalance?.totalBalance || 0;

      // Check sufficient balance
      const balanceAfter = balanceBefore - amount;
      if (
        !this.defaultSettings.allowNegativeBalance &&
        balanceAfter < this.defaultSettings.minBalance
      ) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: 'Insufficient balance',
        };
      }

      // Create transaction record
      const transactionId = uuidv4();
      const transaction: Partial<CreditTransaction> = {
        id: transactionId,
        userId,
        type: 'purchase',
        amount,
        balanceBefore,
        balanceAfter,
        description,
        metadata: metadata || {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await client.query(
        `INSERT INTO credit_transactions
         (id, user_id, type, amount, balance_before, balance_after, description, metadata, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          transaction.id,
          transaction.userId,
          transaction.type,
          -amount, // Store as negative for spending
          transaction.balanceBefore,
          transaction.balanceAfter,
          transaction.description,
          JSON.stringify(transaction.metadata || {}),
          transaction.createdAt,
          transaction.updatedAt,
        ]
      );

      await client.query('COMMIT');

      // Clear cache
      await this.clearBalanceCache(userId);

      // Get updated balance
      const updatedBalance = await this.getUserBalance(userId);

      Logger.info(`Spent ${amount} credits for user ${userId}`, {
        transactionId,
        balanceBefore,
        balanceAfter,
      });

      return {
        success: true,
        transaction: transaction as CreditTransaction,
        balance: updatedBalance!,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      Logger.error('Error spending credits:', error);
      return {
        success: false,
        error: 'Failed to spend credits',
      };
    } finally {
      client.release();
    }
  }

  // Refund credits
  async refundCredits(
    userId: string,
    amount: number,
    description: string,
    originalTransactionId?: string,
    metadata?: Record<string, any>
  ): Promise<CreditOperationResult> {
    const pool = getDatabasePool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Validate amount
      if (amount <= 0 || amount > this.defaultSettings.maxTransactionAmount) {
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
          return {
            success: false,
            error: 'Original transaction not found',
          };
        }
      }

      // Get current balance
      const currentBalance = await this.getUserBalance(userId);
      const balanceBefore = currentBalance?.totalBalance || 0;
      const balanceAfter = balanceBefore + amount;

      // Check max balance limit
      if (balanceAfter > this.defaultSettings.maxBalance) {
        await client.query('ROLLBACK');
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

      await client.query(
        `INSERT INTO credit_transactions
         (id, user_id, type, amount, balance_before, balance_after, description, metadata, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
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
        ]
      );

      await client.query('COMMIT');

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
      await client.query('ROLLBACK');
      Logger.error('Error refunding credits:', error);
      return {
        success: false,
        error: 'Failed to refund credits',
      };
    } finally {
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
               description, metadata, created_at, updated_at
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
               description, metadata, created_at, updated_at
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
