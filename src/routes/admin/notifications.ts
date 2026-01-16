import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { authPreHandler } from '../../middleware/authMiddleware';
import { adminPreHandler } from '../../middleware/adminMiddleware';
import { getDatabasePool } from '../../config/database';
import { notificationService } from '../../services/notificationService';
import type { NotificationType } from '../../types/notification';
import { logAdminAction } from '../../services/auditLogService';
import { ErrorResponses, SuccessResponses } from '../../utils/response';
import { Logger } from '../../utils/logger';

const ANNOUNCEMENT_TITLE = 'Announcement';
const ANNOUNCEMENT_TYPE: NotificationType = 'announcement';
const ANNOUNCEMENT_BATCH_SIZE = 500;

const sanitizeMessage = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export async function adminNotificationRoutes(
  fastify: FastifyInstance
): Promise<void> {
  fastify.post(
    '/announcements',
    {
      schema: {
        body: {
          type: 'object',
          required: ['message'],
          properties: {
            message: { type: 'string', minLength: 1, maxLength: 2000 },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { message } = request.body as { message: string };
        const trimmedMessage = sanitizeMessage(message);

        if (!trimmedMessage) {
          return ErrorResponses.badRequest(
            reply,
            'Announcement message is required'
          );
        }

        const pool = getDatabasePool();
        const userResult = await pool.query(
          `SELECT id FROM users WHERE status != 'deleted'`
        );
        const userIds = userResult.rows.map((row: { id: string }) => row.id);

        if (userIds.length === 0) {
          await logAdminAction(request, {
            action: 'notifications.announcement.sent',
            entityType: 'notification',
            entityId: null,
            metadata: {
              targetCount: 0,
              created: 0,
            },
          });

          return SuccessResponses.ok(reply, {
            created: 0,
            targetCount: 0,
          });
        }

        const announcementId = uuidv4();
        const sentAt = new Date().toISOString();
        let totalCreated = 0;

        for (let i = 0; i < userIds.length; i += ANNOUNCEMENT_BATCH_SIZE) {
          const batch = userIds.slice(i, i + ANNOUNCEMENT_BATCH_SIZE);
          const inputs = batch.map(userId => ({
            userId,
            type: ANNOUNCEMENT_TYPE,
            title: ANNOUNCEMENT_TITLE,
            message: trimmedMessage,
            metadata: {
              announcement_id: announcementId,
              sent_at: sentAt,
              sent_by: request.user?.userId ?? null,
            },
            dedupeKey: `announcement:${announcementId}:${userId}`,
          }));

          const result = await notificationService.createNotifications(inputs);
          if (!result.success) {
            Logger.error('Admin announcement batch failed:', {
              error: result.error,
              batchStart: i,
              batchSize: batch.length,
            });

            await logAdminAction(request, {
              action: 'notifications.announcement.failed',
              entityType: 'notification',
              entityId: announcementId,
              metadata: {
                targetCount: userIds.length,
                created: totalCreated,
                failureBatchStart: i,
                failureBatchSize: batch.length,
              },
            });

            return ErrorResponses.internalError(
              reply,
              `Announcement sent to ${totalCreated} users before an error occurred`
            );
          }

          totalCreated += result.data.created;
        }

        await logAdminAction(request, {
          action: 'notifications.announcement.sent',
          entityType: 'notification',
          entityId: announcementId,
          metadata: {
            targetCount: userIds.length,
            created: totalCreated,
            messageLength: trimmedMessage.length,
          },
        });

        return SuccessResponses.ok(reply, {
          created: totalCreated,
          targetCount: userIds.length,
          announcementId,
        });
      } catch (error) {
        Logger.error('Admin announcement failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to send notification announcements'
        );
      }
    }
  );
}
