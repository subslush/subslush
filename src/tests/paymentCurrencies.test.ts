import { describe, it, expect, beforeEach, jest } from '@jest/globals';

jest.mock('../utils/nowpaymentsClient');
jest.mock('../config/redis');
jest.mock('../config/database');
jest.mock('../services/payments/nowPaymentsProvider');
jest.mock('../services/paymentRepository');
jest.mock('../services/paymentMonitoringService');
jest.mock('../utils/logger');

import { paymentService } from '../services/paymentService';
import { nowpaymentsClient } from '../utils/nowpaymentsClient';
import { redisClient } from '../config/redis';
import { getDatabasePool } from '../config/database';
import { nowPaymentsProvider } from '../services/payments/nowPaymentsProvider';
import { paymentRepository } from '../services/paymentRepository';
import { paymentMonitoringService } from '../services/paymentMonitoringService';

const mockNowPaymentsClient = nowpaymentsClient as jest.Mocked<
  typeof nowpaymentsClient
>;
const mockRedisClient = redisClient as jest.Mocked<typeof redisClient>;
const mockGetDatabasePool = getDatabasePool as jest.MockedFunction<
  typeof getDatabasePool
>;
const mockNowPaymentsProvider = nowPaymentsProvider as jest.Mocked<
  typeof nowPaymentsProvider
>;
const mockPaymentRepository = paymentRepository as jest.Mocked<
  typeof paymentRepository
>;
const mockPaymentMonitoringService = paymentMonitoringService as jest.Mocked<
  typeof paymentMonitoringService
>;

const mockRedis = {
  get: jest.fn<(key: string) => Promise<string | null>>(),
  setex:
    jest.fn<(key: string, ttl: number, value: string) => Promise<string>>(),
  del: jest.fn<(key: string) => Promise<number>>(),
};

const mockDbClient = {
  query: jest.fn<(sql: string, params?: any[]) => Promise<any>>(),
  release: jest.fn<() => void>(),
};

const mockPool = {
  query: jest.fn<(sql: string, params?: any[]) => Promise<any>>(),
  connect: jest
    .fn<() => Promise<typeof mockDbClient>>()
    .mockResolvedValue(mockDbClient),
};

const SANE_TICKERS = [
  'btc',
  'eth',
  'usdt',
  'usdttrc20',
  'usdc',
  'usdterc20',
  'bnb',
  'xrp',
  'ltc',
  'ada',
  'trx',
  'sol',
  'dot',
  'matic',
  'ton',
  'near',
  'algo',
  'bch',
  'xlm',
  'avax',
];

const buildFullCurrencies = (tickers: string[]) =>
  tickers.map((ticker, index) => ({
    ticker,
    name: ticker.toUpperCase(),
    image: `https://nowpayments.io/images/coins/${ticker}.svg`,
    has_extra_id: false,
    is_popular: index < 6,
    is_stable: ticker.includes('usd'),
    is_fiat: false,
    confirmations_required: 1,
  }));

const buildCachedCurrencies = (tickers: string[]) =>
  tickers.map((ticker, index) => ({
    ticker,
    name: ticker.toUpperCase(),
    image: `https://nowpayments.io/images/coins/${ticker}.svg`,
    isPopular: index < 6,
    isStable: ticker.includes('usd'),
  }));

describe('Payment currency handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockRedisClient.getClient.mockReturnValue(mockRedis as any);
    mockRedisClient.isConnected.mockReturnValue(false);

    mockGetDatabasePool.mockReturnValue(mockPool as any);

    mockNowPaymentsClient.getCurrenciesFull.mockResolvedValue([]);
    mockNowPaymentsClient.getCurrencies.mockResolvedValue([]);
    mockNowPaymentsClient.getMinAmount.mockResolvedValue({
      min_amount: 1,
      fiat_equivalent: 1,
    });
    mockNowPaymentsClient.getEstimate.mockResolvedValue({
      currency_from: 'usd',
      amount_from: 100,
      currency_to: 'btc',
      estimated_amount: 0.001,
    });

    mockNowPaymentsProvider.createPayment.mockResolvedValue({
      providerPaymentId: 'payment-1',
      providerStatus: 'waiting',
      normalizedStatus: 'processing',
      amount: 100,
      priceCurrency: 'usd',
      payCurrency: 'btc',
      payAmount: 0.001,
      payAddress: 'addr-123',
      raw: {},
    } as any);

    mockPaymentRepository.create.mockResolvedValue({} as any);
    mockPaymentMonitoringService.addPendingPayment.mockResolvedValue();
  });

  it('rejects invalid pay_currency values', async () => {
    mockNowPaymentsClient.getCurrenciesFull.mockResolvedValue(
      buildFullCurrencies(SANE_TICKERS)
    );

    const result = await paymentService.createPayment('user-1', {
      creditAmount: 100,
      price_currency: 'usd',
      pay_currency: 'doge',
      orderDescription: 'Test payment',
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not supported/i);
    expect(mockNowPaymentsClient.getEstimate).not.toHaveBeenCalled();
    expect(mockNowPaymentsProvider.createPayment).not.toHaveBeenCalled();
  });

  it('falls back to cached currencies when the provider is unavailable', async () => {
    const cachedCurrencies = buildCachedCurrencies(SANE_TICKERS);

    mockRedisClient.isConnected.mockReturnValue(true);
    mockRedis.get.mockResolvedValueOnce(null);
    mockNowPaymentsClient.getCurrenciesFull.mockRejectedValue(
      new Error('provider down')
    );
    mockNowPaymentsClient.getCurrencies.mockRejectedValue(
      new Error('provider down')
    );
    mockRedis.get.mockResolvedValueOnce(JSON.stringify(cachedCurrencies));

    const result = await paymentService.getSupportedCurrencies();

    expect(result).toEqual(cachedCurrencies);
  });
});
