import { describe, it, expect } from 'vitest';
import { parseBlockedDates, IcalProvider } from '../src/lib/availability/IcalProvider';

// A trimmed but faithful Airbnb export. Note all events are VALUE=DATE
// (all-day) and DTEND is exclusive.
const FIXTURE = `BEGIN:VCALENDAR
PRODID:-//Airbnb Inc//Hosting Calendar 0.8.8//EN
CALSCALE:GREGORIAN
VERSION:2.0
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260310
DTEND;VALUE=DATE:20260313
UID:reservation-1@airbnb.com
SUMMARY:Reserved
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260401
DTEND;VALUE=DATE:20260402
UID:blocked-single@airbnb.com
SUMMARY:Airbnb (Not available)
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20261231
DTEND;VALUE=DATE:20270102
UID:new-year@airbnb.com
SUMMARY:Reserved
END:VEVENT
END:VCALENDAR
`;

describe('parseBlockedDates', () => {
  const blocked = parseBlockedDates(FIXTURE);

  it('treats DTEND as EXCLUSIVE (the checkout day is free)', () => {
    // 3/10–3/13 reservation blocks the nights of 10, 11, 12 only.
    expect(blocked.has('2026-03-10')).toBe(true);
    expect(blocked.has('2026-03-11')).toBe(true);
    expect(blocked.has('2026-03-12')).toBe(true);
    expect(blocked.has('2026-03-13')).toBe(false); // ← the off-by-one guard
    expect(blocked.has('2026-03-09')).toBe(false);
  });

  it('handles a single-day block', () => {
    expect(blocked.has('2026-04-01')).toBe(true);
    expect(blocked.has('2026-03-31')).toBe(false);
    expect(blocked.has('2026-04-02')).toBe(false);
  });

  it('handles a block spanning a year boundary', () => {
    expect(blocked.has('2026-12-31')).toBe(true);
    expect(blocked.has('2027-01-01')).toBe(true);
    expect(blocked.has('2027-01-02')).toBe(false); // exclusive end
  });

  it('produces exactly the expected number of blocked days', () => {
    // 3 (March) + 1 (April) + 2 (NYE) = 6
    expect(blocked.size).toBe(6);
  });

  it('returns an empty set for a calendar with no events', () => {
    const empty = `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//x//EN\nEND:VCALENDAR\n`;
    expect(parseBlockedDates(empty).size).toBe(0);
  });
});

describe('IcalProvider.getAvailability', () => {
  const makeProvider = () =>
    new IcalProvider({
      icsUrl: 'https://example.com/fake.ics',
      cacheSeconds: 0, // no caching between test calls
      fetchImpl: (async () =>
        new Response(FIXTURE, { status: 200, headers: { 'Content-Type': 'text/calendar' } })) as typeof fetch,
    });

  it('maps blocked days to available:false and open days to available:true', async () => {
    const days = await makeProvider().getAvailability('listing-1', '2026-03-09', '2026-03-14');
    const byDate = Object.fromEntries(days.map((d) => [d.date, d.available]));
    expect(byDate).toEqual({
      '2026-03-09': true,
      '2026-03-10': false,
      '2026-03-11': false,
      '2026-03-12': false,
      '2026-03-13': true, // checkout day is bookable again
      '2026-03-14': true,
    });
  });

  it('never fabricates pricing (no nightlyPrice/currency from .ics)', async () => {
    const days = await makeProvider().getAvailability('listing-1', '2026-03-09', '2026-03-11');
    for (const d of days) {
      expect(d.nightlyPrice).toBeUndefined();
      expect(d.currency).toBeUndefined();
    }
  });

  it('surfaces a fetch failure so the endpoint can fail soft', async () => {
    const provider = new IcalProvider({
      icsUrl: 'https://example.com/broken.ics',
      cacheSeconds: 0,
      fetchImpl: (async () => new Response('nope', { status: 500, statusText: 'Server Error' })) as typeof fetch,
    });
    await expect(provider.getAvailability('l', '2026-03-01', '2026-03-02')).rejects.toThrow(/500/);
  });
});
