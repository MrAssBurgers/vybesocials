import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, renderHook } from '@testing-library/react';
const mocks = vi.hoisted(() => ({ clear: vi.fn(), signal: vi.fn(), native: false, despia: false }));
vi.mock('@/lib/despiaBridge', () => ({ isDespiaRuntime: () => mocks.despia }));
vi.mock('@/lib/capacitor', () => ({ get isNativePlatform() { return mocks.native; } }));
vi.mock('@/lib/appUpdateBridge', () => ({ signalAppUpdate: mocks.signal, APP_UPDATE_RELOAD_DELAY_MS: 1500 }));
vi.mock('@/lib/selfHealingMonitor', () => ({ clearAppCache: mocks.clear }));
import { useAutoUpdate } from './useAutoUpdate';

const replace = vi.fn();
const version = (entry = '/assets/app-new.js') => ({ ok: true, json: async () => ({ entry }) });
let fetchMock: ReturnType<typeof vi.fn>;
const advance = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

beforeEach(() => {
  vi.useFakeTimers(); vi.stubEnv('DEV', false); vi.clearAllMocks();
  mocks.native = false; mocks.despia = false; mocks.clear.mockResolvedValue(undefined);
  fetchMock = vi.fn().mockResolvedValue(version()); vi.stubGlobal('fetch', fetchMock);
  const actualWindow = window;
  vi.stubGlobal('window', new Proxy(actualWindow, { get(target, key) {
    if (key === 'location') return { origin: actualWindow.location.origin, replace };
    const value = Reflect.get(target, key, target);
    return ['addEventListener', 'removeEventListener', 'dispatchEvent'].includes(String(key)) ? value.bind(target) : value;
  } }));
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  sessionStorage.clear();
  const script = document.createElement('script'); script.type = 'module'; script.src = '/assets/app-old.js'; script.dataset.updateTest = 'true'; document.head.append(script);
});
afterEach(() => {
  cleanup(); document.querySelectorAll('[data-update-test]').forEach(el => el.remove());
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllTimers(); vi.useRealTimers();
});

describe('returning-session updates', () => {
  it('retries a failed first check and reloads once after success', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    renderHook(useAutoUpdate); await advance(1200);
    expect(fetchMock).toHaveBeenCalledOnce(); expect(replace).not.toHaveBeenCalled();
    await advance(5000); expect(fetchMock).toHaveBeenCalledTimes(2);
    await advance(1500); expect(replace).toHaveBeenCalledOnce(); expect(mocks.signal).toHaveBeenCalledOnce();
    expect(sessionStorage.getItem('vybe-entry-reload')).toBe('/assets/app-new.js');
  });
  it('bounds retries and resumes on reconnect without background polling', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    renderHook(useAutoUpdate); await advance(1200 + 5000 + 15000 + 30000);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    await advance(120000); expect(fetchMock).toHaveBeenCalledTimes(4);
    fetchMock.mockResolvedValue(version()); act(() => window.dispatchEvent(new Event('online')));
    await advance(1500); expect(fetchMock).toHaveBeenCalledTimes(5); expect(replace).toHaveBeenCalledOnce();
  });
  it('checks when an offline launch reconnects', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    renderHook(useAutoUpdate); await advance(1200); expect(fetchMock).not.toHaveBeenCalled();
    online.mockReturnValue(true); act(() => window.dispatchEvent(new Event('online')));
    await advance(1500); expect(replace).toHaveBeenCalledOnce();
  });
  it.each(['prefilled', 'edited', 'late-edit', 'rich-text'])('preserves a %s draft without an update wall or reload', async mode => {
    const field = document.createElement(mode === 'rich-text' ? 'div' : 'textarea'); field.dataset.updateTest = 'true'; document.body.append(field);
    if (mode === 'rich-text') { field.setAttribute('contenteditable', 'true'); field.textContent = 'Keep this draft'; }
    if (mode === 'prefilled') (field as HTMLTextAreaElement).value = 'Keep this draft';
    renderHook(useAutoUpdate);
    if (mode === 'edited') { fireEvent.input(field, { target: { value: 'Keep this draft' } }); }
    await advance(1200);
    if (mode === 'late-edit') fireEvent.input(field, { target: { value: 'Keep this draft' } });
    await advance(1500); expect(replace).not.toHaveBeenCalled(); expect(mocks.signal).not.toHaveBeenCalled();
    expect(mocks.clear).toHaveBeenCalledTimes(mode === 'late-edit' ? 1 : 0);
  });
  it('uses the actual script rather than stale metadata and clears a completed guard', async () => {
    sessionStorage.setItem('vybe-app-entry', '/assets/app-other.js'); sessionStorage.setItem('vybe-entry-reload', '/assets/app-old.js');
    fetchMock.mockResolvedValue(version('/assets/app-old.js')); renderHook(useAutoUpdate);
    await advance(5000); expect(replace).not.toHaveBeenCalled(); expect(mocks.clear).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('vybe-entry-reload')).toBeNull();
  });
  it('does not loop after the same published entry already triggered a reload', async () => {
    sessionStorage.setItem('vybe-entry-reload', '/assets/app-new.js'); renderHook(useAutoUpdate);
    await advance(5000); expect(replace).not.toHaveBeenCalled(); expect(mocks.clear).not.toHaveBeenCalled();
  });
  it.each(['https://other.test/assets/app-new.js', '/login', 'javascript:alert(1)'])('rejects invalid manifest entry %s', async entry => {
    fetchMock.mockResolvedValue(version(entry)); renderHook(useAutoUpdate); await advance(5000);
    expect(replace).not.toHaveBeenCalled(); expect(mocks.clear).not.toHaveBeenCalled();
  });
  it('aborts a hanging check on unmount and ignores its late result', async () => {
    let resolve!: (value: ReturnType<typeof version>) => void;
    fetchMock.mockReturnValue(new Promise(done => { resolve = done; }));
    const result = renderHook(useAutoUpdate); await advance(1200);
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    result.unmount(); expect(signal.aborted).toBe(true);
    await act(async () => resolve(version())); await advance(20000);
    expect(replace).not.toHaveBeenCalled(); expect(mocks.clear).not.toHaveBeenCalled();
  });
  it('keeps native OTA outside browser cache/update repair', async () => {
    mocks.native = true; renderHook(useAutoUpdate); await advance(120000);
    expect(fetchMock).not.toHaveBeenCalled(); expect(mocks.clear).not.toHaveBeenCalled();
  });
  it('times out a stuck request and then retries without overlapping checks', async () => {
    fetchMock.mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')))));
    renderHook(useAutoUpdate); await advance(1200);
    act(() => window.dispatchEvent(new Event('online'))); expect(fetchMock).toHaveBeenCalledOnce();
    await advance(8000); expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    await advance(5000 + 1500); expect(fetchMock).toHaveBeenCalledTimes(2); expect(replace).toHaveBeenCalledOnce();
  });
  it('retains the usable page when session storage cannot provide a loop guard', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    renderHook(useAutoUpdate); await advance(1200 + 1500);
    expect(replace).not.toHaveBeenCalled(); expect(mocks.clear).not.toHaveBeenCalled();
  });
  it('does not navigate if writing the once-per-entry guard fails', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    renderHook(useAutoUpdate); await advance(1200 + 1500);
    expect(replace).not.toHaveBeenCalled(); expect(mocks.signal).not.toHaveBeenCalled();
  });
  it('throttles focus checks and removes them when retired', async () => {
    fetchMock.mockResolvedValue(version('/assets/app-old.js'));
    const result = renderHook(useAutoUpdate); await advance(1200);
    act(() => { window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('focus')); });
    expect(fetchMock).toHaveBeenCalledOnce(); await advance(30000);
    act(() => window.dispatchEvent(new Event('focus'))); await advance(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    result.unmount(); await advance(30000); act(() => window.dispatchEvent(new Event('online')));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
