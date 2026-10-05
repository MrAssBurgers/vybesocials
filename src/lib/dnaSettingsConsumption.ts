import type { QueryClient } from '@tanstack/react-query';
import { getEquippedThemeTokens, persistEquippedUserTheme, THEME_PRESETS } from '@/hooks/useCustomTheme';
import { cacheSettings, validateSettings } from '@/hooks/useUISettings';
import { scopedEquippedKey, scopedEquippedUpdatedAtKey } from '@/lib/theme/equippedThemeStorage';
import { normalizeSharedThemeTokens } from '@/lib/sharedThemeSchema';
import type { DnaActor, DnaTarget } from '@/lib/dnaAdaptationService';

function fingerprint(value: unknown) { return value ? JSON.stringify(normalizeSharedThemeTokens(value)) : null; }
/** A local equip can precede its server save. Preserve it before and during an action. */
export function guardDnaLocalTheme(uid: string, expected: DnaTarget | null, completed: DnaTarget | null) {
  if (expected?.kind !== 'theme') return () => {};
  const before = fingerprint(getEquippedThemeTokens(uid));
  const expectedValue = fingerprint(expected.tokens || THEME_PRESETS.classic);
  const completedValue = completed?.kind === 'theme' ? fingerprint(completed.tokens || THEME_PRESETS.classic) : undefined;
  if (before && before !== expectedValue && before !== completedValue) throw new Error('You chose another theme since this suggestion. Run Auto-Pilot again; your choice was preserved.');
  return () => {
    if (fingerprint(getEquippedThemeTokens(uid)) !== before) throw new Error('Your local theme changed while Auto-Pilot was saving. Refresh to review the saved result; your newer local choice was preserved.');
  };
}
export async function consumeDnaSettings(actor: DnaActor, target: DnaTarget, client: QueryClient, localGuard = () => {}) {
  actor.guard?.(); localGuard();
  if (target.kind === 'theme') {
    await client.cancelQueries({ queryKey: ['user-theme', actor.uid], exact: true }); actor.guard?.(); localGuard();
    persistEquippedUserTheme(target.tokens || THEME_PRESETS.classic, { userId: actor.uid, queryClient: client, skipAutoSave: true, themeId: null, basePreset: target.preset || 'classic' });
    if (!target.tokens) {
      // Undo restores absence on the server and in this account's cache.
      localStorage.removeItem(scopedEquippedKey(actor.uid)); localStorage.removeItem(scopedEquippedUpdatedAtKey(actor.uid));
      client.setQueryData(['user-theme', actor.uid], null);
    }
    if (target.tokens && fingerprint(getEquippedThemeTokens(actor.uid)) !== fingerprint(target.tokens)) throw new Error('The theme was saved, but this device could not retain it. Refresh to retry.');
  } else if (target.kind === 'layout') {
    await client.cancelQueries({ queryKey: ['ui-settings', actor.uid], exact: true }); actor.guard?.();
    const value = validateSettings({ ...target.config, safeMode: target.safeMode, configVersion: target.configVersion });
    cacheSettings(actor.uid, value); client.setQueryData(['ui-settings', actor.uid], value);
  } else {
    await client.cancelQueries({ queryKey: ['dna-content-preferences', actor.uid] }); actor.guard?.();
    client.setQueriesData({ queryKey: ['dna-content-preferences', actor.uid] }, target.preferences);
    await client.invalidateQueries({ queryKey: ['dna-content-preferences', actor.uid] }, { throwOnError: true }); actor.guard?.();
  }
  window.dispatchEvent(new CustomEvent('vybeDnaSettingsChanged', { detail: actor.uid }));
}
