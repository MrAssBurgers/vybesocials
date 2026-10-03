import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Android splash fail-open', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('caps the Play Store / Fold splash even when the WebView UA has no wv token', async () => {
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (Linux; Android 17; SM-F971N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
      maxTouchPoints: 5,
    });
    vi.stubGlobal('window', window);
    const { splashAbsoluteMaxMs } = await import('./nativePerfMode');
    expect(splashAbsoluteMaxMs()).toBe(800);
  });

  it('keeps the Android cover deadline after React stops the progress ticker', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    expect(html).toContain('vybe-android-boot');
    expect(html).toContain('var failOpenMs = isAndroid ? 900');
    expect(html).toContain('if (!isAndroid)');
    expect(html).toContain('__VYBE_SPLASH_FORCE_HIDDEN__');
    expect(html).toContain('vybe-splash-failopen');
  });
});
