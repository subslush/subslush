import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authPreHandler } from '../../middleware/authMiddleware';
import { adminPreHandler } from '../../middleware/adminMiddleware';
import { getDatabasePool } from '../../config/database';
import { logAdminAction } from '../../services/auditLogService';
import { notificationService } from '../../services/notificationService';
import { ErrorResponses, SuccessResponses } from '../../utils/response';
import { Logger } from '../../utils/logger';
import { validate as uuidValidate } from 'uuid';
import { subscriptionService } from '../../services/subscriptionService';
import { credentialsEncryptionService } from '../../utils/encryption';
import {
  formatSubscriptionDisplayName,
  formatSubscriptionShortId,
} from '../../utils/subscriptionHelpers';
import { formatMmuCoverageLabel } from '../../utils/mmuSchedule';
import { parseJsonValue } from '../../utils/json';

const renewalWorkflowTaskTypes = new Set(['renewal', 'manual_monthly_upgrade']);

const parseBoolean = (value: unknown): boolean | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return undefined;
};

const prelaunchRewardStatuses = new Set(['pending', 'issue', 'delivered']);

const resolvePrelaunchRewardStatus = (
  value: unknown
): 'pending' | 'issue' | 'delivered' | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (prelaunchRewardStatuses.has(normalized)) {
    return normalized as 'pending' | 'issue' | 'delivered';
  }
  return undefined;
};

const isValidUuid = (value: string): boolean => {
  if (typeof uuidValidate === 'function') {
    return uuidValidate(value);
  }
  return /^[0-9a-f-]{36}$/i.test(value);
};

export async function adminTaskRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            task_category: { type: 'string' },
            bucket: { type: 'string' },
            is_issue: { type: 'string' },
            limit: { type: 'number', minimum: 1, maximum: 200 },
            offset: { type: 'number', minimum: 0 },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const {
          status,
          task_category,
          bucket,
          is_issue,
          limit = 50,
          offset = 0,
        } = request.query as {
          status?: string;
          task_category?: string;
          bucket?: string;
          is_issue?: string;
          limit?: number;
          offset?: number;
        };

        const pool = getDatabasePool();
        const params: any[] = [];
        let paramCount = 0;
        let sql = `
          SELECT t.*,
            COALESCE(o.user_id, s.user_id, t.user_id) AS effective_user_id,
            u.email AS effective_user_email,
            u.email AS user_email,
            o.status AS order_status,
            o.currency AS order_currency,
            o.coupon_id AS order_coupon_id,
            o.coupon_code AS order_coupon_code,
            o.coupon_discount_cents AS order_coupon_discount_cents,
            o.payment_provider AS order_payment_provider,
            o.payment_reference AS order_payment_reference,
            s.service_type AS subscription_service_type,
            s.service_plan AS subscription_service_plan,
            s.status AS subscription_status,
            s.term_months AS subscription_term_months,
            sel.upgrade_options_snapshot AS subscription_upgrade_options_snapshot,
            CASE
              WHEN t.completed_at IS NOT NULL THEN 'completed'
              WHEN t.is_issue = TRUE THEN 'issue'
              WHEN t.assigned_admin IS NOT NULL THEN 'in_progress'
              ELSE 'pending'
            END as status
          FROM admin_tasks t
          LEFT JOIN orders o ON o.id = t.order_id
          LEFT JOIN subscriptions s ON s.id = t.subscription_id
          LEFT JOIN subscription_upgrade_selections sel ON sel.subscription_id = s.id
          LEFT JOIN users u ON u.id = COALESCE(o.user_id, s.user_id, t.user_id)
          WHERE 1=1
        `;

        if (task_category) {
          sql += ` AND t.task_category = $${++paramCount}`;
          params.push(task_category);
        }

        const issueFlag = parseBoolean(is_issue);
        if (issueFlag !== undefined) {
          sql += ` AND t.is_issue = $${++paramCount}`;
          params.push(issueFlag);
        }

        if (bucket === 'queue') {
          sql += ' AND t.completed_at IS NULL AND t.is_issue = FALSE';
        }

        if (bucket === 'issues') {
          sql += ' AND t.completed_at IS NULL AND t.is_issue = TRUE';
        }

        if (bucket === 'delivered') {
          sql += ' AND t.completed_at IS NOT NULL';
        }

        if (status === 'pending') {
          sql +=
            ' AND t.completed_at IS NULL AND t.assigned_admin IS NULL AND t.is_issue = FALSE';
        }

        if (status === 'in_progress') {
          sql +=
            ' AND t.completed_at IS NULL AND t.assigned_admin IS NOT NULL AND t.is_issue = FALSE';
        }

        if (status === 'completed') {
          sql += ' AND t.completed_at IS NOT NULL';
        }

        if (status === 'issue') {
          sql += ' AND t.completed_at IS NULL AND t.is_issue = TRUE';
        }

        if (bucket === 'delivered') {
          sql += ' ORDER BY t.completed_at DESC NULLS LAST, t.created_at DESC';
        } else {
          sql += ' ORDER BY t.created_at ASC';
        }

        sql += ` LIMIT $${++paramCount} OFFSET $${++paramCount}`;
        params.push(limit, offset);

        const result = await pool.query(sql, params);
        const tasks = result.rows.map(row => {
          if (row.task_type !== 'manual_monthly_upgrade') {
            return row;
          }
          const options = parseJsonValue<Record<string, any>>(
            row.subscription_upgrade_options_snapshot,
            {}
          );
          const label = formatMmuCoverageLabel({
            termMonths: Number(row.subscription_term_months),
            intervalMonths:
              Number(options?.['manual_monthly_upgrade_interval_months']) || 1,
            cycleIndex: Number(row.mmu_cycle_index),
          });
          return {
            ...row,
            mmu_label: label?.label ?? null,
            mmu_covers_months_from: label?.coversMonthsFrom ?? null,
            mmu_covers_months_to: label?.coversMonthsTo ?? null,
            mmu_term_months: label?.termMonths ?? null,
          };
        });

        return SuccessResponses.ok(reply, { tasks });
      } catch (error) {
        Logger.error('Admin list tasks failed:', error);
        return ErrorResponses.internalError(reply, 'Failed to list tasks');
      }
    }
  );

  fastify.get(
    '/prelaunch-rewards',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            limit: { type: 'number', minimum: 1, maximum: 200 },
            offset: { type: 'number', minimum: 0 },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const {
          status,
          limit = 50,
          offset = 0,
        } = request.query as {
          status?: string;
          limit?: number;
          offset?: number;
        };

        const resolvedStatus = resolvePrelaunchRewardStatus(status);
        if (status && !resolvedStatus) {
          return ErrorResponses.badRequest(
            reply,
            'Invalid pre-launch reward task status'
          );
        }

        const pool = getDatabasePool();
        const params: any[] = [];
        let paramCount = 0;
        let sql = `
          SELECT t.*,
            u.email AS user_email
          FROM prelaunch_reward_tasks t
          LEFT JOIN users u ON u.id = t.user_id
          WHERE 1=1
        `;

        if (resolvedStatus) {
          sql += ` AND t.status = $${++paramCount}`;
          params.push(resolvedStatus);
        }

        sql += ' ORDER BY t.created_at DESC';
        sql += ` LIMIT $${++paramCount} OFFSET $${++paramCount}`;
        params.push(limit, offset);

        const result = await pool.query(sql, params);

        return SuccessResponses.ok(reply, { tasks: result.rows });
      } catch (error) {
        Logger.error('Admin list prelaunch reward tasks failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to list pre-launch reward tasks'
        );
      }
    }
  );

  fastify.post(
    '/prelaunch-rewards/:taskId/issue',
    {
      schema: {
        params: {
          type: 'object',
          required: ['taskId'],
          properties: {
            taskId: { type: 'string', format: 'uuid' },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { taskId } = request.params as { taskId: string };

        if (!isValidUuid(taskId)) {
          return ErrorResponses.badRequest(reply, 'Invalid task ID format');
        }

        const pool = getDatabasePool();
        const result = await pool.query(
          `UPDATE prelaunch_reward_tasks
           SET status = 'issue',
               updated_at = NOW()
           WHERE id = $1
           RETURNING *`,
          [taskId]
        );

        if (result.rows.length === 0) {
          return ErrorResponses.notFound(
            reply,
            'Pre-launch reward task not found'
          );
        }

        await logAdminAction(request, {
          action: 'prelaunch_rewards.task.issue',
          entityType: 'prelaunch_reward_task',
          entityId: taskId,
        });

        return SuccessResponses.ok(reply, result.rows[0]);
      } catch (error) {
        Logger.error('Admin update prelaunch reward task failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to update pre-launch reward task'
        );
      }
    }
  );

  fastify.post(
    '/prelaunch-rewards/:taskId/delivered',
    {
      schema: {
        params: {
          type: 'object',
          required: ['taskId'],
          properties: {
            taskId: { type: 'string', format: 'uuid' },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { taskId } = request.params as { taskId: string };

        if (!isValidUuid(taskId)) {
          return ErrorResponses.badRequest(reply, 'Invalid task ID format');
        }

        const pool = getDatabasePool();
        const result = await pool.query(
          `UPDATE prelaunch_reward_tasks
           SET status = 'delivered',
               updated_at = NOW()
           WHERE id = $1
           RETURNING *`,
          [taskId]
        );

        if (result.rows.length === 0) {
          return ErrorResponses.notFound(
            reply,
            'Pre-launch reward task not found'
          );
        }

        await logAdminAction(request, {
          action: 'prelaunch_rewards.task.delivered',
          entityType: 'prelaunch_reward_task',
          entityId: taskId,
        });

        return SuccessResponses.ok(reply, result.rows[0]);
      } catch (error) {
        Logger.error('Admin update prelaunch reward task failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to update pre-launch reward task'
        );
      }
    }
  );

  fastify.get(
    '/:taskId/credentials',
    {
      schema: {
        params: {
          type: 'object',
          required: ['taskId'],
          properties: {
            taskId: { type: 'string', format: 'uuid' },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { taskId } = request.params as { taskId: string };
        if (!isValidUuid(taskId)) {
          return ErrorResponses.badRequest(reply, 'Invalid task ID format');
        }

        const pool = getDatabasePool();
        const taskResult = await pool.query(
          `SELECT id, task_type, subscription_id
           FROM admin_tasks
           WHERE id = $1`,
          [taskId]
        );
        const task = taskResult.rows[0] || null;
        if (!task) {
          return ErrorResponses.notFound(reply, 'Task not found');
        }
        if (task.task_type !== 'manual_monthly_upgrade') {
          return ErrorResponses.badRequest(
            reply,
            'Credentials are only available for MMU tasks through this endpoint'
          );
        }
        if (!task.subscription_id) {
          return ErrorResponses.badRequest(
            reply,
            'Task is not linked to a subscription'
          );
        }

        const result = await subscriptionService.getSubscriptionById(
          task.subscription_id
        );
        if (!result.success || !result.data) {
          return ErrorResponses.notFound(reply, 'Subscription not found');
        }

        await logAdminAction(request, {
          action: 'subscriptions.credentials.view',
          entityType: 'subscription',
          entityId: task.subscription_id,
          metadata: {
            context: 'mmu_task_view',
            task_id: taskId,
            credentialPresent: Boolean(result.data.credentials_encrypted),
          },
        });

        if (!result.data.credentials_encrypted) {
          return SuccessResponses.ok(reply, { credentials: null });
        }

        const decrypted = credentialsEncryptionService.decryptFromString(
          result.data.credentials_encrypted
        );
        if (!decrypted.wasEncrypted && decrypted.migratedPayload) {
          await subscriptionService.updateSubscriptionCredentialsEncryptedValue(
            {
              subscriptionId: task.subscription_id,
              encryptedValue: decrypted.migratedPayload,
            }
          );
        }

        return SuccessResponses.ok(reply, {
          credentials: decrypted.plaintext,
          subscription_id: task.subscription_id,
        });
      } catch (error) {
        Logger.error('Admin task credential view failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to retrieve task credentials'
        );
      }
    }
  );

  fastify.post(
    '/:taskId/paid',
    {
      schema: {
        params: {
          type: 'object',
          required: ['taskId'],
          properties: {
            taskId: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          properties: {
            note: { type: 'string', maxLength: 500 },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { taskId } = request.params as { taskId: string };
        const { note } = request.body as { note?: string };

        if (!isValidUuid(taskId)) {
          return ErrorResponses.badRequest(reply, 'Invalid task ID format');
        }

        const pool = getDatabasePool();
        const notePrefix = note
          ? `[${new Date().toISOString()}] ${note}`
          : `[${new Date().toISOString()}] Renewal payment confirmed`;

        const result = await pool.query(
          `UPDATE admin_tasks
           SET payment_confirmed_at = COALESCE(payment_confirmed_at, NOW()),
               assigned_admin = COALESCE(assigned_admin, $1),
               notes = CASE
                 WHEN notes IS NULL OR notes = '' THEN $2
                 ELSE notes || '\n' || $2
               END
           WHERE id = $3
             AND task_type = ANY($4::text[])
             AND completed_at IS NULL
           RETURNING *`,
          [
            request.user?.userId || null,
            notePrefix,
            taskId,
            Array.from(renewalWorkflowTaskTypes),
          ]
        );

        if (result.rows.length === 0) {
          const existsResult = await pool.query(
            'SELECT task_type, completed_at FROM admin_tasks WHERE id = $1',
            [taskId]
          );

          if (existsResult.rows.length === 0) {
            return ErrorResponses.notFound(reply, 'Task not found');
          }

          if (!renewalWorkflowTaskTypes.has(existsResult.rows[0].task_type)) {
            return ErrorResponses.badRequest(
              reply,
              'Task is not a renewal task'
            );
          }

          return ErrorResponses.badRequest(reply, 'Task already completed');
        }

        await logAdminAction(request, {
          action: 'tasks.payment_confirmed',
          entityType: 'admin_task',
          entityId: taskId,
          after: result.rows[0] || null,
          metadata: {
            note: note || null,
          },
        });

        return SuccessResponses.ok(reply, result.rows[0], 'Payment confirmed');
      } catch (error) {
        Logger.error('Admin confirm task payment failed:', error);
        return ErrorResponses.internalError(reply, 'Failed to confirm payment');
      }
    }
  );

  fastify.post(
    '/:taskId/renewal/confirm',
    {
      schema: {
        params: {
          type: 'object',
          required: ['taskId'],
          properties: {
            taskId: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          properties: {
            note: { type: 'string', maxLength: 500 },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { taskId } = request.params as { taskId: string };
        const { note } = request.body as { note?: string };

        if (!isValidUuid(taskId)) {
          return ErrorResponses.badRequest(reply, 'Invalid task ID format');
        }

        const pool = getDatabasePool();
        const taskResult = await pool.query(
          'SELECT * FROM admin_tasks WHERE id = $1',
          [taskId]
        );

        if (taskResult.rows.length === 0) {
          return ErrorResponses.notFound(reply, 'Task not found');
        }

        const task = taskResult.rows[0];
        if (task.completed_at) {
          return ErrorResponses.badRequest(reply, 'Task already completed');
        }
        if (!renewalWorkflowTaskTypes.has(task.task_type)) {
          return ErrorResponses.badRequest(reply, 'Task is not a renewal task');
        }
        if (task.task_type === 'manual_monthly_upgrade') {
          const orderPaymentResult = await pool.query(
            `SELECT o.id, o.status,
                    EXISTS (
                      SELECT 1
                      FROM payments p
                      WHERE p.order_id = o.id
                        AND p.status = 'succeeded'
                    ) AS has_succeeded_payment
             FROM orders o
             LEFT JOIN subscriptions s ON s.order_id = o.id
             WHERE o.id = $1 OR s.id = $2
             ORDER BY CASE WHEN o.id = $1 THEN 0 ELSE 1 END
             LIMIT 1`,
            [task.order_id || null, task.subscription_id || null]
          );
          const order = orderPaymentResult.rows[0] || null;
          if (
            !order ||
            !['paid', 'in_process', 'delivered'].includes(order.status) ||
            order.has_succeeded_payment !== true
          ) {
            return ErrorResponses.badRequest(
              reply,
              'Parent order payment must be verified before completing MMU renewal'
            );
          }
        } else if (!task.payment_confirmed_at) {
          return ErrorResponses.badRequest(
            reply,
            'Confirm payment before completing renewal'
          );
        }

        const notePrefix = note
          ? `[${new Date().toISOString()}] ${note}`
          : `[${new Date().toISOString()}] Renewal delivered`;

        const updateResult = await pool.query(
          `UPDATE admin_tasks
           SET completed_at = NOW(),
               assigned_admin = $1,
               notes = CASE
                 WHEN notes IS NULL OR notes = '' THEN $2
                 ELSE notes || '\n' || $2
               END
           WHERE id = $3 AND completed_at IS NULL
           RETURNING *`,
          [request.user?.userId || null, notePrefix, taskId]
        );

        if (updateResult.rows.length === 0) {
          return ErrorResponses.badRequest(reply, 'Task already completed');
        }

        const subscriptionResult = await pool.query(
          `SELECT s.id,
                  s.user_id,
                  s.service_type,
                  s.service_plan,
                  COALESCE(s.product_name_snapshot, p.name) AS product_name,
                  pv.name AS variant_name
           FROM subscriptions s
           LEFT JOIN product_variants pv ON pv.id = s.product_variant_id
           LEFT JOIN products p ON p.id = COALESCE(s.product_id, pv.product_id)
           WHERE s.id = $1`,
          [task.subscription_id]
        );

        if (subscriptionResult.rows.length > 0) {
          const subscription = subscriptionResult.rows[0];

          const subscriptionLabel = formatSubscriptionDisplayName({
            productName: subscription.product_name ?? null,
            variantName: subscription.variant_name ?? null,
            serviceType: subscription.service_type,
            servicePlan: subscription.service_plan,
            termMonths: subscription.term_months ?? null,
          });
          const subscriptionShort = formatSubscriptionShortId(subscription.id);

          try {
            const renewedAt = new Date().toISOString();
            await notificationService.createNotification({
              userId: subscription.user_id,
              type: 'subscription_renewed',
              title: 'Renewal delivered',
              message: `Your ${subscriptionLabel} renewal (${subscriptionShort}) has been fulfilled and is now active.`,
              metadata: {
                subscription_id: subscription.id,
                link: '/dashboard/orders',
                renewed_at: renewedAt,
              },
              subscriptionId: subscription.id,
              dedupeKey: `subscription_renewed:${subscription.id}:${renewedAt}`,
            });
          } catch (error) {
            Logger.warn('Failed to create renewal notification', {
              subscriptionId: subscription.id,
              error,
            });
          }
        }

        await logAdminAction(request, {
          action: 'tasks.renewal.completed',
          entityType: 'admin_task',
          entityId: taskId,
          after: updateResult.rows[0] || null,
          metadata: {
            note: note || null,
          },
        });

        return SuccessResponses.ok(
          reply,
          updateResult.rows[0],
          'Renewal confirmed'
        );
      } catch (error) {
        Logger.error('Admin confirm renewal failed:', error);
        return ErrorResponses.internalError(reply, 'Failed to confirm renewal');
      }
    }
  );

  fastify.post(
    '/:taskId/complete',
    {
      schema: {
        params: {
          type: 'object',
          required: ['taskId'],
          properties: {
            taskId: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          properties: {
            note: { type: 'string', maxLength: 500 },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { taskId } = request.params as { taskId: string };
        const { note } = request.body as { note?: string };

        if (!isValidUuid(taskId)) {
          return ErrorResponses.badRequest(reply, 'Invalid task ID format');
        }

        const pool = getDatabasePool();
        const notePrefix = note
          ? `[${new Date().toISOString()}] ${note}`
          : null;

        const result = await pool.query(
          `UPDATE admin_tasks
           SET completed_at = NOW(),
               assigned_admin = $1,
               notes = CASE
                 WHEN $2::text IS NULL THEN notes
                 WHEN notes IS NULL OR notes = '' THEN $2
                 ELSE notes || '\n' || $2
               END
           WHERE id = $3 AND completed_at IS NULL
           RETURNING *`,
          [request.user?.userId || null, notePrefix, taskId]
        );

        if (result.rows.length === 0) {
          const existsResult = await pool.query(
            'SELECT completed_at FROM admin_tasks WHERE id = $1',
            [taskId]
          );

          if (existsResult.rows.length === 0) {
            return ErrorResponses.notFound(reply, 'Task not found');
          }

          return ErrorResponses.badRequest(reply, 'Task already completed');
        }

        await logAdminAction(request, {
          action: 'tasks.complete',
          entityType: 'admin_task',
          entityId: taskId,
          after: result.rows[0] || null,
          metadata: {
            note: note || null,
          },
        });

        return SuccessResponses.ok(reply, result.rows[0], 'Task completed');
      } catch (error) {
        Logger.error('Admin complete task failed:', error);
        return ErrorResponses.internalError(reply, 'Failed to complete task');
      }
    }
  );

  fastify.post(
    '/:taskId/start',
    {
      schema: {
        params: {
          type: 'object',
          required: ['taskId'],
          properties: {
            taskId: { type: 'string', format: 'uuid' },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { taskId } = request.params as { taskId: string };

        if (!isValidUuid(taskId)) {
          return ErrorResponses.badRequest(reply, 'Invalid task ID format');
        }

        const pool = getDatabasePool();
        const adminUserId = request.user?.userId || null;

        const result = await pool.query(
          `UPDATE admin_tasks
           SET assigned_admin = $1
           WHERE id = $2
             AND completed_at IS NULL
             AND (assigned_admin IS NULL OR assigned_admin = $1)
           RETURNING *`,
          [adminUserId, taskId]
        );

        if (result.rows.length === 0) {
          const existing = await pool.query(
            'SELECT assigned_admin, completed_at FROM admin_tasks WHERE id = $1',
            [taskId]
          );

          if (existing.rows.length === 0) {
            return ErrorResponses.notFound(reply, 'Task not found');
          }

          if (existing.rows[0].completed_at) {
            return ErrorResponses.badRequest(reply, 'Task already completed');
          }

          return ErrorResponses.badRequest(
            reply,
            'Task already assigned to another admin'
          );
        }

        await logAdminAction(request, {
          action: 'tasks.start',
          entityType: 'admin_task',
          entityId: taskId,
          after: result.rows[0] || null,
        });

        return SuccessResponses.ok(reply, result.rows[0], 'Task assigned');
      } catch (error) {
        Logger.error('Admin start task failed:', error);
        return ErrorResponses.internalError(reply, 'Failed to start task');
      }
    }
  );

  fastify.post(
    '/:taskId/issue',
    {
      schema: {
        params: {
          type: 'object',
          required: ['taskId'],
          properties: {
            taskId: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          properties: {
            note: { type: 'string', maxLength: 500 },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { taskId } = request.params as { taskId: string };
        const { note } = request.body as { note?: string };

        if (!isValidUuid(taskId)) {
          return ErrorResponses.badRequest(reply, 'Invalid task ID format');
        }

        const pool = getDatabasePool();
        const notePrefix = note
          ? `[${new Date().toISOString()}] ${note}`
          : null;

        const result = await pool.query(
          `UPDATE admin_tasks
           SET is_issue = TRUE,
               notes = CASE
                 WHEN $1::text IS NULL THEN notes
                 WHEN notes IS NULL OR notes = '' THEN $1
                 ELSE notes || '\n' || $1
               END
           WHERE id = $2 AND completed_at IS NULL
           RETURNING *`,
          [notePrefix, taskId]
        );

        if (result.rows.length === 0) {
          const existsResult = await pool.query(
            'SELECT completed_at FROM admin_tasks WHERE id = $1',
            [taskId]
          );

          if (existsResult.rows.length === 0) {
            return ErrorResponses.notFound(reply, 'Task not found');
          }

          return ErrorResponses.badRequest(reply, 'Task already completed');
        }

        await logAdminAction(request, {
          action: 'tasks.issue',
          entityType: 'admin_task',
          entityId: taskId,
          after: result.rows[0] || null,
          metadata: {
            note: note || null,
          },
        });

        return SuccessResponses.ok(
          reply,
          result.rows[0],
          'Task moved to issues'
        );
      } catch (error) {
        Logger.error('Admin move task to issues failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to move task to issues'
        );
      }
    }
  );

  fastify.post(
    '/:taskId/queue',
    {
      schema: {
        params: {
          type: 'object',
          required: ['taskId'],
          properties: {
            taskId: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          properties: {
            note: { type: 'string', maxLength: 500 },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { taskId } = request.params as { taskId: string };
        const { note } = request.body as { note?: string };

        if (!isValidUuid(taskId)) {
          return ErrorResponses.badRequest(reply, 'Invalid task ID format');
        }

        const pool = getDatabasePool();
        const notePrefix = note
          ? `[${new Date().toISOString()}] ${note}`
          : null;

        const result = await pool.query(
          `UPDATE admin_tasks
           SET is_issue = FALSE,
               notes = CASE
                 WHEN $1::text IS NULL THEN notes
                 WHEN notes IS NULL OR notes = '' THEN $1
                 ELSE notes || '\n' || $1
               END
           WHERE id = $2 AND completed_at IS NULL
           RETURNING *`,
          [notePrefix, taskId]
        );

        if (result.rows.length === 0) {
          const existsResult = await pool.query(
            'SELECT completed_at FROM admin_tasks WHERE id = $1',
            [taskId]
          );

          if (existsResult.rows.length === 0) {
            return ErrorResponses.notFound(reply, 'Task not found');
          }

          return ErrorResponses.badRequest(reply, 'Task already completed');
        }

        await logAdminAction(request, {
          action: 'tasks.queue',
          entityType: 'admin_task',
          entityId: taskId,
          after: result.rows[0] || null,
          metadata: {
            note: note || null,
          },
        });

        return SuccessResponses.ok(
          reply,
          result.rows[0],
          'Task moved to queue'
        );
      } catch (error) {
        Logger.error('Admin move task to queue failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to move task to queue'
        );
      }
    }
  );
}
