import type { APIRoute } from 'astro';
import { createProvider, type ProviderEnv } from '@lib/availability';
import { listing } from '@config/listing';
import { todayISO, startOfMonthISO, daysInMonth, addDaysISO, daysBetween } from '@lib/dates';

// Server-rendered: this route fetches the .ics and must run per-request.
export const prerender = false;

/**
 * Resolve env across runtimes: Cloudflare passes secrets on
 * locals.runtime.env; Node dev exposes them via process.env / import.meta.env.
 */
function resolveEnv(locals: App.Locals): ProviderEnv {
  const cf = (locals as { runtime?: { env?: Record<string, string> } }).runtime?.env ?? {};
  const node = (typeof process !== 'undefined' ? process.env : {}) as Record<string, string>;
  const meta = import.meta.env as unknown as Record<string, string>;
  const pick = (k: string) => cf[k] ?? node[k] ?? meta[k];
  return {
    AVAILABILITY_PROVIDER: pick('AVAILABILITY_PROVIDER'),
    ICS_URL: pick('ICS_URL'),
    AVAILABILITY_CACHE_SECONDS: pick('AVAILABILITY_CACHE_SECONDS'),
    PMS_API_KEY: pick('PMS_API_KEY'),
    PMS_BASE_URL: pick('PMS_BASE_URL'),
    STAYING_API_KEY: pick('STAYING_API_KEY'),
    STAYING_PLATFORM: pick('STAYING_PLATFORM'),
    STAYING_BASE_URL: pick('STAYING_BASE_URL'),
  };
}

export const GET: APIRoute = async ({ url, locals }) => {
  const env = resolveEnv(locals);
  const cacheSeconds = env.AVAILABILITY_CACHE_SECONDS ? Number(env.AVAILABILITY_CACHE_SECONDS) : 1200;

  // Window: clamp to [today, last day of (today + monthsForward months)].
  const today = todayISO();
  const lastMonthStart = startOfMonthISO(today, listing.booking.monthsForward);
  const maxTo = addDaysISO(lastMonthStart, daysInMonth(lastMonthStart) - 1);

  const clamp = (iso: string | null, lo: string, hi: string, fallback: string): string => {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return fallback;
    if (daysBetween(iso, lo) > 0) return lo; // iso < lo
    if (daysBetween(hi, iso) > 0) return hi; // iso > hi
    return iso;
  };

  const from = clamp(url.searchParams.get('from'), today, maxTo, today);
  const to = clamp(url.searchParams.get('to'), from, maxTo, maxTo);

  try {
    const provider = createProvider(env);
    const days = await provider.getAvailability(listing.listingId, from, to);
    const hasPricing = days.some((d) => typeof d.nightlyPrice === 'number');

    return new Response(
      JSON.stringify({
        from,
        to,
        provider: (env.AVAILABILITY_PROVIDER ?? 'ical').toLowerCase(),
        hasPricing,
        generatedAt: new Date().toISOString(),
        days,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          // Browser doesn't cache; the CDN holds it for the TTL and serves
          // stale while it revalidates in the background.
          'Cache-Control': `public, max-age=0, s-maxage=${cacheSeconds}, stale-while-revalidate=86400`,
        },
      },
    );
  } catch (err) {
    // Fail soft: the client treats a non-200 as "calendar unavailable" and the
    // page still links straight to Airbnb. Never 500 the whole page over this.
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: 'availability_unavailable', message, from, to }), {
      status: 503,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }
};
