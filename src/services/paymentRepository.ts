import { Pool, PoolClient } from 'pg';
import { getDatabasePool } from '../config/database';
import {
  CreateUnifiedPaymentInput,
  UnifiedPayment,
  UnifiedPaymentStatus,
  PaymentProvider,
} from '../types/payment';
import { Logger } from '../utils/logger';
import { parseJsonValue } from '../utils/json';

function getClient(client?: PoolClient): PoolClient | Pool {
  if (client) {
    return client;
  }
  return getDatabasePool();
}

function mapRowToUnifiedPayment(row: any): UnifiedPayment {
  const metadata = parseJsonValue<Record<string, any>>(row.metadata, {});

  const payment: UnifiedPayment = {
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    providerPaymentId: row.provider_payment_id,
    status: row.status,
    purpose: row.purpose,
    amount: parseFloat(row.amount),
    currency: row.currency,
    metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  if (row.provider_status) {
    payment.providerStatus = row.provider_status;
  }

  if (row.checkout_mode !== undefined) {
    payment.checkoutMode = row.checkout_mode;
  }

  if (row.stripe_session_id) {
    payment.stripeSessionId = row.stripe_session_id;
  }

  if (row.amount_usd !== null && row.amount_usd !== undefined) {
    payment.amountUsd = parseFloat(row.amount_usd);
  }

  if (row.payment_method_type) {
    payment.paymentMethodType = row.payment_method_type;
  }

  if (row.subscription_id) {
    payment.subscriptionId = row.subscription_id;
  }

  if (row.credit_transaction_id) {
    payment.creditTransactionId = row.credit_transaction_id;
  }

  if (row.expires_at) {
    payment.expiresAt = row.expires_at;
  }

  if (row.order_id) {
    payment.orderId = row.order_id;
  }

  if (row.product_variant_id) {
    payment.productVariantId = row.product_variant_id;
  }

  if (row.order_item_id) {
    payment.orderItemId = row.order_item_id;
  }

  if (row.price_cents !== null && row.price_cents !== undefined) {
    payment.priceCents = parseInt(row.price_cents, 10);
  }

  if (row.base_price_cents !== null && row.base_price_cents !== undefined) {
    payment.basePriceCents = parseInt(row.base_price_cents, 10);
  }

  if (row.discount_percent !== null && row.discount_percent !== undefined) {
    payment.discountPercent = Number(row.discount_percent);
  }

  if (row.term_months !== null && row.term_months !== undefined) {
    payment.termMonths = parseInt(row.term_months, 10);
  }

  if (row.auto_renew !== null && row.auto_renew !== undefined) {
    payment.autoRenew = row.auto_renew;
  }

  if (row.next_billing_at) {
    payment.nextBillingAt = row.next_billing_at;
  }

  if (row.renewal_method) {
    payment.renewalMethod = row.renewal_method;
  }

  if (row.status_reason) {
    payment.statusReason = row.status_reason;
  }

  return payment;
}

export const paymentRepository = {
  async create(
    input: CreateUnifiedPaymentInput,
    client?: PoolClient
  ): Promise<UnifiedPayment> {
    const db = getClient(client);

    const result = await db.query(
      `INSERT INTO payments (
        user_id,
        provider,
        provider_payment_id,
        status,
        provider_status,
        purpose,
        amount,
        currency,
        amount_usd,
        payment_method_type,
        subscription_id,
        credit_transaction_id,
        expires_at,
        order_id,
        product_variant_id,
        order_item_id,
        price_cents,
        base_price_cents,
        discount_percent,
        term_months,
        auto_renew,
        next_billing_at,
        renewal_method,
        status_reason,
        checkout_mode,
        stripe_session_id,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
      RETURNING *`,
      [
        input.userId,
        input.provider,
        input.providerPaymentId,
        input.status,
        input.providerStatus || null,
        input.purpose,
        input.amount,
        input.currency,
        input.amountUsd ?? null,
        input.paymentMethodType || null,
        input.subscriptionId || null,
        input.creditTransactionId || null,
        input.expiresAt || null,
        input.orderId || null,
        input.productVariantId || null,
        input.orderItemId || null,
        input.priceCents ?? null,
        input.basePriceCents ?? null,
        input.discountPercent ?? null,
        input.termMonths ?? null,
        input.autoRenew ?? null,
        input.nextBillingAt || null,
        input.renewalMethod || null,
        input.statusReason || null,
        input.checkoutMode ?? null,
        input.stripeSessionId ?? null,
        input.metadata ? JSON.stringify(input.metadata) : '{}',
      ]
    );

    return mapRowToUnifiedPayment(result.rows[0]);
  },

  async updateStatusByProviderPaymentId(
    provider: PaymentProvider,
    providerPaymentId: string,
    status: UnifiedPaymentStatus,
    providerStatus?: string,
    metadata?: Record<string, any>,
    client?: PoolClient
  ): Promise<UnifiedPayment | null> {
    try {
      const db = getClient(client);

      const result = await db.query(
        `UPDATE payments
         SET status = $1,
             provider_status = $2,
             metadata = COALESCE($3, metadata),
             updated_at = NOW()
         WHERE provider = $4 AND provider_payment_id = $5
         RETURNING *`,
        [
          status,
          providerStatus || null,
          metadata ? JSON.stringify(metadata) : null,
          provider,
          providerPaymentId,
        ]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return mapRowToUnifiedPayment(result.rows[0]);
    } catch (error) {
      Logger.error('Failed to update payment status in payments table:', error);
      throw error;
    }
  },

  async findLatestByOrderId(
    provider: PaymentProvider,
    orderId: string,
    purpose?: string,
    client?: PoolClient
  ): Promise<UnifiedPayment | null> {
    try {
      const db = getClient(client);
      const params: Array<string> = [provider, orderId];
      let sql = `
        SELECT *
        FROM payments
        WHERE provider = $1
          AND order_id = $2
      `;
      if (purpose) {
        sql += ` AND purpose = $3`;
        params.push(purpose);
      }
      sql += ' ORDER BY created_at DESC LIMIT 1';
      const result = await db.query(sql, params);
      if (result.rows.length === 0) {
        return null;
      }
      return mapRowToUnifiedPayment(result.rows[0]);
    } catch (error) {
      Logger.error('Failed to fetch payment by order id', {
        provider,
        orderId,
        purpose,
        error,
      });
      return null;
    }
  },

  async linkCreditTransaction(
    provider: PaymentProvider,
    providerPaymentId: string,
    creditTransactionId: string,
    client?: PoolClient
  ): Promise<void> {
    const db = getClient(client);
    await db.query(
      `UPDATE payments
       SET credit_transaction_id = $1,
           updated_at = NOW()
       WHERE provider = $2 AND provider_payment_id = $3`,
      [creditTransactionId, provider, providerPaymentId]
    );
  },

  async findByProviderPaymentId(
    provider: PaymentProvider,
    providerPaymentId: string
  ): Promise<UnifiedPayment | null> {
    try {
      const pool = getDatabasePool();
      const result = await pool.query(
        `SELECT * FROM payments WHERE provider = $1 AND provider_payment_id = $2`,
        [provider, providerPaymentId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return mapRowToUnifiedPayment(result.rows[0]);
    } catch (error) {
      Logger.error('Failed to fetch payment by provider_payment_id:', error);
      throw error;
    }
  },

  async findByProviderPaymentIdAny(
    providerPaymentId: string,
    userId?: string
  ): Promise<UnifiedPayment | null> {
    try {
      const pool = getDatabasePool();
      const params: Array<string> = [providerPaymentId];
      let sql = 'SELECT * FROM payments WHERE provider_payment_id = $1';

      if (userId) {
        sql += ' AND user_id = $2';
        params.push(userId);
      }

      sql += ' ORDER BY created_at DESC LIMIT 1';

      const result = await pool.query(sql, params);

      if (result.rows.length === 0) {
        return null;
      }

      return mapRowToUnifiedPayment(result.rows[0]);
    } catch (error) {
      Logger.error(
        'Failed to fetch payment by provider_payment_id (any):',
        error
      );
      throw error;
    }
  },

  async listPendingStripeRenewalPayments(
    subscriptionIds: string[]
  ): Promise<UnifiedPayment[]> {
    if (!subscriptionIds || subscriptionIds.length === 0) {
      return [];
    }

    try {
      const pool = getDatabasePool();
      const result = await pool.query(
        `SELECT *
         FROM payments
         WHERE provider = 'stripe'
           AND status IN ('pending', 'processing', 'requires_action', 'requires_payment_method')
           AND (
             subscription_id = ANY($1::uuid[])
             OR metadata->>'subscription_id' = ANY($2::text[])
           )
           AND (metadata->>'renewal') IN ('true', '1')
         ORDER BY created_at DESC`,
        [subscriptionIds, subscriptionIds]
      );

      return result.rows.map(mapRowToUnifiedPayment);
    } catch (error) {
      Logger.error('Failed to list pending Stripe renewal payments:', error);
      throw error;
    }
  },

  async linkSubscription(
    provider: PaymentProvider,
    providerPaymentId: string,
    subscriptionId: string,
    client?: PoolClient
  ): Promise<void> {
    const db = getClient(client);
    await db.query(
      `UPDATE payments
       SET subscription_id = $1,
           updated_at = NOW()
       WHERE provider = $2 AND provider_payment_id = $3`,
      [subscriptionId, provider, providerPaymentId]
    );
  },
};
