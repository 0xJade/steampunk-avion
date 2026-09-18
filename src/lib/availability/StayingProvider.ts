import type { AvailabilityProvider, DayAvailability, ISODate } from './types';
import { addDaysISO, eachDayISO } from '../dates';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * StayingAPI provider — https://stayingapi.com
 *
 * A REST alternative to the .ics export: give it a platform + listing id and a
 * date range, it returns per-day availability as JSON. This is the concrete,
 * working implementation of the "channel-manager API" path (the generic
 * PmsProvider stays a stub for other vendors).
 *
 * IMPORTANT — pricing: the /v1/availability endpoint does NOT return nightly
 * prices (those live behind a separate /v1/price endpoint). So this provider
 * omits nightlyPrice, and the UI still degrades to "See rates on Airbnb". We
 * never fabricate a price. (See fetchPricing TODO to add /v1/price later.)
 *
 * Sync vs async: sandbox keys (stay_test_) and cache hits return HTTP 200 with
 * the data inline. Live scrapes return HTTP 202 with a jobId; we then poll
 * /v1/jobs/{jobId} until the job is `completed` (or `failed`).
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** One date entry as StayingAPI returns it. */
interface StayingDate {
  date: ISODate;
  available: boolean;
  minNights?: number;
  checkIn?: boolean;
  checkOut?: boolean;
  bookable?: boolean;
}

interface StayingAvailability {
  platform: string;
  listingId: string;
  dates: StayingDate[];
}

interface CacheEntry {
  days: DayAvailability[];
  expires: number;
}

export class StayingProvider implements AvailabilityProvider {
  private static cache = new Map<string, CacheEntry>();

  constructor(
    private readonly opts: {
      apiKey: string;
      /** OTA platform. Defaults to "airbnb". */
      platform?: string;
      /** API host. Defaults to the public StayingAPI base. */
      baseUrl?: string;
      /** In-isolate cache TTL (seconds). Defaults to 20 min. */
      cacheSeconds?: number;
      /** Max total time to wait on an async job before giving up (ms). */
      maxPollMs?: number;
      /** Injectable for tests. Defaults to global fetch. */
      fetchImpl?: typeof fetch;
      /** Injectable delay for tests (defaults to real setTimeout). */
      sleepImpl?: (ms: number) => Promise<void>;
    },
  ) {
    if (!opts.apiKey) {
      throw new Error('StayingProvider requires an apiKey (STAYING_API_KEY).');
    }
  }

  private get base() {
    return (this.opts.baseUrl ?? 'https://api.stayingapi.com').replace(/\/$/, '');
  }
  private get platform() {
    return this.opts.platform ?? 'airbnb';
  }
  private get fetchImpl() {
    return this.opts.fetchImpl ?? fetch;
  }
  private get sleep() {
    return this.opts.sleepImpl ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  }

  private authHeaders(): HeadersInit {
    return { Authorization: `Bearer ${this.opts.apiKey}`, Accept: 'application/json' };
  }

  async getAvailability(
    listingId: string,
    fromDate: ISODate,
    toDate: ISODate,
  ): Promise<DayAvailability[]> {
    const cacheKey = `${this.platform}:${listingId}:${fromDate}:${toDate}`;
    const now = Date.now();
    const cached = StayingProvider.cache.get(cacheKey);
    if (cached && cached.expires > now) return cached.days;

    // Query one day past `toDate` to sidestep any inclusive/exclusive ambiguity
    // in the API's endDate; we filter back to [fromDate, toDate] below.
    const qs = new URLSearchParams({
      platform: this.platform,
      listingId,
      startDate: fromDate,
      endDate: addDaysISO(toDate, 1),
    });
    const url = `${this.base}/v1/availability?${qs.toString()}`;

    const res = await this.fetchImpl(url, { headers: this.authHeaders() });
    const dates = await this.resolveDates(res);

    // Map to our interface, restricted to the requested window. No price.
    const byDate = new Map<ISODate, StayingDate>();
    for (const d of dates) byDate.set(d.date, d);

    const days: DayAvailability[] = eachDayISO(fromDate, toDate).map((date) => {
      const d = byDate.get(date);
      // If the API omitted a day, treat it as unavailable (conservative — never
      // present an unknown day as bookable).
      return {
        date,
        available: d?.available ?? false,
        ...(typeof d?.minNights === 'number' ? { minNights: d.minNights } : {}),
      };
    });

    const ttl = (this.opts.cacheSeconds ?? 1200) * 1000;
    StayingProvider.cache.set(cacheKey, { days, expires: now + ttl });
    return days;
  }

  /** Handle the sync (200) vs async (202 + job) response shapes. */
  private async resolveDates(res: Response): Promise<StayingDate[]> {
    if (res.status === 200) {
      const json = (await res.json()) as { data?: unknown };
      return this.extractDates(json.data);
    }
    if (res.status === 202) {
      const json = (await res.json()) as {
        data?: { jobId?: string; pollUrl?: string; estimatedSeconds?: number };
      };
      const jobId = json.data?.jobId;
      const pollUrl = json.data?.pollUrl ?? (jobId ? `${this.base}/v1/jobs/${jobId}` : undefined);
      if (!pollUrl) throw new Error('StayingAPI returned 202 without a job to poll.');
      return this.pollJob(pollUrl, json.data?.estimatedSeconds ?? 2);
    }
    throw new Error(`StayingAPI availability failed (${res.status} ${res.statusText}).`);
  }

  /** Poll an async job until it completes or we hit the time budget. */
  private async pollJob(pollUrl: string, estimatedSeconds: number): Promise<StayingDate[]> {
    const deadline = Date.now() + (this.opts.maxPollMs ?? 20_000);
    let waitMs = Math.max(1000, Math.min(estimatedSeconds * 1000, 5000));

    while (Date.now() < deadline) {
      await this.sleep(waitMs);
      const res = await this.fetchImpl(pollUrl, { headers: this.authHeaders() });
      if (!res.ok) throw new Error(`StayingAPI job poll failed (${res.status}).`);
      const json = (await res.json()) as {
        data?: { status?: string; result?: unknown; error?: { message?: string } };
      };
      const status = json.data?.status;

      if (status === 'completed') return this.extractDates(json.data?.result);
      if (status === 'failed') {
        throw new Error(`StayingAPI job failed: ${json.data?.error?.message ?? 'unknown error'}`);
      }
      // pending | running → honor Retry-After, then loop.
      const retryAfter = Number(res.headers.get('Retry-After'));
      waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : waitMs;
    }
    throw new Error('StayingAPI job did not complete within the time budget.');
  }

  /** The result is an Availability[]; pull the dates of the first listing. */
  private extractDates(data: unknown): StayingDate[] {
    if (!Array.isArray(data) || data.length === 0) return [];
    const listing = data[0] as StayingAvailability;
    return Array.isArray(listing?.dates) ? listing.dates : [];
  }

  // TODO: add pricing via GET /v1/price (separate endpoint / credits) and merge
  // nightlyPrice + currency into the returned days. Until then, no price is
  // emitted and the UI shows "See rates on Airbnb".
}
