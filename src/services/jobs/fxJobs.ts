import { env } from '../../config/environment';
import { Logger } from '../../utils/logger';
import { fxRateService } from '../fx/fxRateService';
import { fxPricingPublisherService } from '../fx/fxPricingPublisherService';

export async function runDailyFxFetch(): Promise<void> {
  if (!env.FX_ENGINE_ENABLED || !env.FX_FETCH_JOB_ENABLED) {
    Logger.info('FX fetch job skipped (feature flag disabled)', {
      fxEngineEnabled: env.FX_ENGINE_ENABLED,
      fxFetchJobEnabled: env.FX_FETCH_JOB_ENABLED,
    });
    return;
  }

  Logger.info('FX daily fetch job started', {
    schedule: env.FX_FETCH_SCHEDULE_CRON,
    staleMinutes: env.FX_RATE_STALE_MINUTES,
  });

  const result = await fxRateService.fetchAndCacheLatestUsdRates();
  Logger.info('FX daily fetch job completed', result);
}

export async function runWeeklyPricingPublish(): Promise<void> {
  if (!env.FX_ENGINE_ENABLED || !env.FX_PUBLISH_JOB_ENABLED) {
    Logger.info('FX publish job skipped (feature flag disabled)', {
      fxEngineEnabled: env.FX_ENGINE_ENABLED,
      fxPublishJobEnabled: env.FX_PUBLISH_JOB_ENABLED,
    });
    return;
  }

  Logger.info('FX weekly publish job started', {
    schedule: env.FX_PUBLISH_SCHEDULE_CRON,
  });

  const result = await fxPricingPublisherService.publishCurrentPricingSnapshot({
    triggeredBy: 'scheduler',
  });

  const staleOrInvalidRates =
    result.status === 'skipped' &&
    typeof result.reason === 'string' &&
    /^(stale|missing|invalid)_fx_rate_/.test(result.reason);
  if (staleOrInvalidRates) {
    Logger.error('FX publish alert: stale or invalid FX data prevented publish', {
      runId: result.runId,
      snapshotId: result.snapshotId,
      reason: result.reason,
      schedule: env.FX_PUBLISH_SCHEDULE_CRON,
      alert: true,
    });
  }

  Logger.info('FX weekly publish job completed', result);
}
