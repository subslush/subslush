import { getDatabasePool } from '../config/database';
import { Logger } from '../utils/logger';

type RecordPayPalPaymentEvidenceInput = {
  orderId: string;
  userId?: string | null;
  customerEmail?: string | null;
  paypalOrderId: string;
  paypalTransactionId: string;
  ipAddress?: string | null;
  metadata?: Record<string, unknown> | null;
};

type RecordOrderDeliveredEvidenceInput = {
  orderId: string;
  userId?: string | null;
  customerEmail?: string | null;
  deliveryTimestamp?: Date | null;
  metadata?: Record<string, unknown> | null;
};

type RecordCredentialRevealEvidenceInput = {
  orderId: string;
  userId?: string | null;
  customerEmail?: string | null;
  ipAddress?: string | null;
  success: boolean;
  evidence?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
};

const normalizeEmail = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  return normalized;
};

const toJson = (value: unknown): string => JSON.stringify(value ?? {});

const toDeliveredProductLabels = (
  rows: Array<{
    id: string;
    product_name?: string | null;
    variant_name?: string | null;
    description?: string | null;
  }>
): string[] => {
  return rows.map(row => {
    const product =
      typeof row.product_name === 'string' ? row.product_name.trim() : '';
    const variant =
      typeof row.variant_name === 'string' ? row.variant_name.trim() : '';
    const description =
      typeof row.description === 'string' ? row.description.trim() : '';

    if (product && variant) {
      return `${product} ${variant}`;
    }
    return product || variant || description || row.id;
  });
};

class OrderComplianceEvidenceService {
  private async listDeliveredProducts(orderId: string): Promise<string[]> {
    const pool = getDatabasePool();
    const result = await pool.query(
      `SELECT id, product_name, variant_name, description
       FROM order_items
       WHERE order_id = $1
       ORDER BY created_at ASC`,
      [orderId]
    );
    return toDeliveredProductLabels(
      result.rows as Array<{
        id: string;
        product_name?: string | null;
        variant_name?: string | null;
        description?: string | null;
      }>
    );
  }

  async recordPayPalPaymentEvidence(
    input: RecordPayPalPaymentEvidenceInput
  ): Promise<void> {
    try {
      const pool = getDatabasePool();
      const normalizedCustomerEmail = normalizeEmail(input.customerEmail);

      await pool.query(
        `INSERT INTO order_compliance_evidence_logs (
           order_id,
           user_id,
           event_type,
           customer_email,
           paypal_order_id,
           paypal_transaction_id,
           ip_address,
           metadata
         )
         SELECT
           $1,
           COALESCE($2, o.user_id),
           'paypal_payment_capture',
           COALESCE($3, o.contact_email),
           $4,
           $5,
           $6,
           $7::jsonb
         FROM orders o
         WHERE o.id = $1
           AND NOT EXISTS (
             SELECT 1
             FROM order_compliance_evidence_logs e
             WHERE e.order_id = $1
               AND e.event_type = 'paypal_payment_capture'
               AND e.paypal_transaction_id = $5
           )`,
        [
          input.orderId,
          input.userId || null,
          normalizedCustomerEmail,
          input.paypalOrderId,
          input.paypalTransactionId,
          input.ipAddress || null,
          toJson(input.metadata ?? {}),
        ]
      );
    } catch (error) {
      Logger.error('Failed to record PayPal payment evidence', {
        orderId: input.orderId,
        paypalOrderId: input.paypalOrderId,
        paypalTransactionId: input.paypalTransactionId,
        error,
      });
    }
  }

  async recordOrderDeliveredEvidence(
    input: RecordOrderDeliveredEvidenceInput
  ): Promise<void> {
    try {
      const pool = getDatabasePool();
      const deliveredProducts = await this.listDeliveredProducts(input.orderId);
      const normalizedCustomerEmail = normalizeEmail(input.customerEmail);

      await pool.query(
        `INSERT INTO order_compliance_evidence_logs (
           order_id,
           user_id,
           event_type,
           customer_email,
           product_delivered,
           delivery_timestamp,
           metadata
         )
         SELECT
           $1,
           COALESCE($2, o.user_id),
           'order_delivery',
           COALESCE($3, o.contact_email),
           $4::jsonb,
           $5,
           $6::jsonb
         FROM orders o
         WHERE o.id = $1`,
        [
          input.orderId,
          input.userId || null,
          normalizedCustomerEmail,
          JSON.stringify(deliveredProducts),
          input.deliveryTimestamp ?? new Date(),
          toJson(input.metadata ?? {}),
        ]
      );
    } catch (error) {
      Logger.error('Failed to record order delivery evidence', {
        orderId: input.orderId,
        error,
      });
    }
  }

  async recordCredentialRevealEvidence(
    input: RecordCredentialRevealEvidenceInput
  ): Promise<void> {
    try {
      const pool = getDatabasePool();
      const normalizedCustomerEmail = normalizeEmail(input.customerEmail);

      await pool.query(
        `INSERT INTO order_compliance_evidence_logs (
           order_id,
           user_id,
           event_type,
           customer_email,
           ip_address,
           license_account_access_evidence,
           metadata
         )
         SELECT
           $1,
           COALESCE($2, o.user_id),
           'credential_reveal',
           COALESCE($3, o.contact_email),
           $4,
           $5::jsonb,
           $6::jsonb
         FROM orders o
         WHERE o.id = $1`,
        [
          input.orderId,
          input.userId || null,
          normalizedCustomerEmail,
          input.ipAddress || null,
          toJson({
            reveal_clicked: true,
            reveal_success: input.success,
            revealed_at: new Date().toISOString(),
            ...(input.evidence ?? {}),
          }),
          toJson(input.metadata ?? {}),
        ]
      );
    } catch (error) {
      Logger.error('Failed to record credential reveal evidence', {
        orderId: input.orderId,
        error,
      });
    }
  }
}

export const orderComplianceEvidenceService =
  new OrderComplianceEvidenceService();
