import { describe, expect, it, afterEach, vi, beforeEach } from 'vitest';

describe('deviceDetection foldable / Android shell', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('detects Samsung Fold model codes and prefers touch shell', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-F956U) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36',
      maxTouchPoints: 5,
    });
    vi.stubGlobal('window', {
      ...window,
      innerWidth: 390,
      matchMedia: (query: string) => ({
        matches: query.includes('pointer: coarse'),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
        onchange: null,
      }),
    });

    const { isSamsungFoldableUa, preferTouchAppShell, isMobileOrTabletDevice } =
      await import('./deviceDetection');

    expect(isSamsungFoldableUa()).toBe(true);
    expect(preferTouchAppShell()).toBe(true);
    expect(isMobileOrTabletDevice()).toBe(true);
  });

  it('keeps unfolded Fold (≥1024 CSS px) on the touch shell', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-F956U) AppleWebKit/537.36',
      maxTouchPoints: 10,
    });
    vi.stubGlobal('window', {
      ...window,
      innerWidth: 1200,
      matchMedia: (query: string) => ({
        matches: query.includes('pointer: coarse'),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
        onchange: null,
      }),
    });

    const { isMobileOrTabletDevice, preferTouchAppShell } = await import('./deviceDetection');
    expect(preferTouchAppShell()).toBe(true);
    expect(isMobileOrTabletDevice()).toBe(true);
  });
});
