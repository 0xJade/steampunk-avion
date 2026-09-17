import ical from 'node-ical';
import type { AvailabilityProvider, DayAvailability, ISODate } from './types';
import { addDaysISO, daysBetween, eachDayISO } from '../dates';

/**
 * Default provider. Parses the Airbnb .ics calendar export server-side.
 *
 * What .ics gives us: BLOCKED periods only (reservations + host-blocked days).
 * What it does NOT give us: pricing. So DayAvailability here never carries a
 * nightlyPrice — the UI degrades to "See rates on Airbnb".
 *
 * The single most important detail: in iCalendar, an all-day event's DTEND is
 * EXCLUSIVE. A booking DTSTART=20260310 / DTEND=20260313 blocks the nights of
 * the 10th, 11th, and 12th — the guest checks out on the 13th, which is free
 * for the next arrival. Getting this wrong blocks one extra day on every
 * reservation. Covered by tests/ical.test.ts.
 */

/**
 * Convert a node-ical event date to a `yyyy-MM-dd` string.
 *
 * node-ical builds all-day (VALUE=DATE) events with LOCAL-midnight Date objects
 * and tags them `dateOnly`, so we must read them back with LOCAL getters to
 * recover the intended calendar day regardless of the host timezone. Datetime
 * values are true instants and are read in UTC.
 */
function icsDateToISO(d: Date, dateOnly: boolean): ISODate {
  const y = (dateOnly ? d.getFullYear() : d.getUTCFullYear()).toString().padStart(4, '0');
  const mo = ((dateOnly ? d.getMonth() : d.getUTCMonth()) + 1).toString().padStart(2, '0');
  const day = (dateOnly ? d.getDate() : d.getUTCDate()).toString().padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

/**
 * Pure, testable core: given raw .ics text, return the set of blocked days.
 * DTEND is treated as exclusive for all-day events.
 */
export function parseBlockedDates(icsText: string): Set<ISODate> {
  const parsed = ical.parseICS(icsText);
  const blocked = new Set<ISODate>();

  for (const key of Object.keys(parsed)) {
    const ev = parsed[key];
    if (!ev || ev.type !== 'VEVENT' || !ev.start || !ev.end) continue;

    // node-ical marks all-day events with a `dateOnly` flag on the Date.
    const startDateOnly = (ev.start as Date & { dateOnly?: boolean }).dateOnly === true;
    const endDateOnly = (ev.end as Date & { dateOnly?: boolean }).dateOnly === true;

    const startISO = icsDateToISO(ev.start as Date, startDateOnly);
    let endISO = icsDateToISO(ev.end as Date, endDateOnly);

    // DTEND exclusive → last blocked night is the day before DTEND.
    // Only valid when end is strictly after start; guard degenerate events.
    if (daysBetween(startISO, endISO) <= 0) endISO = addDaysISO(startISO, 1);
    const lastBlocked = addDaysISO(endISO, -1);

    for (const day of eachDayISO(startISO, lastBlocked)) blocked.add(day);
  }

  return blocked;
}

/** Small in-isolate cache so repeated calls within a warm worker don't refetch. */
interface CacheEntry {
  blocked: Set<ISODate>;
  expires: number;
}

export class IcalProvider implements AvailabilityProvider {
  private static cache = new Map<string, CacheEntry>();

  constructor(
    private readonly opts: {
      icsUrl: string;
      /** Seconds to cache the parsed feed in-isolate. Defaults to 20 min. */
      cacheSeconds?: number;
      /** Injectable for tests. Defaults to global fetch. */
      fetchImpl?: typeof fetch;
    },
  ) {
    if (!opts.icsUrl) {
      throw new Error(
        'IcalProvider requires an icsUrl. Set ICS_URL in your environment ' +
          '(Airbnb → Calendar → Availability → Export Calendar).',
      );
    }
  }

  private async loadBlocked(): Promise<Set<ISODate>> {
    const now = Date.now();
    const cached = IcalProvider.cache.get(this.opts.icsUrl);
    if (cached && cached.expires > now) return cached.blocked;

    const doFetch = this.opts.fetchImpl ?? fetch;
    const res = await doFetch(this.opts.icsUrl, {
      headers: { Accept: 'text/calendar' },
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch .ics (${res.status} ${res.statusText})`);
    }
    const text = await res.text();
    const blocked = parseBlockedDates(text);

    const ttl = (this.opts.cacheSeconds ?? 1200) * 1000;
    IcalProvider.cache.set(this.opts.icsUrl, { blocked, expires: now + ttl });
    return blocked;
  }

  async getAvailability(
    _listingId: string,
    fromDate: ISODate,
    toDate: ISODate,
  ): Promise<DayAvailability[]> {
    const blocked = await this.loadBlocked();
    return eachDayISO(fromDate, toDate).map((date) => ({
      date,
      available: !blocked.has(date),
      // No minNights, no pricing — .ics doesn't carry them.
    }));
  }
}
