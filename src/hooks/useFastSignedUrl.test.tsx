import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ resolve: vi.fn(), cache: new Map<string, string>() }));
vi.mock('@/lib/firebase/storageService', () => ({ firebaseStorage: { resolveMediaUrl: mock.resolve } }));
vi.mock('@/lib/signedUrlCache', () => ({
  getCachedSignedUrl: (url: string) => mock.cache.get(url) || null,
  cacheSignedUrl: (key: string, url: string) => mock.cache.set(key, url),
  needsSigning: () => false, getSignedUrl: vi.fn(), batchSignUrls: vi.fn(),
}));
vi.mock('@/lib/mediaUrl', () => ({
  normalizeMediaUrl: (url: string | null) => url || null,
  firebaseStorageNeedsToken: (url: string | null) => !!url?.startsWith('gs://'),
}));
import { useResolvedMediaUrl } from './useFastSignedUrl';
beforeEach(() => {
  vi.useFakeTimers(); mock.cache.clear(); mock.resolve.mockReset();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
const advance = async (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
describe('media URL recovery', () => {
  it('retries an unresolved Firebase URL once, then exposes an explicit retry', async () => {
    mock.resolve.mockImplementation(async (url: string) => url);
    const f = renderHook(() => useResolvedMediaUrl('gs://bucket/clip'));
    await advance(); expect(f.result.current.url).toBeNull();
    await advance(2000); expect(mock.resolve).toHaveBeenCalledTimes(2); expect(f.result.current.error).toBe(true);
    await advance(60_000); expect(mock.resolve).toHaveBeenCalledTimes(2);
    mock.resolve.mockResolvedValue('https://storage.test/clip?token=resolved');
    act(() => f.result.current.retry()); await advance();
    expect(f.result.current.url).toContain('token=resolved'); expect(f.result.current.error).toBe(false);
  });
  it('recovers a failed resolution after connectivity returns', async () => {
    mock.resolve.mockRejectedValue(new Error('Network unavailable'));
    const f = renderHook(() => useResolvedMediaUrl('gs://bucket/reconnect'));
    await advance(2000); expect(f.result.current.error).toBe(true);
    mock.resolve.mockResolvedValue('https://storage.test/reconnect?token=resolved');
    act(() => window.dispatchEvent(new Event('online'))); await advance();
    expect(f.result.current.url).toContain('/reconnect?');
  });
  it('retires hanging transports so retry can make a new request and ignores their late results', async () => {
    let finish!: (url: string) => void;
    mock.resolve.mockReturnValueOnce(new Promise<string>(resolve => { finish = resolve; })).mockResolvedValue('https://storage.test/new?token=resolved');
    const f = renderHook(() => useResolvedMediaUrl('gs://bucket/hanging'));
    await advance(12_000); expect(mock.resolve).toHaveBeenCalledTimes(2);
    expect(f.result.current.url).toContain('/new?');
    await act(async () => finish('https://storage.test/late?token=retired'));
    expect(f.result.current.url).toContain('/new?'); expect(mock.cache.get('gs://bucket/hanging')).toContain('/new?');
  });
  it('never paints the previous source while the next one resolves', async () => {
    mock.resolve.mockReturnValue(new Promise(() => {}));
    const f = renderHook(({ source }) => useResolvedMediaUrl(source), { initialProps: { source: 'https://storage.test/old' } });
    expect(f.result.current.url).toContain('/old');
    f.rerender({ source: 'gs://bucket/next' }); expect(f.result.current.url).toBeNull();
    f.rerender({ source: '' }); expect(f.result.current.url).toBeNull();
  });
  it('retires an asynchronously resolved URL and late answer when the source changes', async () => {
    let finish!: (url: string) => void;
    mock.resolve.mockResolvedValueOnce('https://storage.test/first?token=resolved')
      .mockReturnValueOnce(new Promise<string>(resolve => { finish = resolve; }))
      .mockReturnValue(new Promise(() => {}));
    const f = renderHook(({ source }) => useResolvedMediaUrl(source), { initialProps: { source: 'gs://bucket/first' } });
    await advance(); expect(f.result.current.url).toContain('/first?');
    f.rerender({ source: 'gs://bucket/second' }); expect(f.result.current.url).toBeNull();
    f.rerender({ source: 'gs://bucket/third' });
    await act(async () => finish('https://storage.test/second?token=resolved'));
    expect(f.result.current.url).toBeNull(); expect(f.result.current.error).toBe(false);
  });
  it('a hidden unresolved card waits for foreground before restarting', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    mock.resolve.mockResolvedValue('https://storage.test/foreground?token=resolved');
    const f = renderHook(() => useResolvedMediaUrl('gs://bucket/foreground'));
    await advance(); expect(mock.resolve).not.toHaveBeenCalled();
    act(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
    await advance(); expect(f.result.current.url).toContain('/foreground?');
  });
  it.each(['hidden', 'offline', 'inactive'] as const)('does not start resolution while %s', async kind => {
    if (kind === 'hidden') Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    if (kind === 'offline') Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    renderHook(() => useResolvedMediaUrl('gs://bucket/idle', kind !== 'inactive'));
    await advance(60_000); expect(mock.resolve).not.toHaveBeenCalled();
  });
  it('cancels automatic retries when the card departs', async () => {
    mock.resolve.mockRejectedValue(new Error('Network unavailable'));
    const f = renderHook(() => useResolvedMediaUrl('gs://bucket/departed'));
    await advance(); f.unmount(); await advance(60_000);
    expect(mock.resolve).toHaveBeenCalledOnce();
  });
});
