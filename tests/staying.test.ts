import { describe, it, expect, vi } from 'vitest';
import { StayingProvider } from '../src/lib/availability/StayingProvider';

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

const availabilityBody = (dates: unknown[]) => ({
  data: [{ platform: 'airbnb', listingId: '42307961', dates }],
  meta: { currency: 'USD', cached: true, creditsCharged: 0 },
});

describe('StayingProvider — sync (200)', () => {
  it('maps dates to DayAvailability and never emits a price', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(
        availabilityBody([
          { date: '2026-07-13', available: true, minNights: 2, bookable: true },
          { date: '2026-07-14', available: false, minNights: 2, bookable: false },
          { date: '2026-07-15', available: true, minNights: 3, bookable: true },
        ]),
      ),
    ) as unknown as typeof fetch;

    const provider = new StayingProvider({ apiKey: 'stay_test_x', cacheSeconds: 0, fetchImpl });
    const days = await provider.getAvailability('42307961', '2026-07-13', '2026-07-15');

    expect(days).toEqual([
      { date: '2026-07-13', available: true, minNights: 2 },
      { date: '2026-07-14', available: false, minNights: 2 },
      { date: '2026-07-15', available: true, minNights: 3 },
    ]);
    for (const d of days) expect(d).not.toHaveProperty('nightlyPrice');
  });

  it('sends Bearer auth, the platform, and a to+1 endDate', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(availabilityBody([]))) as unknown as typeof fetch;
    const provider = new StayingProvider({
      apiKey: 'stay_test_abc',
      platform: 'airbnb',
      cacheSeconds: 0,
      fetchImpl,
    });
    await provider.getAvailability('42307961', '2026-07-13', '2026-07-20');

    const [calledUrl, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(calledUrl).toContain('/v1/availability');
    expect(calledUrl).toContain('platform=airbnb');
    expect(calledUrl).toContain('listingId=42307961');
    expect(calledUrl).toContain('startDate=2026-07-13');
    expect(calledUrl).toContain('endDate=2026-07-21'); // to + 1 day
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer stay_test_abc',
    });
  });

  it('marks days the API omitted as unavailable (never guesses bookable)', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(availabilityBody([{ date: '2026-07-13', available: true, minNights: 2 }])),
    ) as unknown as typeof fetch;
    const provider = new StayingProvider({ apiKey: 'stay_test_x', cacheSeconds: 0, fetchImpl });
    const days = await provider.getAvailability('42307961', '2026-07-13', '2026-07-14');

    expect(days).toEqual([
      { date: '2026-07-13', available: true, minNights: 2 },
      { date: '2026-07-14', available: false }, // omitted → unavailable, no minNights
    ]);
  });
});

describe('StayingProvider — async (202 + job polling)', () => {
  it('polls the job until completed, then maps the result', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      calls.push(url);
      if (url.includes('/v1/availability')) {
        return jsonResponse(
          { data: { jobId: 'job_1', status: 'pending', pollUrl: 'https://api.x/v1/jobs/job_1', estimatedSeconds: 1 } },
          202,
        );
      }
      // First poll: still running. Second poll: completed.
      if (calls.filter((c) => c.includes('/jobs/')).length === 1) {
        return jsonResponse({ data: { jobId: 'job_1', status: 'running' } }, 200, { 'Retry-After': '0' });
      }
      return jsonResponse({
        data: {
          jobId: 'job_1',
          status: 'completed',
          result: [{ platform: 'airbnb', listingId: '1', dates: [{ date: '2026-07-13', available: true, minNights: 2 }] }],
        },
      });
    }) as unknown as typeof fetch;

    const provider = new StayingProvider({
      apiKey: 'stay_live_x',
      cacheSeconds: 0,
      fetchImpl,
      sleepImpl: async () => {}, // no real waiting in tests
    });
    const days = await provider.getAvailability('1', '2026-07-13', '2026-07-13');

    expect(days).toEqual([{ date: '2026-07-13', available: true, minNights: 2 }]);
    expect(calls.filter((c) => c.includes('/jobs/')).length).toBe(2);
  });

  it('throws when the job fails (so the endpoint fails soft)', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/v1/availability')) {
        return jsonResponse({ data: { jobId: 'job_2', pollUrl: 'https://api.x/v1/jobs/job_2' } }, 202);
      }
      return jsonResponse({ data: { jobId: 'job_2', status: 'failed', error: { message: 'blocked' } } });
    }) as unknown as typeof fetch;

    const provider = new StayingProvider({
      apiKey: 'stay_live_x',
      cacheSeconds: 0,
      fetchImpl,
      sleepImpl: async () => {},
    });
    await expect(provider.getAvailability('1', '2026-07-13', '2026-07-13')).rejects.toThrow(/blocked/);
  });
});

describe('StayingProvider — errors', () => {
  it('requires an apiKey', () => {
    expect(() => new StayingProvider({ apiKey: '' })).toThrow(/apiKey/);
  });

  it('throws on a non-200/202 status', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'nope' }, 401, {})) as unknown as typeof fetch;
    const provider = new StayingProvider({ apiKey: 'stay_test_x', cacheSeconds: 0, fetchImpl });
    await expect(provider.getAvailability('1', '2026-07-13', '2026-07-14')).rejects.toThrow(/401/);
  });
});
