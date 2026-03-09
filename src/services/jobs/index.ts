import { env } from '../../config/environment';
import { Logger } from '../../utils/logger';
import { paymentMonitoringService } from '../paymentMonitoringService';
import { JobScheduler } from './jobScheduler';
import {
  runSubscriptionExpirySweep,
  runSubscriptionReminderSweep,
  runSubscriptionRenewalSweep,
  runUpgradeSelectionReminderSweep,
  runManualMonthlyUpgradeSweep,
} from './subscriptionJobs';
import {
  runPinLockoutMonitor,
  runSubscriptionDataQualityMonitor,
  runOrderAllocationReconciliation,
} from './monitoringJobs';
import {
  runCheckoutAbandonSweep,
  runNowPaymentsCurrencyRefresh,
} from './paymentJobs';
import { runEmailVerificationSync } from './authJobs';
import { runDailyFxFetch, runWeeklyPricingPublish } from './fxJobs';
import { getDelayUntilNextFxRunMs, parseFxCronSchedule } from './fxSchedule';

const scheduler = new JobScheduler();
let jobsRegistered = false;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_WEEK_MS = 7 * ONE_DAY_MS;
const FX_DAILY_FALLBACK_SCHEDULE = {
  minute: 0,
  hour: 0,
  dayOfWeek: null as number | null,
};
const FX_WEEKLY_FALLBACK_SCHEDULE = {
  minute: 59,
  hour: 23,
  dayOfWeek: 0,
};

function registerJobs(): void {
  if (jobsRegistered) {
    return;
  }

  scheduler.register({
    name: 'subscription-renewal',
    intervalMs: env.SUBSCRIPTION_RENEWAL_INTERVAL,
    initialDelayMs: 10000,
    lockKey: 'jobs:subscription_renewal',
    lockTtlSeconds: 300,
    handler: runSubscriptionRenewalSweep,
  });

  scheduler.register({
    name: 'subscription-expiry',
    intervalMs: env.SUBSCRIPTION_EXPIRY_INTERVAL,
    initialDelayMs: 20000,
    lockKey: 'jobs:subscription_expiry',
    lockTtlSeconds: 300,
    handler: runSubscriptionExpirySweep,
  });

  scheduler.register({
    name: 'subscription-reminders',
    intervalMs: env.SUBSCRIPTION_REMINDER_INTERVAL,
    initialDelayMs: 25000,
    lockKey: 'jobs:subscription_reminders',
    lockTtlSeconds: 300,
    handler: runSubscriptionReminderSweep,
  });

  scheduler.register({
    name: 'upgrade-selection-reminders',
    intervalMs: env.UPGRADE_SELECTION_REMINDER_INTERVAL,
    initialDelayMs: 30000,
    lockKey: 'jobs:upgrade_selection_reminders',
    lockTtlSeconds: 300,
    handler: runUpgradeSelectionReminderSweep,
  });

  scheduler.register({
    name: 'manual-monthly-upgrade',
    intervalMs: env.MANUAL_MONTHLY_UPGRADE_INTERVAL,
    initialDelayMs: 45000,
    lockKey: 'jobs:manual_monthly_upgrade',
    lockTtlSeconds: 600,
    handler: runManualMonthlyUpgradeSweep,
  });

  scheduler.register({
    name: 'pin-lockout-monitor',
    intervalMs: env.PIN_LOCKOUT_MONITOR_INTERVAL,
    initialDelayMs: 15000,
    lockKey: 'jobs:pin_lockout_monitor',
    lockTtlSeconds: 120,
    handler: runPinLockoutMonitor,
  });

  scheduler.register({
    name: 'subscription-data-quality',
    intervalMs: env.SUBSCRIPTION_DATA_QUALITY_INTERVAL,
    initialDelayMs: 35000,
    lockKey: 'jobs:subscription_data_quality',
    lockTtlSeconds: 300,
    handler: runSubscriptionDataQualityMonitor,
  });

  scheduler.register({
    name: 'order-allocation-reconciliation',
    intervalMs: env.ORDER_ALLOCATION_RECONCILIATION_INTERVAL,
    initialDelayMs: 60000,
    lockKey: 'jobs:order_allocation_reconciliation',
    lockTtlSeconds: 600,
    handler: runOrderAllocationReconciliation,
  });

  scheduler.register({
    name: 'email-verification-sync',
    intervalMs: env.EMAIL_VERIFICATION_SYNC_INTERVAL,
    initialDelayMs: 30000,
    lockKey: 'jobs:email_verification_sync',
    lockTtlSeconds: 300,
    handler: runEmailVerificationSync,
  });

  scheduler.register({
    name: 'nowpayments-currencies',
    intervalMs: env.NOWPAYMENTS_CURRENCY_REFRESH_INTERVAL,
    initialDelayMs: 20000,
    lockKey: 'jobs:nowpayments_currencies',
    lockTtlSeconds: 300,
    handler: runNowPaymentsCurrencyRefresh,
  });

  scheduler.register({
    name: 'checkout-abandon-sweep',
    intervalMs: env.CHECKOUT_ABANDON_SWEEP_INTERVAL,
    initialDelayMs: 40000,
    lockKey: 'jobs:checkout_abandon_sweep',
    lockTtlSeconds: 300,
    handler: runCheckoutAbandonSweep,
  });

  if (env.FX_ENGINE_ENABLED && env.FX_FETCH_JOB_ENABLED) {
    const now = new Date();
    const parsedFetchSchedule = parseFxCronSchedule(
      env.FX_FETCH_SCHEDULE_CRON,
      FX_DAILY_FALLBACK_SCHEDULE
    );
    const fetchSchedule = {
      minute: parsedFetchSchedule.minute,
      hour: parsedFetchSchedule.hour,
      dayOfWeek: null as number | null,
    };
    const fetchInitialDelayMs = getDelayUntilNextFxRunMs(fetchSchedule, now);

    scheduler.register({
      name: 'fx-daily-fetch',
      intervalMs: ONE_DAY_MS,
      initialDelayMs: fetchInitialDelayMs,
      alignIntervalWithInitialDelay: true,
      lockKey: 'jobs:fx_daily_fetch',
      lockTtlSeconds: 900,
      handler: runDailyFxFetch,
    });

    Logger.info('Registered FX daily fetch schedule', {
      cron: env.FX_FETCH_SCHEDULE_CRON,
      nextRunAt: new Date(now.getTime() + fetchInitialDelayMs).toISOString(),
    });
  }

  if (env.FX_ENGINE_ENABLED && env.FX_PUBLISH_JOB_ENABLED) {
    const now = new Date();
    const parsedPublishSchedule = parseFxCronSchedule(
      env.FX_PUBLISH_SCHEDULE_CRON,
      FX_WEEKLY_FALLBACK_SCHEDULE
    );
    const publishSchedule =
      parsedPublishSchedule.dayOfWeek === null
        ? FX_WEEKLY_FALLBACK_SCHEDULE
        : parsedPublishSchedule;
    const publishInitialDelayMs = getDelayUntilNextFxRunMs(
      publishSchedule,
      now
    );

    scheduler.register({
      name: 'fx-weekly-publish',
      intervalMs: ONE_WEEK_MS,
      initialDelayMs: publishInitialDelayMs,
      alignIntervalWithInitialDelay: true,
      lockKey: 'jobs:fx_weekly_publish',
      lockTtlSeconds: 1800,
      handler: runWeeklyPricingPublish,
    });

    Logger.info('Registered FX weekly publish schedule', {
      cron: env.FX_PUBLISH_SCHEDULE_CRON,
      nextRunAt: new Date(now.getTime() + publishInitialDelayMs).toISOString(),
      dayOfWeek: publishSchedule.dayOfWeek,
    });
  }

  jobsRegistered = true;
}

export async function startJobs(): Promise<void> {
  if (!env.JOBS_ENABLED) {
    Logger.info('Background jobs are disabled');
    return;
  }

  registerJobs();
  scheduler.start();

  if (env.PAYMENT_MONITORING_AUTO_START) {
    try {
      await paymentMonitoringService.startMonitoring();
    } catch (error) {
      Logger.error('Failed to auto-start payment monitoring:', error);
    }
  }
}

export async function stopJobs(): Promise<void> {
  if (jobsRegistered) {
    await scheduler.stop();
  }

  if (paymentMonitoringService.isMonitoringActive()) {
    try {
      await paymentMonitoringService.stopMonitoring();
    } catch (error) {
      Logger.error('Failed to stop payment monitoring:', error);
    }
  }
}
