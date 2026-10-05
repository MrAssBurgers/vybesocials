import { QueryClient } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ tokens: null as Record<string, unknown> | null, persist: vi.fn(), cache: vi.fn(), validate: vi.fn((value: unknown) => value) }));
const classic = { colorPrimary: '330 100% 60%', colorSecondary: '240 10% 12%', colorAccent: '185 100% 50%', bgMain: '240 10% 4%', bgCard: '240 10% 6%', textPrimary: '0 0% 98%', textSecondary: '240 5% 55%', borderRadius: 'medium' as const, mode: 'dark' as const };
vi.mock('@/hooks/useCustomTheme', () => ({ getEquippedThemeTokens: () => mock.tokens, persistEquippedUserTheme: mock.persist, THEME_PRESETS: { get classic() { return classic; } } }));
vi.mock('@/hooks/useUISettings', () => ({ cacheSettings: mock.cache, validateSettings: mock.validate }));
import { consumeDnaSettings, guardDnaLocalTheme } from './dnaSettingsConsumption';
import { scopedEquippedKey } from './theme/equippedThemeStorage';
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); mock.tokens = null; mock.persist.mockImplementation(tokens => { mock.tokens = tokens; localStorage.setItem(scopedEquippedKey('alice'), JSON.stringify(tokens)); }); });
it('consumes real theme tokens without another unverified server write', async () => {
  const client = new QueryClient(), tokens = { ...classic, colorPrimary: '220 90% 56%' };
  await consumeDnaSettings({ uid: 'alice', profileId: 'alice-profile', guard: vi.fn() }, { kind: 'theme', tokens, preset: 'midnight' }, client);
  expect(mock.persist).toHaveBeenCalledWith(tokens, expect.objectContaining({ userId: 'alice', skipAutoSave: true })); expect(mock.tokens).toEqual(tokens); client.clear();
});
it('theme Undo restores absent equipped storage for only the active owner', async () => {
  const client = new QueryClient(); localStorage.setItem(scopedEquippedKey('bob'), 'preserve');
  await consumeDnaSettings({ uid: 'alice', profileId: 'alice-profile' }, { kind: 'theme', tokens: null, preset: null }, client);
  expect(localStorage.getItem(scopedEquippedKey('alice'))).toBeNull(); expect(localStorage.getItem(scopedEquippedKey('bob'))).toBe('preserve'); expect(client.getQueryData(['user-theme', 'alice'])).toBeNull(); client.clear();
});
it('protects a new local choice both before dispatch and during receipt delivery', () => {
  mock.tokens = classic;
  const expected = { kind: 'theme' as const, tokens: classic, preset: 'classic' }, after = { ...expected, tokens: { ...classic, colorPrimary: '100 50% 40%' } };
  const guard = guardDnaLocalTheme('alice', expected, after); mock.tokens = { ...classic, colorPrimary: '40 50% 50%' };
  expect(guard).toThrow(/local theme changed/); expect(() => guardDnaLocalTheme('alice', expected, after)).toThrow(/another theme/);
});
it('updates actual layout and feed caches and never applies a retired account response', async () => {
  const client = new QueryClient(); client.setQueryData(['dna-content-preferences', 'alice', 3], null);
  const actor = { uid: 'alice', profileId: 'alice-profile', guard: vi.fn() };
  await consumeDnaSettings(actor, { kind: 'layout', config: { fontScale: 'large' }, safeMode: false, configVersion: 1 }, client);
  expect(client.getQueryData(['ui-settings', 'alice'])).toEqual({ fontScale: 'large', safeMode: false, configVersion: 1 });
  const preferences = { boost_topics: ['art'], reduce_topics: [] }; await consumeDnaSettings(actor, { kind: 'feed', preferences }, client);
  expect(client.getQueryData(['dna-content-preferences', 'alice', 3])).toEqual(preferences);
  actor.guard.mockImplementation(() => { throw Error('Account changed'); }); await expect(consumeDnaSettings(actor, { kind: 'theme', tokens: classic, preset: 'classic' }, client)).rejects.toThrow('Account changed'); expect(mock.persist).not.toHaveBeenCalled(); client.clear();
});
