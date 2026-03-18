import Fastify from 'fastify';
import { adminCatalogRoutes } from '../routes/admin/catalog';
import { catalogService } from '../services/catalogService';
import { logAdminAction } from '../services/auditLogService';

jest.mock('../services/catalogService');
jest.mock('../services/auditLogService');
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

describe('Admin catalog updates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  it('defaults duration_months to 1 when activating with fixed price fields only', async () => {
    mockCatalogService.getProductById.mockResolvedValue({
      id: 'prod-1',
      status: 'inactive',
      duration_months: null,
      fixed_price_cents: null,
      fixed_price_currency: null,
    } as any);
    mockCatalogService.updateProduct.mockResolvedValue({
      success: true,
      data: {
        id: 'prod-1',
        status: 'active',
        duration_months: 1,
        fixed_price_cents: 999,
        fixed_price_currency: 'USD',
      },
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

    expect(response.statusCode).toBe(200);
    expect(mockCatalogService.updateProduct).toHaveBeenCalledWith(
      'prod-1',
      expect.objectContaining({
        status: 'active',
        duration_months: 1,
        fixed_price_cents: 999,
        fixed_price_currency: 'USD',
      })
    );
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
