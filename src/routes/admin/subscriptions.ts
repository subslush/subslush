import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authPreHandler } from '../../middleware/authMiddleware';
import { adminPreHandler } from '../../middleware/adminMiddleware';
import { getDatabasePool } from '../../config/database';
import { paymentService } from '../../services/paymentService';
import { orderService } from '../../services/orderService';
import { subscriptionService } from '../../services/subscriptionService';
import { upgradeSelectionService } from '../../services/upgradeSelectionService';
import { logAdminAction } from '../../services/auditLogService';
import { ErrorResponses, SuccessResponses } from '../../utils/response';
import { Logger } from '../../utils/logger';
import { credentialsEncryptionService } from '../../utils/encryption';
import type { SubscriptionStatus, ServiceType } from '../../types/subscription';

const parseBoolean = (value: unknown): boolean | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return undefined;
};

export async function adminSubscriptionRoutes(
  fastify: FastifyInstance
): Promise<void> {
  fastify.get(
    '/',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            service_type: { type: 'string' },
            auto_renew: { type: 'string' },
            search: { type: 'string' },
            limit: { type: 'number', minimum: 1, maximum: 200 },
            offset: { type: 'number', minimum: 0 },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = request.query as {
          status?: SubscriptionStatus;
          service_type?: ServiceType;
          auto_renew?: string;
          search?: string;
          limit?: number;
          offset?: number;
        };

        const autoRenew = parseBoolean(query.auto_renew);
        const search = query.search?.trim();
        const subscriptions =
          await subscriptionService.listSubscriptionsForAdmin({
            ...(query.status ? { status: query.status } : {}),
            ...(query.service_type ? { service_type: query.service_type } : {}),
            ...(autoRenew !== undefined ? { auto_renew: autoRenew } : {}),
            ...(search ? { search } : {}),
            ...(query.limit !== undefined ? { limit: query.limit } : {}),
            ...(query.offset !== undefined ? { offset: query.offset } : {}),
          });

        return SuccessResponses.ok(reply, { subscriptions });
      } catch (error) {
        Logger.error('Admin list subscriptions failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to list subscriptions'
        );
      }
    }
  );

  fastify.get(
    '/:subscriptionId/renewal-fulfillment',
    {
      schema: {
        params: {
          type: 'object',
          required: ['subscriptionId'],
          properties: {
            subscriptionId: { type: 'string' },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { subscriptionId } = request.params as {
          subscriptionId: string;
        };

        const subscriptionResult =
          await subscriptionService.getSubscriptionById(subscriptionId);
        if (!subscriptionResult.success || !subscriptionResult.data) {
          return ErrorResponses.notFound(reply, 'Subscription not found');
        }

        const subscription = subscriptionResult.data;
        const selection =
          await upgradeSelectionService.getSelectionForSubscription(
            subscriptionId
          );
        const subscriptionWithSelection = {
          ...subscription,
          selection_type: selection?.selection_type ?? null,
          account_identifier: selection?.account_identifier ?? null,
          manual_monthly_acknowledged_at:
            selection?.manual_monthly_acknowledged_at ?? null,
          submitted_at: selection?.submitted_at ?? null,
          locked_at: selection?.locked_at ?? null,
          upgrade_options_snapshot: selection?.upgrade_options_snapshot ?? null,
          has_user_credentials: Boolean(selection?.credentials_encrypted),
        };
        const order = subscription.order_id
          ? await orderService.getOrderWithItems(subscription.order_id)
          : null;
        const pool = getDatabasePool();

        const userResult = await pool.query(
          `SELECT id, email, status, created_at, last_login
           FROM users
           WHERE id = $1`,
          [subscription.user_id]
        );

        const taskResult = await pool.query(
          `SELECT t.*,
                  CASE
                    WHEN t.completed_at IS NOT NULL THEN 'completed'
                    WHEN t.is_issue = TRUE THEN 'issue'
                    WHEN t.assigned_admin IS NOT NULL THEN 'in_progress'
                    ELSE 'pending'
                  END as status
           FROM admin_tasks t
           WHERE subscription_id = $1
           ORDER BY created_at DESC`,
          [subscriptionId]
        );

        const renewalPaymentResult = await pool.query(
          `SELECT id, amount, balance_before, balance_after, created_at,
                  metadata, status_reason, renewal_method, price_cents, currency
           FROM credit_transactions
           WHERE user_id = $1
             AND (metadata->>'subscription_id') = $2::text
             AND type = 'purchase'
           ORDER BY created_at DESC
           LIMIT 1`,
          [subscription.user_id, subscriptionId]
        );

        const stripePaymentResult = await pool.query(
          `SELECT *
           FROM payments
           WHERE provider = 'stripe'
             AND (
               subscription_id = $1
               OR metadata->>'subscription_id' = $2::text
             )
             AND (metadata->>'renewal') IN ('true', '1')
           ORDER BY created_at DESC
           LIMIT 1`,
          [subscriptionId, subscriptionId]
        );

        const stripePayment = stripePaymentResult.rows[0]
          ? {
              ...stripePaymentResult.rows[0],
              payment_id: stripePaymentResult.rows[0].provider_payment_id,
              amount_cents: stripePaymentResult.rows[0].amount
                ? Math.round(
                    parseFloat(stripePaymentResult.rows[0].amount) * 100
                  )
                : null,
            }
          : null;

        return SuccessResponses.ok(reply, {
          subscription: subscriptionWithSelection,
          user: userResult.rows[0] || null,
          tasks: taskResult.rows || [],
          renewal_payment: renewalPaymentResult.rows[0] || null,
          stripe_payment: stripePayment,
          order,
        });
      } catch (error) {
        Logger.error('Admin renewal fulfillment lookup failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to load renewal fulfillment'
        );
      }
    }
  );

  fastify.patch(
    '/:subscriptionId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['subscriptionId'],
          properties: {
            subscriptionId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          properties: {
            service_plan: { type: 'string' },
            end_date: { type: 'string' },
            renewal_date: { type: 'string' },
            auto_renew: { type: 'boolean' },
            next_billing_at: { type: ['string', 'null'] },
            renewal_method: { type: 'string' },
            status_reason: { type: 'string' },
            price_cents: { type: 'number' },
            currency: { type: 'string' },
            order_id: { type: 'string' },
            product_variant_id: { type: 'string' },
            referral_reward_id: { type: 'string' },
            pre_launch_reward_id: { type: 'string' },
            metadata: { type: 'object' },
          },
          additionalProperties: false,
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { subscriptionId } = request.params as {
          subscriptionId: string;
        };
        const body = request.body as any;
        const parseDateInput = (value: string): Date => {
          const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
          if (match) {
            const year = Number(match[1]);
            const month = Number(match[2]);
            const day = Number(match[3]);
            return new Date(year, month - 1, day, 23, 59, 59, 999);
          }
          return new Date(value);
        };
        const beforeResult =
          await subscriptionService.getSubscriptionById(subscriptionId);
        const before = beforeResult.success ? beforeResult.data : null;

        const updates = {
          ...body,
          end_date: body.end_date ? parseDateInput(body.end_date) : undefined,
          renewal_date: body.renewal_date
            ? parseDateInput(body.renewal_date)
            : undefined,
          next_billing_at:
            body.next_billing_at === null
              ? null
              : body.next_billing_at
                ? parseDateInput(body.next_billing_at)
                : undefined,
        };

        const result = await subscriptionService.updateSubscriptionForAdmin(
          subscriptionId,
          updates
        );

        if (!result.success) {
          return ErrorResponses.badRequest(
            reply,
            result.error || 'Failed to update subscription'
          );
        }

        await logAdminAction(request, {
          action: 'subscriptions.update',
          entityType: 'subscription',
          entityId: subscriptionId,
          before: before || null,
          after: result.data || null,
          metadata: {
            updatedFields: Object.keys((request.body as any) || {}),
          },
        });

        return SuccessResponses.ok(reply, result.data, 'Subscription updated');
      } catch (error) {
        Logger.error('Admin update subscription failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to update subscription'
        );
      }
    }
  );

  fastify.patch(
    '/:subscriptionId/status',
    {
      schema: {
        params: {
          type: 'object',
          required: ['subscriptionId'],
          properties: {
            subscriptionId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['status', 'reason'],
          properties: {
            status: {
              type: 'string',
              enum: ['active', 'expired', 'cancelled', 'pending'],
            },
            reason: { type: 'string', minLength: 1, maxLength: 500 },
          },
          additionalProperties: false,
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { subscriptionId } = request.params as {
          subscriptionId: string;
        };
        const body = request.body as {
          status: SubscriptionStatus;
          reason: string;
        };

        const adminUserId = request.user?.userId || 'admin';
        const beforeResult =
          await subscriptionService.getSubscriptionById(subscriptionId);
        const before = beforeResult.success ? beforeResult.data : null;

        const result = await subscriptionService.updateSubscriptionStatus(
          subscriptionId,
          body.status,
          body.reason,
          adminUserId
        );

        if (!result.success) {
          return ErrorResponses.badRequest(
            reply,
            result.error || 'Failed to update subscription status'
          );
        }

        const sanitizedAfter = result.data
          ? { ...result.data, credentials_encrypted: undefined }
          : null;

        await logAdminAction(request, {
          action: 'subscriptions.status.update',
          entityType: 'subscription',
          entityId: subscriptionId,
          before: before
            ? { ...before, credentials_encrypted: undefined }
            : null,
          after: sanitizedAfter,
          metadata: { status: body.status, reason: body.reason },
        });

        if (body.status === 'expired') {
          try {
            await paymentService.cancelPendingStripeRenewalPayments([
              subscriptionId,
            ]);
          } catch (error) {
            Logger.warn('Manual expiry Stripe cleanup failed', {
              subscriptionId,
              error,
            });
          }
        }

        return SuccessResponses.ok(
          reply,
          sanitizedAfter || null,
          'Subscription status updated'
        );
      } catch (error) {
        Logger.error('Admin update subscription status failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to update subscription status'
        );
      }
    }
  );

  fastify.get(
    '/:subscriptionId/credentials',
    {
      schema: {
        params: {
          type: 'object',
          required: ['subscriptionId'],
          properties: {
            subscriptionId: { type: 'string' },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { subscriptionId } = request.params as {
          subscriptionId: string;
        };

        const result =
          await subscriptionService.getSubscriptionById(subscriptionId);

        if (!result.success || !result.data) {
          return ErrorResponses.notFound(reply, 'Subscription not found');
        }

        await logAdminAction(request, {
          action: 'subscriptions.credentials.view',
          entityType: 'subscription',
          entityId: subscriptionId,
          metadata: {
            credentialPresent: Boolean(result.data.credentials_encrypted),
          },
        });

        if (!result.data.credentials_encrypted) {
          return SuccessResponses.ok(reply, {
            credentials: null,
          });
        }

        const decrypted = credentialsEncryptionService.decryptFromString(
          result.data.credentials_encrypted
        );
        if (!decrypted.wasEncrypted && decrypted.migratedPayload) {
          await subscriptionService.updateSubscriptionCredentialsEncryptedValue(
            {
              subscriptionId,
              encryptedValue: decrypted.migratedPayload,
            }
          );
        }

        return SuccessResponses.ok(reply, {
          credentials: decrypted.plaintext,
        });
      } catch (error) {
        Logger.error('Admin get subscription credentials failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to retrieve subscription credentials'
        );
      }
    }
  );

  fastify.get(
    '/:subscriptionId/upgrade-selection/credentials',
    {
      schema: {
        params: {
          type: 'object',
          required: ['subscriptionId'],
          properties: {
            subscriptionId: { type: 'string' },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { subscriptionId } = request.params as {
          subscriptionId: string;
        };

        const selection =
          await upgradeSelectionService.getSelectionForSubscription(
            subscriptionId
          );

        if (!selection) {
          return ErrorResponses.notFound(reply, 'Upgrade selection not found');
        }

        if (selection.selection_type !== 'upgrade_own_account') {
          return ErrorResponses.badRequest(
            reply,
            'No user-provided credentials for this selection'
          );
        }

        if (!selection.credentials_encrypted) {
          return ErrorResponses.notFound(
            reply,
            'User credentials are not available'
          );
        }

        const decrypted = credentialsEncryptionService.decryptFromString(
          selection.credentials_encrypted
        );
        if (!decrypted.wasEncrypted && decrypted.migratedPayload) {
          await upgradeSelectionService.updateSelectionCredentialsEncryptedValue(
            {
              subscriptionId,
              encryptedValue: decrypted.migratedPayload,
            }
          );
        }

        await logAdminAction(request, {
          action: 'subscriptions.selection_credentials.view',
          entityType: 'subscription',
          entityId: subscriptionId,
          metadata: {
            selectionType: selection.selection_type,
            accountIdentifier: selection.account_identifier ?? null,
          },
        });

        return SuccessResponses.ok(reply, {
          subscription_id: subscriptionId,
          account_identifier: selection.account_identifier ?? null,
          credentials: decrypted.plaintext,
        });
      } catch (error) {
        Logger.error('Admin reveal selection credentials failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to retrieve user credentials'
        );
      }
    }
  );

  fastify.post(
    '/:subscriptionId/credentials',
    {
      schema: {
        params: {
          type: 'object',
          required: ['subscriptionId'],
          properties: {
            subscriptionId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['credentials'],
          properties: {
            credentials: { type: ['string', 'null'], minLength: 1 },
            reason: { type: 'string', maxLength: 500 },
          },
          additionalProperties: false,
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { subscriptionId } = request.params as {
          subscriptionId: string;
        };
        const body = request.body as {
          credentials: string | null;
          reason?: string;
        };

        const trimmedCredentials =
          typeof body.credentials === 'string' ? body.credentials.trim() : null;

        if (typeof body.credentials === 'string' && !trimmedCredentials) {
          return ErrorResponses.badRequest(
            reply,
            'Credentials must not be empty'
          );
        }

        const beforeResult =
          await subscriptionService.getSubscriptionById(subscriptionId);
        const before = beforeResult.success ? beforeResult.data : null;

        const result =
          await subscriptionService.updateSubscriptionCredentialsForAdmin(
            subscriptionId,
            trimmedCredentials
          );

        if (!result.success) {
          return ErrorResponses.badRequest(
            reply,
            result.error || 'Failed to update subscription credentials'
          );
        }

        const sanitizedBefore = before
          ? { ...before, credentials_encrypted: undefined }
          : null;
        const sanitizedAfter = result.data
          ? { ...result.data, credentials_encrypted: undefined }
          : null;

        await logAdminAction(request, {
          action: 'subscriptions.credentials.update',
          entityType: 'subscription',
          entityId: subscriptionId,
          before: sanitizedBefore,
          after: sanitizedAfter,
          metadata: {
            credentialUpdated: true,
            credentialCleared: trimmedCredentials === null,
            reason: body.reason,
          },
        });

        if (sanitizedAfter && 'credentials_encrypted' in sanitizedAfter) {
          delete (sanitizedAfter as any).credentials_encrypted;
        }

        return SuccessResponses.ok(
          reply,
          sanitizedAfter || null,
          'Subscription credentials updated'
        );
      } catch (error) {
        Logger.error('Admin update subscription credentials failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to update subscription credentials'
        );
      }
    }
  );
}
