import Fastify from 'fastify';
import { adminCatalogRoutes } from '../routes/admin/catalog';
import { catalogService } from '../services/catalogService';
import { logAdminAction } from '../services/auditLogService';
import { getDatabasePool } from '../config/database';

jest.mock('../services/catalogService');
jest.mock('../services/auditLogService');
jest.mock('../config/database', () => ({
  getDatabasePool: jest.fn(),
}));
jest.mock('../middleware/authMiddleware', () => ({
  authPreHandler: jest.fn(async (request: any) => {
    request.user = {
      userId: 'admin-1',
      email: 'admin@example.com',
      role: 'admin',
      sessionId: 'session-1',
      isAdmin: true,
    };
  }),
}));
jest.mock('../middleware/adminMiddleware', () => ({
  adminPreHandler: jest.fn(async () => {}),
}));
jest.mock('../utils/logger');

const mockCatalogService = catalogService as jest.Mocked<typeof catalogService>;
const mockLogAdminAction = logAdminAction as jest.MockedFunction<
  typeof logAdminAction
>;
const mockGetDatabasePool = getDatabasePool as jest.MockedFunction<
  typeof getDatabasePool
>;

describe('Admin catalog updates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDatabasePool.mockReturnValue({
      query: jest.fn().mockResolvedValue({ rows: [] }),
    } as any);
  });

  it('creates a fully configurable fixed product as an inactive draft', async () => {
    mockCatalogService.createProduct.mockResolvedValue({
      success: true,
      data: {
        id: 'prod-fixed',
        name: 'Product A — 1 Month',
        status: 'inactive',
        duration_months: 1,
        fixed_price_cents: 1299,
        fixed_price_currency: 'USD',
      },
    } as any);
    const app = Fastify();
    await app.register(adminCatalogRoutes, { prefix: '/admin' });
    const response = await app.inject({
      method: 'POST',
      url: '/admin/products',
      payload: {
        name: 'Product A — 1 Month',
        slug: 'product-a-1-month',
        service_type: 'product-a',
        status: 'inactive',
        duration_months: 1,
        fixed_price_cents: 1299,
        fixed_price_currency: 'USD',
      },
    });
    await app.close();

    expect(response.statusCode).toBe(201);
    expect(mockCatalogService.createProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'inactive',
        duration_months: 1,
        fixed_price_cents: 1299,
        fixed_price_currency: 'USD',
      })
    );
    expect(mockCatalogService.createVariant).not.toHaveBeenCalled();
  });

  it('keeps legacy variant mutation read-only for complete fixed products', async () => {
    mockCatalogService.getProductById.mockResolvedValue({
      id: 'prod-fixed',
      duration_months: 1,
      fixed_price_cents: 1299,
      fixed_price_currency: 'USD',
    } as any);
    const app = Fastify();
    await app.register(adminCatalogRoutes, { prefix: '/admin' });
    const response = await app.inject({
      method: 'POST',
      url: '/admin/product-variants',
      payload: { product_id: 'prod-fixed', name: 'Accidental variant' },
    });
    await app.close();

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain(
      'Variants and terms are read-only for a complete fixed product'
    );
    expect(mockCatalogService.createVariant).not.toHaveBeenCalled();
  });

  it('updates a product label', async () => {
    mockCatalogService.getLabelById.mockResolvedValue({
      id: 'label-1',
      name: 'Old',
    } as any);
    mockCatalogService.updateLabel.mockResolvedValue({
      success: true,
      data: { id: 'label-1', name: 'New' },
    } as any);

    const app = Fastify();
    await app.register(adminCatalogRoutes, { prefix: '/admin' });

    const response = await app.inject({
      method: 'PATCH',
      url: '/admin/product-labels/label-1',
      payload: { name: 'New' },
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.id).toBe('label-1');
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'catalog.label.update',
        entityId: 'label-1',
      })
    );
  });

  it('updates product media', async () => {
    mockCatalogService.getMediaById.mockResolvedValue({
      id: 'media-1',
      url: 'https://example.com/old.png',
    } as any);
    mockCatalogService.updateMedia.mockResolvedValue({
      success: true,
      data: { id: 'media-1', url: 'https://example.com/new.png' },
    } as any);

    const app = Fastify();
    await app.register(adminCatalogRoutes, { prefix: '/admin' });

    const response = await app.inject({
      method: 'PATCH',
      url: '/admin/product-media/media-1',
      payload: { url: 'https://example.com/new.png' },
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.id).toBe('media-1');
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'catalog.media.update',
        entityId: 'media-1',
      })
    );
  });

  it('accepts nullable fixed catalog fields when updating a product', async () => {
    mockCatalogService.getProductById.mockResolvedValue({
      id: 'prod-1',
      duration_months: 12,
      fixed_price_cents: 999,
      fixed_price_currency: 'USD',
      status: 'inactive',
    } as any);
    mockCatalogService.updateProduct.mockResolvedValue({
      success: true,
      data: {
        id: 'prod-1',
        duration_months: null,
        fixed_price_cents: null,
        fixed_price_currency: null,
      },
    } as any);

    const app = Fastify();
    await app.register(adminCatalogRoutes, { prefix: '/admin' });

    const response = await app.inject({
      method: 'PATCH',
      url: '/admin/products/prod-1',
      payload: {
        duration_months: null,
        fixed_price_cents: null,
        fixed_price_currency: null,
      },
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    expect(mockCatalogService.updateProduct).toHaveBeenCalledWith(
      'prod-1',
      expect.objectContaining({
        duration_months: null,
        fixed_price_cents: null,
        fixed_price_currency: null,
      })
    );
  });

  it('requires an explicit duration when publishing fixed price fields', async () => {
    mockCatalogService.getProductById.mockResolvedValue({
      id: 'prod-1',
      status: 'inactive',
      duration_months: null,
      fixed_price_cents: null,
      fixed_price_currency: null,
    } as any);
    const app = Fastify();
    await app.register(adminCatalogRoutes, { prefix: '/admin' });

    const response = await app.inject({
      method: 'PATCH',
      url: '/admin/products/prod-1',
      payload: {
        status: 'active',
        fixed_price_cents: 999,
        fixed_price_currency: 'USD',
      },
    });

    await app.close();

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain('duration');
    expect(response.json().message).toContain('A variant is not required');
    expect(mockCatalogService.updateProduct).not.toHaveBeenCalled();
  });

  it('publishes a complete fixed product without consulting variants', async () => {
    mockCatalogService.getProductById.mockResolvedValue({
      id: 'prod-1',
      status: 'inactive',
      duration_months: 12,
      fixed_price_cents: 9999,
      fixed_price_currency: 'USD',
    } as any);
    mockCatalogService.updateProduct.mockResolvedValue({
      success: true,
      data: { id: 'prod-1', status: 'active' },
    } as any);

    const app = Fastify();
    await app.register(adminCatalogRoutes, { prefix: '/admin' });

    const response = await app.inject({
      method: 'PATCH',
      url: '/admin/products/prod-1',
      payload: { status: 'active' },
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    expect(mockCatalogService.updateProduct).toHaveBeenCalledWith(
      'prod-1',
      expect.objectContaining({ status: 'active' })
    );
    expect(mockCatalogService.listVariants).not.toHaveBeenCalled();
    expect(
      mockCatalogService.listVariantTermsForVariants
    ).not.toHaveBeenCalled();
  });

  it('refuses publication when only a legacy variant configuration exists', async () => {
    mockCatalogService.getProductById.mockResolvedValue({
      id: 'prod-1',
      status: 'inactive',
      duration_months: null,
    } as any);

    const app = Fastify();
    await app.register(adminCatalogRoutes, { prefix: '/admin' });

    const response = await app.inject({
      method: 'PATCH',
      url: '/admin/products/prod-1',
      payload: { status: 'active' },
    });

    await app.close();

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain('Fixed Catalog Fields');
    expect(response.json().message).toContain('A variant is not required');
    expect(mockCatalogService.updateProduct).not.toHaveBeenCalled();
  });

  it('sets the current fixed product price with comparison history metadata', async () => {
    mockCatalogService.getProductById.mockResolvedValue({
      id: 'prod-1',
      fixed_price_cents: 999,
      fixed_price_currency: 'USD',
    } as any);
    mockCatalogService.setCurrentFixedProductPrice.mockResolvedValue({
      success: true,
      data: { id: 'fixed-price-2', product_id: 'prod-1', price_cents: 1199 },
    } as any);
    const app = Fastify();
    await app.register(adminCatalogRoutes, { prefix: '/admin' });
    const response = await app.inject({
      method: 'POST',
      url: '/admin/products/prod-1/fixed-price/current',
      payload: {
        duration_months: 12,
        price_cents: 1199,
        currency: 'USD',
        comparison_price_cents: 1499,
      },
    });
    await app.close();

    expect(response.statusCode).toBe(201);
    expect(mockCatalogService.setCurrentFixedProductPrice).toHaveBeenCalledWith(
      {
        product_id: 'prod-1',
        duration_months: 12,
        price_cents: 1199,
        currency: 'USD',
        comparison_price_cents: 1499,
      }
    );
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'catalog.fixed_product_price.set_current',
      })
    );
  });

  it('uses the product-level recovery operation and preserves compatibility counts', async () => {
    const compatibility = {
      variant_count: 1,
      active_variant_count: 1,
      term_count: 1,
      price_history_count: 2,
      subscription_count: 1,
      order_item_count: 1,
      payment_count: 1,
      credit_transaction_count: 0,
      fixed_catalog_preferred: true,
    };
    mockCatalogService.getLegacyCatalogCompatibility.mockResolvedValue(
      compatibility
    );
    mockCatalogService.recoverProductOnlyCatalog.mockResolvedValue({
      success: true,
      data: {
        product_id: 'prod-1',
        already_product_only: false,
        deactivated_variant_count: 1,
        deactivated_variant_ids: ['variant-1'],
        compatibility: { ...compatibility, active_variant_count: 0 },
      },
    } as any);
    const app = Fastify();
    await app.register(adminCatalogRoutes, { prefix: '/admin' });
    const response = await app.inject({
      method: 'POST',
      url: '/admin/products/prod-1/fixed-catalog/recover',
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().data.deactivated_variant_count).toBe(1);
    expect(response.json().data.compatibility.subscription_count).toBe(1);
  });

  it('passes category and sub-category filters when listing products', async () => {
    mockCatalogService.listProducts.mockResolvedValue([
      {
        id: 'prod-1',
        name: 'Netflix Standard',
        slug: 'netflix-standard',
      },
    ] as any);

    const app = Fastify();
    await app.register(adminCatalogRoutes, { prefix: '/admin' });

    const response = await app.inject({
      method: 'GET',
      url: '/admin/products?category=streaming&sub_category=netflix',
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    expect(mockCatalogService.listProducts).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'streaming',
        sub_category: 'netflix',
      })
    );
  });

  it('refuses a non-divisible term edit when MMU is enabled', async () => {
    mockCatalogService.getVariantTermById.mockResolvedValue({
      id: 'term-1',
      product_variant_id: 'variant-1',
      months: 6,
    } as any);
    mockGetDatabasePool.mockReturnValue({
      query: jest.fn().mockResolvedValue({
        rows: [
          {
            metadata: {
              upgrade_options: {
                manual_monthly_upgrade: true,
                manual_monthly_upgrade_interval_months: 2,
              },
            },
          },
        ],
      }),
    } as any);

    const app = Fastify();
    await app.register(adminCatalogRoutes, { prefix: '/admin' });
    const response = await app.inject({
      method: 'PATCH',
      url: '/admin/product-variant-terms/term-1',
      payload: { months: 3 },
    });
    await app.close();

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toBe(
      'Term length must be divisible by the MMU interval.'
    );
    expect(mockCatalogService.updateVariantTerm).not.toHaveBeenCalled();
  });

  it('creates a product sub-category', async () => {
    mockCatalogService.createProductSubCategory.mockResolvedValue({
      success: true,
      data: {
        id: 'subcat-1',
        category: 'streaming',
        name: 'Netflix',
        slug: 'netflix',
      },
    } as any);

    const app = Fastify();
    await app.register(adminCatalogRoutes, { prefix: '/admin' });

    const response = await app.inject({
      method: 'POST',
      url: '/admin/product-sub-categories',
      payload: {
        category: 'streaming',
        name: 'Netflix',
      },
    });

    await app.close();

    expect(response.statusCode).toBe(201);
    expect(mockCatalogService.createProductSubCategory).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'streaming',
        name: 'Netflix',
      })
    );
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'catalog.sub_category.create',
        entityType: 'product_sub_category',
        entityId: 'subcat-1',
      })
    );
  });
});
