import { useEffect } from 'react';
import { db } from '@/lib/firebase';
import { subscribePostgresChannel, removeRealtimeChannel } from '@/lib/realtimeChannel';
import { useAuth } from '@/lib/auth';
import {
  isEquippedThemeStorageKey,
  readEquippedThemeTokens,
} from '@/lib/theme/equippedThemeStorage';

// Convert hex (#RRGGBB) to "h s% l%" string for CSS HSL tokens
function hexToHsl(hex: string): string | null {
  const m = hex.replace('#', '').match(/^([0-9a-f]{6})$/i);
  if (!m) return null;
  const r = parseInt(m[1].slice(0, 2), 16) / 255;
  const g = parseInt(m[1].slice(2, 4), 16) / 255;
  const b = parseInt(m[1].slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
      case g: h = ((b - r) / d + 2); break;
      case b: h = ((r - g) / d + 4); break;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

const APPLIED_VARS = ['--primary', '--accent', '--ring'];

export function shouldApplyAutoTheme(
  mode: string | null | undefined,
  userId: string | null | undefined,
): boolean {
  return mode === 'autonomous' && !readEquippedThemeTokens(userId)?.colorPrimary;
}

/**
 * Applies the autonomous DNA Auto-Pilot theme overlay (when mode=autonomous).
 * Listens for changes to dna_auto_theme and pushes signature_colors into CSS vars.
 */
export function useApplyAutoTheme() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    let autoThemeApplied = false;

    async function apply() {
      if (readEquippedThemeTokens(user!.id)?.colorPrimary) {
        // An explicit equip owns theme identity and all palette variables.
        autoThemeApplied = false;
        return;
      }

      const [{ data: settings }, { data: theme }] = await Promise.all([
        db.from('dna_agent_settings').select('mode').eq('user_id', user!.id).maybeSingle(),
        db.from('dna_auto_theme').select('*').eq('user_id', user!.id).maybeSingle(),
      ]);
      if (!active) return;

      // Re-check after network latency: the user may have equipped a theme meanwhile.
      if (readEquippedThemeTokens(user!.id)?.colorPrimary) {
        autoThemeApplied = false;
        return;
      }

      if (!shouldApplyAutoTheme(settings?.mode, user!.id) || !theme?.signature_colors) {
        if (autoThemeApplied) {
          APPLIED_VARS.forEach(v => document.documentElement.style.removeProperty(v));
          autoThemeApplied = false;
        }
        return;
      }
      const colors = theme.signature_colors as string[];
      const primary = colors[0] && hexToHsl(colors[0]);
      const accent = colors[1] && hexToHsl(colors[1]);
      const ring = colors[2] && hexToHsl(colors[2]);
      if (primary) document.documentElement.style.setProperty('--primary', primary);
      if (accent) document.documentElement.style.setProperty('--accent', accent);
      if (ring) document.documentElement.style.setProperty('--ring', ring);
      autoThemeApplied = Boolean(primary || accent || ring);
    }

    apply();

    const ch = subscribePostgresChannel(`auto-theme-${user.id}`, [
      { event: '*', table: 'dna_auto_theme', filter: `user_id=eq.${user.id}`, callback: apply },
      { event: '*', table: 'dna_agent_settings', filter: `user_id=eq.${user.id}`, callback: apply },
    ]);
    const onThemeStorage = (event: StorageEvent) => {
      if (isEquippedThemeStorageKey(event.key)) void apply();
    };
    const onThemeEquipped = () => void apply();
    window.addEventListener('storage', onThemeStorage);
    window.addEventListener('vybeThemeEquipped', onThemeEquipped);

    return () => {
      active = false;
      try {
        window.removeEventListener('storage', onThemeStorage);
        window.removeEventListener('vybeThemeEquipped', onThemeEquipped);
        removeRealtimeChannel(ch);
        if (autoThemeApplied && !readEquippedThemeTokens(user.id)?.colorPrimary) {
          APPLIED_VARS.forEach(v => document.documentElement.style.removeProperty(v));
        }
      } catch { /* never throw from cleanup */ }
    };
  }, [user?.id]);
}
