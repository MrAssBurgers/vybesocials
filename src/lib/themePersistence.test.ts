import { beforeEach, describe, expect, it } from 'vitest';
import {
  EQUIPPED_THEME_KEY,
  EQUIPPED_THEME_UPDATED_AT_KEY,
  LEGACY_EQUIPPED_KEY,
  THEME_USER_ID_KEY,
  readBootSnapshot,
  readEquippedThemeTokens,
  scopedEquippedKey,
  scopedEquippedUpdatedAtKey,
} from '@/lib/theme/equippedThemeStorage';
import { clearStoredThemeState } from '@/lib/themeReset';
import { shouldApplyAutoTheme } from '@/hooks/useApplyAutoTheme';

const theme = (colorPrimary: string) => ({ colorPrimary });

function setAuthUser(userId: string): void {
  localStorage.setItem(
    'firebase:authUser:test:[DEFAULT]',
    JSON.stringify({ uid: userId }),
  );
}

describe('equipped theme account scoping', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('reads only the authenticated account scoped theme', () => {
    setAuthUser('user-a');
    localStorage.setItem(EQUIPPED_THEME_KEY, JSON.stringify(theme('global')));
    localStorage.setItem(scopedEquippedKey('user-a'), JSON.stringify(theme('a')));
    localStorage.setItem(scopedEquippedKey('user-b'), JSON.stringify(theme('b')));

    expect(readEquippedThemeTokens()?.colorPrimary).toBe('a');
  });

  it('does not fall back to global or another account after switching users', () => {
    setAuthUser('user-b');
    localStorage.setItem(EQUIPPED_THEME_KEY, JSON.stringify(theme('global')));
    localStorage.setItem(scopedEquippedKey('user-a'), JSON.stringify(theme('a')));

    expect(readEquippedThemeTokens()).toBeNull();
  });

  it('rejects a boot snapshot remembered for another account', () => {
    setAuthUser('user-b');
    localStorage.setItem(THEME_USER_ID_KEY, 'user-a');
    localStorage.setItem('vybe-boot-theme', JSON.stringify({ '--primary': '1 2% 3%' }));

    expect(readBootSnapshot()).toBeNull();
  });

  it('allows the global key only for unauthenticated legacy migration', () => {
    localStorage.setItem(EQUIPPED_THEME_KEY, JSON.stringify(theme('legacy')));

    expect(readEquippedThemeTokens()?.colorPrimary).toBe('legacy');
  });
});

describe('theme reset cleanup', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('removes global, scoped, identity, snapshot, and timestamp state', () => {
    const themeKeys = [
      EQUIPPED_THEME_KEY,
      LEGACY_EQUIPPED_KEY,
      EQUIPPED_THEME_UPDATED_AT_KEY,
      scopedEquippedKey('user-a'),
      scopedEquippedUpdatedAtKey('user-a'),
      THEME_USER_ID_KEY,
      'vybe-equipped-theme-id',
      'vybe-boot-theme',
      'vybe-boot-theme-updated-at',
    ];
    themeKeys.forEach((key) => localStorage.setItem(key, 'value'));
    localStorage.setItem('unrelated-key', 'keep');

    clearStoredThemeState();

    themeKeys.forEach((key) => expect(localStorage.getItem(key)).toBeNull());
    expect(localStorage.getItem('unrelated-key')).toBe('keep');
  });
});

describe('Auto-Pilot theme guard', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('does not apply over an explicitly equipped theme', () => {
    localStorage.setItem(scopedEquippedKey('user-a'), JSON.stringify(theme('a')));

    expect(shouldApplyAutoTheme('autonomous', 'user-a')).toBe(false);
  });

  it('applies only in autonomous mode when no explicit theme exists', () => {
    expect(shouldApplyAutoTheme('autonomous', 'user-a')).toBe(true);
    expect(shouldApplyAutoTheme('manual', 'user-a')).toBe(false);
  });
});
