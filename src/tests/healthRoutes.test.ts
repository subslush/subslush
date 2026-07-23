import Fastify from 'fastify';
import { healthRoutes } from '../routes/health';
import { testDatabaseConnection } from '../config/database';
import { redisClient, rateLimitRedisClient } from '../config/redis';

jest.mock('../config/database', () => ({
  testDatabaseConnection: jest.fn(),
}));
jest.mock('../config/redis', () => ({
  redisClient: { getHealthInfo: jest.fn() },
  rateLimitRedisClient: { getHealthInfo: jest.fn() },
}));

const mockDatabaseHealth = testDatabaseConnection as jest.MockedFunction<
  typeof testDatabaseConnection
>;
const mockRedisHealth = redisClient.getHealthInfo as jest.MockedFunction<
  typeof redisClient.getHealthInfo
>;
const mockRateLimitRedisHealth =
  rateLimitRedisClient.getHealthInfo as jest.MockedFunction<
    typeof rateLimitRedisClient.getHealthInfo
  >;

describe('health and readiness routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabaseHealth.mockResolvedValue(true);
    mockRedisHealth.mockResolvedValue({ status: 'connected', latency: 1 });
    mockRateLimitRedisHealth.mockResolvedValue({
      status: 'connected',
      latency: 2,
    });
  });

  it('reports ready only when every required dependency is available', async () => {
    const app = Fastify();
    await app.register(healthRoutes);

    const response = await app.inject({ method: 'GET', url: '/ready' });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toMatchObject({
      status: 'ready',
      database: { status: 'connected' },
      redis: { status: 'connected' },
      redisRateLimit: { status: 'connected' },
    });
  });

  it('returns 503 when a required dependency is unavailable', async () => {
    mockRateLimitRedisHealth.mockResolvedValue({ status: 'disconnected' });
    const app = Fastify();
    await app.register(healthRoutes);

    const response = await app.inject({ method: 'GET', url: '/ready' });
    await app.close();

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      status: 'not_ready',
      redisRateLimit: { status: 'disconnected' },
    });
  });
});
