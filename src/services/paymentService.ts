import { v4 as uuidv4 } from 'uuid';
import { getDatabasePool } from '../config/database';
import { redisClient } from '../config/redis';
import { env } from '../config/environment';
import { creditService } from './creditService';
import { nowpaymentsClient } from '../utils/nowpaymentsClient';
import { Logger } from '../utils/logger';
import {
  Payment,
  CreatePaymentRequest,
  PaymentStatusResponse,
  PaymentHistoryQuery,
  PaymentHistoryItem,
  PaymentOperationResult,
  WebhookPayload,
  CurrencyInfo,
  NOWPaymentsCreatePaymentRequest,
} from '../types/payment';

export class PaymentService {
  private readonly CACHE_PREFIX = 'payment:';
  private readonly PAYMENT_CACHE_TTL = 300; // 5 minutes
  private readonly STATUS_CACHE_TTL = 60; // 1 minute for status updates

  // Create a new payment invoice
  async createPayment(
    userId: string,
    request: CreatePaymentRequest
  ): Promise<PaymentOperationResult> {
    const pool = getDatabasePool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Validate credit amount
      if (request.creditAmount <= 0 || request.creditAmount > 10000) {
        return {
          success: false,
          error: 'Credit amount must be between 1 and 10,000',
        };
      }

      // Default to BTC if no currency specified
      const currency = request.currency?.toLowerCase() || 'btc';

      // Check if currency is supported
      const isSupported = await nowpaymentsClient.isCurrencySupported(currency);
      if (!isSupported) {
        return {
          success: false,
          error: `Currency ${currency.toUpperCase()} is not supported`,
        };
      }

      // Generate unique payment ID and order ID
      const paymentId = uuidv4();
      const orderId = `credit-${paymentId}`;

      // Get estimate for cryptocurrency amount
      try {
        await nowpaymentsClient.getEstimate({
          amount: request.creditAmount,
          currency_from: 'usd',
          currency_to: currency,
        });
      } catch (error) {
        Logger.error('Error getting payment estimate:', error);
        return {
          success: false,
          error: 'Unable to calculate payment amount',
        };
      }

      // Create NOWPayments direct payment
      const paymentRequest: NOWPaymentsCreatePaymentRequest = {
        price_amount: request.creditAmount,
        price_currency: 'usd',
        pay_currency: currency,
        ipn_callback_url: env.NOWPAYMENTS_WEBHOOK_URL,
        order_id: orderId,
        order_description:
          request.orderDescription ||
          `Credit purchase: $${request.creditAmount}`,
      };

      const payment = await nowpaymentsClient.createPayment(paymentRequest);

      // Validate payment response has all critical data
      if (!payment.payment_id) {
        Logger.error('NOWPayments payment missing payment_id:', payment);
        return {
          success: false,
          error: 'Invalid payment response: missing payment ID',
        };
      }

      if (!payment.pay_address) {
        Logger.error('NOWPayments payment missing pay_address:', payment);
        return {
          success: false,
          error: 'Invalid payment response: missing payment address',
        };
      }

      if (!payment.pay_amount || payment.pay_amount <= 0) {
        Logger.error(
          'NOWPayments payment missing/invalid pay_amount:',
          payment
        );
        return {
          success: false,
          error: 'Invalid payment response: missing payment amount',
        };
      }

      // Calculate expiry time (30 minutes from now)
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

      // Store payment in credit_transactions table with payment fields
      const paymentRecord: Partial<Payment> = {
        id: paymentId,
        userId,
        paymentId: payment.payment_id,
        provider: 'nowpayments',
        status: payment.payment_status,
        currency: payment.pay_currency,
        amount: payment.pay_amount,
        creditAmount: request.creditAmount,
        payAddress: payment.pay_address,
        ...(request.orderDescription && {
          orderDescription: request.orderDescription,
        }),
        metadata: {
          orderId,
          priceAmount: payment.price_amount,
          priceCurrency: payment.price_currency,
          payAddress: payment.pay_address,
          expiresAt: expiresAt.toISOString(),
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt,
      };

      // Insert into credit_transactions table with payment fields
      // Use 0 amount initially - will be set to positive when payment is confirmed
      await client.query(
        `INSERT INTO credit_transactions
         (id, user_id, type, amount, balance_before, balance_after, description, metadata,
          created_at, updated_at, payment_id, payment_provider, payment_status,
          payment_currency, payment_amount)
         VALUES ($1, $2, 'deposit', 0, 0, 0, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          paymentRecord.id,
          paymentRecord.userId,
          paymentRecord.orderDescription ||
            `Pending crypto payment - ${payment.pay_currency.toUpperCase()}`,
          JSON.stringify(paymentRecord.metadata || {}),
          paymentRecord.createdAt,
          paymentRecord.updatedAt,
          paymentRecord.paymentId,
          paymentRecord.provider,
          paymentRecord.status,
          paymentRecord.currency,
          paymentRecord.amount,
        ]
      );

      await client.query('COMMIT');

      // Cache payment data
      await this.cachePayment(paymentRecord as Payment);

      Logger.info(`Created payment for user ${userId}`, {
        paymentId: paymentRecord.id,
        nowPaymentsId: paymentRecord.paymentId,
        creditAmount: paymentRecord.creditAmount,
        currency: paymentRecord.currency,
        amount: paymentRecord.amount,
      });

      return {
        success: true,
        payment: paymentRecord as Payment,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      Logger.error('Error creating payment:', error);
      return {
        success: false,
        error: 'Failed to create payment',
      };
    } finally {
      client.release();
    }
  }

  // Get payment status
  async getPaymentStatus(
    paymentId: string,
    userId?: string
  ): Promise<PaymentStatusResponse | null> {
    try {
      const cacheKey = `${this.CACHE_PREFIX}status:${paymentId}`;

      // Try cache first
      const cached = await redisClient.getClient().get(cacheKey);
      if (cached) {
        Logger.debug(`Payment status cache hit: ${paymentId}`);
        return JSON.parse(cached);
      }

      const pool = getDatabasePool();

      // Query with detailed logging
      Logger.info(`Fetching payment status`, {
        paymentId,
        userId,
        query:
          'SELECT FROM credit_transactions WHERE payment_id = $1 AND user_id = $2',
      });

      const result = await pool.query(
        `SELECT id, payment_id, user_id, payment_status, payment_currency,
                payment_amount, blockchain_hash, amount, type, description,
                created_at, updated_at, metadata
         FROM credit_transactions
         WHERE payment_id = $1 AND user_id = $2
         ORDER BY created_at DESC
         LIMIT 1`,
        [paymentId, userId]
      );

      if (result.rows.length === 0) {
        Logger.warn(`Payment not found in database`, { paymentId, userId });

        // Fallback: Try querying NOWPayments API directly
        try {
          Logger.info(`Attempting to fetch from NOWPayments API: ${paymentId}`);
          const nowPaymentStatus =
            await nowpaymentsClient.getPaymentStatus(paymentId);

          Logger.info(`Retrieved from NOWPayments API`, {
            paymentId,
            status: nowPaymentStatus.payment_status,
            actuallyPaid: nowPaymentStatus.actually_paid,
          });

          // If payment is finished in NOWPayments but not in our DB, trigger webhook processing manually
          if (nowPaymentStatus.payment_status === 'finished') {
            Logger.warn(
              `Payment finished in NOWPayments but not in our DB - triggering manual sync`
            );
            await this.syncPaymentFromNOWPayments(nowPaymentStatus, userId!);
          }

          return {
            paymentId: nowPaymentStatus.payment_id,
            status: nowPaymentStatus.payment_status,
            creditAmount: nowPaymentStatus.price_amount,
            payAmount: nowPaymentStatus.pay_amount,
            payCurrency: nowPaymentStatus.pay_currency,
            actuallyPaid: nowPaymentStatus.actually_paid,
            blockchainHash: nowPaymentStatus.payin_hash,
            createdAt: new Date(nowPaymentStatus.created_at),
            updatedAt: new Date(nowPaymentStatus.updated_at),
          };
        } catch (apiError) {
          Logger.error(`Failed to fetch from NOWPayments API:`, apiError);
          return null;
        }
      }

      const row = result.rows[0];

      Logger.info(`Payment found in database`, {
        paymentId: row.payment_id,
        status: row.payment_status,
        amount: row.amount,
        userId: row.user_id,
      });

      // Parse metadata safely
      const metadata = row.metadata
        ? typeof row.metadata === 'string'
          ? JSON.parse(row.metadata)
          : row.metadata
        : {};

      const response: PaymentStatusResponse = {
        paymentId: row.payment_id,
        status: row.payment_status,
        creditAmount:
          metadata.priceAmount || Math.abs(parseFloat(row.amount || '0')),
        payAmount: parseFloat(row.payment_amount || '0'),
        payCurrency: row.payment_currency || 'btc',
        actuallyPaid: metadata.actuallyPaid,
        blockchainHash: row.blockchain_hash,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
        expiresAt: metadata.expiresAt
          ? new Date(metadata.expiresAt)
          : undefined,
      };

      // Cache the result
      await redisClient
        .getClient()
        .setex(cacheKey, this.STATUS_CACHE_TTL, JSON.stringify(response));

      return response;
    } catch (error) {
      Logger.error('Error getting payment status:', error);
      return null;
    }
  }

  // Add new method to manually sync payment from NOWPayments
  private async syncPaymentFromNOWPayments(
    nowPaymentStatus: any,
    userId: string
  ): Promise<void> {
    const pool = getDatabasePool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Find the payment record
      const result = await client.query(
        'SELECT * FROM credit_transactions WHERE payment_id = $1',
        [nowPaymentStatus.payment_id]
      );

      if (result.rows.length === 0) {
        Logger.error(
          `Cannot sync - payment not found: ${nowPaymentStatus.payment_id}`
        );
        await client.query('ROLLBACK');
        return;
      }

      const payment = result.rows[0];
      const metadata = payment.metadata
        ? typeof payment.metadata === 'string'
          ? JSON.parse(payment.metadata)
          : payment.metadata
        : {};
      const creditAmount =
        metadata.priceAmount || nowPaymentStatus.price_amount;

      // Get current balance
      const currentBalance = await creditService.getUserBalance(userId);
      const balanceBefore = currentBalance?.totalBalance || 0;
      const balanceAfter = balanceBefore + creditAmount;

      // Update payment record with finished status and credit amount
      await client.query(
        `UPDATE credit_transactions
         SET payment_status = $1,
             blockchain_hash = $2,
             amount = $3,
             balance_before = $4,
             balance_after = $5,
             description = $6,
             updated_at = NOW(),
             metadata = $7
         WHERE payment_id = $8`,
        [
          'finished',
          nowPaymentStatus.payin_hash,
          creditAmount,
          balanceBefore,
          balanceAfter,
          `Cryptocurrency payment completed - ${nowPaymentStatus.pay_currency.toUpperCase()}`,
          JSON.stringify({
            ...metadata,
            actuallyPaid: nowPaymentStatus.actually_paid,
            paymentCompleted: true,
            completedAt: new Date().toISOString(),
            blockchainHash: nowPaymentStatus.payin_hash,
            syncedManually: true,
          }),
          nowPaymentStatus.payment_id,
        ]
      );

      await client.query('COMMIT');

      Logger.info(`Successfully synced payment from NOWPayments`, {
        paymentId: nowPaymentStatus.payment_id,
        userId,
        creditAmount,
        newBalance: balanceAfter,
      });

      // Clear cache
      await this.clearUserBalanceCache(userId);
    } catch (error) {
      await client.query('ROLLBACK');
      Logger.error('Error syncing payment from NOWPayments:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Process webhook from NOWPayments
  async processWebhook(payload: WebhookPayload): Promise<boolean> {
    const pool = getDatabasePool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Find payment by NOWPayments payment_id in credit_transactions
      const paymentResult = await client.query(
        'SELECT * FROM credit_transactions WHERE payment_id = $1',
        [payload.payment_id]
      );

      if (paymentResult.rows.length === 0) {
        Logger.error(`Payment not found for webhook: ${payload.payment_id}`);
        return false;
      }

      const payment = paymentResult.rows[0];
      const previousStatus = payment.payment_status;

      // FIX: Handle metadata that might already be an object
      const metadata = payment.metadata
        ? typeof payment.metadata === 'string'
          ? JSON.parse(payment.metadata)
          : payment.metadata
        : {};
      metadata.actuallyPaid = payload.actually_paid;

      await client.query(
        `UPDATE credit_transactions
         SET payment_status = $1, blockchain_hash = $2, updated_at = NOW(), metadata = $3
         WHERE payment_id = $4`,
        [
          payload.payment_status,
          payload.payin_hash,
          JSON.stringify(metadata),
          payload.payment_id,
        ]
      );

      // If payment is confirmed/finished, update the transaction to actually credit the user
      if (
        payload.payment_status === 'finished' &&
        previousStatus !== 'finished'
      ) {
        // Get the current user balance to calculate balance_after
        const currentBalance = await creditService.getUserBalance(
          payment.user_id
        );
        const balanceBefore = currentBalance?.totalBalance || 0;
        const creditAmount = metadata.priceAmount || parseFloat(payment.amount);
        const balanceAfter = balanceBefore + creditAmount;

        // Update the transaction to have the actual credit amount
        await client.query(
          `UPDATE credit_transactions
           SET amount = $1, balance_before = $2, balance_after = $3,
               description = $4, metadata = $5
           WHERE id = $6`,
          [
            creditAmount, // Positive amount for deposits
            balanceBefore,
            balanceAfter,
            `Cryptocurrency payment completed - ${payload.pay_currency.toUpperCase()}`,
            JSON.stringify({
              ...metadata,
              paymentCompleted: true,
              completedAt: new Date().toISOString(),
              blockchainHash: payload.payin_hash,
            }),
            payment.id,
          ]
        );

        // Clear user's balance cache so it gets recalculated
        await this.clearUserBalanceCache(payment.user_id);

        Logger.info(`Credits added for completed payment`, {
          paymentId: payment.id,
          userId: payment.user_id,
          creditAmount,
          balanceBefore,
          balanceAfter,
        });
      }

      await client.query('COMMIT');

      // Clear cached data
      await this.clearPaymentCache(payment.id);

      Logger.info(`Processed webhook for payment ${payment.id}`, {
        paymentId: payment.id,
        previousStatus,
        newStatus: payload.payment_status,
        actuallyPaid: payload.actually_paid,
      });

      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      Logger.error('Error processing webhook:', error);
      return false;
    } finally {
      client.release();
    }
  }

  // Get payment history for user
  async getPaymentHistory(
    query: PaymentHistoryQuery
  ): Promise<PaymentHistoryItem[]> {
    try {
      const pool = getDatabasePool();
      let sql = `
        SELECT id, payment_id, payment_status, payment_provider, payment_currency,
               payment_amount, blockchain_hash, created_at, updated_at, amount, metadata
        FROM credit_transactions
        WHERE payment_id IS NOT NULL
      `;
      const params: any[] = [];
      let paramIndex = 1;

      // Add filters
      if (query.userId) {
        sql += ` AND user_id = $${paramIndex}`;
        params.push(query.userId);
        paramIndex++;
      }

      if (query.status) {
        sql += ` AND payment_status = $${paramIndex}`;
        params.push(query.status);
        paramIndex++;
      }

      if (query.provider) {
        sql += ` AND payment_provider = $${paramIndex}`;
        params.push(query.provider);
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

      return result.rows.map(row => {
        // Safe metadata parsing with fallback for corrupted data
        const metadata = row.metadata
          ? typeof row.metadata === 'string'
            ? row.metadata === '[object Object]'
              ? {}
              : ((): any => {
                  try {
                    return JSON.parse(row.metadata);
                  } catch {
                    Logger.warn(
                      'Failed to parse metadata JSON in payment history, using empty object:',
                      row.metadata
                    );
                    return {};
                  }
                })()
            : row.metadata
          : {};
        return {
          id: row.id,
          paymentId: row.payment_id,
          status: row.payment_status,
          provider: row.payment_provider,
          currency: row.payment_currency,
          amount: parseFloat(row.payment_amount || '0'),
          creditAmount:
            metadata.priceAmount || Math.abs(parseFloat(row.amount)),
          blockchainHash: row.blockchain_hash,
          createdAt: new Date(row.created_at),
          updatedAt: new Date(row.updated_at),
        };
      });
    } catch (error) {
      Logger.error('Error getting payment history:', error);
      return [];
    }
  }

  // Get supported currencies
  async getSupportedCurrencies(): Promise<CurrencyInfo[]> {
    try {
      const cacheKey = `${this.CACHE_PREFIX}currencies`;
      const cached = await redisClient.getClient().get(cacheKey);

      if (cached) {
        return JSON.parse(cached);
      }

      // Get currency ticker list from NOWPayments API
      const currencyTickers = await nowpaymentsClient.getCurrencies();

      Logger.debug(
        `Received ${currencyTickers.length} currencies from NOWPayments API`
      );

      // Transform string array to CurrencyInfo objects with metadata
      const currencyInfo: CurrencyInfo[] = currencyTickers.map(ticker => {
        const lowerTicker = ticker.toLowerCase();

        // Define popular currencies
        const popularCurrencies = [
          'btc',
          'eth',
          'usdt',
          'usdc',
          'ltc',
          'bch',
          'xrp',
          'ada',
          'dot',
          'matic',
        ];
        const isPopular = popularCurrencies.includes(lowerTicker);

        // Define stable currencies
        const stableCurrencies = [
          'usdt',
          'usdc',
          'usdp',
          'dai',
          'busd',
          'tusd',
          'usdcbsc',
          'usdttrc20',
        ];
        const isStable = stableCurrencies.includes(lowerTicker);

        // Generate display name from ticker
        const name = this.generateCurrencyName(ticker);

        return {
          ticker: ticker.toLowerCase(),
          name,
          image: `https://nowpayments.io/images/coins/${ticker.toLowerCase()}.svg`,
          isPopular,
          isStable,
        };
      });

      // Cache for 1 hour
      await redisClient
        .getClient()
        .setex(cacheKey, 3600, JSON.stringify(currencyInfo));

      Logger.info(
        `Successfully processed ${currencyInfo.length} supported currencies`
      );
      return currencyInfo;
    } catch (error) {
      Logger.error('Error getting supported currencies:', error);
      return [];
    }
  }

  // Helper method to generate currency display names
  private generateCurrencyName(ticker: string): string {
    const currencyNames: Record<string, string> = {
      btc: 'Bitcoin',
      eth: 'Ethereum',
      usdt: 'Tether',
      usdc: 'USD Coin',
      ltc: 'Litecoin',
      bch: 'Bitcoin Cash',
      xrp: 'Ripple',
      ada: 'Cardano',
      dot: 'Polkadot',
      matic: 'Polygon',
      avax: 'Avalanche',
      now: 'ChangeNOW',
      fil: 'Filecoin',
      usdp: 'Pax Dollar',
      dai: 'Dai',
      busd: 'Binance USD',
      tusd: 'TrueUSD',
      usdcbsc: 'USD Coin (BSC)',
      usdttrc20: 'Tether (TRC20)',
    };

    return currencyNames[ticker.toLowerCase()] || ticker.toUpperCase();
  }

  // Get payment estimate
  async getEstimate(
    amount: number,
    currency: string
  ): Promise<{ estimatedAmount: number; currency: string } | null> {
    try {
      const estimate = await nowpaymentsClient.getEstimate({
        amount,
        currency_from: 'usd',
        currency_to: currency.toLowerCase(),
      });

      return {
        estimatedAmount: estimate.estimated_amount,
        currency: currency.toUpperCase(),
      };
    } catch (error) {
      Logger.error('Error getting payment estimate:', error);
      return null;
    }
  }

  // Update payment status from NOWPayments API
  async refreshPaymentStatus(paymentId: string): Promise<boolean> {
    try {
      const pool = getDatabasePool();

      // Get payment from credit_transactions table using NOWPayments payment_id
      const result = await pool.query(
        'SELECT id, payment_id, metadata FROM credit_transactions WHERE payment_id = $1',
        [paymentId]
      );

      if (result.rows.length === 0) {
        return false;
      }

      const localId = result.rows[0].id;
      const nowpaymentsId = result.rows[0].payment_id;
      const metadata = result.rows[0].metadata
        ? typeof result.rows[0].metadata === 'string'
          ? JSON.parse(result.rows[0].metadata)
          : result.rows[0].metadata
        : {};

      // Get latest status from NOWPayments
      const status = await nowpaymentsClient.getPaymentStatus(nowpaymentsId);

      // Update metadata with latest payment info
      metadata.actuallyPaid = status.actually_paid;

      // Update database using local ID for WHERE clause
      await pool.query(
        `UPDATE credit_transactions
         SET payment_status = $1, blockchain_hash = $2, updated_at = NOW(), metadata = $3
         WHERE id = $4`,
        [
          status.payment_status,
          status.payin_hash,
          JSON.stringify(metadata),
          localId,
        ]
      );

      // Clear cache
      await this.clearPaymentCache(paymentId);

      return true;
    } catch (error) {
      Logger.error('Error refreshing payment status:', error);
      return false;
    }
  }

  // Cache payment data
  private async cachePayment(payment: Payment): Promise<void> {
    try {
      const cacheKey = `${this.CACHE_PREFIX}${payment.id}`;
      await redisClient
        .getClient()
        .setex(cacheKey, this.PAYMENT_CACHE_TTL, JSON.stringify(payment));
    } catch (error) {
      Logger.error('Error caching payment:', error);
    }
  }

  // Clear payment cache
  private async clearPaymentCache(paymentId: string): Promise<void> {
    try {
      const keys = [
        `${this.CACHE_PREFIX}${paymentId}`,
        `${this.CACHE_PREFIX}status:${paymentId}`,
      ];
      await redisClient.getClient().del(...keys);
    } catch (error) {
      Logger.error('Error clearing payment cache:', error);
    }
  }

  // Clear user balance cache
  private async clearUserBalanceCache(userId: string): Promise<void> {
    try {
      const cacheKey = `credit:balance:${userId}`;
      await redisClient.getClient().del(cacheKey);
      Logger.debug(`Cleared balance cache for user ${userId}`);
    } catch (error) {
      Logger.error('Error clearing user balance cache:', error);
    }
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      const pool = getDatabasePool();
      await pool.query('SELECT 1 FROM credit_transactions LIMIT 1');

      return await nowpaymentsClient.healthCheck();
    } catch (error) {
      Logger.error('Payment service health check failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const paymentService = new PaymentService();
