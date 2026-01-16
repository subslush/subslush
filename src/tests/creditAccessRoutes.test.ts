import Fastify from 'fastify';
import { creditService } from '../services/creditService';

jest.mock('../services/creditService', () => ({
  creditService: {
    getUserBalance: jest.fn(),
    addCredits: jest.fn(),
    getTransaction: jest.fn(),
  },
}));
jest.mock('../middleware/authMiddleware', () => {
  const authPreHandler = jest.fn(async (request: any, reply: any) => {
    const header = request.headers?.authorization as string | undefined;
    if (!header) {
      reply.code(401).send({
        error: 'Unauthorized',
        message: 'Authentication token required',
        code: 'MISSING_TOKEN',
      });
      return;
    }

    const token = header.replace('Bearer ', '');

    if (token === 'admin-token') {
      request.user = {
        userId: '00000000-0000-0000-0000-000000000001',
        email: 'admin@example.com',
        role: 'admin',
        isAdmin: true,
      };
      return;
    }

    if (token === 'user-a') {
      request.user = {
        userId: '11111111-1111-1111-1111-111111111111',
        email: 'usera@example.com',
        role: 'user',
        isAdmin: false,
      };
      return;
    }

    if (token === 'user-b') {
      request.user = {
        userId: '22222222-2222-2222-2222-222222222222',
        email: 'userb@example.com',
        role: 'user',
        isAdmin: false,
      };
      return;
    }

    reply.code(401).send({
      error: 'Unauthorized',
      message: 'Invalid token',
      code: 'INVALID_TOKEN',
    });
  });

  return { authPreHandler };
});

const mockCreditService = creditService as jest.Mocked<typeof creditService>;

const loadCreditRoutes = () => {
  let routes: any;
  jest.isolateModules(() => {
    routes = require('../routes/credits');
  });
  return routes.creditRoutes;
};

describe('Credit routes access control', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockCreditService as any).getTransaction = jest.fn();
    mockCreditService.getUserBalance.mockResolvedValue({
      userId: '22222222-2222-2222-2222-222222222222',
      totalBalance: 50,
      availableBalance: 50,
      pendingBalance: 0,
      lastUpdated: new Date(),
    } as any);
    mockCreditService.addCredits.mockResolvedValue({
      success: true,
      transaction: { id: 'tx-1' },
      balance: {
        userId: '11111111-1111-1111-1111-111111111111',
        totalBalance: 10,
        availableBalance: 10,
        pendingBalance: 0,
        lastUpdated: new Date(),
      },
    } as any);
  });

  it('rejects unauthenticated balance requests', async () => {
    const fastify = Fastify();
    const creditRoutes = loadCreditRoutes();
    await fastify.register(creditRoutes, { prefix: '/credits' });

    const response = await fastify.inject({
      method: 'GET',
      url: '/credits/balance/22222222-2222-2222-2222-222222222222',
    });

    await fastify.close();

    expect(response.statusCode).toBe(401);
  });

  it('blocks non-admin users from reading other user balances', async () => {
    const fastify = Fastify();
    const creditRoutes = loadCreditRoutes();
    await fastify.register(creditRoutes, { prefix: '/credits' });

    const response = await fastify.inject({
      method: 'GET',
      url: '/credits/balance/22222222-2222-2222-2222-222222222222',
      headers: {
        authorization: 'Bearer user-a',
      },
    });

    await fastify.close();

    expect(response.statusCode).toBe(403);
  });

  it('allows admin users to read other user balances', async () => {
    const fastify = Fastify();
    const creditRoutes = loadCreditRoutes();
    await fastify.register(creditRoutes, { prefix: '/credits' });

    const response = await fastify.inject({
      method: 'GET',
      url: '/credits/balance/22222222-2222-2222-2222-222222222222',
      headers: {
        authorization: 'Bearer admin-token',
      },
    });

    await fastify.close();

    expect(response.statusCode).toBe(200);
  });

  it('removes public credit deposit endpoint', async () => {
    const fastify = Fastify();
    const creditRoutes = loadCreditRoutes();
    await fastify.register(creditRoutes, { prefix: '/credits' });

    const response = await fastify.inject({
      method: 'POST',
      url: '/credits/deposit',
      headers: {
        authorization: 'Bearer user-a',
      },
      payload: {
        userId: '22222222-2222-2222-2222-222222222222',
        amount: 5,
        type: 'deposit',
        description: 'Test deposit',
      },
    });

    await fastify.close();

    expect(response.statusCode).toBe(404);
  });

  it('blocks non-admin users from admin credit operations', async () => {
    const fastify = Fastify();
    const creditRoutes = loadCreditRoutes();
    await fastify.register(creditRoutes, { prefix: '/credits' });

    const response = await fastify.inject({
      method: 'POST',
      url: '/credits/admin/add',
      headers: {
        authorization: 'Bearer user-a',
      },
      payload: {
        userId: '11111111-1111-1111-1111-111111111111',
        amount: 5,
        type: 'bonus',
        description: 'Test bonus',
      },
    });

    await fastify.close();

    expect(response.statusCode).toBe(403);
  });

  it('returns not found when user requests another user transaction', async () => {
    mockCreditService.getTransaction.mockResolvedValueOnce(null as any);

    const fastify = Fastify();
    const creditRoutes = loadCreditRoutes();
    await fastify.register(creditRoutes, { prefix: '/credits' });

    const response = await fastify.inject({
      method: 'GET',
      url: '/credits/transactions/11111111-1111-1111-1111-111111111111',
      headers: {
        authorization: 'Bearer user-a',
      },
    });

    await fastify.close();

    expect(response.statusCode).toBe(404);
    expect(mockCreditService.getTransaction).toHaveBeenCalledWith(
      '11111111-1111-1111-1111-111111111111',
      '11111111-1111-1111-1111-111111111111'
    );
  });

  it('rejects invalid transaction IDs', async () => {
    const fastify = Fastify();
    const creditRoutes = loadCreditRoutes();
    await fastify.register(creditRoutes, { prefix: '/credits' });

    const response = await fastify.inject({
      method: 'GET',
      url: '/credits/transactions/invalid-uuid',
      headers: {
        authorization: 'Bearer user-a',
      },
    });

    await fastify.close();

    expect(response.statusCode).toBe(400);
  });
});
