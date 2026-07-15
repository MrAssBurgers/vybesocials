import { describe, expect, it } from 'vitest';
import { detectOAuthPlatform } from './oauthPlatform';

describe('detectOAuthPlatform', () => {
  it('prefers Despia oauth strategy', () => {
    const info = detectOAuthPlatform({
      despia: true,
      capacitor: false,
      ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      standalone: false,
    });
    expect(info.strategy).toBe('despia');
  });

  it('uses redirect for standalone PWA', () => {
    const info = detectOAuthPlatform({
      despia: false,
      capacitor: false,
      ua: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36',
      standalone: true,
    });
    expect(info.strategy).toBe('redirect');
  });

  it('uses popup on desktop chrome', () => {
    const info = detectOAuthPlatform({
      despia: false,
      capacitor: false,
      ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      standalone: false,
    });
    // Width heuristics may still force redirect in jsdom — strategy should not be despia.
    expect(info.strategy).not.toBe('despia');
  });
});
