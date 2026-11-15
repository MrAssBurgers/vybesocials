import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLoginGeoResolver, LOGIN_GEO_CACHE_LIMIT, LOGIN_GEO_CACHE_MS, LOGIN_GEO_FAILURE_CACHE_MS, LOGIN_GEO_WAIT_MS } from '../../functions/src/_shared/loginGeo';

const request = (ip = '203.0.113.7', country = 'US') => ({ rawRequest: { ip, headers: { 'x-appengine-country': country } } });
const response = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
afterEach(() => vi.useRealTimers());

describe('optional login location lookup', () => {
  it('shares concurrent work and recent results while returning independent values', async () => {
    let finish!: (value: Response) => void;
    const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise(resolve => { finish = resolve; }));
    const resolve = createLoginGeoResolver({ fetch });
    const first = resolve(request()), second = resolve(request());
    expect(fetch).toHaveBeenCalledOnce();
    finish(response({ city: 'Example city', country: 'US', latitude: 12, longitude: 24 }));
    const [a, b] = await Promise.all([first, second]);
    expect(a).toMatchObject({ ip: '203.0.113.7', city: 'Example city', latitude: 12, longitude: 24 });
    a.city = 'Mutated';
    expect(b.city).toBe('Example city');
    expect((await resolve(request())).city).toBe('Example city');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('stops waiting within the budget even if fetch ignores abort and never settles', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise(() => {}));
    const resolve = createLoginGeoResolver({ fetch });
    const pending = resolve(request());
    await vi.advanceTimersByTimeAsync(LOGIN_GEO_WAIT_MS);
    await expect(pending).resolves.toEqual({ ip: '203.0.113.7', country: 'US' });
    expect(fetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
    await expect(resolve(request())).resolves.toEqual({ ip: '203.0.113.7', country: 'US' });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('bounds response body parsing too and ignores its later result', async () => {
    vi.useFakeTimers();
    let finish!: (value: unknown) => void;
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue({ ok: true, json: () => new Promise(resolve => { finish = resolve; }) } as Response);
    const resolve = createLoginGeoResolver({ fetch });
    const pending = resolve(request());
    await vi.advanceTimersByTimeAsync(LOGIN_GEO_WAIT_MS);
    expect(await pending).toEqual({ ip: '203.0.113.7', country: 'US' });
    finish({ city: 'Late city' }); await Promise.resolve();
    expect(await resolve(request())).toEqual({ ip: '203.0.113.7', country: 'US' });
  });

  it('refreshes after success and failure TTLs without sharing fallback headers', async () => {
    let now = 0;
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(response({ city: 'Example city' })).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(response({ city: 'Fresh city' }));
    const resolve = createLoginGeoResolver({ fetch, now: () => now });
    expect(await resolve(request())).toMatchObject({ city: 'Example city', country: 'US' });
    expect(await resolve(request(undefined, 'CA'))).toMatchObject({ city: 'Example city', country: 'CA' });
    expect(fetch).toHaveBeenCalledOnce();
    now += LOGIN_GEO_CACHE_MS;
    expect(await resolve(request())).toEqual({ ip: '203.0.113.7', country: 'US' });
    expect(await resolve(request(undefined, 'CA'))).toEqual({ ip: '203.0.113.7', country: 'CA' });
    expect(fetch).toHaveBeenCalledTimes(2);
    now += LOGIN_GEO_FAILURE_CACHE_MS;
    expect(await resolve(request())).toMatchObject({ city: 'Fresh city' });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('evicts old entries at the fixed bound and retains independent IP keys', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => response({ country: 'US' }));
    const resolve = createLoginGeoResolver({ fetch });
    for (let index = 1; index <= LOGIN_GEO_CACHE_LIMIT + 1; index++) await resolve(request(`203.0.113.${index}`));
    await resolve(request('203.0.113.1'));
    expect(fetch).toHaveBeenCalledTimes(LOGIN_GEO_CACHE_LIMIT + 2);
    await resolve(request(`203.0.113.${LOGIN_GEO_CACHE_LIMIT + 1}`));
    expect(fetch).toHaveBeenCalledTimes(LOGIN_GEO_CACHE_LIMIT + 2);
  });

  it.each([null, [], {}, { error: true }, { city: 42, country: {}, latitude: 95, longitude: Infinity }])('keeps request fallback for malformed provider data %j', async value => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response(value));
    expect(await createLoginGeoResolver({ fetch })(request())).toEqual({ ip: '203.0.113.7', country: 'US' });
  });

  it.each(['', '127.0.0.1', '::1', 'invalid/IP'])('never requests the provider for a missing, loopback or malformed IP %s', async ip => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    expect(await createLoginGeoResolver({ fetch })(request(ip, 'ZZ'))).toEqual({ ip: ip || null, country: undefined });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps proxy IP precedence and valid zero coordinates', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response({ country_name: 'Example country', lat: 0, lon: 0 }));
    const resolve = createLoginGeoResolver({ fetch });
    expect(await resolve({ rawRequest: { ip: '192.0.2.8', headers: { 'x-forwarded-for': ['203.0.113.7, 192.0.2.9'], 'cf-ipcountry': 'CA' } } })).toMatchObject({ ip: '203.0.113.7', country: 'Example country', latitude: 0, longitude: 0 });
    expect(fetch.mock.calls[0][0]).toBe('https://ipapi.co/203.0.113.7/json/');
  });
});
