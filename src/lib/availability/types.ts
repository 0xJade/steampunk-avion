/**
 * The single interface every availability source implements. Keeping this
 * narrow is what lets us swap .ics for a PMS later without touching the UI.
 */

/** ISO date string, always `yyyy-MM-dd`, interpreted in UTC. */
export type ISODate = string;

export interface DayAvailability {
  /** `yyyy-MM-dd` (UTC). */
  date: ISODate;
  available: boolean;
  /** Minimum nights for a stay starting this day, when the source knows it. */
  minNights?: number;
  /** Nightly price. OMITTED entirely when unknown — never 0, never faked. */
  nightlyPrice?: number;
  /** ISO 4217, e.g. "USD". Present only alongside nightlyPrice. */
  currency?: string;
}

export interface AvailabilityProvider {
  /**
   * Return one entry per calendar day in [fromDate, toDate] inclusive.
   * Implementations must be UTC-safe and must not fabricate pricing.
   */
  getAvailability(
    listingId: string,
    fromDate: ISODate,
    toDate: ISODate,
  ): Promise<DayAvailability[]>;
}

export type ProviderName = 'ical' | 'mock' | 'pms' | 'staying';
