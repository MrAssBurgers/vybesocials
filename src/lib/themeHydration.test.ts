import { beforeEach, describe, expect, it, vi } from 'vitest';
import { scopedEquippedKey } from '@/lib/theme/equippedThemeStorage';

const mocks = vi.hoisted(() => ({
  applyThemeTokens: vi.fn(),
  reinforceSplashTheme: vi.fn(() => true),
  isSplashVisible: vi.fn(() => false),
  isThemeAlreadyApplied: vi.fn(() => false),
  markThemeAppliedFromBoot: vi.fn(),
}));

vi.mock('@/hooks/useCustomTheme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useCustomTheme')>();
  return {
    ...actual,
    applyThemeTokens: mocks.applyThemeTokens,
    isThemeAlreadyApplied: mocks.isThemeAlreadyApplied,
    markThemeAppliedFromBoot: mocks.markThemeAppliedFromBoot,
  };
});

vi.mock('@/lib/theme/themePrepaint', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/theme/themePrepaint')>();
  return {
    ...actual,
    isSplashVisible: mocks.isSplashVisible,
    reinforceSplashTheme: mocks.reinforceSplashTheme,
  };
});

import { hydrateThemeFromLocalCaches } from '@/lib/themeHydration';

const midnightTokens = {
  colorPrimary: '220 90% 56%',
  colorSecondary: '240 10% 12%',
  colorAccent: '200 100% 62%',
  bgMain: '222 47% 6%',
};

describe('hydrateThemeFromLocalCaches', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.applyThemeTokens.mockClear();
    mocks.reinforceSplashTheme.mockClear();
    mocks.isSplashVisible.mockReturnValue(false);
    mocks.isThemeAlreadyApplied.mockReturnValue(false);
    document.body.classList.remove('splash-visible');
    document.documentElement.removeAttribute('data-vybe-theme-painted');
  });

  it('applies full equipped theme from localStorage', () => {
    localStorage.setItem(scopedEquippedKey('user-1'), JSON.stringify(midnightTokens));

    const applied = hydrateThemeFromLocalCaches(undefined, 'user-1');

    expect(applied).toBe(true);
    expect(mocks.applyThemeTokens).toHaveBeenCalledTimes(1);
    expect(mocks.reinforceSplashTheme).not.toHaveBeenCalled();
  });

  it('applies equipped theme during splash instead of lightweight reinforce only', () => {
    localStorage.setItem(scopedEquippedKey('user-1'), JSON.stringify(midnightTokens));
    mocks.isSplashVisible.mockReturnValue(true);
    document.body.classList.add('splash-visible');

    const applied = hydrateThemeFromLocalCaches(undefined, 'user-1');

    expect(applied).toBe(true);
    expect(mocks.applyThemeTokens).toHaveBeenCalledTimes(1);
    expect(mocks.reinforceSplashTheme).not.toHaveBeenCalled();
  });

  it('does not apply when no equipped tokens exist during splash', () => {
    mocks.isSplashVisible.mockReturnValue(true);
    document.body.classList.add('splash-visible');

    const applied = hydrateThemeFromLocalCaches();

    expect(applied).toBe(false);
    expect(mocks.applyThemeTokens).not.toHaveBeenCalled();
  });
});
