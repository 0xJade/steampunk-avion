import type { AvailabilityProvider, DayAvailability, ISODate } from './types';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * STUB — future channel-manager / PMS integration.
 *
 * Unlike the .ics export, a PMS API (Hostaway, Hospitable, Guesty, OwnerRez…)
 * can return REAL nightly rates and min-night rules — the reason to ever move
 * off IcalProvider. This class exists so that switch is a config change, not a
 * refactor. It is intentionally non-functional today.
 *
 * The test key you were given (`stay_test_…`) is wired to land here via
 * PMS_API_KEY. Nothing calls this provider until AVAILABILITY_PROVIDER=pms.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export class PmsProvider implements AvailabilityProvider {
  constructor(
    private readonly opts: {
      apiKey: string;
      baseUrl: string;
      /** The PMS's own id for the unit, which may differ from the Airbnb id. */
      propertyId?: string;
    },
  ) {}

  async getAvailability(
    _listingId: string,
    _fromDate: ISODate,
    _toDate: ISODate,
  ): Promise<DayAvailability[]> {
    // TODO: Choose a vendor and implement its calendar endpoint. Sketch:
    //
    //   const res = await fetch(
    //     `${this.opts.baseUrl}/v1/listings/${this.opts.propertyId}/calendar` +
    //       `?start=${_fromDate}&end=${_toDate}`,
    //     { headers: { Authorization: `Bearer ${this.opts.apiKey}` } },
    //   );
    //   const json = await res.json();
    //
    // TODO: Map the vendor's day objects → DayAvailability. Crucially:
    //   • available:    from the vendor's status/availability flag
    //   • minNights:    from per-day min-stay rules (do NOT hardcode)
    //   • nightlyPrice: ONLY when the vendor returns a real number
    //   • currency:     the vendor's ISO currency; omit price if absent
    //
    // TODO: Be UTC-safe — normalize vendor dates to `yyyy-MM-dd` (see dates.ts).
    // TODO: Never fabricate a price. If a day has no rate, omit nightlyPrice.
    throw new Error(
      'PmsProvider is not implemented yet. Set AVAILABILITY_PROVIDER=ical (default) ' +
        'or =mock. See PmsProvider.ts TODOs to wire up a channel manager.',
    );
  }
}
