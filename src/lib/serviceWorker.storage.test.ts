// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync('public/sw.js', 'utf8');
function worker() {
  const handlers = new Map<string, (event: unknown) => void>();
  const cached = new Response('cached'), put = vi.fn(async () => {});
  const cache = { put, addAll: vi.fn(async () => {}), match: vi.fn(async () => undefined as Response | undefined), keys: vi.fn(async (): Promise<string[]> => []), delete: vi.fn(async () => true) };
  const caches = { open: vi.fn(async () => cache), match: vi.fn(async () => undefined as Response | undefined), keys: vi.fn(async (): Promise<string[]> => []), delete: vi.fn(async () => true) };
  const fetch = vi.fn(async () => new Response('fresh')), claim = vi.fn(async () => {});
  runInNewContext(source, { self: { location: new URL('https://vybehub.app'), navigator: {}, skipWaiting: vi.fn(), addEventListener: (name: string, handler: (event: unknown) => void) => handlers.set(name, handler) }, clients: { claim }, caches, fetch, URL, Response, console });
  function dispatch(name: string, path = '/assets/feature-current.js') {
    const background: Promise<unknown>[] = []; let response!: Promise<Response>, dispatched = false;
    handlers.get(name)!({ request: { url: `https://vybehub.app${path}`, method: 'GET', mode: 'cors' }, respondWith: (value: Promise<Response>) => { response = value; }, waitUntil: (value: Promise<unknown>) => { if (dispatched) throw Error('waitUntil registered after dispatch'); background.push(value); } });
    dispatched = true;
    return { response, background };
  }
  return { cached, cache, caches, fetch, put, claim, dispatch };
}
describe('worker storage failures do not block the network', () => {
  it.each(['open', 'precache'] as const)('allows installation when %s storage fails', async failure => {
    const f = worker();
    if (failure === 'open') f.caches.open.mockRejectedValue(Error('Storage blocked'));
    else f.cache.addAll.mockRejectedValue(Error('Quota exceeded'));
    await expect(Promise.all(f.dispatch('install').background)).resolves.toBeDefined();
  });
  it.each(['keys', 'delete'] as const)('claims clients even when obsolete cache %s fails', async failure => {
    const f = worker();
    if (failure === 'keys') f.caches.keys.mockRejectedValue(Error('Storage blocked'));
    else { f.caches.keys.mockResolvedValue(['vybe-shell-v1']); f.caches.delete.mockRejectedValue(Error('Storage blocked')); }
    await expect(Promise.all(f.dispatch('activate').background)).resolves.toBeDefined();
    expect(f.claim).toHaveBeenCalledOnce();
  });
  it.each(['/assets/feature-current.js', '/assets/current.css', '/assets/current.woff2', '/images/current.jpg'])('returns online %s even when cache reads and writes fail', async path => {
    const f = worker(); f.caches.open.mockRejectedValue(Error('Storage blocked')); f.caches.match.mockRejectedValue(Error('Storage blocked'));
    const event = f.dispatch('fetch', path);
    expect(await (await event.response).text()).toBe('fresh');
    await Promise.all(event.background);
  });
  it.each(['/assets/feature-current.js', '/assets/current.css', '/images/current.jpg'])('does not delay %s for a hanging cache write', async path => {
    const f = worker(); let finish!: () => void; f.put.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
    const event = f.dispatch('fetch', path);
    const observed = await Promise.race([event.response.then(r => r.text()), new Promise(resolve => setTimeout(() => resolve('blocked by cache'), 30))]);
    finish(); await Promise.all(event.background);
    expect(observed).toBe('fresh');
  });
  it('retains cached JavaScript offline but returns a bounded failure if cache is also unavailable', async () => {
    const f = worker(); f.fetch.mockRejectedValue(Error('Offline')); f.cache.match.mockResolvedValue(f.cached.clone());
    expect(await (await f.dispatch('fetch').response).text()).toBe('cached');
    f.caches.open.mockRejectedValue(Error('Storage blocked'));
    expect((await f.dispatch('fetch').response).status).toBe(504);
  });
  it('returns a cached stylesheet while retaining and completing its network refresh', async () => {
    const f = worker(); f.cache.match.mockResolvedValue(f.cached.clone());
    const event = f.dispatch('fetch', '/assets/current.css');
    expect(await (await event.response).text()).toBe('cached');
    await Promise.all(event.background);
    expect(f.fetch).toHaveBeenCalledOnce(); expect(f.put).toHaveBeenCalledOnce();
  });
  it('leaves cached images alone without a new request or write', async () => {
    const f = worker(); f.caches.match.mockResolvedValue(f.cached.clone());
    const event = f.dispatch('fetch', '/images/current.jpg');
    expect(await (await event.response).text()).toBe('cached');
    await Promise.all(event.background);
    expect(f.fetch).not.toHaveBeenCalled(); expect(f.put).not.toHaveBeenCalled();
  });
  it('keeps the existing asset cap and deletes only the oldest excess entry', async () => {
    const f = worker(); const keys = Array.from({ length: 181 }, (_, i) => `/assets/feature-${i}.js`);
    f.cache.keys.mockResolvedValue(keys);
    const event = f.dispatch('fetch'); expect(await (await event.response).text()).toBe('fresh');
    await Promise.all(event.background);
    expect(f.cache.delete).toHaveBeenCalledExactlyOnceWith(keys[0]);
  });
});
