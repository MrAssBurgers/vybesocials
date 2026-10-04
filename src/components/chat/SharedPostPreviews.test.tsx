import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/hooks/useProfileAccount', () => ({ useProfileAccount: () => ({ ready: false }) }));
vi.mock('@/lib/socialFeedService', () => ({ readSocialPostPreviews: vi.fn() }));
import { SharedPostPreviewStore } from './SharedPostPreviews';
import type { SocialPostPreview } from '@/lib/socialFeedService';
const post = (id: string) => ({ id, caption: 'Checked caption' }) as SocialPostPreview;
afterEach(() => { vi.useRealTimers(); });

describe('visible shared-post preview lifetime', () => {
  it('shows malformed IDs as unavailable without requesting them', async () => {
    vi.useFakeTimers(); const load = vi.fn(async () => []);
    const store = new SharedPostPreviewStore(load); const stop = store.start();
    for (const id of ['', 'posts/one', 'x'.repeat(1501)]) {
      store.observe(id); expect(store.get(id).status).toBe('unavailable');
    }
    await vi.advanceTimersByTimeAsync(3000); expect(load).not.toHaveBeenCalled(); stop();
  });
  it('coalesces duplicate visible IDs, caps batches and spaces requests', async () => {
    vi.useFakeTimers(); const load = vi.fn(async (ids: string[]) => ids.map(post));
    const store = new SharedPostPreviewStore(load); const stop = store.start();
    const release = store.observe('one'); const releaseAgain = store.observe('one');
    for (let i = 0; i < 24; i++) store.observe(`post-${i}`);
    await vi.advanceTimersByTimeAsync(500);
    expect(load).toHaveBeenCalledTimes(1); expect(load.mock.calls[0][0]).toHaveLength(20);
    expect(new Set(load.mock.calls[0][0]).size).toBe(20);
    expect(store.get('one').post).toEqual(post('one'));
    release(); expect(store.get('one').post).toBeDefined();
    releaseAgain(); expect(store.get('one').post).toBeUndefined();
    await vi.advanceTimersByTimeAsync(2000); expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(500); expect(load).toHaveBeenCalledTimes(2); stop();
  });
  it('clears expired content before a slow recheck and does not keep it after errors', async () => {
    vi.useFakeTimers(); let reject!: (error: Error) => void;
    const load = vi.fn().mockResolvedValueOnce([post('one')]).mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    const store = new SharedPostPreviewStore(load); const stop = store.start(); store.observe('one');
    await vi.advanceTimersByTimeAsync(500); expect(store.get('one').post).toBeDefined();
    await vi.advanceTimersByTimeAsync(30000); expect(store.get('one').post).toBeUndefined();
    reject(new Error('Access changed')); await vi.advanceTimersByTimeAsync(0);
    expect(store.get('one').status).toBe('error');
    await vi.advanceTimersByTimeAsync(60000); expect(load).toHaveBeenCalledTimes(2);
    load.mockResolvedValueOnce([]); store.retry('one'); await vi.advanceTimersByTimeAsync(500);
    expect(store.get('one').status).toBe('unavailable'); stop();
  });
  it('rejects late hidden, stopped and no-longer-visible responses', async () => {
    vi.useFakeTimers(); let resolve!: (posts: SocialPostPreview[]) => void;
    const load = vi.fn(() => new Promise<SocialPostPreview[]>(done => { resolve = done; }));
    const store = new SharedPostPreviewStore(load); const stop = store.start(); const release = store.observe('one');
    await vi.advanceTimersByTimeAsync(500); store.setVisible(false);
    resolve([post('one')]); await vi.advanceTimersByTimeAsync(0); expect(store.get('one').post).toBeUndefined();
    store.setVisible(true); await vi.advanceTimersByTimeAsync(2500); release();
    resolve([post('one')]); await vi.advanceTimersByTimeAsync(0); expect(store.get('one').post).toBeUndefined();
    store.observe('one'); await vi.advanceTimersByTimeAsync(2500); stop();
    resolve([post('one')]); await vi.advanceTimersByTimeAsync(0); expect(store.get('one').post).toBeUndefined();
  });
  it('never displays a response that arrives after its permission lease', async () => {
    vi.useFakeTimers(); let resolve!: (posts: SocialPostPreview[]) => void;
    const store = new SharedPostPreviewStore(() => new Promise(done => { resolve = done; }));
    const stop = store.start(); store.observe('one'); await vi.advanceTimersByTimeAsync(31000);
    resolve([post('one')]); await vi.advanceTimersByTimeAsync(0); expect(store.get('one').post).toBeUndefined(); stop();
  });
});
