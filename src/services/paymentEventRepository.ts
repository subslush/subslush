import type { PoolClient } from 'pg';
import { getDatabasePool } from '../config/database';
import { Logger } from '../utils/logger';

type PaymentEventInput = {
  provider: string;
  eventId: string;
  eventType: string;
  orderId?: string | null;
  paymentId?: string | null;
};

export const paymentEventRepository = {
  async recordEvent(
    input: PaymentEventInput,
    client?: PoolClient
  ): Promise<boolean> {
    const db = client ?? getDatabasePool();

    try {
      const result = await db.query(
        `INSERT INTO payment_events (provider, event_id, event_type, order_id, payment_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (provider, event_id) DO NOTHING
         RETURNING id`,
        [
          input.provider,
          input.eventId,
          input.eventType,
          input.orderId ?? null,
          input.paymentId ?? null,
        ]
      );
      return result.rows.length > 0;
    } catch (error) {
      Logger.error('Failed to record payment event', {
        provider: input.provider,
        eventId: input.eventId,
        error,
      });
      return false;
    }
  },
};
