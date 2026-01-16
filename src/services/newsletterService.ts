import crypto from 'crypto';
import type { PoolClient } from 'pg';
import { getDatabasePool } from '../config/database';
import { couponService } from './couponService';
import { emailService } from './emailService';
import { env } from '../config/environment';
import { Logger } from '../utils/logger';

const COUPON_PERCENT_OFF = 12;
const COUPON_VALID_DAYS = 3;
const COUPON_PREFIX = 'NEWSLETTER12';

export type NewsletterSubscriberStatus = 'subscribed' | 'unsubscribed';

export type NewsletterSubscriber = {
  id: string;
  email: string;
  status: NewsletterSubscriberStatus;
  source?: string | null;
  coupon_code?: string | null;
  coupon_sent_at?: string | null;
  subscribed_at: string;
  unsubscribed_at?: string | null;
  created_at: string;
  updated_at: string;
};

type NewsletterSubscribeResult = {
  success: boolean;
  alreadySubscribed?: boolean;
  emailSent?: boolean;
  couponCode?: string | null;
  error?: string;
};

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const resolveAppBaseUrl = (): string | null => {
  const base = env.APP_BASE_URL?.replace(/\/$/, '');
  if (base) return base;
  if (env.NODE_ENV !== 'production') {
    return 'http://localhost:3000';
  }
  return null;
};

const buildAppLink = (path: string): string => {
  const base = resolveAppBaseUrl();
  if (!base) return path;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
};

const generateCouponCode = (): string => {
  const suffix = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${COUPON_PREFIX}-${suffix}`;
};

const formatExpiryText = (date: Date | null): string => {
  if (!date) return 'Valid for 3 days.';
  return `Valid until ${date.toISOString().slice(0, 10)}.`;
};

class NewsletterService {
  async subscribe(params: {
    email: string;
    source?: string | null;
  }): Promise<NewsletterSubscribeResult> {
    const trimmedEmail = params.email.trim();
    const normalizedEmail = normalizeEmail(trimmedEmail);
    const pool = getDatabasePool();
    const client = await pool.connect();
    let transactionOpen = false;
    let shouldSendEmail = false;
    let alreadySubscribed = false;
    let couponCode: string | null = null;
    let couponId: string | null = null;

    try {
      await client.query('BEGIN');
      transactionOpen = true;

      const existingResult = await client.query(
        `SELECT id, status, coupon_id, coupon_code, coupon_sent_at
         FROM newsletter_subscriptions
         WHERE email_normalized = $1
         FOR UPDATE`,
        [normalizedEmail]
      );

      if (existingResult.rows.length > 0) {
        const existing = existingResult.rows[0];
        alreadySubscribed = existing.status === 'subscribed';
        couponId = existing.coupon_id ?? null;
        couponCode = existing.coupon_code ?? null;

        if (existing.status === 'subscribed') {
          if (!couponId || !couponCode) {
            const created = await this.createNewsletterCoupon(client);
            if (!created.success) {
              await client.query('ROLLBACK');
              transactionOpen = false;
              return {
                success: false,
                error: created.error || 'Failed to create coupon',
              };
            }
            couponId = created.couponId;
            couponCode = created.couponCode;

            await client.query(
              `UPDATE newsletter_subscriptions
               SET coupon_id = $2,
                   coupon_code = $3,
                   updated_at = NOW()
               WHERE id = $1`,
              [existing.id, couponId, couponCode]
            );
            shouldSendEmail = true;
          } else {
            shouldSendEmail = !existing.coupon_sent_at;
          }
        } else {
          if (!couponId || !couponCode) {
            const created = await this.createNewsletterCoupon(client);
            if (!created.success) {
              await client.query('ROLLBACK');
              transactionOpen = false;
              return {
                success: false,
                error: created.error || 'Failed to create coupon',
              };
            }
            couponId = created.couponId;
            couponCode = created.couponCode;
          }

          await client.query(
            `UPDATE newsletter_subscriptions
             SET status = 'subscribed',
                 subscribed_at = NOW(),
                 unsubscribed_at = NULL,
                 source = COALESCE($2, source),
                 coupon_id = $3,
                 coupon_code = $4,
                 updated_at = NOW()
             WHERE id = $1`,
            [existing.id, params.source ?? null, couponId, couponCode]
          );

          shouldSendEmail = Boolean(couponCode);
        }
      } else {
        const created = await this.createNewsletterCoupon(client);
        if (!created.success) {
          await client.query('ROLLBACK');
          transactionOpen = false;
          return {
            success: false,
            error: created.error || 'Failed to create coupon',
          };
        }

        couponId = created.couponId;
        couponCode = created.couponCode;

        await client.query(
          `INSERT INTO newsletter_subscriptions (
             email,
             email_normalized,
             status,
             source,
             coupon_id,
             coupon_code,
             subscribed_at,
             created_at,
             updated_at
           ) VALUES ($1, $2, 'subscribed', $3, $4, $5, NOW(), NOW(), NOW())`,
          [
            trimmedEmail,
            normalizedEmail,
            params.source ?? null,
            couponId,
            couponCode,
          ]
        );

        shouldSendEmail = true;
      }

      await client.query('COMMIT');
      transactionOpen = false;
    } catch (error) {
      if (transactionOpen) {
        await client.query('ROLLBACK');
        transactionOpen = false;
      }
      Logger.error('Newsletter subscription failed:', error);
      return {
        success: false,
        error: 'Failed to subscribe to newsletter',
      };
    } finally {
      if (transactionOpen) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          Logger.error(
            'Failed to rollback newsletter subscription',
            rollbackError
          );
        }
      }
      client.release();
    }

    let emailSent = false;
    if (shouldSendEmail && couponCode) {
      const expiresAt = await this.resolveCouponExpiry(couponId);
      const sendResult = await this.sendCouponEmail({
        to: trimmedEmail,
        couponCode,
        expiresAt,
      });
      emailSent = sendResult.success;

      if (emailSent) {
        try {
          await pool.query(
            `UPDATE newsletter_subscriptions
             SET coupon_sent_at = NOW(),
                 updated_at = NOW()
             WHERE email_normalized = $1`,
            [normalizedEmail]
          );
        } catch (error) {
          Logger.warn('Failed to update newsletter coupon sent timestamp', {
            email: normalizedEmail,
            error,
          });
        }
      } else {
        Logger.warn('Newsletter coupon email failed to send', {
          email: normalizedEmail,
          error: sendResult.error,
        });
      }
    }

    return {
      success: true,
      alreadySubscribed,
      emailSent,
      couponCode,
    };
  }

  async listSubscribers(filters: {
    status?: NewsletterSubscriberStatus;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ subscribers: NewsletterSubscriber[]; total: number }> {
    const pool = getDatabasePool();
    const params: Array<string | number> = [];
    let paramCount = 0;
    let whereClause = 'WHERE 1=1';

    if (filters.status) {
      whereClause += ` AND status = $${++paramCount}`;
      params.push(filters.status);
    }

    if (filters.search) {
      whereClause += ` AND email ILIKE $${++paramCount}`;
      params.push(`%${filters.search}%`);
    }

    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    const listSql = `
      SELECT
        id,
        email,
        status,
        source,
        coupon_code,
        coupon_sent_at,
        subscribed_at,
        unsubscribed_at,
        created_at,
        updated_at
      FROM newsletter_subscriptions
      ${whereClause}
      ORDER BY subscribed_at DESC
      LIMIT $${++paramCount}
      OFFSET $${++paramCount}
    `;
    params.push(limit, offset);

    const [rowsResult, countResult] = await Promise.all([
      pool.query(listSql, params),
      pool.query(
        `SELECT COUNT(*)::int AS total
         FROM newsletter_subscriptions
         ${whereClause}`,
        params.slice(0, paramCount - 2)
      ),
    ]);

    const total = countResult.rows[0]?.total ?? 0;

    return {
      subscribers: rowsResult.rows,
      total: Number(total) || 0,
    };
  }

  private async createNewsletterCoupon(
    client: PoolClient
  ): Promise<
    | { success: true; couponId: string; couponCode: string }
    | { success: false; error?: string }
  > {
    const code = generateCouponCode();
    const now = new Date();
    const endsAt = new Date(
      now.getTime() + COUPON_VALID_DAYS * 24 * 60 * 60 * 1000
    );

    const result = await couponService.createCoupon(
      {
        code,
        percent_off: COUPON_PERCENT_OFF,
        scope: 'global',
        status: 'active',
        starts_at: now,
        ends_at: endsAt,
        max_redemptions: 1,
        first_order_only: true,
      },
      client
    );

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Failed to create coupon',
      };
    }

    if (!result.data) {
      return {
        success: false,
        error: 'Failed to create coupon',
      };
    }

    return {
      success: true,
      couponId: result.data.id,
      couponCode: result.data.code,
    };
  }

  private async resolveCouponExpiry(
    couponId: string | null
  ): Promise<Date | null> {
    if (!couponId) return null;
    try {
      const coupon = await couponService.getCouponById(couponId);
      if (!coupon?.ends_at) return null;
      return new Date(coupon.ends_at);
    } catch (error) {
      Logger.warn('Failed to resolve coupon expiry', { couponId, error });
      return null;
    }
  }

  private async sendCouponEmail(params: {
    to: string;
    couponCode: string;
    expiresAt: Date | null;
  }): Promise<{ success: boolean; error?: string }> {
    const browseLink = buildAppLink('/browse');
    const expiryText = formatExpiryText(params.expiresAt);
    const expiryLabel = params.expiresAt
      ? params.expiresAt.toISOString().slice(0, 10)
      : null;
    const expiryNote = expiryLabel
      ? `Valid until ${expiryLabel}`
      : `Valid for ${COUPON_VALID_DAYS} days`;
    const subject = 'Your 12% off first-order coupon from SubSlush';
    const text = [
      'Welcome to SubSlush.',
      'Premium subscriptions for less, and you just unlocked 12% off your first order.',
      'Use the code below to get started.',
      '',
      `Coupon code: ${params.couponCode}`,
      expiryText,
      'This code can only be used once on your first purchase.',
      '',
      `Start browsing: ${browseLink}`,
      '',
      'If you did not request this, you can safely ignore this email.',
    ].join('\n');

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Your 12% off coupon</title>
        </head>
        <body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,sans-serif;color:#111827;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f3f4f6;padding:24px 0;">
            <tr>
              <td align="center">
                <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="background-color:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
                  <tr>
                    <td style="padding:24px 32px;background-color:#0f172a;background:linear-gradient(90deg,#0f172a,#1e293b);color:#ffffff;text-align:center;">
                      <div style="font-size:24px;font-weight:700;letter-spacing:0.5px;line-height:1.1;">
                        <span style="display:inline-block;"><span style="color:#06B6D4;">S</span><span style="color:#27A6CC;">u</span><span style="color:#4897C3;">b</span><span style="color:#6988BB;">S</span><span style="color:#8978B2;">l</span><span style="color:#AA68AA;">u</span><span style="color:#CB59A1;">s</span><span style="color:#EC4899;">h</span></span>
                      </div>
                      <div style="font-size:12px;color:#d1d5db;margin-top:6px;">Premium For Less</div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:28px 32px;">
                      <h1 style="margin:0 0 12px;font-size:20px;text-align:center;">Welcome to SubSlush</h1>
                      <p style="margin:0 0 16px;font-size:14px;color:#374151;text-align:center;">
                        Premium subscriptions for less, and you just unlocked 12% off your first order.
                        Use the code below to get started.
                      </p>
                      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;">
                        <tr>
                          <td style="padding:16px;text-align:center;">
                            <div style="font-size:12px;text-transform:uppercase;color:#6b7280;letter-spacing:0.08em;">Coupon code</div>
                            <div style="margin-top:6px;font-size:22px;font-weight:700;letter-spacing:0.1em;color:#111827;">${params.couponCode}</div>
                            <div style="margin-top:8px;font-size:12px;color:#6b7280;">12% off your first order · ${expiryNote}</div>
                          </td>
                        </tr>
                      </table>
                      <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:22px auto 12px;">
                        <tr>
                          <td>
                            <a href="${browseLink}" style="display:inline-block;background-color:#111827;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:13px;font-weight:600;">
                              Start browsing
                            </a>
                          </td>
                        </tr>
                      </table>
                      <p style="margin:0;font-size:12px;color:#6b7280;text-align:center;">
                        This code can only be used once on your first purchase.
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:18px 32px;background-color:#f9fafb;text-align:center;font-size:12px;color:#9ca3af;">
                      &copy; 2026 SubSlush. All rights reserved.
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `.trim();

    return emailService.send({
      to: params.to,
      subject,
      text,
      html,
      from: 'no-reply@subslush.com',
    });
  }
}

export const newsletterService = new NewsletterService();
