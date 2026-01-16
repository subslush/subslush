import { getDatabasePool } from '../config/database';
import { Logger } from '../utils/logger';
import { credentialsEncryptionService } from '../utils/encryption';
import type {
  UpgradeOptionsSnapshot,
  UpgradeSelectionType,
} from '../types/subscription';
import type { UpgradeSelection } from '../types/upgradeSelection';

function parseSnapshot(value: any): UpgradeOptionsSnapshot {
  if (!value) {
    return {
      allow_new_account: false,
      allow_own_account: false,
      manual_monthly_upgrade: false,
    };
  }
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as UpgradeOptionsSnapshot;
    } catch {
      return {
        allow_new_account: false,
        allow_own_account: false,
        manual_monthly_upgrade: false,
      };
    }
  }
  return value as UpgradeOptionsSnapshot;
}

function mapSelection(row: any): UpgradeSelection {
  return {
    subscription_id: row.subscription_id,
    order_id: row.order_id ?? null,
    selection_type: row.selection_type ?? null,
    account_identifier: row.account_identifier ?? null,
    credentials_encrypted: row.credentials_encrypted ?? null,
    manual_monthly_acknowledged_at: row.manual_monthly_acknowledged_at ?? null,
    submitted_at: row.submitted_at ?? null,
    locked_at: row.locked_at ?? null,
    reminder_24h_at: row.reminder_24h_at ?? null,
    reminder_48h_at: row.reminder_48h_at ?? null,
    auto_selected_at: row.auto_selected_at ?? null,
    upgrade_options_snapshot: parseSnapshot(row.upgrade_options_snapshot),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export class UpgradeSelectionService {
  async ensureSelection(params: {
    subscriptionId: string;
    orderId?: string | null;
    upgradeOptions: UpgradeOptionsSnapshot;
  }): Promise<void> {
    try {
      const pool = getDatabasePool();
      await pool.query(
        `INSERT INTO subscription_upgrade_selections
          (subscription_id, order_id, upgrade_options_snapshot)
         VALUES ($1, $2, $3)
         ON CONFLICT (subscription_id) DO NOTHING`,
        [
          params.subscriptionId,
          params.orderId ?? null,
          JSON.stringify(params.upgradeOptions),
        ]
      );
    } catch (error) {
      Logger.error('Failed to ensure upgrade selection row', {
        subscriptionId: params.subscriptionId,
        error,
      });
    }
  }

  async markSelectionResolved(params: {
    subscriptionId: string;
    lockedAt?: Date;
  }): Promise<void> {
    try {
      const pool = getDatabasePool();
      const now = params.lockedAt ?? new Date();
      await pool.query(
        `UPDATE subscription_upgrade_selections
         SET submitted_at = COALESCE(submitted_at, $2),
             locked_at = COALESCE(locked_at, $3),
             updated_at = NOW()
         WHERE subscription_id = $1
           AND selection_type IS NULL
           AND submitted_at IS NULL
           AND locked_at IS NULL`,
        [params.subscriptionId, now, now]
      );
    } catch (error) {
      Logger.warn('Failed to mark selection as resolved', {
        subscriptionId: params.subscriptionId,
        error,
      });
    }
  }

  async getSelectionForSubscription(
    subscriptionId: string
  ): Promise<UpgradeSelection | null> {
    try {
      const pool = getDatabasePool();
      const result = await pool.query(
        `SELECT *
         FROM subscription_upgrade_selections
         WHERE subscription_id = $1`,
        [subscriptionId]
      );
      if (result.rows.length === 0) {
        return null;
      }
      return mapSelection(result.rows[0]);
    } catch (error) {
      Logger.error('Failed to fetch upgrade selection', {
        subscriptionId,
        error,
      });
      return null;
    }
  }

  async getSelectionForSubscriptionUser(
    subscriptionId: string,
    userId: string
  ): Promise<UpgradeSelection | null> {
    try {
      const pool = getDatabasePool();
      const result = await pool.query(
        `SELECT sel.*
         FROM subscription_upgrade_selections sel
         JOIN subscriptions s ON s.id = sel.subscription_id
         WHERE sel.subscription_id = $1
           AND s.user_id = $2`,
        [subscriptionId, userId]
      );
      if (result.rows.length === 0) {
        return null;
      }
      return mapSelection(result.rows[0]);
    } catch (error) {
      Logger.error('Failed to fetch upgrade selection for user', {
        subscriptionId,
        userId,
        error,
      });
      return null;
    }
  }

  async submitSelection(params: {
    subscriptionId: string;
    selectionType: UpgradeSelectionType;
    accountIdentifier?: string | null;
    credentials?: string | null;
    manualMonthlyAcknowledgedAt?: Date | null;
    autoSelectedAt?: Date | null;
  }): Promise<UpgradeSelection | null> {
    try {
      const pool = getDatabasePool();
      const now = new Date();
      const credentialsEncrypted =
        params.credentials !== undefined
          ? credentialsEncryptionService.prepareForStorage(params.credentials)
          : null;

      const result = await pool.query(
        `UPDATE subscription_upgrade_selections
         SET selection_type = $2,
             account_identifier = $3,
             credentials_encrypted = $4,
             manual_monthly_acknowledged_at = $5,
             submitted_at = COALESCE(submitted_at, $6),
             locked_at = COALESCE(locked_at, $7),
             auto_selected_at = COALESCE(auto_selected_at, $8),
             updated_at = NOW()
         WHERE subscription_id = $1
           AND locked_at IS NULL
         RETURNING *`,
        [
          params.subscriptionId,
          params.selectionType,
          params.accountIdentifier ?? null,
          credentialsEncrypted,
          params.manualMonthlyAcknowledgedAt ?? null,
          now,
          now,
          params.autoSelectedAt ?? null,
        ]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return mapSelection(result.rows[0]);
    } catch (error) {
      Logger.error('Failed to submit upgrade selection', {
        subscriptionId: params.subscriptionId,
        error,
      });
      return null;
    }
  }

  async acknowledgeManualMonthly(params: {
    subscriptionId: string;
    acknowledgedAt?: Date;
  }): Promise<UpgradeSelection | null> {
    try {
      const pool = getDatabasePool();
      const now = params.acknowledgedAt ?? new Date();

      const result = await pool.query(
        `UPDATE subscription_upgrade_selections
         SET manual_monthly_acknowledged_at = COALESCE(manual_monthly_acknowledged_at, $2),
             submitted_at = COALESCE(submitted_at, $3),
             locked_at = COALESCE(locked_at, $4),
             updated_at = NOW()
         WHERE subscription_id = $1
         RETURNING *`,
        [params.subscriptionId, now, now, now]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return mapSelection(result.rows[0]);
    } catch (error) {
      Logger.error('Failed to acknowledge manual monthly upgrade', {
        subscriptionId: params.subscriptionId,
        error,
      });
      return null;
    }
  }

  async markReminder(params: {
    subscriptionId: string;
    reminder: '24h' | '48h';
  }): Promise<void> {
    const column =
      params.reminder === '24h' ? 'reminder_24h_at' : 'reminder_48h_at';
    try {
      const pool = getDatabasePool();
      await pool.query(
        `UPDATE subscription_upgrade_selections
         SET ${column} = COALESCE(${column}, NOW()),
             updated_at = NOW()
         WHERE subscription_id = $1`,
        [params.subscriptionId]
      );
    } catch (error) {
      Logger.warn('Failed to mark selection reminder', {
        subscriptionId: params.subscriptionId,
        error,
      });
    }
  }

  async updateSelectionCredentialsEncryptedValue(params: {
    subscriptionId: string;
    encryptedValue: string | null;
  }): Promise<void> {
    try {
      const pool = getDatabasePool();
      await pool.query(
        `UPDATE subscription_upgrade_selections
         SET credentials_encrypted = $1,
             updated_at = NOW()
         WHERE subscription_id = $2`,
        [params.encryptedValue, params.subscriptionId]
      );
    } catch (error) {
      Logger.warn('Failed to update selection credentials value', {
        subscriptionId: params.subscriptionId,
        error,
      });
    }
  }
}

export const upgradeSelectionService = new UpgradeSelectionService();
