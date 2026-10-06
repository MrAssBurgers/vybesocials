import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';

const bootSource = readFileSync('public/boot-guard.js', 'utf8');
const workerSource = readFileSync('public/sw.js', 'utf8');
const buckets = ['vybe-v41', 'vybe-shell-v7', 'vybe-assets-v8', 'vybe-static-v41', 'vybe-media-v1', 'vybe-private-fixture', 'other-app-fixture', 'vybe-v42', 'vybe-shell-v8', 'vybe-assets-v9', 'vybe-static-v42'];
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

function boot(options: { loading?: boolean; offline?: boolean; blocked?: 'read' | 'write'; entry?: string; draft?: boolean; delayedCleanup?: boolean } = {}) {
  vi.useFakeTimers();
  const doc = document.implementation.createHTMLDocument();
  if (!options.loading) doc.head.innerHTML = '<script type="module" src="/assets/app-old.js"></script>';
  Object.defineProperty(doc, 'readyState', { value: options.loading ? 'loading' : 'complete' });
  if (options.draft) { const field = doc.createElement('textarea'); field.value = 'Keep my post'; doc.body.append(field); }
  const replace = vi.fn(); const reload = vi.fn();
  const origin = 'https://vybehub.app';
  const own = { active: { scriptURL: origin + '/sw.js' }, scope: origin + '/', unregister: vi.fn(async () => true) };
  const others = ['/push/sw.js', '/firebase-messaging-sw.js'].map(script => ({ active: { scriptURL: origin + script }, scope: origin + '/', unregister: vi.fn(async () => true) }));
  others.push({ active: { scriptURL: origin + '/sw.js' }, scope: origin + '/other/', unregister: vi.fn(async () => true) });
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => { if (options.blocked === 'read') throw new Error('blocked'); return values.get(key) || null; },
    setItem: (key: string, value: string) => { if (options.blocked === 'write') throw new Error('blocked'); values.set(key, value); },
    removeItem: (key: string) => values.delete(key),
  };
  const deleted: string[] = [];
  let finishCleanup: (() => void) | undefined;
  const getRegistrations = vi.fn(() => options.delayedCleanup ? new Promise<typeof others>(resolve => { finishCleanup = () => resolve([own, ...others]); }) : Promise.resolve([own, ...others]));
  const fetchVersion = vi.fn(async () => ({ ok: true, json: async () => ({ entry: options.entry || '/assets/app-new.js' }) }));
  const location = { origin, pathname: '/home', hostname: 'vybehub.app', search: '', hash: '', replace, reload };
  const cache = { keys: async () => buckets, delete: async (name: string) => { deleted.push(name); return true; } };
  const win: Record<string, unknown> = { location, caches: cache, addEventListener: vi.fn() };
  runInNewContext(bootSource, { window: win, document: doc, location, navigator: { onLine: !options.offline, userAgent: '', serviceWorker: { getRegistrations } }, sessionStorage: storage, caches: cache, URL, fetch: fetchVersion, AbortController, setTimeout, clearTimeout, setInterval, clearInterval, console });
  return { doc, replace, reload, own, others, deleted, fetchVersion, getRegistrations, win, values, finish: () => finishCleanup?.() };
}
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

describe('worker cache activation ownership', () => {
  it('deletes obsolete app files while preserving media, private data, unrelated buckets and current files', async () => {
    const handlers = new Map<string, (event: { waitUntil: (promise: Promise<unknown>) => void }) => void>();
    const deleted: string[] = [];
    runInNewContext(workerSource, { self: { addEventListener: (type: string, handler: typeof handlers extends Map<string, infer V> ? V : never) => handlers.set(type, handler), navigator: {}, location: new URL('https://vybehub.app'), skipWaiting: vi.fn() }, clients: { claim: async () => {} }, caches: { keys: async () => buckets, delete: async (name: string) => { deleted.push(name); } }, console, URL });
    let completion: Promise<unknown> | undefined;
    handlers.get('activate')!({ waitUntil: promise => { completion = promise; } });
    await completion;
    expect(deleted).toEqual(buckets.slice(0, 4));
  });
});

describe('startup entry recovery', () => {
  it('waits for the parsed module tag and only retires owned app files', async () => {
    const state = boot({ loading: true });
    expect(state.fetchVersion).not.toHaveBeenCalled();
    state.doc.head.innerHTML = '<script type="module" src="/assets/app-old.js"></script>';
    state.doc.dispatchEvent(new Event('DOMContentLoaded'));
    await settle();
    expect(state.replace).toHaveBeenCalledOnce(); expect(state.own.unregister).toHaveBeenCalledOnce();
    state.others.forEach(other => expect(other.unregister).not.toHaveBeenCalled());
    expect(state.deleted).toEqual(buckets.filter(name => !['vybe-media-v1', 'vybe-private-fixture', 'other-app-fixture'].includes(name)));
  });
  it.each(['read', 'write'] as const)('does not delete files or restart when the %s loop guard is blocked', async blocked => {
    const state = boot({ blocked }); await settle();
    expect(state.getRegistrations).not.toHaveBeenCalled(); expect(state.replace).not.toHaveBeenCalled();
  });
  it.each(['/assets/app-old.js', 'https://other.test/app-new.js', '/home'])('leaves matching or invalid remote entry %s alone', async entry => {
    const state = boot({ entry }); await settle(); expect(state.getRegistrations).not.toHaveBeenCalled(); expect(state.replace).not.toHaveBeenCalled();
  });
  it('preserves a prefilled draft', async () => {
    const state = boot({ draft: true }); await settle(); expect(state.deleted).toEqual([]); expect(state.replace).not.toHaveBeenCalled();
  });
  it('cancels automatic navigation if editing starts during cleanup', async () => {
    const state = boot({ delayedCleanup: true }); await settle();
    state.doc.dispatchEvent(new Event('input')); state.finish(); await settle();
    expect(state.replace).not.toHaveBeenCalled();
  });
  it('preserves the last usable offline files for both automatic and manual recovery', async () => {
    const state = boot({ offline: true }); await settle();
    (state.win.__VYBE_CLEAR_CACHE_RELOAD__ as () => void)(); await settle();
    expect(state.fetchVersion).not.toHaveBeenCalled(); expect(state.deleted).toEqual([]); expect(state.reload).toHaveBeenCalledOnce();
  });
  it('manual recovery also preserves unrelated workers and private/media buckets', async () => {
    const state = boot({ entry: '/assets/app-old.js' }); await settle();
    (state.win.__VYBE_CLEAR_CACHE_RELOAD__ as () => void)(); await settle();
    expect(state.own.unregister).toHaveBeenCalledOnce(); state.others.forEach(other => expect(other.unregister).not.toHaveBeenCalled());
    expect(state.deleted).not.toContain('vybe-private-fixture'); expect(state.deleted).not.toContain('other-app-fixture'); expect(state.deleted).not.toContain('vybe-media-v1');
    expect(state.reload).toHaveBeenCalledOnce();
  });
});

it('legacy root messaging retirement never forces client navigation or deletes private data', async () => {
  const handlers = new Map<string, (event: { waitUntil: (promise: Promise<unknown>) => void }) => void>();
  const navigate = vi.fn(); const postMessage = vi.fn(); const unregister = vi.fn(async () => true); const deleted: string[] = [];
  runInNewContext(readFileSync('public/firebase-messaging-sw.js', 'utf8'), { self: { registration: { scope: 'https://vybehub.app/', unregister }, clients: { matchAll: async () => [{ navigate, postMessage }] }, skipWaiting: vi.fn(), addEventListener: (type: string, handler: (event: { waitUntil: (promise: Promise<unknown>) => void }) => void) => handlers.set(type, handler) }, caches: { keys: async () => [...buckets, 'other-vybe-shell-private'], delete: async (name: string) => { deleted.push(name); } }, URL });
  let completion: Promise<unknown> | undefined;
  handlers.get('activate')!({ waitUntil: promise => { completion = promise; } }); await completion;
  expect(unregister).toHaveBeenCalledOnce(); expect(postMessage).toHaveBeenCalledOnce(); expect(navigate).not.toHaveBeenCalled();
  expect(deleted).not.toContain('vybe-private-fixture'); expect(deleted).not.toContain('other-vybe-shell-private'); expect(deleted).not.toContain('vybe-media-v1');
});
