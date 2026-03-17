import type { PoolClient } from 'pg';
import { getDatabasePool } from '../config/database';
import { Logger } from '../utils/logger';
import type {
  OrderEntitlement,
  OrderEntitlementStatus,
  UpsertOrderEntitlementInput,
} from '../types/orderEntitlement';

function parseMetadata(value: any): Record<string, any> | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
}

function mapRow(row: any): OrderEntitlement {
  return {
    id: row.id,
    order_id: row.order_id,
    order_item_id: row.order_item_id ?? null,
    user_id: row.user_id,
    status: row.status,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    duration_months_snapshot: row.duration_months_snapshot ?? null,
    credentials_encrypted: row.credentials_encrypted ?? null,
    mmu_cycle_index: row.mmu_cycle_index ?? null,
    mmu_cycle_total: row.mmu_cycle_total ?? null,
    source_subscription_id: row.source_subscription_id ?? null,
    metadata: parseMetadata(row.metadata),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export class OrderEntitlementService {
  async upsertEntitlement(
    input: UpsertOrderEntitlementInput,
    client?: PoolClient
  ): Promise<OrderEntitlement | null> {
    try {
      const db = client ?? getDatabasePool();
      const status: OrderEntitlementStatus = input.status ?? 'active';
      const metadata = input.metadata ? JSON.stringify(input.metadata) : null;

      if (input.source_subscription_id) {
        const result = await db.query(
          `INSERT INTO order_entitlements
            (
              order_id,
              order_item_id,
              user_id,
              status,
              starts_at,
              ends_at,
              duration_months_snapshot,
              credentials_encrypted,
              mmu_cycle_index,
              mmu_cycle_total,
              source_subscription_id,
              metadata
            )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT ON CONSTRAINT order_entitlements_source_subscription_id_key
           DO UPDATE
           SET order_id = EXCLUDED.order_id,
               order_item_id = COALESCE(
                 EXCLUDED.order_item_id,
                 order_entitlements.order_item_id
               ),
               user_id = EXCLUDED.user_id,
               status = EXCLUDED.status,
               starts_at = EXCLUDED.starts_at,
               ends_at = EXCLUDED.ends_at,
               duration_months_snapshot = COALESCE(
                 EXCLUDED.duration_months_snapshot,
                 order_entitlements.duration_months_snapshot
               ),
               credentials_encrypted = COALESCE(
                 EXCLUDED.credentials_encrypted,
                 order_entitlements.credentials_encrypted
               ),
               mmu_cycle_index = EXCLUDED.mmu_cycle_index,
               mmu_cycle_total = EXCLUDED.mmu_cycle_total,
               metadata = COALESCE(order_entitlements.metadata, '{}'::jsonb)
                 || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
               updated_at = NOW()
           RETURNING *`,
          [
            input.order_id,
            input.order_item_id ?? null,
            input.user_id,
            status,
            input.starts_at,
            input.ends_at,
            input.duration_months_snapshot ?? null,
            input.credentials_encrypted ?? null,
            input.mmu_cycle_index ?? null,
            input.mmu_cycle_total ?? null,
            input.source_subscription_id,
            metadata,
          ]
        );

        return result.rows[0] ? mapRow(result.rows[0]) : null;
      }

      if (input.order_item_id) {
        const result = await db.query(
          `INSERT INTO order_entitlements
            (
              order_id,
              order_item_id,
              user_id,
              status,
              starts_at,
              ends_at,
              duration_months_snapshot,
              credentials_encrypted,
              mmu_cycle_index,
              mmu_cycle_total,
              metadata
            )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT ON CONSTRAINT order_entitlements_order_item_id_key
           DO UPDATE
           SET order_id = EXCLUDED.order_id,
               user_id = EXCLUDED.user_id,
               status = EXCLUDED.status,
               starts_at = EXCLUDED.starts_at,
               ends_at = EXCLUDED.ends_at,
               duration_months_snapshot = COALESCE(
                 EXCLUDED.duration_months_snapshot,
                 order_entitlements.duration_months_snapshot
               ),
               credentials_encrypted = COALESCE(
                 EXCLUDED.credentials_encrypted,
                 order_entitlements.credentials_encrypted
               ),
               mmu_cycle_index = EXCLUDED.mmu_cycle_index,
               mmu_cycle_total = EXCLUDED.mmu_cycle_total,
               metadata = COALESCE(order_entitlements.metadata, '{}'::jsonb)
                 || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
               updated_at = NOW()
           RETURNING *`,
          [
            input.order_id,
            input.order_item_id,
            input.user_id,
            status,
            input.starts_at,
            input.ends_at,
            input.duration_months_snapshot ?? null,
            input.credentials_encrypted ?? null,
            input.mmu_cycle_index ?? null,
            input.mmu_cycle_total ?? null,
            metadata,
          ]
        );

        return result.rows[0] ? mapRow(result.rows[0]) : null;
      }

      const result = await db.query(
        `INSERT INTO order_entitlements
          (
            order_id,
            user_id,
            status,
            starts_at,
            ends_at,
            duration_months_snapshot,
            credentials_encrypted,
            mmu_cycle_index,
            mmu_cycle_total,
            metadata
          )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          input.order_id,
          input.user_id,
          status,
          input.starts_at,
          input.ends_at,
          input.duration_months_snapshot ?? null,
          input.credentials_encrypted ?? null,
          input.mmu_cycle_index ?? null,
          input.mmu_cycle_total ?? null,
          metadata,
        ]
      );

      return result.rows[0] ? mapRow(result.rows[0]) : null;
    } catch (error) {
      Logger.error('Failed to upsert order entitlement', {
        orderId: input.order_id,
        orderItemId: input.order_item_id ?? null,
        sourceSubscriptionId: input.source_subscription_id ?? null,
        error,
      });
      return null;
    }
  }

  async listForOrder(
    params: {
      orderId: string;
      userId?: string;
    },
    client?: PoolClient
  ): Promise<OrderEntitlement[]> {
    try {
      const db = client ?? getDatabasePool();
      const result = await db.query(
        `SELECT *
         FROM order_entitlements
         WHERE order_id = $1
           ${params.userId ? 'AND user_id = $2' : ''}
         ORDER BY created_at ASC`,
        params.userId ? [params.orderId, params.userId] : [params.orderId]
      );
      return result.rows.map(mapRow);
    } catch (error) {
      Logger.error('Failed to list order entitlements', {
        orderId: params.orderId,
        userId: params.userId ?? null,
        error,
      });
      return [];
    }
  }

  async getForOrder(
    params: {
      entitlementId: string;
      orderId: string;
      userId?: string;
    },
    client?: PoolClient
  ): Promise<OrderEntitlement | null> {
    try {
      const db = client ?? getDatabasePool();
      const result = await db.query(
        `SELECT *
         FROM order_entitlements
         WHERE id = $1
           AND order_id = $2
           ${params.userId ? 'AND user_id = $3' : ''}
         LIMIT 1`,
        params.userId
          ? [params.entitlementId, params.orderId, params.userId]
          : [params.entitlementId, params.orderId]
      );
      return result.rows[0] ? mapRow(result.rows[0]) : null;
    } catch (error) {
      Logger.error('Failed to fetch order entitlement', {
        entitlementId: params.entitlementId,
        orderId: params.orderId,
        userId: params.userId ?? null,
        error,
      });
      return null;
    }
  }

  async updateEntitlementCredentialsEncryptedValue(params: {
    entitlementId: string;
    encryptedValue: string;
  }): Promise<boolean> {
    try {
      const pool = getDatabasePool();
      const result = await pool.query(
        `UPDATE order_entitlements
         SET credentials_encrypted = $2,
             updated_at = NOW()
         WHERE id = $1`,
        [params.entitlementId, params.encryptedValue]
      );
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      Logger.error('Failed to update order entitlement credentials', {
        entitlementId: params.entitlementId,
        error,
      });
      return false;
    }
  }
}

export const orderEntitlementService = new OrderEntitlementService();
