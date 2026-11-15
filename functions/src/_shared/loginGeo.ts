import { isIP } from 'node:net';

type Request = { rawRequest?: { ip?: string; headers?: Record<string, unknown> } };
type Details = { city?: string; region?: string; country?: string; latitude?: number; longitude?: number };
export type LoginGeo = Details & { ip: string | null };
export const LOGIN_GEO_WAIT_MS = 1000;
export const LOGIN_GEO_CACHE_MS = 5 * 60_000;
export const LOGIN_GEO_FAILURE_CACHE_MS = 15_000;
export const LOGIN_GEO_CACHE_LIMIT = 128;

export function clientIpFromRequest(request: Request): string | null {
  const headers = request.rawRequest?.headers || {};
  const forwarded = headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0].trim();
  if (Array.isArray(forwarded) && typeof forwarded[0] === 'string') return forwarded[0].split(',')[0].trim();
  const appEngine = headers['x-appengine-user-ip'];
  if (typeof appEngine === 'string' && appEngine.trim()) return appEngine.trim();
  return request.rawRequest?.ip || null;
}
const text = (value: unknown) => typeof value === 'string' && value.trim() && value.length <= 128 ? value : undefined;
const coordinate = (value: unknown, bound: number) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= bound ? value : undefined;

/** Only best-effort IP labels are cached, never an account, code, trust decision
 * or sign-in receipt. Each request still runs every device/account check. */
export function createLoginGeoResolver(options: { fetch?: typeof globalThis.fetch; now?: () => number } = {}) {
  const clock = options.now || Date.now;
  const cache = new Map<string, { expiresAt: number; result: Promise<Details | null> }>();
  async function lookup(ip: string): Promise<Details | null> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async () => {
          const response = await (options.fetch || globalThis.fetch)(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, { signal: controller.signal });
          if (!response.ok) return null;
          const value: unknown = await response.json();
          if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
          const row = value as Record<string, unknown>;
          if (row.error) return null;
          const details: Details = {
            city: text(row.city), region: text(row.region), country: text(row.country_name) || text(row.country),
            latitude: coordinate(row.latitude, 90) ?? coordinate(row.lat, 90),
            longitude: coordinate(row.longitude, 180) ?? coordinate(row.lon, 180),
          };
          return Object.values(details).some(value => value !== undefined) ? details : null;
        })(),
        new Promise<null>(resolve => { timer = setTimeout(() => { controller.abort(); resolve(null); }, LOGIN_GEO_WAIT_MS); }),
      ]);
    } catch { return null; }
    finally { clearTimeout(timer); }
  }
  return async (request: Request): Promise<LoginGeo> => {
    const headers = request.rawRequest?.headers || {}, ip = clientIpFromRequest(request);
    const country = text(headers['x-appengine-country']) || text(headers['cf-ipcountry']);
    const base: LoginGeo = { ip, country: country && country !== 'ZZ' ? country : undefined };
    if (!ip || !isIP(ip) || ip === '127.0.0.1' || ip.startsWith('::')) return base;
    let entry = cache.get(ip);
    if (entry && entry.expiresAt <= clock()) { cache.delete(ip); entry = undefined; }
    if (!entry) {
      while (cache.size >= LOGIN_GEO_CACHE_LIMIT) cache.delete(cache.keys().next().value!);
      const added = { expiresAt: Infinity, result: Promise.resolve<Details | null>(null) };
      // Install before the first await so concurrent requests share this work.
      cache.set(ip, added);
      added.result = lookup(ip).then(value => {
        added.expiresAt = clock() + (value ? LOGIN_GEO_CACHE_MS : LOGIN_GEO_FAILURE_CACHE_MS);
        return value;
      });
      entry = added;
    } else { cache.delete(ip); cache.set(ip, entry); }
    const details = await entry.result;
    // Fallback headers belong to this request; never share them through cache.
    return { ...base, ...details, country: details?.country || base.country };
  };
}
