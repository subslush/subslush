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
});
