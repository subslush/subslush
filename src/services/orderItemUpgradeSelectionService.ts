import type { PoolClient } from 'pg';
import { getDatabasePool } from '../config/database';
import { Logger } from '../utils/logger';
import { credentialsEncryptionService } from '../utils/encryption';
import type { UpgradeSelectionType } from '../types/subscription';

export type OrderItemUpgradeSelection = {
  order_item_id: string;
  selection_type: UpgradeSelectionType | null;
  account_identifier: string | null;
  credentials_encrypted: string | null;
  manual_monthly_acknowledged_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

function mapRow(row: any): OrderItemUpgradeSelection {
  return {
    order_item_id: row.order_item_id,
    selection_type: row.selection_type ?? null,
    account_identifier: row.account_identifier ?? null,
    credentials_encrypted: row.credentials_encrypted ?? null,
    manual_monthly_acknowledged_at: row.manual_monthly_acknowledged_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export class OrderItemUpgradeSelectionService {
  async upsertSelection(
    params: {
      orderItemId: string;
      selectionType?: UpgradeSelectionType | null;
      accountIdentifier?: string | null;
      credentials?: string | null;
      credentialsEncrypted?: string | null;
      manualMonthlyAcknowledgedAt?: Date | null;
    },
    client?: PoolClient
  ): Promise<OrderItemUpgradeSelection | null> {
    try {
      const pool = client ?? getDatabasePool();
      const credentialsValue =
        params.credentials !== undefined
          ? params.credentials
          : (params.credentialsEncrypted ?? null);
      const credentialsEncrypted =
        credentialsValue !== undefined
          ? credentialsEncryptionService.prepareForStorage(credentialsValue)
          : null;

      const result = await pool.query(
        `INSERT INTO order_item_upgrade_selections
          (order_item_id, selection_type, account_identifier, credentials_encrypted, manual_monthly_acknowledged_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (order_item_id) DO UPDATE
         SET selection_type = COALESCE(EXCLUDED.selection_type, order_item_upgrade_selections.selection_type),
             account_identifier = COALESCE(EXCLUDED.account_identifier, order_item_upgrade_selections.account_identifier),
             credentials_encrypted = COALESCE(EXCLUDED.credentials_encrypted, order_item_upgrade_selections.credentials_encrypted),
             manual_monthly_acknowledged_at = COALESCE(EXCLUDED.manual_monthly_acknowledged_at, order_item_upgrade_selections.manual_monthly_acknowledged_at),
             updated_at = NOW()
         RETURNING *`,
        [
          params.orderItemId,
          params.selectionType ?? null,
          params.accountIdentifier ?? null,
          credentialsEncrypted,
          params.manualMonthlyAcknowledgedAt ?? null,
        ]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return mapRow(result.rows[0]);
    } catch (error) {
      Logger.error('Failed to upsert order item upgrade selection', {
        orderItemId: params.orderItemId,
        error,
      });
      return null;
    }
  }

  async getSelection(
    orderItemId: string
  ): Promise<OrderItemUpgradeSelection | null> {
    try {
      const pool = getDatabasePool();
      const result = await pool.query(
        `SELECT *
         FROM order_item_upgrade_selections
         WHERE order_item_id = $1`,
        [orderItemId]
      );
      if (result.rows.length === 0) {
        return null;
      }
      return mapRow(result.rows[0]);
    } catch (error) {
      Logger.error('Failed to fetch order item upgrade selection', {
        orderItemId,
        error,
      });
      return null;
    }
  }

  async listSelectionsForOrder(
    orderId: string
  ): Promise<Record<string, OrderItemUpgradeSelection>> {
    try {
      const pool = getDatabasePool();
      const result = await pool.query(
        `SELECT sel.*
         FROM order_item_upgrade_selections sel
         JOIN order_items oi ON oi.id = sel.order_item_id
         WHERE oi.order_id = $1`,
        [orderId]
      );

      return result.rows.reduce(
        (acc: Record<string, OrderItemUpgradeSelection>, row: any) => {
          const mapped = mapRow(row);
          acc[mapped.order_item_id] = mapped;
          return acc;
        },
        {}
      );
    } catch (error) {
      Logger.error('Failed to list order item upgrade selections', {
        orderId,
        error,
      });
      return {};
    }
  }
}

export const orderItemUpgradeSelectionService =
  new OrderItemUpgradeSelectionService();
