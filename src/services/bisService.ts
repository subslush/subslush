import { getDatabasePool } from '../config/database';
import { Logger } from '../utils/logger';

export type BisInquiryStatus = 'active' | 'issue' | 'cancelled' | 'solved';
export type BisInquiryTopic = 'bug' | 'issue' | 'suggestion';

export type BisInquiry = {
  id: string;
  email: string;
  topic: BisInquiryTopic;
  message: string;
  status: BisInquiryStatus;
  created_at: string;
  updated_at: string;
};

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

class BisService {
  async createInquiry(params: {
    email: string;
    topic: BisInquiryTopic;
    message: string;
  }): Promise<
    { success: true; inquiry: BisInquiry } | { success: false; error: string }
  > {
    const pool = getDatabasePool();
    const trimmedEmail = params.email.trim();
    const normalizedEmail = normalizeEmail(trimmedEmail);
    const message = params.message.trim();

    try {
      const result = await pool.query(
        `INSERT INTO bis_inquiries (
           email,
           email_normalized,
           topic,
           message,
           status,
           created_at,
           updated_at
         ) VALUES ($1, $2, $3, $4, 'active', NOW(), NOW())
         RETURNING id, email, topic, message, status, created_at, updated_at`,
        [trimmedEmail, normalizedEmail, params.topic, message]
      );

      return { success: true, inquiry: result.rows[0] };
    } catch (error) {
      Logger.error('Failed to create BIS inquiry:', error);
      return { success: false, error: 'Failed to create inquiry' };
    }
  }

  async listInquiries(filters: {
    status?: BisInquiryStatus;
    limit?: number;
    offset?: number;
  }): Promise<{ inquiries: BisInquiry[]; total: number }> {
    const pool = getDatabasePool();
    const params: Array<string | number> = [];
    let paramCount = 0;
    let whereClause = 'WHERE 1=1';

    if (filters.status) {
      whereClause += ` AND status = $${++paramCount}`;
      params.push(filters.status);
    }

    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    const listSql = `
      SELECT id, email, topic, message, status, created_at, updated_at
      FROM bis_inquiries
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${++paramCount}
      OFFSET $${++paramCount}
    `;
    params.push(limit, offset);

    const [rowsResult, countResult] = await Promise.all([
      pool.query(listSql, params),
      pool.query(
        `SELECT COUNT(*)::int AS total
         FROM bis_inquiries
         ${whereClause}`,
        params.slice(0, paramCount - 2)
      ),
    ]);

    const total = countResult.rows[0]?.total ?? 0;

    return {
      inquiries: rowsResult.rows,
      total: Number(total) || 0,
    };
  }

  async getInquiryById(id: string): Promise<BisInquiry | null> {
    const pool = getDatabasePool();
    const result = await pool.query(
      `SELECT id, email, topic, message, status, created_at, updated_at
       FROM bis_inquiries
       WHERE id = $1`,
      [id]
    );

    return result.rows[0] || null;
  }

  async updateInquiryStatus(
    id: string,
    status: BisInquiryStatus
  ): Promise<
    { success: true; inquiry: BisInquiry } | { success: false; error: string }
  > {
    const pool = getDatabasePool();
    try {
      const result = await pool.query(
        `UPDATE bis_inquiries
         SET status = $2,
             updated_at = NOW()
         WHERE id = $1
         RETURNING id, email, topic, message, status, created_at, updated_at`,
        [id, status]
      );

      if (result.rows.length === 0) {
        return { success: false, error: 'Inquiry not found' };
      }

      return { success: true, inquiry: result.rows[0] };
    } catch (error) {
      Logger.error('Failed to update BIS inquiry status:', error);
      return { success: false, error: 'Failed to update inquiry status' };
    }
  }
}

export const bisService = new BisService();
