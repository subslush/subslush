import { env } from '../config/environment';
import { fxPricingPublisherService } from '../services/fx/fxPricingPublisherService';
import { runWeeklyPricingPublish } from '../services/jobs/fxJobs';
import { Logger } from '../utils/logger';

jest.mock('../services/fx/fxPricingPublisherService', () => ({
  fxPricingPublisherService: {
    publishCurrentPricingSnapshot: jest.fn(),
  },
}));

jest.mock('../services/fx/fxRateService', () => ({
  fxRateService: {
    fetchAndCacheLatestUsdRates: jest.fn(),
  },
}));

jest.mock('../utils/logger', () => ({
  Logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const mockPublisher = fxPricingPublisherService as jest.Mocked<
  typeof fxPricingPublisherService
>;

describe('fx jobs stale guard alerts', () => {
  const originalFxEngineEnabled = env.FX_ENGINE_ENABLED;
  const originalFxPublishJobEnabled = env.FX_PUBLISH_JOB_ENABLED;

  beforeEach(() => {
    jest.clearAllMocks();
    env.FX_ENGINE_ENABLED = true;
    env.FX_PUBLISH_JOB_ENABLED = true;
  });

  afterAll(() => {
    env.FX_ENGINE_ENABLED = originalFxEngineEnabled;
    env.FX_PUBLISH_JOB_ENABLED = originalFxPublishJobEnabled;
  });

  it('logs an alert when weekly publish skips due to stale rates', async () => {
    mockPublisher.publishCurrentPricingSnapshot.mockResolvedValue({
      status: 'skipped',
      runId: 'run-1',
      snapshotId: 'snapshot-1',
      publishedCount: 0,
      reason: 'stale_fx_rate_EUR',
    });

    await runWeeklyPricingPublish();

    expect(Logger.error).toHaveBeenCalledWith(
      'FX publish alert: stale or invalid FX data prevented publish',
      expect.objectContaining({
        runId: 'run-1',
        snapshotId: 'snapshot-1',
        reason: 'stale_fx_rate_EUR',
        alert: true,
      })
    );
  });
});
