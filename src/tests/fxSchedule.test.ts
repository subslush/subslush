import {
  getDelayUntilNextFxRunMs,
  getNextFxRunAt,
  parseFxCronSchedule,
} from '../services/jobs/fxSchedule';

describe('fxSchedule', () => {
  it('parses weekly publish cron and schedules next Sunday 23:59 local time', () => {
    const schedule = parseFxCronSchedule('59 23 * * 0', {
      minute: 0,
      hour: 0,
      dayOfWeek: null,
    });
    const now = new Date(2026, 1, 24, 10, 0, 0, 0); // Tue Feb 24, 2026 local

    const nextRun = getNextFxRunAt(schedule, now);

    expect(nextRun.getDay()).toBe(0);
    expect(nextRun.getHours()).toBe(23);
    expect(nextRun.getMinutes()).toBe(59);
    expect(nextRun.getTime()).toBeGreaterThan(now.getTime());
  });

  it('rolls weekly publish to the following week when current slot already passed', () => {
    const schedule = {
      minute: 59,
      hour: 23,
      dayOfWeek: 0,
    };
    const now = new Date(2026, 2, 1, 23, 59, 1, 0); // Sunday 23:59:01 local

    const nextRun = getNextFxRunAt(schedule, now);

    expect(nextRun.getDay()).toBe(0);
    expect(nextRun.getDate()).toBe(8);
    expect(nextRun.getHours()).toBe(23);
    expect(nextRun.getMinutes()).toBe(59);
  });

  it('uses fallback schedule when cron format is invalid', () => {
    const fallback = {
      minute: 59,
      hour: 23,
      dayOfWeek: 0,
    };

    const parsed = parseFxCronSchedule('invalid-cron', fallback);

    expect(parsed).toEqual(fallback);
  });

  it('calculates positive delay to next run', () => {
    const schedule = {
      minute: 0,
      hour: 0,
      dayOfWeek: null,
    };
    const now = new Date(2026, 1, 24, 12, 0, 0, 0);

    const delay = getDelayUntilNextFxRunMs(schedule, now);

    expect(delay).toBeGreaterThan(0);
    expect(delay).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  });
});
