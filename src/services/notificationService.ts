import { getDatabasePool } from '../config/database';
import { Logger } from '../utils/logger';
import {
  Notification,
  CreateNotificationInput,
  NotificationListResult,
} from '../types/notification';
import {
  createSuccessResult,
  createErrorResult,
  ServiceResult,
} from '../types/service';

function parseMetadata(value: any): Record<string, unknown> | null {
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

function mapNotification(row: any): Notification {
  return {
    id: row.id,
    user_id: row.user_id,
    type: row.type,
    title: row.title,
    message: row.message,
    metadata: parseMetadata(row.metadata),
    read_at: row.read_at ?? null,
    cleared_at: row.cleared_at ?? null,
    created_at: row.created_at,
    order_id: row.order_id ?? null,
    subscription_id: row.subscription_id ?? null,
    dedupe_key: row.dedupe_key,
  };
}

export class NotificationService {
  async createNotification(
    input: CreateNotificationInput
  ): Promise<ServiceResult<Notification | null>> {
    try {
      const pool = getDatabasePool();
      const result = await pool.query(
        `INSERT INTO notifications (
          user_id, type, title, message, metadata, order_id, subscription_id, dedupe_key
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (dedupe_key) DO NOTHING
        RETURNING *`,
        [
          input.userId,
          input.type,
          input.title,
          input.message,
          input.metadata ? JSON.stringify(input.metadata) : '{}',
          input.orderId || null,
          input.subscriptionId || null,
          input.dedupeKey,
        ]
      );

      if (result.rows.length === 0) {
        return createSuccessResult(null);
      }

      return createSuccessResult(mapNotification(result.rows[0]));
    } catch (error) {
      Logger.error('Failed to create notification:', error);
      return createErrorResult('Failed to create notification');
    }
  }

  async createNotifications(
    inputs: CreateNotificationInput[]
  ): Promise<ServiceResult<{ created: number }>> {
    if (inputs.length === 0) {
      return createSuccessResult({ created: 0 });
    }

    try {
      const pool = getDatabasePool();
      const values: any[] = [];
      const placeholders = inputs.map((input, index) => {
        const baseIndex = index * 8;
        values.push(
          input.userId,
          input.type,
          input.title,
          input.message,
          input.metadata ? JSON.stringify(input.metadata) : '{}',
          input.orderId || null,
          input.subscriptionId || null,
          input.dedupeKey
        );
        return `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7}, $${baseIndex + 8})`;
      });

      const result = await pool.query(
        `INSERT INTO notifications (
          user_id, type, title, message, metadata, order_id, subscription_id, dedupe_key
        ) VALUES ${placeholders.join(', ')}
        ON CONFLICT (dedupe_key) DO NOTHING`,
        values
      );

      return createSuccessResult({ created: result.rowCount ?? 0 });
    } catch (error) {
      Logger.error('Failed to create notifications:', error);
      return createErrorResult('Failed to create notifications');
    }
  }

  async listNotificationsForUser(options: {
    userId: string;
    limit?: number;
    offset?: number;
    unreadOnly?: boolean;
  }): Promise<ServiceResult<NotificationListResult>> {
    try {
      const { userId, limit = 10, offset = 0, unreadOnly = false } = options;
      const filters: string[] = ['user_id = $1', 'cleared_at IS NULL'];
      const params: any[] = [userId];
      let paramCount = 1;

      if (unreadOnly) {
        filters.push('read_at IS NULL');
      }

      const whereClause = `WHERE ${filters.join(' AND ')}`;

      const countResult = await getDatabasePool().query(
        `SELECT COUNT(*) as count FROM notifications ${whereClause}`,
        params
      );
      const total = parseInt(countResult.rows[0]?.count || '0', 10);

      const unreadResult = await getDatabasePool().query(
        `SELECT COUNT(*) as count
         FROM notifications
         WHERE user_id = $1
           AND read_at IS NULL
           AND cleared_at IS NULL`,
        [userId]
      );
      const unreadCount = parseInt(unreadResult.rows[0]?.count || '0', 10);

      const listParams = [...params, limit, offset];
      const listSql = `
        SELECT * FROM notifications
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
      `;
      const listResult = await getDatabasePool().query(listSql, listParams);
      const notifications = listResult.rows.map(mapNotification);

      return createSuccessResult({
        notifications,
        total,
        unreadCount,
      });
    } catch (error) {
      Logger.error('Failed to list notifications:', error);
      return createErrorResult('Failed to list notifications');
    }
  }

  async markNotificationsRead(options: {
    userId: string;
    ids?: string[];
  }): Promise<ServiceResult<{ updated: number }>> {
    try {
      const { userId, ids } = options;
      const pool = getDatabasePool();

      let result;
      if (ids && ids.length > 0) {
        result = await pool.query(
          `UPDATE notifications
           SET read_at = NOW()
           WHERE user_id = $1
             AND id = ANY($2::uuid[])
             AND read_at IS NULL
             AND cleared_at IS NULL`,
          [userId, ids]
        );
      } else {
        result = await pool.query(
          `UPDATE notifications
           SET read_at = NOW()
           WHERE user_id = $1
             AND read_at IS NULL
             AND cleared_at IS NULL`,
          [userId]
        );
      }

      return createSuccessResult({ updated: result.rowCount ?? 0 });
    } catch (error) {
      Logger.error('Failed to mark notifications read:', error);
      return createErrorResult('Failed to mark notifications read');
    }
  }

  async clearNotificationsForUser(options: {
    userId: string;
    ids?: string[];
  }): Promise<ServiceResult<{ cleared: number }>> {
    try {
      const { userId, ids } = options;
      const pool = getDatabasePool();
      let result;

      if (ids && ids.length > 0) {
        result = await pool.query(
          `UPDATE notifications
           SET cleared_at = NOW()
           WHERE user_id = $1
             AND id = ANY($2::uuid[])
             AND cleared_at IS NULL`,
          [userId, ids]
        );
      } else {
        result = await pool.query(
          `UPDATE notifications
           SET cleared_at = NOW()
           WHERE user_id = $1
             AND cleared_at IS NULL`,
          [userId]
        );
      }

      return createSuccessResult({ cleared: result.rowCount ?? 0 });
    } catch (error) {
      Logger.error('Failed to clear notifications:', error);
      return createErrorResult('Failed to clear notifications');
    }
  }
}

export const notificationService = new NotificationService();
