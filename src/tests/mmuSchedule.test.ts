import { describe, expect, it } from '@jest/globals';
import {
  formatMmuCoverageLabel,
  getInitialMmuCoverage,
  getMmuCycleInfo,
  shouldCreateMmuTask,
  validateMmuTermDivisibility,
} from '../utils/mmuSchedule';

describe('mmuSchedule', () => {
  it('calculates the current cycle based on calendar months', () => {
    const termStartAt = new Date('2024-01-15T00:00:00Z');
    const now = new Date('2024-02-01T00:00:00Z');

    const info = getMmuCycleInfo({ termStartAt, termMonths: 6, now });

    expect(info).not.toBeNull();
    expect(info?.cycleIndex).toBe(1);
    expect(info?.cycleTotal).toBe(6);
  });

  it('advances to the next cycle after the day-of-month boundary', () => {
    const termStartAt = new Date('2024-01-15T00:00:00Z');
    const now = new Date('2024-02-20T00:00:00Z');

    const info = getMmuCycleInfo({ termStartAt, termMonths: 6, now });

    expect(info).not.toBeNull();
    expect(info?.cycleIndex).toBe(2);
    expect(info?.cycleTotal).toBe(6);
    expect(info?.cycleStart.getFullYear()).toBe(2024);
    expect(info?.cycleStart.getMonth()).toBe(1);
    expect(info?.cycleStart.getDate()).toBe(15);
    expect(info?.cycleEnd.getFullYear()).toBe(2024);
    expect(info?.cycleEnd.getMonth()).toBe(2);
    expect(info?.cycleEnd.getDate()).toBe(15);
  });

  it('returns null when now is beyond the term duration', () => {
    const termStartAt = new Date('2024-01-01T00:00:00Z');
    const now = new Date('2024-08-01T00:00:00Z');

    const info = getMmuCycleInfo({ termStartAt, termMonths: 6, now });
    expect(info).toBeNull();
  });

  it('determines when to create MMU tasks based on lead time', () => {
    const cycleEnd = new Date('2024-03-15T00:00:00Z');
    const early = new Date('2024-03-01T00:00:00Z');
    const withinLead = new Date('2024-03-10T00:00:00Z');

    expect(shouldCreateMmuTask(cycleEnd, early, 7)).toBe(false);
    expect(shouldCreateMmuTask(cycleEnd, withinLead, 7)).toBe(true);
  });

  it.each([
    [6, 1],
    [12, 1],
    [12, 2],
    [6, 2],
    [12, 3],
  ])(
    'covers the full term exactly once for term %i interval %i',
    (termMonths, intervalMonths) => {
      const initial = getInitialMmuCoverage({ termMonths, intervalMonths });
      const covered = new Set<number>();
      for (
        let month = initial.coversMonthsFrom;
        month <= initial.coversMonthsTo;
        month += 1
      ) {
        covered.add(month);
      }

      for (
        let cycleIndex = intervalMonths;
        cycleIndex < termMonths;
        cycleIndex += intervalMonths
      ) {
        const label = formatMmuCoverageLabel({
          termMonths,
          intervalMonths,
          cycleIndex,
        });
        expect(label).not.toBeNull();
        for (
          let month = label!.coversMonthsFrom;
          month <= label!.coversMonthsTo;
          month += 1
        ) {
          expect(covered.has(month)).toBe(false);
          covered.add(month);
        }
      }

      expect(Array.from(covered).sort((a, b) => a - b)).toEqual(
        Array.from({ length: termMonths }, (_, index) => index + 1)
      );
    }
  );

  it('formats representative MMU labels', () => {
    expect(
      formatMmuCoverageLabel({
        termMonths: 6,
        intervalMonths: 1,
        cycleIndex: 1,
      })?.label
    ).toBe('Month 2 of 6');
    expect(
      formatMmuCoverageLabel({
        termMonths: 12,
        intervalMonths: 2,
        cycleIndex: 2,
      })?.label
    ).toBe('Months 3-4 of 12');
  });

  it('rejects invalid MMU term divisibility', () => {
    expect(
      validateMmuTermDivisibility({
        termMonths: 5,
        intervalMonths: 2,
      })
    ).toBe(false);
  });
});
