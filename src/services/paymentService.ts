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
  NOWPaymentsCreateInvoiceRequest,
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

      // Create NOWPayments invoice
      const invoiceRequest: NOWPaymentsCreateInvoiceRequest = {
        price_amount: request.creditAmount,
        price_currency: 'usd',
        pay_currency: currency,
        ipn_callback_url: env.NOWPAYMENTS_WEBHOOK_URL,
        order_id: orderId,
        order_description:
          request.orderDescription ||
          `Credit purchase: $${request.creditAmount}`,
      };

      const invoice = await nowpaymentsClient.createInvoice(invoiceRequest);

      // Calculate expiry time (30 minutes from now)
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

      // Store payment in credit_transactions table with payment fields
      const payment: Partial<Payment> = {
        id: paymentId,
        userId,
        paymentId: invoice.payment_id,
        provider: 'nowpayments',
        status: invoice.payment_status,
        currency: invoice.pay_currency,
        amount: invoice.pay_amount,
        creditAmount: request.creditAmount,
        payAddress: invoice.pay_address,
        ...(request.orderDescription && {
          orderDescription: request.orderDescription,
        }),
        metadata: {
          orderId,
          invoiceUrl: invoice.invoice_url,
          priceAmount: invoice.price_amount,
          priceCurrency: invoice.price_currency,
          payAddress: invoice.pay_address,
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
          payment.id,
          payment.userId,
          payment.orderDescription ||
            `Pending crypto payment - ${invoice.pay_currency.toUpperCase()}`,
          JSON.stringify(payment.metadata || {}),
          payment.createdAt,
          payment.updatedAt,
          payment.paymentId,
          payment.provider,
          payment.status,
          payment.currency,
          payment.amount,
        ]
      );

      await client.query('COMMIT');

      // Cache payment data
      await this.cachePayment(payment as Payment);

      Logger.info(`Created payment for user ${userId}`, {
        paymentId: payment.id,
        nowPaymentsId: payment.paymentId,
        creditAmount: payment.creditAmount,
        currency: payment.currency,
        amount: payment.amount,
      });

      return {
        success: true,
        payment: payment as Payment,
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
      // Try cache first
      const cacheKey = `${this.CACHE_PREFIX}status:${paymentId}`;
      const cached = await redisClient.getClient().get(cacheKey);

      if (cached) {
        const payment = JSON.parse(cached);
        // Verify user access if userId provided
        if (userId && payment.userId !== userId) {
          return null;
        }
        return payment;
      }

      // Get from credit_transactions table
      const pool = getDatabasePool();
      let query = `
        SELECT id, user_id, payment_id, payment_status, payment_currency, payment_amount,
               blockchain_hash, created_at, updated_at, amount, description, metadata
        FROM credit_transactions
        WHERE id = $1 AND payment_id IS NOT NULL
      `;
      const params: any[] = [paymentId];

      if (userId) {
        query += ' AND user_id = $2';
        params.push(userId);
      }

      const result = await pool.query(query, params);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      const metadata = row.metadata ? JSON.parse(row.metadata) : {};
      const response: PaymentStatusResponse = {
        paymentId: row.id,
        status: row.payment_status,
        creditAmount: metadata.priceAmount || Math.abs(parseFloat(row.amount)),
        payAmount: parseFloat(row.payment_amount || '0'),
        payCurrency: row.payment_currency,
        ...(row.actually_paid && {
          actuallyPaid: parseFloat(row.actually_paid),
        }),
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

      // Update payment status and blockchain hash
      const metadata = payment.metadata ? JSON.parse(payment.metadata) : {};
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
        await creditService.getUserBalance(payment.user_id);

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
        const metadata = row.metadata ? JSON.parse(row.metadata) : {};
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

      // Get payment from credit_transactions table
      const result = await pool.query(
        'SELECT payment_id, metadata FROM credit_transactions WHERE id = $1',
        [paymentId]
      );

      if (result.rows.length === 0) {
        return false;
      }

      const nowpaymentsId = result.rows[0].payment_id;
      const metadata = result.rows[0].metadata
        ? JSON.parse(result.rows[0].metadata)
        : {};

      // Get latest status from NOWPayments
      const status = await nowpaymentsClient.getPaymentStatus(nowpaymentsId);

      // Update metadata with latest payment info
      metadata.actuallyPaid = status.actually_paid;

      // Update database
      await pool.query(
        `UPDATE credit_transactions
         SET payment_status = $1, blockchain_hash = $2, updated_at = NOW(), metadata = $3
         WHERE id = $4`,
        [
          status.payment_status,
          status.payin_hash,
          JSON.stringify(metadata),
          paymentId,
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
