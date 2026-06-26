import { useLayoutEffect, useState } from 'react';
import { useUserTheme } from '@/hooks/useCustomTheme';
import { getVybeMarkColorsFromStorage } from '@/lib/bootThemeApply';

export interface VybeMarkColors {
  primary: string;
  secondary: string;
  accent: string;
}

function readHslVar(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return raw ? `hsl(${raw})` : null;
}

function readFromDocument(): VybeMarkColors {
  const fromStorage = getVybeMarkColorsFromStorage();
  if (fromStorage) return fromStorage;

  const primary = readHslVar('--primary');
  const secondary = readHslVar('--secondary');
  const accent = readHslVar('--accent');

  return {
    primary: primary ?? 'hsl(var(--primary))',
    secondary: secondary ?? primary ?? 'hsl(var(--secondary, var(--primary)))',
    accent: accent ?? 'hsl(var(--accent))',
  };
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
