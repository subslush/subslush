export type FxCronSchedule = {
  minute: number;
  hour: number;
  dayOfWeek: number | null;
};

const CRON_PARTS = 5;

const isIntegerInRange = (
  value: string,
  min: number,
  max: number
): boolean => {
  if (!/^\d+$/.test(value)) {
    return false;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max;
};

export function parseFxCronSchedule(
  cron: string,
  fallback: FxCronSchedule
): FxCronSchedule {
  const normalized = cron.trim();
  if (!normalized) {
    return { ...fallback };
  }

  const parts = normalized.split(/\s+/);
  if (parts.length !== CRON_PARTS) {
    return { ...fallback };
  }

  const minuteRaw = parts[0] ?? '';
  const hourRaw = parts[1] ?? '';
  const dayOfMonthRaw = parts[2] ?? '';
  const monthRaw = parts[3] ?? '';
  const dayOfWeekRaw = parts[4] ?? '';
  if (
    !isIntegerInRange(minuteRaw, 0, 59) ||
    !isIntegerInRange(hourRaw, 0, 23) ||
    dayOfMonthRaw !== '*' ||
    monthRaw !== '*'
  ) {
    return { ...fallback };
  }

  const minute = Number(minuteRaw);
  const hour = Number(hourRaw);

  if (dayOfWeekRaw === '*') {
    return {
      minute,
      hour,
      dayOfWeek: null,
    };
  }

  if (!isIntegerInRange(dayOfWeekRaw, 0, 6)) {
    return { ...fallback };
  }

  return {
    minute,
    hour,
    dayOfWeek: Number(dayOfWeekRaw),
  };
}

export function getNextFxRunAt(
  schedule: FxCronSchedule,
  now: Date = new Date()
): Date {
  const nextRun = new Date(now);
  nextRun.setSeconds(0, 0);
  nextRun.setHours(schedule.hour, schedule.minute, 0, 0);

  if (schedule.dayOfWeek === null) {
    if (nextRun.getTime() <= now.getTime()) {
      nextRun.setDate(nextRun.getDate() + 1);
    }
    return nextRun;
  }

  const dayOffset = (schedule.dayOfWeek - now.getDay() + 7) % 7;
  nextRun.setDate(nextRun.getDate() + dayOffset);
  if (dayOffset === 0 && nextRun.getTime() <= now.getTime()) {
    nextRun.setDate(nextRun.getDate() + 7);
  }

  return nextRun;
}

export function getDelayUntilNextFxRunMs(
  schedule: FxCronSchedule,
  now: Date = new Date()
): number {
  const nextRun = getNextFxRunAt(schedule, now);
  return Math.max(0, nextRun.getTime() - now.getTime());
}
