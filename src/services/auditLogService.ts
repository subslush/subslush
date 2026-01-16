import { FastifyRequest } from 'fastify';
import { getDatabasePool } from '../config/database';
import { Logger } from '../utils/logger';

export interface AdminAuditLogEntry {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  // Allow rich domain objects; JSON.stringify handles Dates and plain objects.
  before?: unknown | null;
  after?: unknown | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

export interface CredentialRevealAuditEntry {
  userId?: string | null;
  subscriptionId?: string | null;
  success: boolean;
  failureReason?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

class AuditLogService {
  async recordAdminAction(entry: AdminAuditLogEntry): Promise<void> {
    try {
      const pool = getDatabasePool();
      const toJson = (value: unknown): string | null => {
        if (value === undefined || value === null) {
          return null;
        }
        return JSON.stringify(value);
      };

      await pool.query(
        `INSERT INTO admin_audit_logs
         (user_id, action, entity_type, entity_id, before, after, metadata,
          ip_address, user_agent, request_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          entry.userId || null,
          entry.action,
          entry.entityType,
          entry.entityId || null,
          toJson(entry.before),
          toJson(entry.after),
          toJson(entry.metadata),
          entry.ipAddress || null,
          entry.userAgent || null,
          entry.requestId || null,
        ]
      );
    } catch (error) {
      Logger.error('Failed to record admin audit log:', error);
    }
  }

  async recordCredentialRevealAttempt(
    entry: CredentialRevealAuditEntry
  ): Promise<void> {
    try {
      const pool = getDatabasePool();
      const toJson = (value: unknown): string | null => {
        if (value === undefined || value === null) {
          return null;
        }
        return JSON.stringify(value);
      };

      await pool.query(
        `INSERT INTO credential_reveal_audit_logs
         (user_id, subscription_id, success, failure_reason, metadata,
          ip_address, user_agent, request_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          entry.userId || null,
          entry.subscriptionId || null,
          entry.success,
          entry.failureReason || null,
          toJson(entry.metadata),
          entry.ipAddress || null,
          entry.userAgent || null,
          entry.requestId || null,
        ]
      );
    } catch (error) {
      Logger.error('Failed to record credential reveal audit log:', error);
    }
  }
}

export const auditLogService = new AuditLogService();

export const logAdminAction = async (
  request: FastifyRequest,
  entry: Omit<
    AdminAuditLogEntry,
    'userId' | 'ipAddress' | 'userAgent' | 'requestId'
  >
): Promise<void> => {
  try {
    const userAgent = request.headers['user-agent'];
    await auditLogService.recordAdminAction({
      ...entry,
      userId: request.user?.userId ?? null,
      ipAddress: request.ip,
      userAgent: userAgent ?? null,
      requestId: request.id,
    });
  } catch (error) {
    Logger.error('Admin audit logging failed:', error);
  }
};

export const logCredentialRevealAttempt = async (
  request: FastifyRequest,
  entry: Omit<
    CredentialRevealAuditEntry,
    'userId' | 'ipAddress' | 'userAgent' | 'requestId'
  >
): Promise<void> => {
  try {
    const userAgent = request.headers['user-agent'];
    await auditLogService.recordCredentialRevealAttempt({
      ...entry,
      userId: request.user?.userId ?? null,
      ipAddress: request.ip,
      userAgent: userAgent ?? null,
      requestId: request.id,
    });
  } catch (error) {
    Logger.error('Credential reveal audit logging failed:', error);
  }
};
