/**
 * ─────────────────────────────────────────────────────────────────────────────
 * UTC-SAFE DATE MATH.
 *
 * Off-by-one date bugs from timezone coercion are the #1 failure mode for a
 * booking calendar. The rules enforced here:
 *
 *   • A "day" is a `yyyy-MM-dd` string with NO time and NO zone.
 *   • We NEVER call `new Date("2026-03-01")` for arithmetic — that parses as
 *     UTC midnight but then most getters/formatters read it back in LOCAL time,
 *     which shifts the calendar day in any negative-offset zone.
 *   • All arithmetic runs on UTC-anchored Dates and is read back with getUTC*.
 *   • date-fns is used for the arithmetic primitives; the UTC anchoring is ours.
 *
 * Every exported function is pure and covered by tests/dates.test.ts.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { DayAvailability, ISODate } from './availability/types';

const MS_PER_DAY = 86_400_000;

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse `yyyy-MM-dd` to a Date anchored at UTC midnight. Throws on bad input. */
export function parseISODate(iso: ISODate): Date {
  const m = ISO_DATE_RE.exec(iso);
  if (!m) throw new RangeError(`Invalid ISO date: "${iso}"`);
  const [, y, mo, d] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  // Guard against rollover like 2026-02-31 silently becoming March.
  if (
    date.getUTCFullYear() !== Number(y) ||
    date.getUTCMonth() !== Number(mo) - 1 ||
    date.getUTCDate() !== Number(d)
  ) {
    throw new RangeError(`Invalid calendar date: "${iso}"`);
  }
  return date;
}

/** Format a Date to `yyyy-MM-dd` using its UTC fields (never local). */
export function toISODate(date: Date): ISODate {
  const y = date.getUTCFullYear().toString().padStart(4, '0');
  const mo = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const d = date.getUTCDate().toString().padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

/**
 * Add (or subtract) whole days, staying UTC-safe.
 *
 * We do NOT use date-fns's addDays here: it operates in local time and silently
 * drops/adds a day across a DST boundary (proven by tests/dates.test.ts). UTC
 * has no DST, so adding whole days of milliseconds to a UTC-midnight instant
 * always lands on the correct UTC-midnight day.
 */
export function addDaysISO(iso: ISODate, days: number): ISODate {
  return toISODate(new Date(parseISODate(iso).getTime() + days * MS_PER_DAY));
}

/** Calendar days from `a` to `b` (b - a). Negative if b is before a. */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / MS_PER_DAY);
}

/** Inclusive list of every `yyyy-MM-dd` from `from` to `to`. */
export function eachDayISO(from: ISODate, to: ISODate): ISODate[] {
  const span = daysBetween(from, to);
  if (span < 0) return [];
  const out: ISODate[] = [];
  for (let i = 0; i <= span; i++) out.push(addDaysISO(from, i));
  return out;
}

/** Today as `yyyy-MM-dd` in UTC. Pass a clock for deterministic tests. */
export function todayISO(now: Date = new Date()): ISODate {
  return toISODate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())));
}

/** True when calendar day `a` falls strictly before day `b`. */
export function isBefore(a: ISODate, b: ISODate): boolean {
  return daysBetween(a, b) > 0;
}

export function isPast(iso: ISODate, today: ISODate = todayISO()): boolean {
  return daysBetween(iso, today) > 0;
}

/** 0=Sunday … 6=Saturday, in UTC. */
export function weekdayUTC(iso: ISODate): number {
  return parseISODate(iso).getUTCDay();
}

/** First day of the given month as `yyyy-MM-01`. `monthOffset` shifts months. */
export function startOfMonthISO(iso: ISODate, monthOffset = 0): ISODate {
  const d = parseISODate(iso);
  return toISODate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + monthOffset, 1)));
}

/** Number of days in the month containing `iso`. */
export function daysInMonth(iso: ISODate): number {
  const d = parseISODate(iso);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

// ─────────────────────────────────────────────────────────────────────────────
// RANGE SELECTION LOGIC (also used by the calendar island)
// ─────────────────────────────────────────────────────────────────────────────

export interface DateRange {
  checkIn: ISODate | null;
  checkOut: ISODate | null;
}

export interface RangeValidation {
  valid: boolean;
  nights: number;
  /** Reason it's invalid, for aria/live messaging. Null when valid. */
  reason:
    | null
    | 'incomplete'
    | 'checkout-before-checkin'
    | 'same-day'
    | 'contains-blocked'
    | 'below-min-nights'
    | 'in-past';
  /** Effective minimum nights that applied (from data or the fallback). */
  minNights: number;
}

/**
 * Decide the next selection state when a guest clicks `clicked`, Airbnb-style:
 *   • no check-in yet, or a completed range exists → start over at `clicked`
 *   • check-in set, click a later day → set checkout
 *   • click the same day or earlier → restart at `clicked`
 * Past/blocked days should be filtered by the caller before this runs.
 */
export function nextSelection(current: DateRange, clicked: ISODate): DateRange {
  const { checkIn, checkOut } = current;
  if (!checkIn || checkOut) return { checkIn: clicked, checkOut: null };
  if (daysBetween(checkIn, clicked) <= 0) return { checkIn: clicked, checkOut: null };
  return { checkIn, checkOut: clicked };
}

/**
 * Validate a chosen range against the availability map.
 * NOTE ON SEMANTICS: `checkOut` is a departure day — the guest does NOT sleep
 * that night — so the nights that must be AVAILABLE are [checkIn, checkOut-1].
 * This mirrors how .ics DTEND is exclusive and avoids blocking a valid stay
 * just because the checkout day itself is someone else's check-in.
 */
export function validateRange(
  range: DateRange,
  availabilityByDate: Map<ISODate, DayAvailability>,
  opts: { defaultMinNights: number; today?: ISODate } = { defaultMinNights: 1 },
): RangeValidation {
  const today = opts.today ?? todayISO();
  const { checkIn, checkOut } = range;

  if (!checkIn || !checkOut) {
    return { valid: false, nights: 0, reason: 'incomplete', minNights: opts.defaultMinNights };
  }
  const nights = daysBetween(checkIn, checkOut);
  if (nights < 0) {
    return { valid: false, nights, reason: 'checkout-before-checkin', minNights: opts.defaultMinNights };
  }
  if (nights === 0) {
    return { valid: false, nights, reason: 'same-day', minNights: opts.defaultMinNights };
  }
  if (isPast(checkIn, today)) {
    return { valid: false, nights, reason: 'in-past', minNights: opts.defaultMinNights };
  }

  // Every night slept must be available: [checkIn, checkOut-1].
  const nightsSlept = eachDayISO(checkIn, addDaysISO(checkOut, -1));
  for (const day of nightsSlept) {
    const info = availabilityByDate.get(day);
    if (!info || !info.available) {
      return { valid: false, nights, reason: 'contains-blocked', minNights: opts.defaultMinNights };
    }
  }

  // Min-nights: the check-in day's rule wins if present, else the fallback.
  const minNights = availabilityByDate.get(checkIn)?.minNights ?? opts.defaultMinNights;
  if (nights < minNights) {
    return { valid: false, nights, reason: 'below-min-nights', minNights };
  }

  return { valid: true, nights, reason: null, minNights };
}
