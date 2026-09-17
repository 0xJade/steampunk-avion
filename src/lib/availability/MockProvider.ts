import type { AvailabilityProvider, DayAvailability, ISODate } from './types';
import { eachDayISO, weekdayUTC } from '../dates';

/**
 * Deterministic fake availability for local dev and tests. Given the same
 * date range it always returns the same result — no randomness, no clock.
 *
 * By default it supplies NO pricing, so the UI exercises the same
 * "See rates on Airbnb" path the real IcalProvider produces. Pass
 * `{ withPricing: true }` to also emit deterministic prices when you want to
 * see the price-present branch.
 */
export class MockProvider implements AvailabilityProvider {
  constructor(private readonly opts: { withPricing?: boolean } = {}) {}

  async getAvailability(
    _listingId: string,
    fromDate: ISODate,
    toDate: ISODate,
  ): Promise<DayAvailability[]> {
    return eachDayISO(fromDate, toDate).map((date) => this.dayFor(date));
  }

  private dayFor(date: ISODate): DayAvailability {
    // Deterministic hash from the digits of the date.
    const n = Number(date.replace(/-/g, ''));
    const h = (n * 2654435761) >>> 0; // Knuth multiplicative hash

    // Block roughly 1 in 3 days, in a way that clusters into short "stays".
    const blocked = h % 3 === 0;
    const weekend = weekdayUTC(date) === 5 || weekdayUTC(date) === 6;

    const day: DayAvailability = {
      date,
      available: !blocked,
      minNights: weekend ? 3 : 2,
    };

    if (this.opts.withPricing && !blocked) {
      // Deterministic, obviously-fake pricing — dev only.
      day.nightlyPrice = weekend ? 189 : 149;
      day.currency = 'USD';
    }
    return day;
  }
}
