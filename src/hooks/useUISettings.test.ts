import { describe, expect, it, vi } from 'vitest';
import { cacheSettings, clearSettingsCache, DEFAULT_UI_SETTINGS, getCachedSettings, validateSettings } from './useUISettings';

vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: null }) }));

describe('UI customization persistence', () => {
  it('never loads another account or legacy unowned settings', () => {
    localStorage.setItem('vybe-ui-settings-cache', JSON.stringify({ ...DEFAULT_UI_SETTINGS, fontScale: 'large' }));
    cacheSettings('account-a', { ...DEFAULT_UI_SETTINGS, fontScale: 'small' });
    expect(getCachedSettings('account-a')?.fontScale).toBe('small');
    expect(getCachedSettings('account-b')).toBeNull();
    expect(getCachedSettings()).toBeNull();
    cacheSettings('account-b', { ...DEFAULT_UI_SETTINGS, fontScale: 'xlarge' });
    clearSettingsCache('account-a');
    expect(getCachedSettings('account-a')).toBeNull();
    expect(getCachedSettings('account-b')?.fontScale).toBe('xlarge');
  });

  it('repairs malformed, duplicate and unknown layouts without losing safe mode', () => {
    const settings = validateSettings({
      navTabs: ['home', 'home', 'messages', 'profile', 'unknown'],
      navOrder: [9, 2, 2, -1, 0.5],
      safeMode: true,
      configVersion: 4,
      layouts: { home: [null, { id: 'stories', order: 5, visible: false }, { id: 'stories', order: 0 }, { id: 'unknown' }] },
    });
    expect(settings.navTabs).toEqual(['home', 'messages', 'profile']);
    expect(settings.navOrder).toEqual([2, 0, 1]);
    expect(settings.safeMode).toBe(true);
    expect(settings.configVersion).toBe(4);
    expect(settings.layouts.home).toHaveLength(DEFAULT_UI_SETTINGS.layouts.home.length);
    expect(settings.layouts.home.at(-1)).toEqual({ id: 'stories', name: 'Stories', order: 3, visible: false });
  });

  it('accepts null / primitive / broken saved data without leaking mutable defaults', () => {
    for (const value of [null, false, 123, 'broken', { layouts: null }, { navTabs: [null] }]) {
      const settings = validateSettings(value);
      expect(settings).toEqual(DEFAULT_UI_SETTINGS);
      settings.layouts.home[0].visible = false;
      settings.navTabs.pop();
      expect(DEFAULT_UI_SETTINGS.layouts.home[0].visible).toBe(true);
      expect(DEFAULT_UI_SETTINGS.navTabs).toHaveLength(5);
    }
    localStorage.setItem('vybe-ui-settings-cache:broken', '{invalid');
    expect(getCachedSettings('broken')).toBeNull();
  });
});
