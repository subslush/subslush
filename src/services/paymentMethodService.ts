import { getDatabasePool } from '../config/database';
import { Logger } from '../utils/logger';
import type {
  UpsertPaymentMethodInput,
  UserPaymentMethod,
  PaymentMethodProvider,
  PaymentMethodStatus,
} from '../types/paymentMethod';

function mapPaymentMethod(row: any): UserPaymentMethod {
  return {
    id: row.id,
    user_id: row.user_id,
    provider: row.provider,
    provider_customer_id: row.provider_customer_id ?? null,
    provider_payment_method_id: row.provider_payment_method_id,
    brand: row.brand ?? null,
    last4: row.last4 ?? null,
    exp_month: row.exp_month ?? null,
    exp_year: row.exp_year ?? null,
    status: row.status,
    is_default: row.is_default,
    setup_intent_id: row.setup_intent_id ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export class PaymentMethodService {
  async upsertPaymentMethod(
    input: UpsertPaymentMethodInput
  ): Promise<UserPaymentMethod | null> {
    const pool = getDatabasePool();
    const client = await pool.connect();
    let transactionOpen = false;
    try {
      await client.query('BEGIN');
      transactionOpen = true;

      const existing = await client.query(
        `SELECT * FROM user_payment_methods
         WHERE provider = $1 AND provider_payment_method_id = $2`,
        [input.provider, input.provider_payment_method_id]
      );

      if (existing.rows.length > 0) {
        const current = existing.rows[0];
        if (current.user_id !== input.user_id) {
          Logger.warn('Payment method ownership mismatch', {
            paymentMethodId: input.provider_payment_method_id,
            existingUserId: current.user_id,
            newUserId: input.user_id,
          });
          await client.query('ROLLBACK');
          transactionOpen = false;
          return null;
        }
      }

      if (input.is_default === true) {
        await client.query(
          `UPDATE user_payment_methods
           SET is_default = FALSE
           WHERE user_id = $1 AND provider = $2`,
          [input.user_id, input.provider]
        );
      }

      if (existing.rows.length > 0) {
        const current = existing.rows[0];
        const updateResult = await client.query(
          `UPDATE user_payment_methods
           SET provider_customer_id = COALESCE($1, provider_customer_id),
               brand = COALESCE($2, brand),
               last4 = COALESCE($3, last4),
               exp_month = COALESCE($4, exp_month),
               exp_year = COALESCE($5, exp_year),
               status = COALESCE($6, status),
               setup_intent_id = COALESCE($7, setup_intent_id),
               is_default = COALESCE($8, is_default)
           WHERE id = $9
           RETURNING *`,
          [
            input.provider_customer_id ?? null,
            input.brand ?? null,
            input.last4 ?? null,
            input.exp_month ?? null,
            input.exp_year ?? null,
            input.status ?? null,
            input.setup_intent_id ?? null,
            typeof input.is_default === 'boolean' ? input.is_default : null,
            current.id,
          ]
        );

        await client.query('COMMIT');
        transactionOpen = false;
        return updateResult.rows.length > 0
          ? mapPaymentMethod(updateResult.rows[0])
          : null;
      }

      const insertResult = await client.query(
        `INSERT INTO user_payment_methods (
           user_id, provider, provider_customer_id, provider_payment_method_id,
           brand, last4, exp_month, exp_year, status, is_default, setup_intent_id
         ) VALUES (
           $1, $2, $3, $4,
           $5, $6, $7, $8, $9, $10, $11
         )
         RETURNING *`,
        [
          input.user_id,
          input.provider,
          input.provider_customer_id ?? null,
          input.provider_payment_method_id,
          input.brand ?? null,
          input.last4 ?? null,
          input.exp_month ?? null,
          input.exp_year ?? null,
          input.status ?? 'active',
          input.is_default ?? false,
          input.setup_intent_id ?? null,
        ]
      );

      await client.query('COMMIT');
      transactionOpen = false;
      return insertResult.rows.length > 0
        ? mapPaymentMethod(insertResult.rows[0])
        : null;
    } catch (error) {
      if (transactionOpen) {
        await client.query('ROLLBACK');
        transactionOpen = false;
      }
      Logger.error('Failed to upsert payment method:', error);
      return null;
    } finally {
      if (transactionOpen) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          Logger.error(
            'Failed to rollback payment method transaction',
            rollbackError
          );
        }
      }
      client.release();
    }
  }

  async setDefaultPaymentMethod(
    userId: string,
    provider: PaymentMethodProvider,
    paymentMethodId: string
  ): Promise<boolean> {
    try {
      const pool = getDatabasePool();
      await pool.query(
        `UPDATE user_payment_methods
         SET is_default = CASE WHEN id = $3 THEN TRUE ELSE FALSE END
         WHERE user_id = $1 AND provider = $2`,
        [userId, provider, paymentMethodId]
      );
      return true;
    } catch (error) {
      Logger.error('Failed to set default payment method:', error);
      return false;
    }
  }

  async getPaymentMethodById(
    paymentMethodId: string,
    userId?: string
  ): Promise<UserPaymentMethod | null> {
    try {
      const pool = getDatabasePool();
      const result = await pool.query(
        `SELECT * FROM user_payment_methods
         WHERE id = $1${userId ? ' AND user_id = $2' : ''}`,
        userId ? [paymentMethodId, userId] : [paymentMethodId]
      );
      if (result.rows.length === 0) return null;
      return mapPaymentMethod(result.rows[0]);
    } catch (error) {
      Logger.error('Failed to fetch payment method:', error);
      return null;
    }
  }

  async getDefaultPaymentMethod(
    userId: string,
    provider: PaymentMethodProvider
  ): Promise<UserPaymentMethod | null> {
    try {
      const pool = getDatabasePool();
      const result = await pool.query(
        `SELECT * FROM user_payment_methods
         WHERE user_id = $1 AND provider = $2 AND is_default = TRUE
         ORDER BY updated_at DESC
         LIMIT 1`,
        [userId, provider]
      );
      if (result.rows.length === 0) return null;
      return mapPaymentMethod(result.rows[0]);
    } catch (error) {
      Logger.error('Failed to fetch default payment method:', error);
      return null;
    }
  }

  async updatePaymentMethodStatus(
    paymentMethodId: string,
    status: PaymentMethodStatus
  ): Promise<boolean> {
    try {
      const pool = getDatabasePool();
      await pool.query(
        `UPDATE user_payment_methods
         SET status = $1
         WHERE id = $2`,
        [status, paymentMethodId]
      );
      return true;
    } catch (error) {
      Logger.error('Failed to update payment method status:', error);
      return false;
    }
  }
}

export const paymentMethodService = new PaymentMethodService();
