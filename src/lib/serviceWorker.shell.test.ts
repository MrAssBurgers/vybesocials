// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync('public/sw.js', 'utf8');
const shell = '<!doctype html><html><script type="module" src="/assets/app-current.js"></script></html>';
function fixture(cached = new Response(shell, { headers: { 'Content-Type': 'text/html' } })) {
  const handlers = new Map<string, (event: unknown) => void>();
  const put = vi.fn(async (_key: string, _response: Response) => {}), open = vi.fn(async () => ({ put, match: async () => cached.clone() }));
  const fetch = vi.fn();
  runInNewContext(source, { self: { location: new URL('https://vybehub.app'), navigator: {}, skipWaiting: vi.fn(), addEventListener: (name: string, handler: (event: unknown) => void) => handlers.set(name, handler) }, caches: { open, match: async () => cached.clone() }, fetch, URL, Response, console });
  async function navigate(path = '/home') {
    let result!: Promise<Response>;
    const background: Promise<unknown>[] = [];
    handlers.get('fetch')!({ request: { url: `https://vybehub.app${path}`, method: 'GET', mode: 'navigate' }, respondWith: (promise: Promise<Response>) => { result = promise; }, waitUntil: (promise: Promise<unknown>) => background.push(promise) });
    const response = await result;
    await Promise.all(background);
    return response;
  }
  return { fetch, put, open, navigate };
}

describe('offline app shell integrity', () => {
  it.each([
    ['version JSON', 'application/json', '{"entry":"/assets/app-current.js"}'],
    ['JavaScript', 'application/javascript', 'console.log("app")'],
    ['error HTML', 'text/html', '<html>Temporarily unavailable</html>'],
    ['maintenance HTML', 'text/html', shell.replace('<html>', '<html data-vybe-maintenance="true">')],
  ])('returns online %s without replacing the offline app', async (_name, type, body) => {
    const f = fixture(); f.fetch.mockResolvedValue(new Response(body, { headers: { 'Content-Type': type } }));
    expect(await (await f.navigate('/version.json?test=current')).text()).toBe(body);
    expect(f.put).not.toHaveBeenCalled();
    f.fetch.mockRejectedValue(new Error('Offline'));
    expect(await (await f.navigate('/map')).text()).toBe(shell);
  });
  it('warms the real app shell and returns an intact response', async () => {
    const f = fixture(); f.fetch.mockResolvedValue(new Response(shell, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
    expect(await (await f.navigate('/clips')).text()).toBe(shell);
    expect(f.put).toHaveBeenCalledOnce();
    expect(f.put.mock.calls[0][0]).toBe('/');
    expect(await f.put.mock.calls[0][1].text()).toBe(shell);
  });
  it.each(['open', 'put'])('a blocked cache %s cannot break an online launch', async failure => {
    const f = fixture(); (failure === 'open' ? f.open : f.put).mockRejectedValue(new Error('Storage blocked'));
    f.fetch.mockResolvedValue(new Response(shell, { headers: { 'Content-Type': 'text/html' } }));
    expect(await (await f.navigate()).text()).toBe(shell);
  });
  it('does not serve a previously corrupted JSON shell as an offline app page', async () => {
    const f = fixture(new Response('{"entry":"old"}', { headers: { 'Content-Type': 'application/json' } }));
    f.fetch.mockRejectedValue(new Error('Offline'));
    const response = await f.navigate('/map');
    expect(response.headers.get('Content-Type')).toContain('text/html');
    const body = await response.text();
    expect(body).toContain('Reconnecting');
    expect(body).toContain('Try again');
    expect(body).not.toMatch(/http-equiv=["']refresh/i);
  });
});
