import Fastify from 'fastify';
import { adminTaskRoutes } from '../routes/admin/tasks';
import { getDatabasePool } from '../config/database';

jest.mock('../config/database');
jest.mock('../services/auditLogService', () => ({
  logAdminAction: jest.fn(),
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

const mockGetDatabasePool = getDatabasePool as jest.MockedFunction<
  typeof getDatabasePool
>;

describe('Admin task completion', () => {
  const mockPool = {
    query: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDatabasePool.mockReturnValue(mockPool as any);
  });

  it('returns 400 for invalid task id format without hitting the database', async () => {
    const app = Fastify();
    await app.register(adminTaskRoutes, { prefix: '/admin/tasks' });

    const response = await app.inject({
      method: 'POST',
      url: '/admin/tasks/invalid-uuid/complete',
      payload: { note: 'done' },
    });

    await app.close();

    expect(response.statusCode).toBe(400);
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it('returns 404 when the task does not exist', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const app = Fastify();
    await app.register(adminTaskRoutes, { prefix: '/admin/tasks' });

    const response = await app.inject({
      method: 'POST',
      url: '/admin/tasks/11111111-1111-1111-1111-111111111111/complete',
      payload: { note: 'done' },
    });

    await app.close();

    expect(response.statusCode).toBe(404);
    expect(mockPool.query).toHaveBeenCalledTimes(2);
  });
});
