import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

describe('getRuntimeOs auto-detect', () => {
  const originalUA = navigator.userAgent;

  beforeEach(() => {
    // Reset module cache between UA swaps (clears runtime OS cache).
    vi.resetModules();
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'userAgent', {
      value: originalUA,
      configurable: true,
    });
  });

  it('detects Android from UA', async () => {
    Object.defineProperty(navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      configurable: true,
    });
    const { getRuntimeOs } = await import('./despiaBridge');
    expect(getRuntimeOs()).toBe('android');
  });

  it('detects iOS from iPhone UA', async () => {
    Object.defineProperty(navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
      configurable: true,
    });
    const { getRuntimeOs } = await import('./despiaBridge');
    expect(getRuntimeOs()).toBe('ios');
  });
});
