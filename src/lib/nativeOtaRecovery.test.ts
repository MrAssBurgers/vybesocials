import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

let fixtureRoot: string;
let generatedScript: string;
beforeAll(() => {
  fixtureRoot = mkdtempSync(join(tmpdir(), 'vybe-native-ota-qa-'));
  mkdirSync(join(fixtureRoot, 'scripts'));
  mkdirSync(join(fixtureRoot, 'dist', 'despia'), { recursive: true });
  copyFileSync('scripts/stamp-despia-ota.mjs', join(fixtureRoot, 'scripts', 'stamp-despia-ota.mjs'));
  writeFileSync(join(fixtureRoot, 'dist', 'index.html'), '<html><head></head><body><div id="root"></div></body></html>');
  writeFileSync(join(fixtureRoot, 'dist', 'despia', 'local.json'), JSON.stringify({ deployed_at: '1000000000000', assets: ['/assets/app-fixture.js'] }));
  execFileSync(process.execPath, [join(fixtureRoot, 'scripts', 'stamp-despia-ota.mjs')], { stdio: 'pipe' });
  const html = readFileSync(join(fixtureRoot, 'dist', 'index.html'), 'utf8');
  generatedScript = html.match(/<script data-vybe-ota-escape="1">([\s\S]*?)<\/script>/)![1];
});
afterAll(() => {
  if (fixtureRoot && resolve(fixtureRoot).startsWith(resolve(tmpdir()) + sep) && basename(fixtureRoot).startsWith('vybe-native-ota-qa-')) {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

function boot(options: { ready?: boolean; appReadyAttribute?: boolean; native?: boolean; delayedManifest?: boolean; remote?: string; seen?: string; blockedStorage?: boolean } = {}) {
  vi.useFakeTimers();
  const doc = document.implementation.createHTMLDocument();
  doc.body.innerHTML = '<div id="vybe-static-boot"></div><textarea>Keep my draft</textarea>';
  if (options.appReadyAttribute) doc.documentElement.setAttribute('data-vybe-app-ready', 'true');
  const values = new Map<string, string>();
  if (options.seen) values.set('vybe_ota_seen', options.seen);
  const storage = {
    getItem: (key: string) => { if (options.blockedStorage) throw new Error('Storage unavailable'); return values.get(key) || null; },
    setItem: (key: string, value: string) => { if (options.blockedStorage) throw new Error('Storage unavailable'); values.set(key, value); },
  };
  const replace = vi.fn(), reload = vi.fn();
  const location = { hostname: 'localhost', href: 'http://localhost:7777/login', replace, reload };
  const win: Record<string, unknown> = { __VYBE_MAIN_EVAL__: options.ready === true };
  let resolveManifest: ((payload: { deployed_at: string }) => void) | undefined;
  const manifest = { deployed_at: options.remote ?? '1000000000001' };
  const fetchManifest = vi.fn(async () => ({ json: () => options.delayedManifest ? new Promise(resolve => { resolveManifest = resolve; }) : Promise.resolve(manifest) }));
  runInNewContext(generatedScript, { window: win, document: doc, navigator: { userAgent: options.native === false ? 'Desktop Chrome' : 'Android despia-android' }, location, sessionStorage: storage, fetch: fetchManifest, URL, Date, setTimeout, clearTimeout });
  return { doc, win, replace, reload, fetchManifest, values, finishManifest: () => resolveManifest?.(manifest), alias: () => doc.querySelector<HTMLScriptElement>('script[data-vybe-stable-recovery]') };
}

describe('generated native OTA recovery', () => {
  it('keeps a running native app and its draft when a newer pack is available', async () => {
    const state = boot({ ready: true });
    await vi.advanceTimersByTimeAsync(15000);
    expect(state.fetchManifest).toHaveBeenCalledOnce();
    expect(state.replace).not.toHaveBeenCalled();
    expect(state.reload).not.toHaveBeenCalled();
    expect(state.doc.querySelector('textarea')!.value).toBe('Keep my draft');
  });
  it('does not restart an app that becomes ready while metadata is in flight', async () => {
    const state = boot({ delayedManifest: true });
    await vi.advanceTimersByTimeAsync(0);
    state.win.__VYBE_MAIN_EVAL__ = true;
    state.finishManifest();
    await vi.advanceTimersByTimeAsync(15000);
    expect(state.replace).not.toHaveBeenCalled();
    expect(state.reload).not.toHaveBeenCalled();
  });
  it.each(['main evaluation', 'painted app attribute'])('ignores a late recovery-script error after %s succeeds', async marker => {
    const state = boot({ remote: '1000000000000' });
    await vi.advanceTimersByTimeAsync(3000);
    const alias = state.alias(); expect(alias).not.toBeNull();
    if (marker === 'main evaluation') state.win.__VYBE_MAIN_EVAL__ = true;
    else state.doc.documentElement.setAttribute('data-vybe-app-ready', 'true');
    alias!.dispatchEvent(new Event('error'));
    await vi.advanceTimersByTimeAsync(12000);
    expect(state.replace).not.toHaveBeenCalled();
    expect(state.reload).not.toHaveBeenCalled();
  });
  it('still retries a missing native module through the stable local alias', async () => {
    const state = boot({ remote: '1000000000000' });
    await vi.advanceTimersByTimeAsync(3000);
    expect(state.alias()!.getAttribute('src')).toMatch(/^\/assets\/app\.js\?vybe_recovery=/);
    expect(state.replace).not.toHaveBeenCalled();
  });
  it('retains one bounded local reload when the alias genuinely fails', async () => {
    const state = boot({ remote: '1000000000000' });
    await vi.advanceTimersByTimeAsync(3000);
    state.alias()!.dispatchEvent(new Event('error'));
    state.alias()!.dispatchEvent(new Event('error'));
    expect(state.replace).toHaveBeenCalledOnce();
    expect(new URL(state.replace.mock.calls[0][0]).origin).toBe('http://localhost:7777');
    expect(new URL(state.replace.mock.calls[0][0]).pathname).toBe('/login');
  });
  it('leaves an already current running native app alone', async () => {
    const state = boot({ ready: true, remote: '1000000000000' });
    await vi.advanceTimersByTimeAsync(15000);
    expect(state.alias()).toBeNull(); expect(state.replace).not.toHaveBeenCalled();
  });
  it('retains stale broken-pack recovery when a new build has not evaluated', async () => {
    const state = boot();
    await vi.advanceTimersByTimeAsync(1800);
    expect(state.replace).toHaveBeenCalledOnce();
    expect(new URL(state.replace.mock.calls[0][0]).origin).toBe('http://localhost:7777');
  });
  it('keeps a running app stable when session storage is unavailable', async () => {
    const state = boot({ ready: true, blockedStorage: true });
    await vi.advanceTimersByTimeAsync(15000);
    expect(state.replace).not.toHaveBeenCalled(); expect(state.reload).not.toHaveBeenCalled();
  });
  it('does not fetch native OTA metadata in a regular browser', async () => {
    const state = boot({ ready: true, native: false });
    await vi.advanceTimersByTimeAsync(15000);
    expect(state.fetchManifest).not.toHaveBeenCalled(); expect(state.replace).not.toHaveBeenCalled();
  });
});
