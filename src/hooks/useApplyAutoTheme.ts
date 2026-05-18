import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

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

/**
 * Applies the autonomous DNA Auto-Pilot theme overlay (when mode=autonomous).
 * Listens for changes to dna_auto_theme and pushes signature_colors into CSS vars.
 */
export function useApplyAutoTheme() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.id) return;
    let active = true;

    async function apply() {
      const [{ data: settings }, { data: theme }] = await Promise.all([
        supabase.from('dna_agent_settings').select('mode').eq('user_id', user!.id).maybeSingle(),
        supabase.from('dna_auto_theme').select('*').eq('user_id', user!.id).maybeSingle(),
      ]);
      if (!active) return;

      // only apply in autonomous mode
      if (settings?.mode !== 'autonomous' || !theme?.signature_colors) {
        // clear any prior overrides
        APPLIED_VARS.forEach(v => document.documentElement.style.removeProperty(v));
        return;
      }
      const colors = theme.signature_colors as string[];
      const primary = colors[0] && hexToHsl(colors[0]);
      const accent = colors[1] && hexToHsl(colors[1]);
      const ring = colors[2] && hexToHsl(colors[2]);
      if (primary) document.documentElement.style.setProperty('--primary', primary);
      if (accent) document.documentElement.style.setProperty('--accent', accent);
      if (ring) document.documentElement.style.setProperty('--ring', ring);
    }

    apply();

    const ch = supabase
      .channel(`auto-theme-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dna_auto_theme', filter: `user_id=eq.${user.id}` }, apply)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dna_agent_settings', filter: `user_id=eq.${user.id}` }, apply)
      .subscribe();

    return () => {
      active = false;
      try {
        if (ch) supabase.removeChannel(ch);
        APPLIED_VARS.forEach(v => document.documentElement.style.removeProperty(v));
      } catch { /* never throw from cleanup */ }
    };
  }, [user?.id]);
}
