import { getDatabasePool } from '../config/database';
import { env } from '../config/environment';
import { emailService } from './emailService';
import { notificationService } from './notificationService';
import { Logger } from '../utils/logger';
import {
  formatSubscriptionDisplayName,
  formatSubscriptionShortId,
} from '../utils/subscriptionHelpers';

type RenewalTaskPriority = 'low' | 'medium' | 'high' | 'urgent';

const RENEWAL_FULFILLMENT_CATEGORY = 'renewal_fulfillment';

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

const formatCurrency = (
  amountCents?: number | null,
  currency?: string | null
): string => {
  if (!amountCents) return '-';
  const amount = amountCents / 100;
  const normalized = (currency || 'USD').toUpperCase();
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: normalized,
    }).format(amount);
  } catch {
    return `${normalized} ${amount.toFixed(2)}`;
  }
};

async function fetchUserEmail(userId: string): Promise<string | null> {
  try {
    const pool = getDatabasePool();
    const result = await pool.query('SELECT email FROM users WHERE id = $1', [
      userId,
    ]);
    return result.rows[0]?.email ?? null;
  } catch (error) {
    Logger.warn('Failed to fetch user email for renewal notification', {
      userId,
      error,
    });
    return null;
  }
}

export async function ensureRenewalTask(params: {
  subscriptionId: string;
  userId: string;
  orderId?: string | null;
  dueDate: Date;
  notes: string;
  priority: RenewalTaskPriority;
}): Promise<void> {
  const pool = getDatabasePool();

  await pool.query(
    `INSERT INTO admin_tasks
      (subscription_id, user_id, order_id, task_type, due_date, priority, notes, task_category, sla_due_at)
     SELECT $1, $2, $3, 'renewal', $4, $5, $6, $7::varchar(50), $8
     WHERE NOT EXISTS (
       SELECT 1
       FROM admin_tasks
       WHERE subscription_id = $1
         AND task_type = 'renewal'
         AND completed_at IS NULL
         AND task_category = $7::varchar(50)
     )`,
    [
      params.subscriptionId,
      params.userId,
      params.orderId || null,
      params.dueDate,
      params.priority,
      params.notes,
      RENEWAL_FULFILLMENT_CATEGORY,
      params.dueDate,
    ]
  );
}

export async function notifyStripeRenewalFailure(params: {
  userId: string;
  subscriptionId: string;
  serviceType: string;
  servicePlan: string;
  productName?: string | null;
  variantName?: string | null;
  termMonths?: number | null;
  endDate: Date;
  renewalDate?: Date | null;
  priceCents?: number | null;
  currency?: string | null;
  reason: string;
  nextRetryAt?: Date | null;
}): Promise<void> {
  const serviceLabel = formatSubscriptionDisplayName({
    productName: params.productName ?? null,
    variantName: params.variantName ?? null,
    serviceType: params.serviceType as any,
    servicePlan: params.servicePlan as any,
    termMonths: params.termMonths ?? null,
  });
  const endDateLabel = params.endDate.toISOString().slice(0, 10);
  const renewalDateLabel = params.renewalDate
    ? params.renewalDate.toISOString().slice(0, 10)
    : endDateLabel;
  const updateLink = buildAppLink(
    `/dashboard/subscriptions/${params.subscriptionId}/billing`
  );
  const dashboardLink = buildAppLink('/dashboard/subscriptions');
  const subscriptionShort = formatSubscriptionShortId(params.subscriptionId);

  await notificationService.createNotification({
    userId: params.userId,
    type: 'subscription_renewal_failed',
    title: 'Renewal payment failed',
    message: `Your renewal payment failed for ${subscriptionShort}. Update your card or pay manually.`,
    metadata: {
      subscription_id: params.subscriptionId,
      renewal_method: 'stripe',
      next_retry_at: params.nextRetryAt
        ? params.nextRetryAt.toISOString()
        : null,
      end_date: params.endDate.toISOString(),
      reason: params.reason,
      link: `/dashboard/subscriptions/${params.subscriptionId}/billing`,
    },
    subscriptionId: params.subscriptionId,
    dedupeKey: `subscription_renewal_failed:${params.subscriptionId}:${params.endDate.toISOString()}`,
  });

  const email = await fetchUserEmail(params.userId);
  if (!email) return;

  const priceLabel = formatCurrency(params.priceCents ?? null, params.currency);
  const subject = 'SubSlush renewal payment failed - update your card';
  const text = [
    `Your ${serviceLabel} renewal payment failed.`,
    subscriptionShort,
    '',
    `Price: ${priceLabel}`,
    `Renewal date: ${renewalDateLabel}`,
    `Subscription end date: ${endDateLabel}`,
    '',
    `Update your card: ${updateLink}`,
    `Pay manually from your dashboard: ${dashboardLink}`,
  ].join('\n');
  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Renewal payment failed</title>
      </head>
      <body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,sans-serif;color:#111827;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f3f4f6;padding:24px 0;">
          <tr>
            <td align="center">
              <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="background-color:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
                <tr>
                  <td style="padding:24px 32px;background-color:#111827;color:#ffffff;text-align:center;">
                    <div style="font-size:24px;font-weight:700;letter-spacing:0.5px;line-height:1.1;">
                      <span style="display:inline-block;"><span style="color:#06B6D4;">S</span><span style="color:#27A6CC;">u</span><span style="color:#4897C3;">b</span><span style="color:#6988BB;">S</span><span style="color:#8978B2;">l</span><span style="color:#AA68AA;">u</span><span style="color:#CB59A1;">s</span><span style="color:#EC4899;">h</span></span>
                    </div>
                    <div style="font-size:12px;color:#d1d5db;margin-top:6px;">Premium For Less</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:28px 32px;">
                    <h1 style="margin:0 0 12px;font-size:20px;">Renewal payment failed</h1>
                    <p style="margin:0 0 16px;font-size:14px;color:#374151;">
                      Your ${serviceLabel} renewal payment failed.
                    </p>
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;">
                      <tr>
                        <td style="padding:14px 16px;font-size:13px;color:#111827;">
                          <div style="font-weight:600;margin-bottom:6px;">${subscriptionShort}</div>
                          <div>Price: <strong>${priceLabel}</strong></div>
                          <div>Renewal date: ${renewalDateLabel}</div>
                          <div>Subscription end date: ${endDateLabel}</div>
                        </td>
                      </tr>
                    </table>
                    <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:22px auto 12px;">
                      <tr>
                        <td>
                          <a href="${updateLink}" style="display:inline-block;background-color:#111827;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:13px;font-weight:600;">
                            Update card
                          </a>
                        </td>
                      </tr>
                    </table>
                    <p style="margin:0;font-size:12px;color:#6b7280;text-align:center;">
                      You can also pay manually from your dashboard:
                      <a href="${dashboardLink}" style="color:#111827;text-decoration:underline;">Open subscriptions</a>
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

  await emailService.send({
    to: email,
    subject,
    text,
    html,
  });
}

export async function notifyStripeRenewalSuccess(params: {
  userId: string;
  subscriptionId: string;
  serviceType: string;
  servicePlan: string;
  productName?: string | null;
  variantName?: string | null;
  termMonths?: number | null;
}): Promise<void> {
  const renewedAt = new Date().toISOString();
  const subscriptionShort = formatSubscriptionShortId(params.subscriptionId);

  await notificationService.createNotification({
    userId: params.userId,
    type: 'subscription_renewed',
    title: 'Payment received',
    message: `We received your payment for ${subscriptionShort} and will process your renewal shortly.`,
    metadata: {
      subscription_id: params.subscriptionId,
      link: '/dashboard/subscriptions',
      renewed_at: renewedAt,
    },
    subscriptionId: params.subscriptionId,
    dedupeKey: `subscription_renewed:${params.subscriptionId}:${renewedAt}`,
  });
}

export async function notifyCreditsRenewalSuccess(params: {
  userId: string;
  subscriptionId: string;
  serviceType: string;
  servicePlan: string;
  productName?: string | null;
  variantName?: string | null;
  termMonths?: number | null;
}): Promise<void> {
  const renewedAt = new Date().toISOString();
  const serviceLabel = formatSubscriptionDisplayName({
    productName: params.productName ?? null,
    variantName: params.variantName ?? null,
    serviceType: params.serviceType as any,
    servicePlan: params.servicePlan as any,
    termMonths: params.termMonths ?? null,
  });
  const subscriptionShort = formatSubscriptionShortId(params.subscriptionId);

  await notificationService.createNotification({
    userId: params.userId,
    type: 'subscription_renewed',
    title: 'Subscription renewed',
    message: `Your ${serviceLabel} subscription (${subscriptionShort}) has been renewed using credits.`,
    metadata: {
      subscription_id: params.subscriptionId,
      link: '/dashboard/subscriptions',
      renewed_at: renewedAt,
      renewal_method: 'credits',
    },
    subscriptionId: params.subscriptionId,
    dedupeKey: `subscription_renewed:${params.subscriptionId}:${renewedAt}`,
  });
}
