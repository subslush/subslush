import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authPreHandler } from '../../middleware/authMiddleware';
import { adminPreHandler } from '../../middleware/adminMiddleware';
import { catalogService } from '../../services/catalogService';
import { logAdminAction } from '../../services/auditLogService';
import { ErrorResponses, SuccessResponses } from '../../utils/response';
import { Logger } from '../../utils/logger';
import { getSupportedCurrencies } from '../../utils/currency';

const parseBoolean = (value: unknown): boolean | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return undefined;
};

export async function adminCatalogRoutes(
  fastify: FastifyInstance
): Promise<void> {
  fastify.get(
    '/products',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            service_type: { type: 'string' },
            limit: { type: 'number', minimum: 1, maximum: 200 },
            offset: { type: 'number', minimum: 0 },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { status, service_type, limit, offset } = request.query as {
          status?: string;
          service_type?: string;
          limit?: number;
          offset?: number;
        };

        const products = await catalogService.listProducts({
          ...(status ? { status } : {}),
          ...(service_type ? { service_type } : {}),
          ...(limit !== undefined ? { limit } : {}),
          ...(offset !== undefined ? { offset } : {}),
        });

        return SuccessResponses.ok(reply, { products });
      } catch (error) {
        Logger.error('Admin list products failed:', error);
        return ErrorResponses.internalError(reply, 'Failed to list products');
      }
    }
  );

  fastify.get(
    '/products/:productId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['productId'],
          properties: {
            productId: { type: 'string' },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { productId } = request.params as { productId: string };
        const result = await catalogService.getProductDetail(productId);

        if (!result.success) {
          if (result.error === 'Product not found') {
            return ErrorResponses.notFound(reply, 'Product not found');
          }
          return ErrorResponses.internalError(
            reply,
            result.error || 'Failed to fetch product'
          );
        }

        return SuccessResponses.ok(reply, result.data);
      } catch (error) {
        Logger.error('Admin get product failed:', error);
        return ErrorResponses.internalError(reply, 'Failed to fetch product');
      }
    }
  );

  fastify.post(
    '/products',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name', 'slug'],
          properties: {
            name: { type: 'string', minLength: 1 },
            slug: { type: 'string', minLength: 1 },
            description: { type: 'string' },
            service_type: { type: 'string' },
            logo_key: { type: 'string' },
            category: { type: 'string' },
            default_currency: { type: 'string' },
            max_subscriptions: { type: 'integer', minimum: 0 },
            status: { type: 'string', enum: ['active', 'inactive'] },
            metadata: { type: 'object' },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const payload = request.body as any;
        if (payload?.status === 'active' || payload?.status === undefined) {
          return ErrorResponses.badRequest(
            reply,
            'Create the product as inactive, add variants/terms/prices, then activate it.'
          );
        }

        const result = await catalogService.createProduct(payload);

        if (!result.success) {
          return ErrorResponses.badRequest(
            reply,
            result.error || 'Failed to create product'
          );
        }

        await logAdminAction(request, {
          action: 'catalog.product.create',
          entityType: 'product',
          entityId: result.data?.id || null,
          after: result.data || null,
        });

        return SuccessResponses.created(reply, result.data, 'Product created');
      } catch (error) {
        Logger.error('Admin create product failed:', error);
        return ErrorResponses.internalError(reply, 'Failed to create product');
      }
    }
  );

  fastify.patch(
    '/products/:productId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['productId'],
          properties: {
            productId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            slug: { type: 'string' },
            description: { type: 'string' },
            service_type: { type: 'string' },
            logo_key: { type: 'string' },
            category: { type: 'string' },
            default_currency: { type: 'string' },
            max_subscriptions: { type: 'integer', minimum: 0 },
            status: { type: 'string', enum: ['active', 'inactive'] },
            metadata: { type: 'object' },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { productId } = request.params as { productId: string };
        const payload = request.body as any;
        const before = await catalogService.getProductById(productId);

        if (!before) {
          return ErrorResponses.notFound(reply, 'Product not found');
        }

        if (payload?.status === 'active') {
          const activeVariants = await catalogService.listVariants(
            productId,
            true
          );
          if (activeVariants.length === 0) {
            return ErrorResponses.badRequest(
              reply,
              'Cannot activate product without an active variant'
            );
          }

          const termMap = await catalogService.listVariantTermsForVariants(
            activeVariants.map(variant => variant.id),
            true
          );
          const missingTerms = activeVariants.filter(
            variant => (termMap.get(variant.id) || []).length === 0
          );
          if (missingTerms.length > 0) {
            const names = missingTerms
              .map(variant => variant.name)
              .filter(Boolean)
              .slice(0, 3)
              .join(', ');
            const suffix = missingTerms.length > 3 ? '…' : '';
            const detail = names ? ` (${names}${suffix})` : '';
            return ErrorResponses.badRequest(
              reply,
              `Cannot activate product until all active variants have at least one term${detail}`
            );
          }

          const requiredCurrencies = getSupportedCurrencies();
          const variantIds = activeVariants.map(variant => variant.id);
          const currencyMaps = await Promise.all(
            requiredCurrencies.map(currency =>
              catalogService.listCurrentPricesForCurrency({
                variantIds,
                currency,
              })
            )
          );

          const missingCurrencyByVariant = activeVariants
            .map(variant => {
              const missing = requiredCurrencies.filter((_, index) => {
                const priceMap = currencyMaps[index];
                return !priceMap || !priceMap.has(variant.id);
              });
              return missing.length > 0
                ? {
                    name: variant.name || variant.id,
                    missing,
                  }
                : null;
            })
            .filter(Boolean) as Array<{ name: string; missing: string[] }>;

          if (missingCurrencyByVariant.length > 0) {
            const preview = missingCurrencyByVariant
              .slice(0, 3)
              .map(entry => `${entry.name}: ${entry.missing.join(', ')}`)
              .join('; ');
            const suffix = missingCurrencyByVariant.length > 3 ? '…' : '';
            return ErrorResponses.badRequest(
              reply,
              `Cannot activate product until all active variants have prices for ${requiredCurrencies.join(', ')}. Missing: ${preview}${suffix}`
            );
          }
        }

        const result = await catalogService.updateProduct(productId, payload);

        if (!result.success) {
          return ErrorResponses.badRequest(
            reply,
            result.error || 'Failed to update product'
          );
        }

        await logAdminAction(request, {
          action: 'catalog.product.update',
          entityType: 'product',
          entityId: productId,
          before: before || null,
          after: result.data || null,
          metadata: {
            updatedFields: Object.keys((request.body as any) || {}),
          },
        });

        return SuccessResponses.ok(reply, result.data, 'Product updated');
      } catch (error) {
        Logger.error('Admin update product failed:', error);
        return ErrorResponses.internalError(reply, 'Failed to update product');
      }
    }
  );

  fastify.get(
    '/products/:productId/labels',
    {
      schema: {
        params: {
          type: 'object',
          required: ['productId'],
          properties: {
            productId: { type: 'string' },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { productId } = request.params as { productId: string };
        const product = await catalogService.getProductById(productId);

        if (!product) {
          return ErrorResponses.notFound(reply, 'Product not found');
        }

        const labels = await catalogService.listProductLabels(productId);
        return SuccessResponses.ok(reply, { labels });
      } catch (error) {
        Logger.error('Admin list product labels failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to list product labels'
        );
      }
    }
  );

  fastify.post(
    '/products/:productId/labels',
    {
      schema: {
        params: {
          type: 'object',
          required: ['productId'],
          properties: {
            productId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['label_id'],
          properties: {
            label_id: { type: 'string' },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { productId } = request.params as { productId: string };
        const { label_id } = request.body as { label_id: string };

        const result = await catalogService.addProductLabel(
          productId,
          label_id
        );

        if (!result.success) {
          if (result.error === 'Product not found') {
            return ErrorResponses.notFound(reply, 'Product not found');
          }
          if (result.error === 'Label not found') {
            return ErrorResponses.notFound(reply, 'Label not found');
          }
          return ErrorResponses.badRequest(
            reply,
            result.error || 'Failed to attach label'
          );
        }

        await logAdminAction(request, {
          action: 'catalog.product.label.attach',
          entityType: 'product_label_map',
          entityId: `${productId}:${label_id}`,
          metadata: {
            productId,
            labelId: label_id,
          },
        });

        return SuccessResponses.ok(reply, { labels: result.data });
      } catch (error) {
        Logger.error('Admin attach product label failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to attach product label'
        );
      }
    }
  );

  fastify.delete(
    '/products/:productId/labels/:labelId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['productId', 'labelId'],
          properties: {
            productId: { type: 'string' },
            labelId: { type: 'string' },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { productId, labelId } = request.params as {
          productId: string;
          labelId: string;
        };

        const result = await catalogService.removeProductLabel(
          productId,
          labelId
        );

        if (!result.success) {
          if (result.error === 'Product not found') {
            return ErrorResponses.notFound(reply, 'Product not found');
          }
          if (result.error === 'Label not found') {
            return ErrorResponses.notFound(reply, 'Label not found');
          }
          return ErrorResponses.badRequest(
            reply,
            result.error || 'Failed to detach label'
          );
        }

        await logAdminAction(request, {
          action: 'catalog.product.label.detach',
          entityType: 'product_label_map',
          entityId: `${productId}:${labelId}`,
          metadata: {
            productId,
            labelId,
          },
        });

        return SuccessResponses.ok(reply, { labels: result.data });
      } catch (error) {
        Logger.error('Admin detach product label failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to detach product label'
        );
      }
    }
  );

  fastify.get(
    '/product-variants',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            product_id: { type: 'string' },
            service_plan: { type: 'string' },
            is_active: { type: 'string' },
            limit: { type: 'number', minimum: 1, maximum: 200 },
            offset: { type: 'number', minimum: 0 },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { product_id, service_plan, is_active, limit, offset } =
          request.query as {
            product_id?: string;
            service_plan?: string;
            is_active?: string;
            limit?: number;
            offset?: number;
          };

        const isActive = parseBoolean(is_active);
        const variants = await catalogService.listVariantsForAdmin({
          ...(product_id ? { product_id } : {}),
          ...(service_plan ? { service_plan } : {}),
          ...(isActive !== undefined ? { is_active: isActive } : {}),
          ...(limit !== undefined ? { limit } : {}),
          ...(offset !== undefined ? { offset } : {}),
        });

        return SuccessResponses.ok(reply, { variants });
      } catch (error) {
        Logger.error('Admin list variants failed:', error);
        return ErrorResponses.internalError(reply, 'Failed to list variants');
      }
    }
  );

  fastify.post(
    '/product-variants',
    {
      schema: {
        body: {
          type: 'object',
          required: ['product_id', 'name'],
          properties: {
            product_id: { type: 'string' },
            name: { type: 'string', minLength: 1 },
            variant_code: { type: 'string' },
            description: { type: 'string' },
            service_plan: { type: 'string' },
            is_active: { type: 'boolean' },
            sort_order: { type: 'number' },
            metadata: { type: 'object' },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const result = await catalogService.createVariant(request.body as any);

        if (!result.success) {
          return ErrorResponses.badRequest(
            reply,
            result.error || 'Failed to create variant'
          );
        }

        await logAdminAction(request, {
          action: 'catalog.variant.create',
          entityType: 'product_variant',
          entityId: result.data?.id || null,
          after: result.data || null,
        });

        return SuccessResponses.created(reply, result.data, 'Variant created');
      } catch (error) {
        Logger.error('Admin create variant failed:', error);
        return ErrorResponses.internalError(reply, 'Failed to create variant');
      }
    }
  );

  fastify.patch(
    '/product-variants/:variantId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['variantId'],
          properties: {
            variantId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            variant_code: { type: 'string' },
            description: { type: 'string' },
            service_plan: { type: 'string' },
            is_active: { type: 'boolean' },
            sort_order: { type: 'number' },
            metadata: { type: 'object' },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { variantId } = request.params as { variantId: string };
        const before = await catalogService.getVariantById(variantId);
        const result = await catalogService.updateVariant(
          variantId,
          request.body as any
        );

        if (!result.success) {
          return ErrorResponses.badRequest(
            reply,
            result.error || 'Failed to update variant'
          );
        }

        await logAdminAction(request, {
          action: 'catalog.variant.update',
          entityType: 'product_variant',
          entityId: variantId,
          before: before || null,
          after: result.data || null,
          metadata: {
            updatedFields: Object.keys((request.body as any) || {}),
          },
        });

        return SuccessResponses.ok(reply, result.data, 'Variant updated');
      } catch (error) {
        Logger.error('Admin update variant failed:', error);
        return ErrorResponses.internalError(reply, 'Failed to update variant');
      }
    }
  );

  fastify.delete(
    '/product-variants/:variantId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['variantId'],
          properties: {
            variantId: { type: 'string' },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { variantId } = request.params as { variantId: string };
        const before = await catalogService.getVariantById(variantId);
        const result = await catalogService.deleteVariant(variantId);

        if (!result.success) {
          return ErrorResponses.badRequest(
            reply,
            result.error || 'Failed to delete variant'
          );
        }

        await logAdminAction(request, {
          action: 'catalog.variant.delete',
          entityType: 'product_variant',
          entityId: variantId,
          before: before || null,
        });

        return SuccessResponses.ok(reply, { deleted: true });
      } catch (error) {
        Logger.error('Admin delete variant failed:', error);
        return ErrorResponses.internalError(reply, 'Failed to delete variant');
      }
    }
  );

  fastify.get(
    '/product-variant-terms',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            product_variant_id: { type: 'string' },
            is_active: { type: 'string' },
            limit: { type: 'number', minimum: 1, maximum: 200 },
            offset: { type: 'number', minimum: 0 },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { product_variant_id, is_active, limit, offset } =
          request.query as {
            product_variant_id?: string;
            is_active?: string;
            limit?: number;
            offset?: number;
          };

        const isActive = parseBoolean(is_active);
        const terms = await catalogService.listVariantTerms({
          ...(product_variant_id ? { product_variant_id } : {}),
          ...(isActive !== undefined ? { is_active: isActive } : {}),
          ...(limit !== undefined ? { limit } : {}),
          ...(offset !== undefined ? { offset } : {}),
        });

        return SuccessResponses.ok(reply, { terms });
      } catch (error) {
        Logger.error('Admin list variant terms failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to list variant terms'
        );
      }
    }
  );

  fastify.post(
    '/product-variant-terms',
    {
      schema: {
        body: {
          type: 'object',
          required: ['product_variant_id', 'months'],
          properties: {
            product_variant_id: { type: 'string' },
            months: { type: 'number', minimum: 1 },
            discount_percent: { type: 'number', minimum: 0, maximum: 100 },
            is_active: { type: 'boolean' },
            is_recommended: { type: 'boolean' },
            sort_order: { type: 'number' },
            metadata: { type: 'object' },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const result = await catalogService.createVariantTerm(
          request.body as any
        );

        if (!result.success) {
          return ErrorResponses.badRequest(
            reply,
            result.error || 'Failed to create variant term'
          );
        }

        await logAdminAction(request, {
          action: 'catalog.variant_term.create',
          entityType: 'product_variant_term',
          entityId: result.data?.id || null,
          after: result.data || null,
        });

        return SuccessResponses.created(
          reply,
          result.data,
          'Variant term created'
        );
      } catch (error) {
        Logger.error('Admin create variant term failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to create variant term'
        );
      }
    }
  );

  fastify.patch(
    '/product-variant-terms/:termId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['termId'],
          properties: {
            termId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          properties: {
            months: { type: 'number', minimum: 1 },
            discount_percent: { type: 'number', minimum: 0, maximum: 100 },
            is_active: { type: 'boolean' },
            is_recommended: { type: 'boolean' },
            sort_order: { type: 'number' },
            metadata: { type: 'object' },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { termId } = request.params as { termId: string };
        const before = await catalogService.getVariantTermById(termId);
        const result = await catalogService.updateVariantTerm(
          termId,
          request.body as any
        );

        if (!result.success) {
          return ErrorResponses.badRequest(
            reply,
            result.error || 'Failed to update variant term'
          );
        }

        await logAdminAction(request, {
          action: 'catalog.variant_term.update',
          entityType: 'product_variant_term',
          entityId: termId,
          before: before || null,
          after: result.data || null,
          metadata: {
            updatedFields: Object.keys((request.body as any) || {}),
          },
        });

        return SuccessResponses.ok(reply, result.data, 'Variant term updated');
      } catch (error) {
        Logger.error('Admin update variant term failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to update variant term'
        );
      }
    }
  );

  fastify.delete(
    '/product-variant-terms/:termId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['termId'],
          properties: {
            termId: { type: 'string' },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { termId } = request.params as { termId: string };
        const result = await catalogService.deleteVariantTerm(termId);

        if (!result.success) {
          return ErrorResponses.badRequest(
            reply,
            result.error || 'Failed to delete variant term'
          );
        }

        await logAdminAction(request, {
          action: 'catalog.variant_term.delete',
          entityType: 'product_variant_term',
          entityId: termId,
        });

        return SuccessResponses.ok(reply, { deleted: true });
      } catch (error) {
        Logger.error('Admin delete variant term failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to delete variant term'
        );
      }
    }
  );

  fastify.get(
    '/product-labels',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'number', minimum: 1, maximum: 200 },
            offset: { type: 'number', minimum: 0 },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { limit, offset } = request.query as {
          limit?: number;
          offset?: number;
        };

        const labels = await catalogService.listLabels({
          ...(limit !== undefined ? { limit } : {}),
          ...(offset !== undefined ? { offset } : {}),
        });
        return SuccessResponses.ok(reply, { labels });
      } catch (error) {
        Logger.error('Admin list labels failed:', error);
        return ErrorResponses.internalError(reply, 'Failed to list labels');
      }
    }
  );

  fastify.post(
    '/product-labels',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name', 'slug'],
          properties: {
            name: { type: 'string', minLength: 1 },
            slug: { type: 'string', minLength: 1 },
            description: { type: 'string' },
            color: { type: 'string' },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const result = await catalogService.createLabel(request.body as any);

        if (!result.success) {
          return ErrorResponses.badRequest(
            reply,
            result.error || 'Failed to create label'
          );
        }

        await logAdminAction(request, {
          action: 'catalog.label.create',
          entityType: 'product_label',
          entityId: result.data?.id || null,
          after: result.data || null,
        });

        return SuccessResponses.created(reply, result.data, 'Label created');
      } catch (error) {
        Logger.error('Admin create label failed:', error);
        return ErrorResponses.internalError(reply, 'Failed to create label');
      }
    }
  );

  fastify.patch(
    '/product-labels/:labelId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['labelId'],
          properties: {
            labelId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            slug: { type: 'string' },
            description: { type: 'string' },
            color: { type: 'string' },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { labelId } = request.params as { labelId: string };
        const before = await catalogService.getLabelById(labelId);
        const result = await catalogService.updateLabel(
          labelId,
          request.body as any
        );

        if (!result.success) {
          if (result.error === 'Label not found') {
            return ErrorResponses.notFound(reply, 'Label not found');
          }
          return ErrorResponses.badRequest(
            reply,
            result.error || 'Failed to update label'
          );
        }

        await logAdminAction(request, {
          action: 'catalog.label.update',
          entityType: 'product_label',
          entityId: labelId,
          before: before || null,
          after: result.data || null,
          metadata: {
            updatedFields: Object.keys((request.body as any) || {}),
          },
        });

        return SuccessResponses.ok(reply, result.data, 'Label updated');
      } catch (error) {
        Logger.error('Admin update label failed:', error);
        return ErrorResponses.internalError(reply, 'Failed to update label');
      }
    }
  );

  fastify.get(
    '/product-media',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            product_id: { type: 'string' },
            limit: { type: 'number', minimum: 1, maximum: 200 },
            offset: { type: 'number', minimum: 0 },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { product_id, limit, offset } = request.query as {
          product_id?: string;
          limit?: number;
          offset?: number;
        };

        const media = await catalogService.listMedia({
          ...(product_id ? { product_id } : {}),
          ...(limit !== undefined ? { limit } : {}),
          ...(offset !== undefined ? { offset } : {}),
        });

        return SuccessResponses.ok(reply, { media });
      } catch (error) {
        Logger.error('Admin list media failed:', error);
        return ErrorResponses.internalError(reply, 'Failed to list media');
      }
    }
  );

  fastify.post(
    '/product-media',
    {
      schema: {
        body: {
          type: 'object',
          required: ['product_id', 'media_type', 'url'],
          properties: {
            product_id: { type: 'string' },
            media_type: { type: 'string', enum: ['image', 'video'] },
            url: { type: 'string', minLength: 1 },
            alt_text: { type: 'string' },
            sort_order: { type: 'number' },
            is_primary: { type: 'boolean' },
            metadata: { type: 'object' },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const result = await catalogService.createMedia(request.body as any);

        if (!result.success) {
          return ErrorResponses.badRequest(
            reply,
            result.error || 'Failed to create media'
          );
        }

        await logAdminAction(request, {
          action: 'catalog.media.create',
          entityType: 'product_media',
          entityId: result.data?.id || null,
          after: result.data || null,
        });

        return SuccessResponses.created(reply, result.data, 'Media created');
      } catch (error) {
        Logger.error('Admin create media failed:', error);
        return ErrorResponses.internalError(reply, 'Failed to create media');
      }
    }
  );

  fastify.patch(
    '/product-media/:mediaId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['mediaId'],
          properties: {
            mediaId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          properties: {
            media_type: { type: 'string', enum: ['image', 'video'] },
            url: { type: 'string' },
            alt_text: { type: 'string' },
            sort_order: { type: 'number' },
            is_primary: { type: 'boolean' },
            metadata: { type: 'object' },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { mediaId } = request.params as { mediaId: string };
        const before = await catalogService.getMediaById(mediaId);
        const result = await catalogService.updateMedia(
          mediaId,
          request.body as any
        );

        if (!result.success) {
          if (result.error === 'Media not found') {
            return ErrorResponses.notFound(reply, 'Media not found');
          }
          return ErrorResponses.badRequest(
            reply,
            result.error || 'Failed to update media'
          );
        }

        await logAdminAction(request, {
          action: 'catalog.media.update',
          entityType: 'product_media',
          entityId: mediaId,
          before: before || null,
          after: result.data || null,
          metadata: {
            updatedFields: Object.keys((request.body as any) || {}),
          },
        });

        return SuccessResponses.ok(reply, result.data, 'Media updated');
      } catch (error) {
        Logger.error('Admin update media failed:', error);
        return ErrorResponses.internalError(reply, 'Failed to update media');
      }
    }
  );

  fastify.get(
    '/price-history',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            product_variant_id: { type: 'string' },
            product_id: { type: 'string' },
            limit: { type: 'number', minimum: 1, maximum: 200 },
            offset: { type: 'number', minimum: 0 },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { product_variant_id, product_id, limit, offset } =
          request.query as {
            product_variant_id?: string;
            product_id?: string;
            limit?: number;
            offset?: number;
          };

        const prices = await catalogService.listPriceHistory({
          ...(product_variant_id ? { product_variant_id } : {}),
          ...(product_id ? { product_id } : {}),
          ...(limit !== undefined ? { limit } : {}),
          ...(offset !== undefined ? { offset } : {}),
        });

        return SuccessResponses.ok(reply, { prices });
      } catch (error) {
        Logger.error('Admin list price history failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to list price history'
        );
      }
    }
  );

  fastify.post(
    '/price-history',
    {
      schema: {
        body: {
          type: 'object',
          required: ['product_variant_id', 'price_cents', 'currency'],
          properties: {
            product_variant_id: { type: 'string' },
            price_cents: { type: 'number', minimum: 0 },
            currency: { type: 'string', minLength: 1 },
            starts_at: { type: 'string' },
            ends_at: { type: 'string' },
            metadata: { type: 'object' },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = request.body as any;
        const priceHistoryInput = {
          product_variant_id: body.product_variant_id,
          price_cents: body.price_cents,
          currency: body.currency,
          ...(body.starts_at ? { starts_at: new Date(body.starts_at) } : {}),
          ...(body.ends_at ? { ends_at: new Date(body.ends_at) } : {}),
          ...(body.metadata ? { metadata: body.metadata } : {}),
        };

        const result =
          await catalogService.createPriceHistory(priceHistoryInput);

        if (!result.success) {
          return ErrorResponses.badRequest(
            reply,
            result.error || 'Failed to create price entry'
          );
        }

        await logAdminAction(request, {
          action: 'catalog.price_history.create',
          entityType: 'price_history',
          entityId: result.data?.id || null,
          after: result.data || null,
        });

        return SuccessResponses.created(
          reply,
          result.data,
          'Price entry created'
        );
      } catch (error) {
        Logger.error('Admin create price history failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to create price entry'
        );
      }
    }
  );

  fastify.post(
    '/price-history/current',
    {
      schema: {
        body: {
          type: 'object',
          required: ['product_variant_id', 'price_cents', 'currency'],
          properties: {
            product_variant_id: { type: 'string' },
            price_cents: { type: 'number', minimum: 0 },
            currency: { type: 'string', minLength: 1 },
            starts_at: { type: 'string' },
            end_previous: { type: 'boolean' },
            metadata: { type: 'object' },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = request.body as any;
        const priceHistoryInput = {
          product_variant_id: body.product_variant_id,
          price_cents: body.price_cents,
          currency: body.currency,
          ...(body.starts_at ? { starts_at: new Date(body.starts_at) } : {}),
          ...(body.metadata ? { metadata: body.metadata } : {}),
        };

        const result = await catalogService.setCurrentPrice(priceHistoryInput, {
          endPrevious: body.end_previous,
        });

        if (!result.success) {
          return ErrorResponses.badRequest(
            reply,
            result.error || 'Failed to set current price'
          );
        }

        await logAdminAction(request, {
          action: 'catalog.price_history.set_current',
          entityType: 'price_history',
          entityId: result.data?.id || null,
          after: result.data || null,
        });

        return SuccessResponses.created(
          reply,
          result.data,
          'Current price set'
        );
      } catch (error) {
        Logger.error('Admin set current price failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to set current price'
        );
      }
    }
  );
}
