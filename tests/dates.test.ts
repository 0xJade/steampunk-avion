import { describe, it, expect } from 'vitest';
import {
  parseISODate,
  toISODate,
  addDaysISO,
  daysBetween,
  eachDayISO,
  todayISO,
  isPast,
  startOfMonthISO,
  daysInMonth,
  weekdayUTC,
  nextSelection,
  validateRange,
} from '../src/lib/dates';
import type { DayAvailability, ISODate } from '../src/lib/availability/types';

// This whole suite runs under TZ=America/Los_Angeles (see package.json). If any
// helper leaked local-time coercion, these would go off by one.

describe('UTC-safe parsing/formatting', () => {
  it('round-trips a date string without shifting', () => {
    expect(toISODate(parseISODate('2026-03-01'))).toBe('2026-03-01');
    expect(toISODate(parseISODate('2026-01-01'))).toBe('2026-01-01');
    expect(toISODate(parseISODate('2026-12-31'))).toBe('2026-12-31');
  });

  it('does not shift across a DST spring-forward boundary (US: 2026-03-08)', () => {
    // In America/Los_Angeles, naive local math around this day is where the
    // off-by-one bug bites.
    expect(addDaysISO('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDaysISO('2026-03-08', 1)).toBe('2026-03-09');
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
  });

  it('rejects malformed and impossible dates', () => {
    expect(() => parseISODate('2026-13-01')).toThrow();
    expect(() => parseISODate('2026-02-30')).toThrow();
    expect(() => parseISODate('not-a-date')).toThrow();
  });
});

describe('arithmetic', () => {
  it('adds and subtracts days across month/year boundaries', () => {
    expect(addDaysISO('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysISO('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDaysISO('2028-03-01', -1)).toBe('2028-02-29'); // leap year
  });

  it('daysBetween is signed and symmetric', () => {
    expect(daysBetween('2026-03-01', '2026-03-04')).toBe(3);
    expect(daysBetween('2026-03-04', '2026-03-01')).toBe(-3);
    expect(daysBetween('2026-03-01', '2026-03-01')).toBe(0);
  });

  it('eachDayISO is inclusive on both ends and empty when reversed', () => {
    expect(eachDayISO('2026-03-01', '2026-03-04')).toEqual([
      '2026-03-01',
      '2026-03-02',
      '2026-03-03',
      '2026-03-04',
    ]);
    expect(eachDayISO('2026-03-04', '2026-03-01')).toEqual([]);
  });

  it('month helpers', () => {
    expect(startOfMonthISO('2026-03-17')).toBe('2026-03-01');
    expect(startOfMonthISO('2026-03-17', 12)).toBe('2027-03-01');
    expect(daysInMonth('2026-02-10')).toBe(28);
    expect(daysInMonth('2028-02-10')).toBe(29);
    expect(daysInMonth('2026-04-10')).toBe(30);
    expect(weekdayUTC('2026-09-17')).toBe(4); // Thursday
  });
});

describe('today / past', () => {
  it('todayISO honors an injected clock in UTC', () => {
    // 2026-03-08T02:00Z is still 2026-03-07 in LA, but UTC day is the 8th.
    expect(todayISO(new Date('2026-03-08T02:00:00Z'))).toBe('2026-03-08');
  });

  it('isPast compares calendar days', () => {
    expect(isPast('2026-03-07', '2026-03-08')).toBe(true);
    expect(isPast('2026-03-08', '2026-03-08')).toBe(false);
    expect(isPast('2026-03-09', '2026-03-08')).toBe(false);
  });
});

describe('range selection', () => {
  it('first click sets check-in', () => {
    expect(nextSelection({ checkIn: null, checkOut: null }, '2026-03-10')).toEqual({
      checkIn: '2026-03-10',
      checkOut: null,
    });
  });

  it('later click sets checkout', () => {
    expect(nextSelection({ checkIn: '2026-03-10', checkOut: null }, '2026-03-13')).toEqual({
      checkIn: '2026-03-10',
      checkOut: '2026-03-13',
    });
  });

  it('earlier or same click restarts at the new day', () => {
    expect(nextSelection({ checkIn: '2026-03-10', checkOut: null }, '2026-03-08')).toEqual({
      checkIn: '2026-03-08',
      checkOut: null,
    });
    expect(nextSelection({ checkIn: '2026-03-10', checkOut: null }, '2026-03-10')).toEqual({
      checkIn: '2026-03-10',
      checkOut: null,
    });
  });

  it('clicking with a completed range starts over', () => {
    expect(
      nextSelection({ checkIn: '2026-03-10', checkOut: '2026-03-13' }, '2026-03-20'),
    ).toEqual({ checkIn: '2026-03-20', checkOut: null });
  });
});

describe('range validation', () => {
  const avail = (dates: ISODate[], overrides: Partial<DayAvailability> = {}) => {
    const map = new Map<ISODate, DayAvailability>();
    for (const d of dates) map.set(d, { date: d, available: true, ...overrides });
    return map;
  };

  const today = '2026-03-01';

  it('accepts a clean 3-night stay; checkout day itself need not be available', () => {
    // Nights slept: 10,11,12. The 13th is checkout — intentionally NOT in the map.
    const map = avail(['2026-03-10', '2026-03-11', '2026-03-12']);
    const r = validateRange(
      { checkIn: '2026-03-10', checkOut: '2026-03-13' },
      map,
      { defaultMinNights: 2, today },
    );
    expect(r.valid).toBe(true);
    expect(r.nights).toBe(3);
  });

  it('rejects a range containing a blocked night', () => {
    const map = avail(['2026-03-10', '2026-03-12']); // 11th missing/blocked
    const r = validateRange(
      { checkIn: '2026-03-10', checkOut: '2026-03-13' },
      map,
      { defaultMinNights: 1, today },
    );
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('contains-blocked');
  });

  it('enforces min-nights, preferring the check-in day rule', () => {
    const map = avail(['2026-03-10', '2026-03-11']);
    map.set('2026-03-10', { date: '2026-03-10', available: true, minNights: 3 });
    const r = validateRange(
      { checkIn: '2026-03-10', checkOut: '2026-03-12' }, // 2 nights
      map,
      { defaultMinNights: 1, today },
    );
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('below-min-nights');
    expect(r.minNights).toBe(3);
  });

  it('rejects same-day and reversed ranges', () => {
    const map = avail(['2026-03-10']);
    expect(
      validateRange({ checkIn: '2026-03-10', checkOut: '2026-03-10' }, map, {
        defaultMinNights: 1,
        today,
      }).reason,
    ).toBe('same-day');
    expect(
      validateRange({ checkIn: '2026-03-12', checkOut: '2026-03-10' }, map, {
        defaultMinNights: 1,
        today,
      }).reason,
    ).toBe('checkout-before-checkin');
  });

  it('rejects a check-in in the past', () => {
    const map = avail(['2026-02-20', '2026-02-21']);
    const r = validateRange(
      { checkIn: '2026-02-20', checkOut: '2026-02-22' },
      map,
      { defaultMinNights: 1, today },
    );
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('in-past');
  });
});
