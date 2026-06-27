import { useLayoutEffect, useState } from 'react';
import { useUserTheme } from '@/hooks/useCustomTheme';
import { getVybeMarkColorsFromStorage } from '@/lib/bootThemeApply';

export interface VybeMarkColors {
  primary: string;
  secondary: string;
  accent: string;
  /** Deep violet — left leg bottom (neon-purple) */
  deepPrimary: string;
  /** Deep blue — right leg bottom */
  deepAccent: string;
}

function readHslVar(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return raw ? `hsl(${raw})` : null;
}

function readFromDocument(): VybeMarkColors {
  const fromStorage = getVybeMarkColorsFromStorage();
  const primary = fromStorage?.primary ?? readHslVar('--primary') ?? 'hsl(var(--primary))';
  const secondary = fromStorage?.secondary ?? readHslVar('--secondary') ?? primary;
  const accent = fromStorage?.accent ?? readHslVar('--accent') ?? 'hsl(var(--accent))';
  const deepPrimary =
    readHslVar('--neon-purple') ?? readHslVar('--vybe-brand-purple') ?? secondary ?? primary;
  const deepAccent =
    readHslVar('--neon-cyan') ?? readHslVar('--vybe-brand-cyan') ?? accent;

  return { primary, secondary, accent, deepPrimary, deepAccent };
}

/** Resolved HSL strings for SVG strokes — prefers equipped theme tokens (no default flash). */
export function useVybeMarkColors(): VybeMarkColors {
  const { data: userTheme } = useUserTheme();
  const themeStamp = [
    userTheme?.id,
    userTheme?.updated_at,
    (userTheme?.theme_tokens as { colorPrimary?: string } | undefined)?.colorPrimary,
  ]
    .filter(Boolean)
    .join('-');

  const [colors, setColors] = useState<VybeMarkColors>(readFromDocument);

  useLayoutEffect(() => {
    setColors(readFromDocument());
  }, [themeStamp]);

  useLayoutEffect(() => {
    const refresh = () => setColors(readFromDocument());
    window.addEventListener('vybeThemeChange', refresh);
    window.addEventListener('vybeThemeEquipped', refresh);
    return () => {
      window.removeEventListener('vybeThemeChange', refresh);
      window.removeEventListener('vybeThemeEquipped', refresh);
    };
  }, []);

  return colors;
}
