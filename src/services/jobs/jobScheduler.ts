import { redisClient } from '../../config/redis';
import { Logger } from '../../utils/logger';
import { RedisHelper } from '../../utils/redisHelper';

export interface ScheduledJob {
  name: string;
  intervalMs: number;
  handler: () => Promise<void>;
  runOnStart?: boolean;
  initialDelayMs?: number;
  lockKey?: string;
  lockTtlSeconds?: number;
}

export class JobScheduler {
  private readonly jobs = new Map<string, ScheduledJob>();
  private readonly timers = new Map<
    string,
    ReturnType<typeof global.setInterval>
  >();
  private readonly startTimeouts = new Map<
    string,
    ReturnType<typeof global.setTimeout>
  >();
  private readonly running = new Set<string>();
  private started = false;

  register(job: ScheduledJob): void {
    if (this.jobs.has(job.name)) {
      Logger.warn(`Job "${job.name}" is already registered`);
      return;
    }

    if (job.intervalMs <= 0) {
      Logger.warn(`Job "${job.name}" has invalid interval: ${job.intervalMs}`);
      return;
    }

    this.jobs.set(job.name, job);
  }

  start(): void {
    if (this.started) {
      Logger.warn('Job scheduler already started');
      return;
    }

    this.started = true;

    this.jobs.forEach(job => {
      const runOnStart = job.runOnStart !== false;
      const initialDelay = job.initialDelayMs ?? 0;

      if (runOnStart) {
        const timeout = global.setTimeout(() => {
          void this.runJob(job);
        }, initialDelay);
        this.startTimeouts.set(job.name, timeout);
      }

      const interval = global.setInterval(() => {
        void this.runJob(job);
      }, job.intervalMs);

      this.timers.set(job.name, interval);
    });

    Logger.info(`Job scheduler started (${this.jobs.size} jobs)`);
  }

  async stop(): Promise<void> {
    this.timers.forEach(timer => {
      global.clearInterval(timer);
    });
    this.startTimeouts.forEach(timeout => {
      global.clearTimeout(timeout);
    });

    this.timers.clear();
    this.startTimeouts.clear();
    this.running.clear();
    this.started = false;

    Logger.info('Job scheduler stopped');
  }

  private async runJob(job: ScheduledJob): Promise<void> {
    if (this.running.has(job.name)) {
      Logger.warn(`Job "${job.name}" is already running`);
      return;
    }

    let lockValue: string | null = null;
    if (job.lockKey) {
      if (!redisClient.isConnected()) {
        Logger.warn(`Skipping job "${job.name}" (Redis unavailable for lock)`);
        return;
      }

      try {
        lockValue = await RedisHelper.acquireLock(
          job.lockKey,
          job.lockTtlSeconds ?? 60
        );
      } catch (error) {
        Logger.error(`Failed to acquire lock for job "${job.name}":`, error);
        return;
      }

      if (!lockValue) {
        Logger.info(`Job "${job.name}" skipped (lock already held)`);
        return;
      }
    }

    this.running.add(job.name);

    try {
      await job.handler();
    } catch (error) {
      Logger.error(`Job "${job.name}" failed:`, error);
    } finally {
      this.running.delete(job.name);
      if (lockValue && job.lockKey) {
        try {
          await RedisHelper.releaseLock(job.lockKey, lockValue);
        } catch (error) {
          Logger.error(`Failed to release lock for job "${job.name}":`, error);
        }
      }
    }
  }
}
