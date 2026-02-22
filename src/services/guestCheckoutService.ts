import { randomBytes, createHash } from 'crypto';
import { getDatabasePool } from '../config/database';
import { env } from '../config/environment';
import { Logger } from '../utils/logger';
import { emailService } from './emailService';
import { checkoutPricingService } from './checkoutPricingService';
import { orderItemUpgradeSelectionService } from './orderItemUpgradeSelectionService';
import {
  createSuccessResult,
  createErrorResult,
  ServiceResult,
} from '../types/service';
import { normalizeUpgradeOptions } from '../utils/upgradeOptions';
import type {
  GuestDraftInput,
  GuestDraftResult,
  GuestIdentityResult,
  CheckoutPricingSummary,
} from '../types/checkout';

const CLAIM_TOKEN_BYTES = 32;
const CLAIM_TOKEN_TTL_HOURS = 72;
const CHECKOUT_KEY_BYTES = 24;

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

const parseMetadata = (value: any): Record<string, any> | null => {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
};

const buildGuestEmail = (guestIdentityId: string): string =>
  `guest+${guestIdentityId}@guest.local`;

const resolveAppBaseUrl = (): string | null => {
  const explicitBase = env.APP_BASE_URL?.replace(/\/$/, '');
  if (explicitBase) {
    return explicitBase;
  }

  if (env.PASSWORD_RESET_REDIRECT_URL) {
    try {
      return new globalThis.URL(env.PASSWORD_RESET_REDIRECT_URL).origin;
    } catch (error) {
      Logger.warn(
        'Invalid PASSWORD_RESET_REDIRECT_URL while building claim link',
        {
          error,
        }
      );
    }
  }

  if (env.NODE_ENV !== 'production') {
    return 'http://localhost:3000';
  }

  return null;
};

const buildClaimLink = (token: string): string => {
  const base = resolveAppBaseUrl();
  const path = `/checkout/claim?token=${encodeURIComponent(token)}`;
  if (!base) return path;
  return `${base}${path}`;
};

const buildPricingSummary = (
  pricing: CheckoutPricingSummary['items'] | null,
  totals: {
    orderSubtotalCents: number;
    orderDiscountCents: number;
    orderCouponDiscountCents: number;
    orderTotalCents: number;
    normalizedCouponCode?: string | null;
  }
): CheckoutPricingSummary => ({
  items: pricing ?? [],
  order_subtotal_cents: totals.orderSubtotalCents,
  order_discount_cents: totals.orderDiscountCents,
  order_coupon_discount_cents: totals.orderCouponDiscountCents,
  order_total_cents: totals.orderTotalCents,
  normalized_coupon_code: totals.normalizedCouponCode ?? null,
});

export class GuestCheckoutService {
  async ensureGuestIdentity(
    email: string,
    user?: { userId: string; email?: string | null }
  ): Promise<ServiceResult<GuestIdentityResult>> {
    try {
      const normalizedEmail = normalizeEmail(email);
      const pool = getDatabasePool();
      const result = await pool.query(
        `INSERT INTO guest_identities (email, last_used_at)
         VALUES ($1, NOW())
         ON CONFLICT (email)
         DO UPDATE SET last_used_at = NOW()
         RETURNING id, email, user_id`,
        [normalizedEmail]
      );

      if (result.rows.length === 0) {
        return createErrorResult('Failed to create guest identity');
      }

      const identityRow = result.rows[0] as {
        id: string;
        email: string;
        user_id?: string | null;
      };

      const userId = user?.userId;
      const userEmail = user?.email ? normalizeEmail(user.email) : null;
      if (userId && userEmail && userEmail === normalizedEmail) {
        if (!identityRow.user_id || identityRow.user_id === userId) {
          if (identityRow.user_id !== userId) {
            await pool.query(
              `UPDATE guest_identities
               SET user_id = $1, last_used_at = NOW()
               WHERE id = $2`,
              [userId, identityRow.id]
            );
          }
        } else {
          Logger.warn('Guest identity already linked to a different user', {
            guestIdentityId: identityRow.id,
            userId,
          });
        }
      }

      return createSuccessResult({
        guestIdentityId: identityRow.id,
        email: identityRow.email,
      });
    } catch (error) {
      Logger.error('Failed to ensure guest identity:', error);
      return createErrorResult('Failed to create guest identity');
    }
  }

  async issueClaimToken(params: {
    guestIdentityId: string;
    email: string;
    sendEmail?: boolean;
  }): Promise<
    ServiceResult<{
      token: string;
      claimLink: string;
      expiresAt: Date;
      emailSent: boolean;
    }>
  > {
    try {
      const token = randomBytes(CLAIM_TOKEN_BYTES).toString('hex');
      const tokenHash = hashToken(token);
      const expiresAt = new Date(
        Date.now() + CLAIM_TOKEN_TTL_HOURS * 60 * 60 * 1000
      );
      const pool = getDatabasePool();

      await pool.query(
        `INSERT INTO guest_claim_tokens
         (guest_identity_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [params.guestIdentityId, tokenHash, expiresAt]
      );

      const claimLink = buildClaimLink(token);
      const shouldSendEmail = params.sendEmail !== false;
      let emailSent = false;

      if (shouldSendEmail) {
        const subject = 'Confirm your checkout email';
        const text = [
          'Use the link below to confirm your email for this checkout:',
          '',
          claimLink,
          '',
          'If you did not request this, you can ignore this email.',
        ].join('\n');

        const html = `
          <p>Use the link below to confirm your email for this checkout:</p>
          <p><a href="${claimLink}">Confirm checkout email</a></p>
          <p>If you did not request this, you can ignore this email.</p>
        `.trim();

        const sendResult = await emailService.send({
          to: params.email,
          subject,
          text,
          html,
        });

        emailSent = sendResult.success;
        if (!sendResult.success) {
          Logger.warn('Guest claim email failed to send', {
            guestIdentityId: params.guestIdentityId,
            error: sendResult.error,
          });
        }
      }

      return createSuccessResult({
        token,
        claimLink,
        expiresAt,
        emailSent,
      });
    } catch (error) {
      Logger.error('Failed to issue guest claim token:', error);
      return createErrorResult('Failed to issue claim token');
    }
  }

  async consumeClaimToken(
    token: string
  ): Promise<ServiceResult<{ guestIdentityId: string }>> {
    try {
      const tokenHash = hashToken(token);
      const pool = getDatabasePool();
      const result = await pool.query(
        `UPDATE guest_claim_tokens
         SET used_at = NOW()
         WHERE token_hash = $1
           AND used_at IS NULL
           AND expires_at > NOW()
         RETURNING guest_identity_id`,
        [tokenHash]
      );

      if (result.rows.length === 0) {
        return createErrorResult('Token invalid or expired');
      }

      return createSuccessResult({
        guestIdentityId: result.rows[0].guest_identity_id,
      });
    } catch (error) {
      Logger.error('Failed to consume guest claim token:', error);
      return createErrorResult('Failed to verify token');
    }
  }

  async claimGuestIdentity(params: {
    token: string;
    userId: string;
  }): Promise<ServiceResult<{ guestIdentityId: string; reassigned: boolean }>> {
    const pool = getDatabasePool();
    const client = await pool.connect();
    let transactionOpen = false;

    try {
      await client.query('BEGIN');
      transactionOpen = true;

      const tokenHash = hashToken(params.token);
      const tokenResult = await client.query(
        `UPDATE guest_claim_tokens
         SET used_at = NOW()
         WHERE token_hash = $1
           AND used_at IS NULL
           AND expires_at > NOW()
         RETURNING guest_identity_id`,
        [tokenHash]
      );

      if (tokenResult.rows.length === 0) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return createErrorResult('token_invalid_or_expired');
      }

      const guestIdentityId = tokenResult.rows[0].guest_identity_id as string;
      const identityResult = await client.query(
        `SELECT id, email, user_id
         FROM guest_identities
         WHERE id = $1
         FOR UPDATE`,
        [guestIdentityId]
      );

      if (identityResult.rows.length === 0) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return createErrorResult('guest_identity_not_found');
      }

      const identityRow = identityResult.rows[0];
      const existingUserId = identityRow.user_id as string | null;

      const targetUserResult = await client.query(
        `SELECT id, is_guest, stripe_customer_id
         FROM users
         WHERE id = $1
         FOR UPDATE`,
        [params.userId]
      );

      if (targetUserResult.rows.length === 0) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return createErrorResult('user_not_found');
      }

      const targetUser = targetUserResult.rows[0];

      if (existingUserId && existingUserId !== params.userId) {
        const optionalUserTables = [
          'admin_tasks',
          'payment_refunds',
          'notifications',
          'prelaunch_reward_tasks',
          'user_perks',
          'user_vouchers',
          'user_raffle_entries',
          'user_payment_methods',
        ];

        const optionalTableResult = await client.query(
          `SELECT table_name
             FROM information_schema.columns
            WHERE table_schema = 'public'
              AND column_name = 'user_id'
              AND table_name = ANY($1::text[])`,
          [optionalUserTables]
        );

        const optionalTableSet = new Set<string>(
          optionalTableResult.rows.map(row => String(row.table_name))
        );

        const runOptionalUserUpdate = async (
          tableName: string,
          run: () => Promise<void>
        ): Promise<void> => {
          if (!optionalTableSet.has(tableName)) {
            Logger.warn('Skipping optional guest-claim table reassignment', {
              tableName,
              reason: 'table_missing_or_no_user_id',
            });
            return;
          }

          const savepointName = 'sp_guest_claim_optional_user_reassign';
          await client.query(`SAVEPOINT ${savepointName}`);
          try {
            await run();
            await client.query(`RELEASE SAVEPOINT ${savepointName}`);
          } catch (error) {
            await client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
            await client.query(`RELEASE SAVEPOINT ${savepointName}`);
            Logger.warn('Optional guest-claim table reassignment failed', {
              tableName,
              sourceUserId: existingUserId,
              targetUserId: params.userId,
              error,
            });
          }
        };

        const guestUserResult = await client.query(
          `SELECT id, is_guest, stripe_customer_id
           FROM users
           WHERE id = $1
           FOR UPDATE`,
          [existingUserId]
        );

        if (guestUserResult.rows.length === 0) {
          await client.query('ROLLBACK');
          transactionOpen = false;
          return createErrorResult('guest_user_not_found');
        }

        const guestUser = guestUserResult.rows[0];
        if (!guestUser.is_guest) {
          await client.query('ROLLBACK');
          transactionOpen = false;
          return createErrorResult('already_claimed');
        }

        await client.query(
          `UPDATE orders SET user_id = $1 WHERE user_id = $2`,
          [params.userId, existingUserId]
        );
        await client.query(
          `UPDATE subscriptions SET user_id = $1 WHERE user_id = $2`,
          [params.userId, existingUserId]
        );
        await client.query(
          `UPDATE payments SET user_id = $1 WHERE user_id = $2`,
          [params.userId, existingUserId]
        );
        await client.query(
          `UPDATE credit_transactions SET user_id = $1 WHERE user_id = $2`,
          [params.userId, existingUserId]
        );
        await runOptionalUserUpdate('payment_refunds', async () => {
          await client.query(
            `UPDATE payment_refunds SET user_id = $1 WHERE user_id = $2`,
            [params.userId, existingUserId]
          );
        });
        await runOptionalUserUpdate('admin_tasks', async () => {
          await client.query(
            `UPDATE admin_tasks SET user_id = $1 WHERE user_id = $2`,
            [params.userId, existingUserId]
          );
        });
        await runOptionalUserUpdate('notifications', async () => {
          await client.query(
            `UPDATE notifications SET user_id = $1 WHERE user_id = $2`,
            [params.userId, existingUserId]
          );
        });
        await runOptionalUserUpdate('prelaunch_reward_tasks', async () => {
          await client.query(
            `UPDATE prelaunch_reward_tasks SET user_id = $1 WHERE user_id = $2`,
            [params.userId, existingUserId]
          );
        });
        await runOptionalUserUpdate('user_perks', async () => {
          await client.query(
            `UPDATE user_perks SET user_id = $1 WHERE user_id = $2`,
            [params.userId, existingUserId]
          );
        });
        await runOptionalUserUpdate('user_vouchers', async () => {
          await client.query(
            `UPDATE user_vouchers SET user_id = $1 WHERE user_id = $2`,
            [params.userId, existingUserId]
          );
        });
        await runOptionalUserUpdate('user_raffle_entries', async () => {
          await client.query(
            `UPDATE user_raffle_entries SET user_id = $1 WHERE user_id = $2`,
            [params.userId, existingUserId]
          );
        });

        await runOptionalUserUpdate('user_payment_methods', async () => {
          const defaultMethodResult = await client.query(
            `SELECT 1
             FROM user_payment_methods
             WHERE user_id = $1
               AND provider = 'stripe'
               AND is_default = TRUE
             LIMIT 1`,
            [params.userId]
          );
          const targetHasDefault = defaultMethodResult.rows.length > 0;
          await client.query(
            `UPDATE user_payment_methods
             SET user_id = $1,
                 is_default = CASE WHEN $3 THEN FALSE ELSE is_default END
             WHERE user_id = $2`,
            [params.userId, existingUserId, targetHasDefault]
          );
        });

        if (!targetUser.stripe_customer_id && guestUser.stripe_customer_id) {
          await client.query(
            `UPDATE users
             SET stripe_customer_id = NULL
             WHERE id = $1`,
            [existingUserId]
          );
          await client.query(
            `UPDATE users
             SET stripe_customer_id = $1
             WHERE id = $2 AND stripe_customer_id IS NULL`,
            [guestUser.stripe_customer_id, params.userId]
          );
        }

        await client.query(
          `UPDATE users
           SET guest_claimed_at = NOW()
           WHERE id = $1`,
          [existingUserId]
        );
      }

      await client.query(
        `UPDATE guest_identities
         SET user_id = $1, last_used_at = NOW()
         WHERE id = $2`,
        [params.userId, guestIdentityId]
      );

      await client.query(
        `UPDATE guest_claim_tokens
         SET used_at = NOW()
         WHERE guest_identity_id = $1
           AND used_at IS NULL`,
        [guestIdentityId]
      );

      await client.query('COMMIT');
      transactionOpen = false;

      return createSuccessResult({
        guestIdentityId,
        reassigned: Boolean(existingUserId && existingUserId !== params.userId),
      });
    } catch (error) {
      if (transactionOpen) {
        await client.query('ROLLBACK');
        transactionOpen = false;
      }
      Logger.error('Failed to claim guest identity:', error);
      return createErrorResult('claim_failed');
    } finally {
      if (transactionOpen) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          Logger.error('Failed to rollback guest claim', rollbackError);
        }
      }
      client.release();
    }
  }

  async upsertDraftOrder(
    input: GuestDraftInput
  ): Promise<ServiceResult<GuestDraftResult>> {
    const pool = getDatabasePool();
    const client = await pool.connect();
    let transactionOpen = false;

    try {
      await client.query('BEGIN');
      transactionOpen = true;

      const identityResult = await client.query(
        `SELECT id, email, user_id
         FROM guest_identities
         WHERE id = $1
         FOR UPDATE`,
        [input.guest_identity_id]
      );

      if (identityResult.rows.length === 0) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return createErrorResult('guest_identity_not_found');
      }

      const identityRow = identityResult.rows[0];
      const normalizedContact = normalizeEmail(input.contact_email);
      if (normalizedContact !== normalizeEmail(identityRow.email)) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return createErrorResult('contact_email_mismatch');
      }

      let userId: string | null = identityRow.user_id || null;
      if (!userId) {
        const guestEmail = buildGuestEmail(identityRow.id);
        const userInsert = await client.query(
          `INSERT INTO users (email, is_guest)
           VALUES ($1, TRUE)
           RETURNING id`,
          [guestEmail]
        );
        userId = userInsert.rows[0]?.id || null;
        if (!userId) {
          await client.query('ROLLBACK');
          transactionOpen = false;
          return createErrorResult('guest_user_create_failed');
        }

        await client.query(
          `UPDATE guest_identities
           SET user_id = $1, last_used_at = NOW()
           WHERE id = $2`,
          [userId, identityRow.id]
        );
      } else {
        await client.query(
          `UPDATE guest_identities
           SET last_used_at = NOW()
           WHERE id = $1`,
          [identityRow.id]
        );
      }

      const autoRenewAll = input.items.every(item => item.auto_renew === true);
      const currency = input.currency.trim().toUpperCase();

      const pricingResult = await checkoutPricingService.priceDraft({
        items: input.items,
        currency,
        couponCode: input.coupon_code ?? null,
        userId,
      });

      if (!pricingResult.success) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return createErrorResult(pricingResult.error || 'pricing_failed');
      }

      const pricing = pricingResult.data;
      const coupon = pricing.coupon ?? null;
      const normalizedCoupon = coupon?.code ?? null;
      const pricingSummaryItems = pricing.items.map(item => ({
        variant_id: item.variant.id,
        product_id: item.product.id,
        product_name: item.product.name,
        service_type: item.product.service_type ?? null,
        variant_name: item.variant.name ?? null,
        service_plan:
          item.variant.service_plan ?? item.variant.variant_code ?? null,
        term_months: item.termMonths,
        currency: item.currency,
        base_price_cents: item.basePriceCents,
        discount_percent: item.discountPercent,
        term_subtotal_cents: item.termSubtotalCents,
        term_discount_cents: item.termDiscountCents,
        term_total_cents: item.termTotalCents,
        coupon_discount_cents: item.couponDiscountCents,
        final_total_cents: item.finalTotalCents,
      }));

      let orderId: string | null = null;
      let checkoutSessionKey: string;
      let existingMetadata: Record<string, any> = {};

      if (input.checkout_session_key) {
        checkoutSessionKey = input.checkout_session_key;
        const orderResult = await client.query(
          `SELECT id, status, metadata
           FROM orders
           WHERE checkout_session_key = $1
           FOR UPDATE`,
          [checkoutSessionKey]
        );

        if (orderResult.rows.length === 0) {
          await client.query('ROLLBACK');
          transactionOpen = false;
          return createErrorResult('checkout_session_not_found');
        }

        const orderRow = orderResult.rows[0];
        if (orderRow.status !== 'cart') {
          await client.query('ROLLBACK');
          transactionOpen = false;
          return createErrorResult('checkout_session_locked');
        }

        const metadata = parseMetadata(orderRow.metadata) || {};
        const existingGuestId = metadata['guest_identity_id'];
        if (existingGuestId && existingGuestId !== identityRow.id) {
          await client.query('ROLLBACK');
          transactionOpen = false;
          return createErrorResult('checkout_session_mismatch');
        }

        existingMetadata = metadata;
        orderId = orderRow.id;

        await client.query(
          `UPDATE orders
           SET contact_email = $1,
               currency = $2,
               coupon_id = $3,
               coupon_code = $4,
               coupon_discount_cents = $5,
               subtotal_cents = $6,
               discount_cents = $7,
               total_cents = $8,
               auto_renew = $9,
               metadata = $10,
               updated_at = NOW()
           WHERE id = $11`,
          [
            normalizedContact,
            currency,
            coupon?.id ?? null,
            normalizedCoupon,
            pricing.orderCouponDiscountCents,
            pricing.orderSubtotalCents,
            pricing.orderDiscountCents,
            pricing.orderTotalCents,
            autoRenewAll,
            JSON.stringify({
              ...existingMetadata,
              guest_identity_id: identityRow.id,
              checkout_source: 'guest',
              ...(coupon
                ? {
                    coupon_code: coupon.code,
                    coupon_percent_off: coupon.percent_off,
                    coupon_apply_scope: coupon.apply_scope ?? null,
                  }
                : {}),
            }),
            orderId,
          ]
        );

        await client.query('DELETE FROM order_items WHERE order_id = $1', [
          orderId,
        ]);
      } else {
        checkoutSessionKey = randomBytes(CHECKOUT_KEY_BYTES).toString('hex');
        const metadata = {
          guest_identity_id: identityRow.id,
          checkout_source: 'guest',
        };

        let inserted = false;
        let attempts = 0;
        while (!inserted && attempts < 3) {
          attempts += 1;
          try {
            const orderInsert = await client.query(
              `INSERT INTO orders
               (user_id, status, status_reason, currency, subtotal_cents, discount_cents,
                coupon_id, coupon_code, coupon_discount_cents, total_cents, paid_with_credits,
                auto_renew, contact_email, checkout_session_key, metadata)
               VALUES ($1, 'cart', 'guest_draft', $2, $3, $4, $5, $6, $7, $8, FALSE, $9, $10, $11, $12)
               RETURNING id`,
              [
                userId,
                currency,
                pricing.orderSubtotalCents,
                pricing.orderDiscountCents,
                coupon?.id ?? null,
                normalizedCoupon,
                pricing.orderCouponDiscountCents,
                pricing.orderTotalCents,
                autoRenewAll,
                normalizedContact,
                checkoutSessionKey,
                JSON.stringify({
                  ...metadata,
                  ...(coupon
                    ? {
                        coupon_code: coupon.code,
                        coupon_percent_off: coupon.percent_off,
                        coupon_apply_scope: coupon.apply_scope ?? null,
                      }
                    : {}),
                }),
              ]
            );
            orderId = orderInsert.rows[0].id;
            inserted = true;
          } catch (error: any) {
            if (error?.code === '23505') {
              checkoutSessionKey =
                randomBytes(CHECKOUT_KEY_BYTES).toString('hex');
              continue;
            }
            throw error;
          }
        }

        if (!inserted) {
          await client.query('ROLLBACK');
          transactionOpen = false;
          return createErrorResult('checkout_session_conflict');
        }
      }

      if (!orderId) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return createErrorResult('draft_order_missing');
      }

      for (const pricedItem of pricing.items) {
        const planCode =
          pricedItem.variant.service_plan ||
          pricedItem.variant.variant_code ||
          pricedItem.variant.name ||
          pricedItem.variant.id;
        const serviceType =
          pricedItem.product.service_type ||
          pricedItem.product.slug ||
          pricedItem.product.name;
        const upgradeOptions = normalizeUpgradeOptions(
          pricedItem.product.metadata
        );
        const orderDescription = `Subscription: ${serviceType} ${planCode} (${pricedItem.termMonths} month${
          pricedItem.termMonths > 1 ? 's' : ''
        })`;

        const itemInsert = await client.query(
          `INSERT INTO order_items
           (order_id, product_variant_id, quantity, unit_price_cents, base_price_cents, discount_percent,
            term_months, currency, total_price_cents, description, metadata, auto_renew, coupon_discount_cents)
           VALUES ($1, $2, 1, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           RETURNING id`,
          [
            orderId,
            pricedItem.input.variant_id,
            pricedItem.finalTotalCents,
            pricedItem.basePriceCents,
            pricedItem.discountPercent,
            pricedItem.termMonths,
            pricedItem.currency,
            pricedItem.finalTotalCents,
            orderDescription,
            JSON.stringify({
              service_type: serviceType,
              service_plan: planCode,
              duration_months: pricedItem.termMonths,
              discount_percent: pricedItem.discountPercent,
              base_price_cents: pricedItem.basePriceCents,
              total_price_cents: pricedItem.finalTotalCents,
              ...(pricedItem.input.selection_type
                ? { selection_type: pricedItem.input.selection_type }
                : {}),
              ...(pricedItem.input.manual_monthly_acknowledged !== undefined &&
              pricedItem.input.manual_monthly_acknowledged !== null
                ? {
                    manual_monthly_acknowledged:
                      pricedItem.input.manual_monthly_acknowledged,
                  }
                : {}),
              ...(upgradeOptions ? { upgrade_options: upgradeOptions } : {}),
              ...(coupon
                ? {
                    coupon_code: coupon.code,
                    coupon_percent_off: coupon.percent_off,
                    coupon_apply_scope: coupon.apply_scope ?? null,
                    coupon_discount_cents: pricedItem.couponDiscountCents,
                  }
                : {}),
            }),
            pricedItem.input.auto_renew === true,
            pricedItem.couponDiscountCents,
          ]
        );

        const orderItemId = itemInsert.rows[0]?.id as string | undefined;
        if (orderItemId) {
          const hasSelectionData =
            pricedItem.input.selection_type ||
            pricedItem.input.account_identifier ||
            pricedItem.input.credentials ||
            pricedItem.input.manual_monthly_acknowledged !== undefined;
          if (hasSelectionData) {
            await orderItemUpgradeSelectionService.upsertSelection(
              {
                orderItemId,
                selectionType: pricedItem.input.selection_type ?? null,
                accountIdentifier: pricedItem.input.account_identifier ?? null,
                credentials: pricedItem.input.credentials ?? null,
                manualMonthlyAcknowledgedAt:
                  pricedItem.input.manual_monthly_acknowledged === true
                    ? new Date()
                    : null,
              },
              client
            );
          }
        }
      }

      await client.query('COMMIT');
      transactionOpen = false;

      return createSuccessResult({
        orderId,
        checkoutSessionKey,
        pricing: buildPricingSummary(pricingSummaryItems, {
          orderSubtotalCents: pricing.orderSubtotalCents,
          orderDiscountCents: pricing.orderDiscountCents,
          orderCouponDiscountCents: pricing.orderCouponDiscountCents,
          orderTotalCents: pricing.orderTotalCents,
          normalizedCouponCode: pricing.normalizedCouponCode ?? null,
        }),
      });
    } catch (error) {
      if (transactionOpen) {
        await client.query('ROLLBACK');
        transactionOpen = false;
      }
      Logger.error('Failed to upsert guest draft order:', error);
      return createErrorResult('Failed to create draft order');
    } finally {
      if (transactionOpen) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          Logger.error('Failed to rollback guest draft order', rollbackError);
        }
      }
      client.release();
    }
  }
}

export const guestCheckoutService = new GuestCheckoutService();
