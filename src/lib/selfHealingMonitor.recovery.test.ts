import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/firebaseAuthRefresh', () => ({ refreshFirebaseSession: vi.fn() }));
vi.mock('sonner', () => ({ toast: { dismiss: vi.fn(), message: vi.fn(), success: vi.fn() } }));
import { clearAppCache, clearErrorTracking, isChunkLoadError, trackError } from './selfHealingMonitor';

describe('recovery preserves user state', () => {
  const remove = vi.fn().mockResolvedValue(true);
  beforeEach(() => {
    vi.clearAllMocks();
    clearErrorTracking();
    localStorage.clear();
    vi.stubGlobal('caches', { keys: vi.fn().mockResolvedValue([
      'vybe-shell-v8', 'vybe-assets-v9', 'vybe-static-v42', 'vybe-v42',
      'vybe-media-v2', 'other-app-cache', 'vybe-private-history',
    ]), delete: remove });
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it.each([
    'Failed to fetch dynamically imported module: https://vybehub.app/assets/Community-old.js',
    'error loading dynamically imported module',
    'Importing a module script failed.',
    'Loading chunk 123 failed.',
    'ChunkLoadError',
  ])('recognizes missing module: %s', message => expect(isChunkLoadError(message)).toBe(true));

  it.each(['Failed to fetch', 'NetworkError', 'Failed to fetch profile', 'Loading chunk preview'])(
    'does not treat an ordinary request as an app update: %s', message => expect(isChunkLoadError(message)).toBe(false));

  it('awaits only app file removal and retains media, private and unrelated caches', async () => {
    await clearAppCache();
    expect(remove.mock.calls.map(args => args[0])).toEqual([
      'vybe-shell-v8', 'vybe-assets-v9', 'vybe-static-v42', 'vybe-v42',
    ]);
  });

  it('keeps the usable offline caches when disconnected', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await clearAppCache();
    expect(remove).not.toHaveBeenCalled();
  });

  it('does not reject when browser cache access is blocked', async () => {
    vi.stubGlobal('caches', { keys: vi.fn().mockRejectedValue(new Error('SecurityError')) });
    await expect(clearAppCache()).resolves.toBeUndefined();
  });

  it('prunes only regenerable display caches on repeated storage quota failures', () => {
    const preserved = ['firebase:authUser:project:app', 'vybe-trusted-device', 'vybe-home-layout',
      'post-draft', 'unknown-new-setting', 'vybe-current-profile', 'sb-old-auth'];
    for (const key of [...preserved, 'vybe_profile_avatar_v1', 'vybe-user-level-v1:me']) {
      localStorage.setItem(key, 'retained');
    }
    for (let i = 0; i < 3; i++) trackError('QuotaExceededError: localStorage quota exceeded');
    for (const key of preserved) expect(localStorage.getItem(key)).toBe('retained');
    expect(localStorage.getItem('vybe_profile_avatar_v1')).toBeNull();
    expect(localStorage.getItem('vybe-user-level-v1:me')).toBeNull();
  });

  it('refetches after repeated network failures without deleting caches', () => {
    const refetch = vi.fn();
    window.addEventListener('vybe:self-heal:refetch', refetch);
    try {
      for (let i = 0; i < 3; i++) trackError('Failed to fetch API');
      expect(refetch).toHaveBeenCalledOnce();
      expect(remove).not.toHaveBeenCalled();
    } finally { window.removeEventListener('vybe:self-heal:refetch', refetch); }
  });
});
