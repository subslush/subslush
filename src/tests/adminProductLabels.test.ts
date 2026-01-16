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

describe('Admin product label mapping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('attaches labels to a product', async () => {
    mockCatalogService.addProductLabel.mockResolvedValue({
      success: true,
      data: [{ id: 'label-1', name: 'Featured' }],
    } as any);

    const app = Fastify();
    await app.register(adminCatalogRoutes, { prefix: '/admin' });

    const response = await app.inject({
      method: 'POST',
      url: '/admin/products/prod-1/labels',
      payload: { label_id: 'label-1' },
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.labels).toHaveLength(1);
    expect(body.data.labels[0].id).toBe('label-1');
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'catalog.product.label.attach',
        entityId: 'prod-1:label-1',
      })
    );
  });

  it('detaches labels from a product', async () => {
    mockCatalogService.removeProductLabel.mockResolvedValue({
      success: true,
      data: [],
    } as any);

    const app = Fastify();
    await app.register(adminCatalogRoutes, { prefix: '/admin' });

    const response = await app.inject({
      method: 'DELETE',
      url: '/admin/products/prod-1/labels/label-1',
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.labels).toEqual([]);
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'catalog.product.label.detach',
        entityId: 'prod-1:label-1',
      })
    );
  });
});
