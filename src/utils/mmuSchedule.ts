export interface MmuCycleInfo {
  cycleIndex: number;
  cycleTotal: number;
  cycleStart: Date;
  cycleEnd: Date;
}

const normalizeMonths = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

export function addCalendarMonths(base: Date, months: number): Date {
  const result = new Date(base);
  result.setMonth(result.getMonth() + normalizeMonths(months));
  return result;
}

export function diffInCalendarMonths(start: Date, end: Date): number {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return 0;
  }

  let months =
    (endDate.getFullYear() - startDate.getFullYear()) * 12 +
    (endDate.getMonth() - startDate.getMonth());

  if (endDate.getDate() < startDate.getDate()) {
    months -= 1;
  }

  return Math.max(0, months);
}

export function getMmuCycleInfo(params: {
  termStartAt: Date;
  termMonths: number;
  now?: Date;
}): MmuCycleInfo | null {
  const termMonths = normalizeMonths(params.termMonths);
  if (!Number.isFinite(termMonths) || termMonths <= 0) return null;

  const termStartAt = new Date(params.termStartAt);
  if (Number.isNaN(termStartAt.getTime())) {
    return null;
  }

  const now = params.now ?? new Date();
  const monthsElapsed = diffInCalendarMonths(termStartAt, now);
  const cycleIndex = monthsElapsed + 1;

  if (cycleIndex > termMonths) {
    return null;
  }

  const cycleStart = addCalendarMonths(termStartAt, cycleIndex - 1);
  const cycleEnd = addCalendarMonths(termStartAt, cycleIndex);

  return {
    cycleIndex,
    cycleTotal: termMonths,
    cycleStart,
    cycleEnd,
  };
}

export function shouldCreateMmuTask(
  cycleEnd: Date,
  now: Date,
  leadDays: number = 7
): boolean {
  const leadMs = leadDays * 24 * 60 * 60 * 1000;
  return now.getTime() >= cycleEnd.getTime() - leadMs;
}
