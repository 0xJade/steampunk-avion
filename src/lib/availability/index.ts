import type { AvailabilityProvider, ProviderName } from './types';
import { IcalProvider } from './IcalProvider';
import { MockProvider } from './MockProvider';
import { PmsProvider } from './PmsProvider';

export * from './types';
export { IcalProvider, parseBlockedDates } from './IcalProvider';
export { MockProvider } from './MockProvider';
export { PmsProvider } from './PmsProvider';

/**
 * Reads provider config from an env bag. On Cloudflare the runtime env is
 * passed per-request (locals.runtime.env); we accept any string map so this
 * works in Node dev, tests, and Workers alike.
 */
export interface ProviderEnv {
  AVAILABILITY_PROVIDER?: string;
  ICS_URL?: string;
  AVAILABILITY_CACHE_SECONDS?: string;
  PMS_API_KEY?: string;
  PMS_BASE_URL?: string;
}

function pickName(env: ProviderEnv): ProviderName {
  const raw = (env.AVAILABILITY_PROVIDER ?? 'ical').toLowerCase();
  if (raw === 'ical' || raw === 'mock' || raw === 'pms') return raw;
  throw new Error(`Unknown AVAILABILITY_PROVIDER "${raw}". Use ical | mock | pms.`);
}

/**
 * Build the active provider. The default is IcalProvider. If ical is selected
 * but ICS_URL is missing (e.g. before you've pasted it in), we fall back to
 * MockProvider so local dev still renders a calendar — and warn loudly.
 */
export function createProvider(env: ProviderEnv): AvailabilityProvider {
  const name = pickName(env);
  const cacheSeconds = env.AVAILABILITY_CACHE_SECONDS
    ? Number(env.AVAILABILITY_CACHE_SECONDS)
    : undefined;

  switch (name) {
    case 'mock':
      return new MockProvider();

    case 'pms':
      if (!env.PMS_API_KEY || !env.PMS_BASE_URL) {
        throw new Error('AVAILABILITY_PROVIDER=pms requires PMS_API_KEY and PMS_BASE_URL.');
      }
      return new PmsProvider({ apiKey: env.PMS_API_KEY, baseUrl: env.PMS_BASE_URL });

    case 'ical':
    default:
      if (!env.ICS_URL) {
        console.warn(
          '[availability] AVAILABILITY_PROVIDER=ical but ICS_URL is unset — ' +
            'falling back to MockProvider. Set ICS_URL to use real calendar data.',
        );
        return new MockProvider();
      }
      return new IcalProvider({ icsUrl: env.ICS_URL, cacheSeconds });
  }
}
