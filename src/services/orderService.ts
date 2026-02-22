import type { PoolClient } from 'pg';
import { getDatabasePool } from '../config/database';
import { Logger } from '../utils/logger';
import {
  Order,
  OrderItem,
  OrderStatus,
  CreateOrderInput,
  CreateOrderItemInput,
  OrderListItem,
  OrderWithItems,
} from '../types/order';
import {
  ServiceResult,
  createSuccessResult,
  createErrorResult,
} from '../types/service';
import { notificationService } from './notificationService';
import { emailService } from './emailService';
import { guestCheckoutService } from './guestCheckoutService';
import { env } from '../config/environment';
import { formatSubscriptionDisplayName } from '../utils/subscriptionHelpers';

function parseMetadata(value: any): Record<string, any> | null {
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

function mapOrder(row: any): Order {
  return {
    id: row.id,
    user_id: row.user_id,
    status: row.status,
    status_reason: row.status_reason,
    currency: row.currency,
    subtotal_cents: row.subtotal_cents,
    discount_cents: row.discount_cents,
    coupon_id: row.coupon_id ?? null,
    coupon_code: row.coupon_code ?? null,
    coupon_discount_cents: row.coupon_discount_cents ?? null,
    total_cents: row.total_cents,
    term_months: row.term_months,
    paid_with_credits: row.paid_with_credits,
    auto_renew: row.auto_renew,
    contact_email: row.contact_email ?? null,
    checkout_session_key: row.checkout_session_key ?? null,
    checkout_mode: row.checkout_mode ?? null,
    stripe_session_id: row.stripe_session_id ?? null,
    payment_provider: row.payment_provider,
    payment_reference: row.payment_reference,
    metadata: parseMetadata(row.metadata),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapOrderItem(row: any): OrderItem {
  return {
    id: row.id,
    order_id: row.order_id,
    product_variant_id: row.product_variant_id,
    product_name: row.product_name ?? null,
    variant_name: row.variant_name ?? null,
    quantity: row.quantity,
    unit_price_cents: row.unit_price_cents,
    base_price_cents: row.base_price_cents ?? null,
    discount_percent: row.discount_percent ?? null,
    term_months: row.term_months ?? null,
    auto_renew: row.auto_renew ?? null,
    coupon_discount_cents: row.coupon_discount_cents ?? null,
    currency: row.currency,
    total_price_cents: row.total_price_cents,
    description: row.description,
    metadata: parseMetadata(row.metadata),
    created_at: row.created_at,
  };
}

function formatOrderNotification(
  status: OrderStatus,
  orderId: string,
  statusReason?: string | null
): { title: string; message: string } | null {
  const normalizedReason =
    typeof statusReason === 'string' ? statusReason.trim().toLowerCase() : '';
  const silentCancellationReasons = new Set([
    'checkout_timeout',
    'checkout_cancelled',
  ]);

  const shortId = orderId.slice(0, 8);
  if (status === 'delivered') {
    return {
      title: 'Order delivered',
      message: `Your order ${shortId} has been delivered.`,
    };
  }
  if (
    status === 'cancelled' &&
    !silentCancellationReasons.has(normalizedReason)
  ) {
    return {
      title: 'Order cancelled',
      message: `Your order ${shortId} was cancelled.`,
    };
  }
  return null;
}

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

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const resolveTermMonths = (item: OrderItem): number | null => {
  const termMonths =
    item.term_months ??
    item.metadata?.['term_months'] ??
    item.metadata?.['duration_months'] ??
    null;
  const parsed = Number(termMonths);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
};

const formatOrderItemLabel = (item: OrderItem): string => {
  const productName = item.product_name ?? null;
  const variantName = item.variant_name ?? null;
  const termMonths = resolveTermMonths(item);
  const serviceType = item.metadata?.['service_type'] ?? null;
  const servicePlan = item.metadata?.['service_plan'] ?? null;
  const label = formatSubscriptionDisplayName({
    productName,
    variantName,
    serviceType: serviceType as any,
    servicePlan: servicePlan as any,
    termMonths,
  });
  return label || item.description || 'Subscription';
};

const isRenewalOrder = (order: Order): boolean => {
  const metadata = order.metadata || {};
  const renewalFlag =
    metadata['renewal'] ?? metadata['is_renewal'] ?? metadata['renewal_order'];
  if (
    renewalFlag === true ||
    renewalFlag === 'true' ||
    renewalFlag === 1 ||
    renewalFlag === '1'
  ) {
    return true;
  }
  const orderType =
    typeof metadata['order_type'] === 'string'
      ? metadata['order_type'].toLowerCase()
      : null;
  return orderType === 'renewal';
};

export class OrderService {
  private async fetchUserEmail(userId: string): Promise<string | null> {
    try {
      const pool = getDatabasePool();
      const result = await pool.query('SELECT email FROM users WHERE id = $1', [
        userId,
      ]);
      return result.rows[0]?.email ?? null;
    } catch (error) {
      Logger.warn('Failed to fetch user email for order delivery', {
        userId,
        error,
      });
      return null;
    }
  }

  private async isGuestUser(userId: string): Promise<boolean> {
    try {
      const pool = getDatabasePool();
      const result = await pool.query(
        'SELECT is_guest FROM users WHERE id = $1',
        [userId]
      );
      return result.rows[0]?.is_guest === true;
    } catch (error) {
      Logger.warn('Failed to determine guest user status for order email', {
        userId,
        error,
      });
      return false;
    }
  }

  private async listOrderSubscriptions(orderId: string): Promise<
    Array<{
      id: string;
      product_name: string | null;
      variant_name: string | null;
      service_type: string | null;
      service_plan: string | null;
      term_months: number | null;
    }>
  > {
    try {
      const pool = getDatabasePool();
      const result = await pool.query(
        `
        SELECT s.id,
               s.service_type,
               s.service_plan,
               s.term_months,
               pv.name AS variant_name,
               p.name AS product_name
        FROM subscriptions s
        LEFT JOIN product_variants pv ON pv.id = s.product_variant_id
        LEFT JOIN products p ON p.id = pv.product_id
        WHERE s.order_id = $1
        ORDER BY s.created_at ASC
        `,
        [orderId]
      );
      return result.rows.map((row: any) => ({
        id: row.id,
        product_name: row.product_name ?? null,
        variant_name: row.variant_name ?? null,
        service_type: row.service_type ?? null,
        service_plan: row.service_plan ?? null,
        term_months:
          row.term_months !== null && row.term_months !== undefined
            ? Number(row.term_months)
            : null,
      }));
    } catch (error) {
      Logger.warn('Failed to load subscriptions for delivered order email', {
        orderId,
        error,
      });
      return [];
    }
  }

  private resolveSubscriptionLabels(
    order: Order,
    items: OrderItem[],
    subscriptions: Array<{
      id: string;
      product_name: string | null;
      variant_name: string | null;
      service_type: string | null;
      service_plan: string | null;
      term_months: number | null;
    }>
  ): string[] {
    if (subscriptions.length > 0) {
      return subscriptions.map(subscription => {
        const label = formatSubscriptionDisplayName({
          productName: subscription.product_name ?? null,
          variantName: subscription.variant_name ?? null,
          serviceType: subscription.service_type as any,
          servicePlan: subscription.service_plan as any,
          termMonths: subscription.term_months ?? null,
        });
        const shortCode = subscription.id.slice(0, 8);
        return label
          ? `${label} - ${shortCode}`
          : `Subscription - ${shortCode}`;
      });
    }

    const labels = items.map(formatOrderItemLabel).filter(Boolean);
    if (labels.length > 0) {
      return labels;
    }

    const metadata = order.metadata || {};
    const fallbackLabel = formatSubscriptionDisplayName({
      productName: metadata['product_name'] ?? null,
      variantName: metadata['variant_name'] ?? null,
      serviceType: metadata['service_type'] ?? null,
      servicePlan: metadata['service_plan'] ?? null,
      termMonths:
        metadata['duration_months'] ??
        metadata['term_months'] ??
        order.term_months ??
        null,
    });

    return fallbackLabel ? [fallbackLabel] : [];
  }

  private async sendOrderDeliveredEmail(params: {
    order: Order;
    previousStatus: OrderStatus | null;
    userId: string;
  }): Promise<void> {
    const { order, previousStatus, userId } = params;
    if (order.status !== 'delivered' || previousStatus === 'delivered') {
      return;
    }
    const { payload } = await this.buildOrderDeliveredEmailPayload(
      order,
      userId
    );
    if (!payload) return;

    const sendResult = await emailService.send(payload);
    if (!sendResult.success) {
      Logger.warn('Failed to send order delivery email', {
        orderId: order.id,
        error: sendResult.error,
      });
    }
  }

  private async buildOrderDeliveredEmailPayload(
    order: Order,
    userId: string
  ): Promise<{
    payload?: {
      to: string;
      subject: string;
      text: string;
      html: string;
      from?: string;
    };
    reason?: string;
  }> {
    if (isRenewalOrder(order)) {
      return { reason: 'renewal_order' };
    }

    const contactEmail =
      typeof order.contact_email === 'string' ? order.contact_email.trim() : '';
    const email = contactEmail || (await this.fetchUserEmail(userId));
    if (!email) {
      return { reason: 'user_email_missing' };
    }

    const [items, subscriptions] = await Promise.all([
      this.listOrderItems(order.id),
      this.listOrderSubscriptions(order.id),
    ]);
    const labels = this.resolveSubscriptionLabels(order, items, subscriptions);
    const orderShort = order.id.slice(0, 8);
    const subscriptionsText =
      labels.length > 0
        ? labels.map(label => `- ${label}`).join('\n')
        : '- Subscription';
    const subscriptionsHtml =
      labels.length > 0
        ? labels
            .map(
              label => `<li style="margin:0 0 6px 0;">${escapeHtml(label)}</li>`
            )
            .join('')
        : '<li style="margin:0 0 6px 0;">Subscription</li>';

    const dashboardLink = buildAppLink('/dashboard/subscriptions');
    const helpLink = buildAppLink('/help');
    const shouldIssueClaimToken = await this.isGuestUser(userId);
    const guestIdentityId =
      typeof order.metadata?.['guest_identity_id'] === 'string'
        ? order.metadata['guest_identity_id']
        : null;
    const isUnclaimedGuestOrder =
      shouldIssueClaimToken && Boolean(guestIdentityId) && Boolean(contactEmail);

    if (isUnclaimedGuestOrder && guestIdentityId) {
      const claimTokenResult = await guestCheckoutService.issueClaimToken({
        guestIdentityId,
        email,
        sendEmail: false,
      });

      if (claimTokenResult.success) {
        const claimLink = claimTokenResult.data.claimLink;
        const subject = 'Action required: claim your delivered SubSlush order';
        const text = [
          `Your order ${orderShort} has been delivered.`,
          '',
          'Action required within 72 hours:',
          '1) Click this one-time claim link:',
          claimLink,
          '2) Sign in to your SubSlush account or create a new one.',
          '   The order will be attached to the account you sign in/create.',
          '',
          'After you claim the order:',
          `3) Open My Subscriptions: ${dashboardLink}`,
          '4) Click "Manage" on your delivered subscription.',
          '5) If prompted, set a 4-digit PIN you can remember.',
          '6) Use the PIN and click "Reveal" to view credentials and activation instructions.',
          '',
          'Important: credentials and activation instructions are NOT automatic.',
          'You must open Manage and Reveal to finish activation.',
          '',
          'Subscriptions delivered:',
          subscriptionsText,
          '',
          `Need help? ${helpLink}`,
        ].join('\n');

        const html = `
          <!doctype html>
          <html>
            <head>
              <meta charset="utf-8" />
              <meta name="viewport" content="width=device-width, initial-scale=1" />
              <title>Order delivered - action required</title>
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
                          <h1 style="margin:0 0 12px;font-size:20px;text-align:center;">Order delivered - claim required</h1>
                          <p style="margin:0 0 16px;font-size:14px;color:#374151;text-align:center;">
                            Your order ${orderShort} has been delivered.
                            Claim it within <strong>72 hours</strong> to access credentials and activation instructions.
                          </p>
                          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 16px;background-color:#fff7ed;border:1px solid #fdba74;border-radius:10px;">
                            <tr>
                              <td style="padding:14px 16px;font-size:13px;color:#7c2d12;text-align:center;">
                                This claim link is one-time use and expires in 72 hours.
                              </td>
                            </tr>
                          </table>
                          <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 18px;">
                            <tr>
                              <td>
                                <a href="${claimLink}" style="display:inline-block;background-color:#111827;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:8px;font-size:14px;font-weight:700;">
                                  Claim order now
                                </a>
                              </td>
                            </tr>
                          </table>
                          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;margin-bottom:16px;">
                            <tr>
                              <td style="padding:14px 16px;font-size:13px;color:#111827;">
                                <div style="font-weight:700;margin-bottom:8px;text-align:center;">Follow these steps</div>
                                <ol style="margin:0;padding-left:20px;color:#374151;">
                                  <li style="margin:0 0 8px 0;">Click <strong>Claim order now</strong> above.</li>
                                  <li style="margin:0 0 8px 0;">Sign in to an existing SubSlush account, or create a new account. The order attaches to that account.</li>
                                  <li style="margin:0 0 8px 0;">Open <strong>My Subscriptions</strong> in your dashboard.</li>
                                  <li style="margin:0 0 8px 0;">Click <strong>Manage</strong> on your delivered subscription.</li>
                                  <li style="margin:0 0 8px 0;">If needed, set a 4-digit PIN you can remember.</li>
                                  <li style="margin:0;">Use the PIN and click <strong>Reveal</strong> to view credentials and activation instructions.</li>
                                </ol>
                              </td>
                            </tr>
                          </table>
                          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 16px;background-color:#eef2ff;border:1px solid #c7d2fe;border-radius:10px;">
                            <tr>
                              <td style="padding:14px 16px;font-size:13px;color:#1e1b4b;text-align:center;">
                                <strong>Important:</strong> Subscription credentials and activation instructions are not automatic.
                                You must complete <strong>Manage + Reveal</strong> to finish activation.
                              </td>
                            </tr>
                          </table>
                          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;">
                            <tr>
                              <td style="padding:14px 16px;font-size:13px;color:#111827;">
                                <div style="font-weight:600;margin-bottom:6px;text-align:center;">Subscriptions delivered</div>
                                <ul style="margin:0;padding-left:18px;color:#374151;">
                                  ${subscriptionsHtml}
                                </ul>
                              </td>
                            </tr>
                          </table>
                          <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:22px auto 12px;">
                            <tr>
                              <td>
                                <a href="${claimLink}" style="display:inline-block;background-color:#111827;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:8px;font-size:14px;font-weight:700;">
                                  Claim order now
                                </a>
                              </td>
                            </tr>
                          </table>
                          <p style="margin:0;font-size:12px;color:#6b7280;text-align:center;">
                            Need help? Visit our <a href="${helpLink}" style="color:#111827;text-decoration:underline;">help center</a>.
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

        return {
          payload: {
            to: email,
            subject,
            text,
            html,
            from: 'no-reply@subslush.com',
          },
        };
      }

      Logger.warn('Failed to generate claim token for delivered guest order', {
        orderId: order.id,
        guestIdentityId,
        error: claimTokenResult.error,
      });
    }

    let claimText = '';
    let claimHtml = '';

    if (shouldIssueClaimToken && guestIdentityId && contactEmail) {
      const claimTokenResult = await guestCheckoutService.issueClaimToken({
        guestIdentityId,
        email,
        sendEmail: false,
      });

      if (claimTokenResult.success) {
        claimText = [
          '',
          'To manage this order in your account:',
          '1) Create a SubSlush account (or sign in) with this same email address.',
          `2) Claim this order within 72 hours: ${claimTokenResult.data.claimLink}`,
          '3) Open My Subscriptions, click Manage, then Reveal credentials/activation instructions.',
        ].join('\n');
        claimHtml = `
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:16px 0;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
            <tr>
              <td style="padding:14px 16px;font-size:13px;color:#334155;">
                <div style="font-weight:600;margin-bottom:8px;color:#0f172a;">Manage this order in your account</div>
                <div style="margin-bottom:8px;">Create a SubSlush account (or sign in) with this same email address, then click claim.</div>
                <div style="margin-bottom:8px;">This one-time claim link expires in 72 hours.</div>
                <a href="${claimTokenResult.data.claimLink}" style="display:inline-block;background-color:#111827;color:#ffffff;text-decoration:none;padding:9px 14px;border-radius:8px;font-size:13px;font-weight:600;">
                  Claim this order
                </a>
              </td>
            </tr>
          </table>
        `.trim();
      } else {
        Logger.warn(
          'Failed to generate claim token for delivered guest order',
          {
            orderId: order.id,
            guestIdentityId,
            error: claimTokenResult.error,
          }
        );
      }
    }

    const subject = 'Your SubSlush order is delivered';
    const text = [
      `Your order ${orderShort} has been delivered.`,
      'Your subscription is now active and available in My Subscriptions.',
      '',
      'Subscriptions activated:',
      subscriptionsText,
      '',
      `Open My Subscriptions: ${dashboardLink}`,
      `Need help? ${helpLink}`,
      claimText,
    ].join('\n');
    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Order delivered</title>
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
                      <h1 style="margin:0 0 12px;font-size:20px;">Order delivered</h1>
                      <p style="margin:0 0 16px;font-size:14px;color:#374151;">
                        Your order ${orderShort} has been delivered and your subscription is now active.
                        You can access it in your SubSlush dashboard under My Subscriptions.
                      </p>
                      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;">
                        <tr>
                          <td style="padding:14px 16px;font-size:13px;color:#111827;">
                            <div style="font-weight:600;margin-bottom:6px;">Subscriptions activated</div>
                            <ul style="margin:0;padding-left:18px;color:#374151;">
                              ${subscriptionsHtml}
                            </ul>
                          </td>
                        </tr>
                      </table>
                      <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:22px auto 12px;">
                        <tr>
                          <td>
                            <a href="${dashboardLink}" style="display:inline-block;background-color:#111827;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:13px;font-weight:600;">
                              View My Subscriptions
                            </a>
                          </td>
                        </tr>
                      </table>
                      ${claimHtml}
                      <p style="margin:0;font-size:12px;color:#6b7280;text-align:center;">
                        Need help? Visit our <a href="${helpLink}" style="color:#111827;text-decoration:underline;">help center</a>.
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

    return {
      payload: {
        to: email,
        subject,
        text,
        html,
        from: 'no-reply@subslush.com',
      },
    };
  }

  async sendOrderPaymentConfirmationEmail(
    orderId: string
  ): Promise<{ success: boolean; reason?: string }> {
    const order = await this.getOrderById(orderId);
    if (!order) {
      return { success: false, reason: 'order_not_found' };
    }
    if (isRenewalOrder(order)) {
      return { success: false, reason: 'renewal_order' };
    }

    const alreadySent =
      typeof order.metadata?.['payment_confirmation_email_sent_at'] ===
      'string';
    if (alreadySent) {
      return { success: false, reason: 'already_sent' };
    }

    const contactEmail =
      typeof order.contact_email === 'string' ? order.contact_email.trim() : '';
    const email = contactEmail || (await this.fetchUserEmail(order.user_id));
    if (!email) {
      return { success: false, reason: 'user_email_missing' };
    }

    const [items, subscriptions] = await Promise.all([
      this.listOrderItems(order.id),
      this.listOrderSubscriptions(order.id),
    ]);
    const labels = this.resolveSubscriptionLabels(order, items, subscriptions);
    const orderShort = order.id.slice(0, 8);
    const subscriptionsText =
      labels.length > 0
        ? labels.map(label => `- ${label}`).join('\n')
        : '- Subscription';
    const subscriptionsHtml =
      labels.length > 0
        ? labels
            .map(
              label => `<li style="margin:0 0 6px 0;">${escapeHtml(label)}</li>`
            )
            .join('')
        : '<li style="margin:0 0 6px 0;">Subscription</li>';

    const helpLink = buildAppLink('/help');
    const shouldIssueClaimToken = await this.isGuestUser(order.user_id);
    const guestIdentityId =
      typeof order.metadata?.['guest_identity_id'] === 'string'
        ? order.metadata['guest_identity_id']
        : null;
    let claimText = '';
    let claimHtml = '';

    if (shouldIssueClaimToken && guestIdentityId && contactEmail) {
      const claimTokenResult = await guestCheckoutService.issueClaimToken({
        guestIdentityId,
        email,
        sendEmail: false,
      });

      if (claimTokenResult.success) {
        claimText = [
          '',
          'To manage this order in your account:',
          '1) Create a SubSlush account (or sign in) with this same email address.',
          `2) Claim this order within 72 hours: ${claimTokenResult.data.claimLink}`,
          '3) Open My Subscriptions, click Manage, then Reveal credentials/activation instructions.',
        ].join('\n');
        claimHtml = `
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:16px 0;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
            <tr>
              <td style="padding:14px 16px;font-size:13px;color:#334155;">
                <div style="font-weight:600;margin-bottom:8px;color:#0f172a;">Manage this order in your account</div>
                <div style="margin-bottom:8px;">Create a SubSlush account (or sign in) with this same email address, then click claim.</div>
                <div style="margin-bottom:8px;">This one-time claim link expires in 72 hours.</div>
                <a href="${claimTokenResult.data.claimLink}" style="display:inline-block;background-color:#111827;color:#ffffff;text-decoration:none;padding:9px 14px;border-radius:8px;font-size:13px;font-weight:600;">
                  Claim this order
                </a>
              </td>
            </tr>
          </table>
        `.trim();
      } else {
        Logger.warn('Failed to generate claim token for payment confirmation', {
          orderId: order.id,
          guestIdentityId,
          error: claimTokenResult.error,
        });
      }
    }

    const subject = 'Your SubSlush order is confirmed';
    const text = [
      `We received your payment for order ${orderShort}.`,
      'Order delivery is usually completed within 24 hours during business days.',
      'In some cases, delivery can take up to 72 hours.',
      '',
      'Order items:',
      subscriptionsText,
      '',
      `Need help? ${helpLink}`,
      claimText,
    ].join('\n');
    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Order confirmed</title>
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
                      <h1 style="margin:0 0 12px;font-size:20px;">Payment received</h1>
                      <p style="margin:0 0 12px;font-size:14px;color:#374151;">
                        We received your payment for order ${orderShort}.
                      </p>
                      <p style="margin:0 0 16px;font-size:14px;color:#374151;">
                        Order delivery is usually completed within 24 hours during business days.
                        In some cases, delivery can take up to 72 hours.
                      </p>
                      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;">
                        <tr>
                          <td style="padding:14px 16px;font-size:13px;color:#111827;">
                            <div style="font-weight:600;margin-bottom:6px;">Order items</div>
                            <ul style="margin:0;padding-left:18px;color:#374151;">
                              ${subscriptionsHtml}
                            </ul>
                          </td>
                        </tr>
                      </table>
                      ${claimHtml}
                      <p style="margin:0;font-size:12px;color:#6b7280;text-align:center;">
                        Need help? Visit our <a href="${helpLink}" style="color:#111827;text-decoration:underline;">help center</a>.
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

    const sendResult = await emailService.send({
      to: email,
      subject,
      text,
      html,
      from: 'no-reply@subslush.com',
    });
    if (!sendResult.success) {
      Logger.warn('Failed to send order payment confirmation email', {
        orderId,
        error: sendResult.error,
      });
      return { success: false, reason: sendResult.error || 'send_failed' };
    }

    try {
      const pool = getDatabasePool();
      await pool.query(
        `UPDATE orders
         SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
             updated_at = NOW()
         WHERE id = $1`,
        [
          order.id,
          JSON.stringify({
            payment_confirmation_email_sent_at: new Date().toISOString(),
          }),
        ]
      );
    } catch (error) {
      Logger.warn('Failed to mark payment confirmation email metadata', {
        orderId: order.id,
        error,
      });
    }

    return { success: true };
  }

  async resendOrderDeliveredEmail(
    orderId: string
  ): Promise<{ success: boolean; reason?: string }> {
    const order = await this.getOrderById(orderId);
    if (!order) {
      return { success: false, reason: 'order_not_found' };
    }
    if (order.status !== 'delivered') {
      return { success: false, reason: 'order_not_delivered' };
    }

    const { payload, reason } = await this.buildOrderDeliveredEmailPayload(
      order,
      order.user_id
    );
    if (!payload) {
      return { success: false, reason: reason || 'email_unavailable' };
    }

    const sendResult = await emailService.send(payload);
    if (!sendResult.success) {
      Logger.warn('Failed to resend order delivery email', {
        orderId,
        error: sendResult.error,
      });
      return { success: false, reason: sendResult.error || 'send_failed' };
    }

    return { success: true };
  }

  private async insertOrderWithItems(
    client: PoolClient,
    input: CreateOrderInput,
    items: CreateOrderItemInput[]
  ): Promise<ServiceResult<OrderWithItems>> {
    const discountCents = input.discount_cents ?? 0;
    const couponDiscountCents = input.coupon_discount_cents ?? 0;
    const subtotalCents =
      input.subtotal_cents ??
      items.reduce((sum, item) => sum + item.total_price_cents, 0);
    const totalCents =
      input.total_cents ??
      Math.max(0, subtotalCents - discountCents - couponDiscountCents);

    const orderResult = await client.query(
      `INSERT INTO orders (
        user_id, status, status_reason, currency, subtotal_cents, discount_cents,
        coupon_id, coupon_code, coupon_discount_cents, total_cents, paid_with_credits,
        auto_renew, payment_provider, payment_reference, term_months, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *`,
      [
        input.user_id,
        input.status || 'cart',
        input.status_reason || null,
        input.currency || null,
        subtotalCents,
        discountCents,
        input.coupon_id ?? null,
        input.coupon_code ?? null,
        couponDiscountCents,
        totalCents,
        input.paid_with_credits ?? false,
        input.auto_renew ?? false,
        input.payment_provider || null,
        input.payment_reference || null,
        input.term_months ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ]
    );

    if (orderResult.rows.length === 0) {
      return createErrorResult('Failed to create order');
    }

    const order = mapOrder(orderResult.rows[0]);
    const createdItems: OrderItem[] = [];

    for (const item of items) {
      const itemResult = await client.query(
        `INSERT INTO order_items (
          order_id, product_variant_id, quantity, unit_price_cents,
          base_price_cents, discount_percent, term_months, currency,
          total_price_cents, description, metadata, auto_renew, coupon_discount_cents
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *`,
        [
          order.id,
          item.product_variant_id || null,
          item.quantity,
          item.unit_price_cents,
          item.base_price_cents ?? null,
          item.discount_percent ?? null,
          item.term_months ?? null,
          item.currency,
          item.total_price_cents,
          item.description || null,
          item.metadata ? JSON.stringify(item.metadata) : null,
          item.auto_renew ?? null,
          item.coupon_discount_cents ?? null,
        ]
      );

      if (itemResult.rows.length > 0) {
        createdItems.push(mapOrderItem(itemResult.rows[0]));
      }
    }

    return createSuccessResult({
      ...order,
      items: createdItems,
    });
  }

  async createOrderWithItems(
    input: CreateOrderInput,
    items: CreateOrderItemInput[]
  ): Promise<ServiceResult<OrderWithItems>> {
    const pool = getDatabasePool();
    const client = await pool.connect();
    let transactionOpen = false;

    try {
      await client.query('BEGIN');
      transactionOpen = true;

      const result = await this.insertOrderWithItems(client, input, items);
      if (!result.success) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return result;
      }

      await client.query('COMMIT');
      transactionOpen = false;

      return result;
    } catch (error) {
      if (transactionOpen) {
        await client.query('ROLLBACK');
        transactionOpen = false;
      }
      Logger.error('Failed to create order with items:', error);
      return createErrorResult('Failed to create order');
    } finally {
      if (transactionOpen) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          Logger.error(
            'Failed to rollback order creation transaction',
            rollbackError
          );
        }
      }
      client.release();
    }
  }

  async createOrderWithItemsInTransaction(
    client: PoolClient,
    input: CreateOrderInput,
    items: CreateOrderItemInput[]
  ): Promise<ServiceResult<OrderWithItems>> {
    try {
      return await this.insertOrderWithItems(client, input, items);
    } catch (error) {
      Logger.error('Failed to create order with items in transaction:', error);
      return createErrorResult('Failed to create order');
    }
  }

  async updateOrderStatus(
    orderId: string,
    status: OrderStatus,
    statusReason?: string
  ): Promise<ServiceResult<Order>> {
    try {
      const pool = getDatabasePool();
      const existingResult = await pool.query(
        'SELECT id, user_id, status FROM orders WHERE id = $1',
        [orderId]
      );

      if (existingResult.rows.length === 0) {
        return createErrorResult('Order not found');
      }

      const previousStatus = existingResult.rows[0].status as OrderStatus;
      const userId = existingResult.rows[0].user_id as string;
      const result = await pool.query(
        `UPDATE orders
         SET status = $1,
             status_reason = $2,
             updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [status, statusReason || null, orderId]
      );

      if (result.rows.length === 0) {
        return createErrorResult('Order not found');
      }

      const order = mapOrder(result.rows[0]);
      const notificationCopy = formatOrderNotification(
        status,
        orderId,
        order.status_reason
      );

      if (notificationCopy && previousStatus !== status) {
        try {
          await notificationService.createNotification({
            userId,
            type:
              status === 'delivered' ? 'order_delivered' : 'order_cancelled',
            title: notificationCopy.title,
            message: notificationCopy.message,
            orderId,
            metadata: {
              order_id: orderId,
              status,
              link: '/dashboard/orders',
            },
            dedupeKey: `order:${orderId}:${status}`,
          });
        } catch (error) {
          Logger.warn('Failed to create order notification', {
            orderId,
            status,
            error,
          });
        }
      }

      if (userId && status === 'delivered' && previousStatus !== status) {
        try {
          await this.sendOrderDeliveredEmail({
            order,
            previousStatus,
            userId,
          });
        } catch (error) {
          Logger.warn('Failed to send order delivery email', {
            orderId,
            error,
          });
        }
      }

      return createSuccessResult(order);
    } catch (error) {
      Logger.error('Failed to update order status:', error);
      return createErrorResult('Failed to update order status');
    }
  }

  async updateOrderPayment(
    orderId: string,
    updates: {
      payment_provider?: string | null;
      payment_reference?: string | null;
      paid_with_credits?: boolean;
      auto_renew?: boolean;
      checkout_mode?: string | null;
      stripe_session_id?: string | null;
      status?: OrderStatus;
      status_reason?: string | null;
      metadata?: Record<string, any> | null;
    }
  ): Promise<ServiceResult<Order>> {
    try {
      const updateFields: string[] = [];
      const values: any[] = [];
      let paramCount = 0;
      let previousStatus: OrderStatus | null = null;
      let userId: string | null = null;

      if (updates.status === 'delivered' || updates.status === 'cancelled') {
        const existingResult = await getDatabasePool().query(
          'SELECT status, user_id FROM orders WHERE id = $1',
          [orderId]
        );
        if (existingResult.rows.length > 0) {
          previousStatus = existingResult.rows[0].status as OrderStatus;
          userId = existingResult.rows[0].user_id as string;
        }
      }

      if (updates.payment_provider !== undefined) {
        updateFields.push(`payment_provider = $${++paramCount}`);
        values.push(updates.payment_provider);
      }
      if (updates.payment_reference !== undefined) {
        updateFields.push(`payment_reference = $${++paramCount}`);
        values.push(updates.payment_reference);
      }
      if (updates.paid_with_credits !== undefined) {
        updateFields.push(`paid_with_credits = $${++paramCount}`);
        values.push(updates.paid_with_credits);
      }
      if (updates.auto_renew !== undefined) {
        updateFields.push(`auto_renew = $${++paramCount}`);
        values.push(updates.auto_renew);
      }
      if (updates.checkout_mode !== undefined) {
        updateFields.push(`checkout_mode = $${++paramCount}`);
        values.push(updates.checkout_mode);
      }
      if (updates.stripe_session_id !== undefined) {
        updateFields.push(`stripe_session_id = $${++paramCount}`);
        values.push(updates.stripe_session_id);
      }
      if (updates.status !== undefined) {
        updateFields.push(`status = $${++paramCount}`);
        values.push(updates.status);
      }
      if (updates.status_reason !== undefined) {
        updateFields.push(`status_reason = $${++paramCount}`);
        values.push(updates.status_reason);
      }
      if (updates.metadata !== undefined) {
        updateFields.push(`metadata = $${++paramCount}`);
        values.push(updates.metadata ? JSON.stringify(updates.metadata) : null);
      }

      if (updateFields.length === 0) {
        return createErrorResult('No valid fields to update');
      }

      updateFields.push(`updated_at = NOW()`);
      values.push(orderId);

      const pool = getDatabasePool();
      const result = await pool.query(
        `UPDATE orders
         SET ${updateFields.join(', ')}
         WHERE id = $${++paramCount}
         RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return createErrorResult('Order not found');
      }

      const order = mapOrder(result.rows[0]);
      const notificationCopy = formatOrderNotification(
        updates.status as OrderStatus,
        orderId,
        order.status_reason
      );

      if (
        notificationCopy &&
        previousStatus &&
        previousStatus !== updates.status &&
        userId
      ) {
        try {
          await notificationService.createNotification({
            userId,
            type:
              updates.status === 'delivered'
                ? 'order_delivered'
                : 'order_cancelled',
            title: notificationCopy.title,
            message: notificationCopy.message,
            orderId,
            metadata: {
              order_id: orderId,
              status: updates.status,
              link: '/dashboard/orders',
            },
            dedupeKey: `order:${orderId}:${updates.status}`,
          });
        } catch (error) {
          Logger.warn('Failed to create order notification', {
            orderId,
            status: updates.status,
            error,
          });
        }
      }

      if (
        userId &&
        updates.status === 'delivered' &&
        previousStatus &&
        previousStatus !== updates.status
      ) {
        try {
          await this.sendOrderDeliveredEmail({
            order,
            previousStatus,
            userId,
          });
        } catch (error) {
          Logger.warn('Failed to send order delivery email', {
            orderId,
            error,
          });
        }
      }

      return createSuccessResult(order);
    } catch (error) {
      Logger.error('Failed to update order payment:', error);
      return createErrorResult('Failed to update order payment');
    }
  }

  async hasPaidOrder(userId: string): Promise<boolean> {
    try {
      const pool = getDatabasePool();
      const result = await pool.query(
        `SELECT 1
         FROM orders
         WHERE user_id = $1
           AND status = ANY($2::text[])
         LIMIT 1`,
        [userId, ['paid', 'in_process', 'delivered']]
      );
      return result.rows.length > 0;
    } catch (error) {
      Logger.error('Failed to check paid order status:', error);
      return false;
    }
  }

  async listOrders(filters?: {
    status?: OrderStatus;
    payment_provider?: string;
    user_id?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<Order[]> {
    try {
      const pool = getDatabasePool();
      const params: any[] = [];
      let paramCount = 0;
      let sql = `
        SELECT o.*
        FROM orders o
        LEFT JOIN users u ON u.id = o.user_id
        WHERE 1=1
      `;

      if (filters?.status) {
        sql += ` AND o.status = $${++paramCount}`;
        params.push(filters.status);
      }

      if (filters?.payment_provider) {
        sql += ` AND o.payment_provider = $${++paramCount}`;
        params.push(filters.payment_provider);
      }

      if (filters?.user_id) {
        sql += ` AND o.user_id = $${++paramCount}`;
        params.push(filters.user_id);
      }

      if (filters?.search) {
        const searchValue = `%${filters.search}%`;
        sql += ` AND (
          CAST(o.id AS TEXT) ILIKE $${++paramCount}
          OR CAST(o.user_id AS TEXT) ILIKE $${++paramCount}
          OR o.payment_reference ILIKE $${++paramCount}
          OR u.email ILIKE $${++paramCount}
        )`;
        params.push(searchValue, searchValue, searchValue, searchValue);
      }

      sql += ' ORDER BY o.created_at DESC';

      if (filters?.limit) {
        sql += ` LIMIT $${++paramCount}`;
        params.push(filters.limit);
      }

      if (filters?.offset) {
        sql += ` OFFSET $${++paramCount}`;
        params.push(filters.offset);
      }

      const result = await pool.query(sql, params);
      return result.rows.map(mapOrder);
    } catch (error) {
      Logger.error('Failed to list orders:', error);
      return [];
    }
  }

  async listOrdersForUser(options: {
    userId: string;
    status?: OrderStatus;
    payment_provider?: string;
    limit?: number;
    offset?: number;
    includeItems?: boolean;
    includeCart?: boolean;
    includeUnpaid?: boolean;
  }): Promise<{ orders: OrderListItem[]; total: number }> {
    try {
      const {
        userId,
        status,
        payment_provider,
        limit = 20,
        offset = 0,
        includeItems = false,
        includeCart = false,
        includeUnpaid = false,
      } = options;

      const pool = getDatabasePool();
      const filters: string[] = ['user_id = $1'];
      const params: any[] = [userId];
      let paramCount = 1;
      const paidVisibleStatuses: OrderStatus[] = [
        'paid',
        'in_process',
        'delivered',
      ];

      if (!includeUnpaid) {
        if (status && !paidVisibleStatuses.includes(status)) {
          return { orders: [], total: 0 };
        }
        if (!status) {
          filters.push(`status = ANY($${++paramCount}::text[])`);
          params.push(paidVisibleStatuses);
        }
      }

      if (!includeCart && status !== 'cart') {
        filters.push("status != 'cart'");
      }

      if (status) {
        filters.push(`status = $${++paramCount}`);
        params.push(status);
      }

      if (payment_provider) {
        filters.push(`payment_provider = $${++paramCount}`);
        params.push(payment_provider);
      }

      const whereClause = `WHERE ${filters.join(' AND ')}`;

      const countResult = await pool.query(
        `SELECT COUNT(*) as count FROM orders ${whereClause}`,
        params
      );
      const total = parseInt(countResult.rows[0]?.count || '0', 10);

      const listParams = [...params, limit, offset];
      const listSql = `
        SELECT * FROM orders
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
      `;
      const ordersResult = await pool.query(listSql, listParams);
      const orders = ordersResult.rows.map(mapOrder) as OrderListItem[];

      if (includeItems && orders.length > 0) {
        const orderIds = orders.map(order => order.id);
        const itemsResult = await pool.query(
          `
          SELECT oi.*,
                 pv.name AS variant_name,
                 p.name AS product_name
          FROM order_items oi
          LEFT JOIN product_variants pv ON pv.id = oi.product_variant_id
          LEFT JOIN products p ON p.id = pv.product_id
          WHERE oi.order_id = ANY($1::uuid[])
          ORDER BY oi.created_at ASC
          `,
          [orderIds]
        );
        const items = itemsResult.rows.map(mapOrderItem);
        const itemsByOrderId = new Map<string, OrderItem[]>();

        for (const item of items) {
          const list = itemsByOrderId.get(item.order_id) || [];
          list.push(item);
          itemsByOrderId.set(item.order_id, list);
        }

        for (const order of orders) {
          order.items = itemsByOrderId.get(order.id) || [];
        }
      }

      return { orders, total };
    } catch (error) {
      Logger.error('Failed to list user orders:', error);
      return { orders: [], total: 0 };
    }
  }

  async listOrderItems(orderId: string): Promise<OrderItem[]> {
    try {
      const pool = getDatabasePool();
      const result = await pool.query(
        `
        SELECT oi.*,
               pv.name AS variant_name,
               p.name AS product_name
        FROM order_items oi
        LEFT JOIN product_variants pv ON pv.id = oi.product_variant_id
        LEFT JOIN products p ON p.id = pv.product_id
        WHERE oi.order_id = $1
        ORDER BY oi.created_at ASC
        `,
        [orderId]
      );
      return result.rows.map(mapOrderItem);
    } catch (error) {
      Logger.error('Failed to list order items:', error);
      return [];
    }
  }

  async getOrderById(orderId: string): Promise<Order | null> {
    try {
      const pool = getDatabasePool();
      const result = await pool.query('SELECT * FROM orders WHERE id = $1', [
        orderId,
      ]);
      if (result.rows.length === 0) {
        return null;
      }
      return mapOrder(result.rows[0]);
    } catch (error) {
      Logger.error('Failed to fetch order:', error);
      return null;
    }
  }

  async getOrderByCheckoutSessionKey(
    checkoutSessionKey: string
  ): Promise<Order | null> {
    try {
      const pool = getDatabasePool();
      const result = await pool.query(
        'SELECT * FROM orders WHERE checkout_session_key = $1',
        [checkoutSessionKey]
      );
      if (result.rows.length === 0) {
        return null;
      }
      return mapOrder(result.rows[0]);
    } catch (error) {
      Logger.error('Failed to fetch order by checkout session key:', error);
      return null;
    }
  }

  async getOrderWithItems(orderId: string): Promise<OrderWithItems | null> {
    try {
      const pool = getDatabasePool();
      const orderResult = await pool.query(
        'SELECT * FROM orders WHERE id = $1',
        [orderId]
      );

      if (orderResult.rows.length === 0) {
        return null;
      }

      const itemsResult = await pool.query(
        'SELECT * FROM order_items WHERE order_id = $1 ORDER BY created_at ASC',
        [orderId]
      );

      return {
        ...mapOrder(orderResult.rows[0]),
        items: itemsResult.rows.map(mapOrderItem),
      };
    } catch (error) {
      Logger.error('Failed to fetch order with items:', error);
      return null;
    }
  }
}

export const orderService = new OrderService();
