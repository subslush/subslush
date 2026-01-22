import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authPreHandler } from '../../middleware/authMiddleware';
import { adminPreHandler } from '../../middleware/adminMiddleware';
import { couponService } from '../../services/couponService';
import { logAdminAction } from '../../services/auditLogService';
import { ErrorResponses, SuccessResponses } from '../../utils/response';
import { Logger } from '../../utils/logger';
import type { CouponScope, CouponStatus } from '../../types/coupon';

const isValidScopeTarget = (
  scope: CouponScope,
  category?: string | null,
  productId?: string | null
): boolean => {
  if (scope === 'global') {
    return !category && !productId;
  }
  if (scope === 'category') {
    return Boolean(category) && !productId;
  }
  if (scope === 'product') {
    return Boolean(productId) && !category;
  }
  return false;
};

const sanitizeString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const parseTermMonthsInput = (
  value: unknown
): { provided: boolean; value: number | null; error?: string } => {
  if (value === undefined) return { provided: false, value: null };
  if (value === null || value === '') return { provided: true, value: null };
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
    return {
      provided: true,
      value: null,
      error: 'term_months must be a positive whole number',
    };
  }
  return { provided: true, value: parsed };
};

export async function adminCouponRoutes(
  fastify: FastifyInstance
): Promise<void> {
  fastify.get(
    '/',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['active', 'inactive'] },
            scope: { type: 'string', enum: ['global', 'category', 'product'] },
            code: { type: 'string' },
            limit: { type: 'number', minimum: 1, maximum: 200 },
            offset: { type: 'number', minimum: 0 },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const filters = request.query as {
          status?: CouponStatus;
          scope?: CouponScope;
          code?: string;
          limit?: number;
          offset?: number;
        };

        const coupons = await couponService.listCoupons(filters);
        return SuccessResponses.ok(reply, { coupons });
      } catch (error) {
        Logger.error('Admin list coupons failed:', error);
        return ErrorResponses.internalError(reply, 'Failed to list coupons');
      }
    }
  );

  fastify.get(
    '/:couponId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['couponId'],
          properties: {
            couponId: { type: 'string' },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { couponId } = request.params as { couponId: string };
        const coupon = await couponService.getCouponById(couponId);
        if (!coupon) {
          return ErrorResponses.notFound(reply, 'Coupon not found');
        }
        return SuccessResponses.ok(reply, coupon);
      } catch (error) {
        Logger.error('Admin get coupon failed:', error);
        return ErrorResponses.internalError(reply, 'Failed to fetch coupon');
      }
    }
  );

  fastify.post(
    '/',
    {
      schema: {
        body: {
          type: 'object',
          required: ['code', 'percent_off', 'scope'],
          properties: {
            code: { type: 'string', minLength: 1 },
            percent_off: { type: 'number', minimum: 0, maximum: 100 },
            scope: { type: 'string', enum: ['global', 'category', 'product'] },
            status: { type: 'string', enum: ['active', 'inactive'] },
            starts_at: { type: 'string', format: 'date-time' },
            ends_at: { type: 'string', format: 'date-time' },
            max_redemptions: { type: ['number', 'null'], minimum: 0 },
            bound_user_id: { type: 'string' },
            first_order_only: { type: 'boolean' },
            category: { type: 'string' },
            product_id: { type: 'string' },
            term_months: { type: ['integer', 'null'], minimum: 1 },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const payload = request.body as any;
        const scope = payload.scope as CouponScope;
        const category = sanitizeString(payload.category);
        const productId = sanitizeString(payload.product_id);
        const termMonthsInput = parseTermMonthsInput(payload.term_months);

        if (!isValidScopeTarget(scope, category, productId)) {
          return ErrorResponses.badRequest(
            reply,
            'Coupon scope requires a matching category or product_id'
          );
        }

        if (termMonthsInput.error) {
          return ErrorResponses.badRequest(reply, termMonthsInput.error);
        }

        const result = await couponService.createCoupon({
          code: payload.code,
          percent_off: payload.percent_off,
          scope,
          status: payload.status,
          starts_at: payload.starts_at ? new Date(payload.starts_at) : null,
          ends_at: payload.ends_at ? new Date(payload.ends_at) : null,
          max_redemptions:
            payload.max_redemptions !== undefined
              ? payload.max_redemptions === null
                ? null
                : Number(payload.max_redemptions)
              : null,
          bound_user_id: sanitizeString(payload.bound_user_id),
          first_order_only: payload.first_order_only ?? false,
          category,
          product_id: productId,
          term_months: termMonthsInput.value,
        });

        if (!result.success) {
          return ErrorResponses.badRequest(
            reply,
            result.error || 'Failed to create coupon'
          );
        }

        await logAdminAction(request, {
          action: 'coupons.create',
          entityType: 'coupon',
          entityId: result.data.id,
          after: result.data,
        });

        return SuccessResponses.created(reply, result.data, 'Coupon created');
      } catch (error) {
        Logger.error('Admin create coupon failed:', error);
        return ErrorResponses.internalError(reply, 'Failed to create coupon');
      }
    }
  );

  fastify.patch(
    '/:couponId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['couponId'],
          properties: {
            couponId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          properties: {
            code: { type: 'string', minLength: 1 },
            percent_off: { type: 'number', minimum: 0, maximum: 100 },
            scope: { type: 'string', enum: ['global', 'category', 'product'] },
            status: { type: 'string', enum: ['active', 'inactive'] },
            starts_at: { type: 'string', format: 'date-time' },
            ends_at: { type: 'string', format: 'date-time' },
            max_redemptions: { type: ['number', 'null'], minimum: 0 },
            bound_user_id: { type: 'string' },
            first_order_only: { type: 'boolean' },
            category: { type: 'string' },
            product_id: { type: 'string' },
            term_months: { type: ['integer', 'null'], minimum: 1 },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { couponId } = request.params as { couponId: string };
        const payload = request.body as any;
        const before = await couponService.getCouponById(couponId);

        if (!before) {
          return ErrorResponses.notFound(reply, 'Coupon not found');
        }

        const nextScope = (payload.scope ?? before.scope) as CouponScope;
        const nextCategory =
          payload.category !== undefined
            ? sanitizeString(payload.category)
            : before.category;
        const nextProductId =
          payload.product_id !== undefined
            ? sanitizeString(payload.product_id)
            : before.product_id;
        const termMonthsInput = parseTermMonthsInput(payload.term_months);

        if (!isValidScopeTarget(nextScope, nextCategory, nextProductId)) {
          return ErrorResponses.badRequest(
            reply,
            'Coupon scope requires a matching category or product_id'
          );
        }

        if (termMonthsInput.error) {
          return ErrorResponses.badRequest(reply, termMonthsInput.error);
        }

        const updates = {
          ...(payload.code !== undefined ? { code: payload.code } : {}),
          ...(payload.percent_off !== undefined
            ? { percent_off: payload.percent_off }
            : {}),
          ...(payload.scope !== undefined ? { scope: payload.scope } : {}),
          ...(payload.status !== undefined ? { status: payload.status } : {}),
          ...(payload.starts_at !== undefined
            ? {
                starts_at: payload.starts_at
                  ? new Date(payload.starts_at)
                  : null,
              }
            : {}),
          ...(payload.ends_at !== undefined
            ? { ends_at: payload.ends_at ? new Date(payload.ends_at) : null }
            : {}),
          ...(payload.max_redemptions !== undefined
            ? {
                max_redemptions:
                  payload.max_redemptions === null
                    ? null
                    : Number(payload.max_redemptions),
              }
            : {}),
          ...(payload.bound_user_id !== undefined
            ? { bound_user_id: sanitizeString(payload.bound_user_id) }
            : {}),
          ...(payload.first_order_only !== undefined
            ? { first_order_only: payload.first_order_only }
            : {}),
          ...(payload.category !== undefined
            ? { category: sanitizeString(payload.category) }
            : {}),
          ...(payload.product_id !== undefined
            ? { product_id: sanitizeString(payload.product_id) }
            : {}),
          ...(termMonthsInput.provided
            ? { term_months: termMonthsInput.value }
            : {}),
        };

        if (payload.scope === 'global') {
          updates.category = null;
          updates.product_id = null;
        }
        if (payload.scope === 'category') {
          updates.product_id = null;
        }
        if (payload.scope === 'product') {
          updates.category = null;
        }

        const result = await couponService.updateCoupon(couponId, updates);
        if (!result.success) {
          return ErrorResponses.badRequest(
            reply,
            result.error || 'Failed to update coupon'
          );
        }

        await logAdminAction(request, {
          action: 'coupons.update',
          entityType: 'coupon',
          entityId: couponId,
          before,
          after: result.data,
        });

        return SuccessResponses.ok(reply, result.data, 'Coupon updated');
      } catch (error) {
        Logger.error('Admin update coupon failed:', error);
        return ErrorResponses.internalError(reply, 'Failed to update coupon');
      }
    }
  );

  fastify.delete(
    '/:couponId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['couponId'],
          properties: {
            couponId: { type: 'string' },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { couponId } = request.params as { couponId: string };
        const before = await couponService.getCouponById(couponId);

        if (!before) {
          return ErrorResponses.notFound(reply, 'Coupon not found');
        }

        const result = await couponService.deleteCoupon(couponId);
        if (!result.success) {
          return ErrorResponses.badRequest(
            reply,
            result.error || 'Failed to delete coupon'
          );
        }

        await logAdminAction(request, {
          action: 'coupons.delete',
          entityType: 'coupon',
          entityId: couponId,
          before,
        });

        return SuccessResponses.ok(reply, { deleted: true });
      } catch (error) {
        Logger.error('Admin delete coupon failed:', error);
        return ErrorResponses.internalError(reply, 'Failed to delete coupon');
      }
    }
  );
}
