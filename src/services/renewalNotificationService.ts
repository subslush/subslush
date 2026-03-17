import { getDatabasePool } from '../config/database';
import { notificationService } from './notificationService';
import {
  formatSubscriptionDisplayName,
  formatSubscriptionShortId,
} from '../utils/subscriptionHelpers';

type RenewalTaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type SubscriptionReminderStage = '7d' | '3d' | '24h';

const RENEWAL_FULFILLMENT_CATEGORY = 'renewal_fulfillment';

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
      link: '/dashboard/orders',
    },
    subscriptionId: params.subscriptionId,
    dedupeKey: `subscription_renewal_failed:${params.subscriptionId}:${params.endDate.toISOString()}`,
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
      link: '/dashboard/orders',
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
      link: '/dashboard/orders',
      renewed_at: renewedAt,
      renewal_method: 'credits',
    },
    subscriptionId: params.subscriptionId,
    dedupeKey: `subscription_renewed:${params.subscriptionId}:${renewedAt}`,
  });
}
