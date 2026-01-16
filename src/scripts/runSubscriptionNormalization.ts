import { env } from '../config/environment';
import {
  createDatabasePool,
  testDatabaseConnection,
  closeDatabasePool,
} from '../config/database';
import { redisClient } from '../config/redis';
import {
  runSubscriptionExpirySweep,
  runSubscriptionRenewalSweep,
} from '../services/jobs/subscriptionJobs';
import { Logger } from '../utils/logger';

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const includeRenewals = args.has('--include-renewals');

  Logger.info('Subscription normalization started', { includeRenewals });

  createDatabasePool(env);

  const dbOk = await testDatabaseConnection();
  if (!dbOk) {
    Logger.error('Database connection failed; aborting normalization');
    process.exit(1);
  }

  try {
    await redisClient.connect();
  } catch (error) {
    Logger.warn('Redis connection failed; continuing without cache clears', {
      error,
    });
  }

  try {
    if (includeRenewals) {
      await runSubscriptionRenewalSweep();
    }

    await runSubscriptionExpirySweep();
  } catch (error) {
    Logger.error('Subscription normalization failed', { error });
    process.exitCode = 1;
  } finally {
    try {
      await redisClient.disconnect();
    } catch (error) {
      Logger.warn('Failed to disconnect Redis cleanly', { error });
    }
    await closeDatabasePool();
  }

  Logger.info('Subscription normalization complete');
}

main().catch(error => {
  Logger.error('Unhandled normalization error', { error });
  process.exit(1);
});
