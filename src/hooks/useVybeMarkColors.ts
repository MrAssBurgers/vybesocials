import { useLayoutEffect, useState } from 'react';
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

function isThemePaintedOnDocument(): boolean {
  if (typeof document === 'undefined') return false;
  if (document.documentElement.getAttribute('data-vybe-theme-painted') === 'true') return true;
  return Boolean(getComputedStyle(document.documentElement).getPropertyValue('--primary').trim());
}

/** Live CSS vars — matches what is painted on screen (hero, gradients, UI). */
function readVybeMarkFromDocument(): VybeMarkColors | null {
  const primary = readHslVar('--primary');
  const accent = readHslVar('--accent');
  if (!primary || !accent) return null;
  return {
    primary,
    secondary: readHslVar('--secondary') ?? primary,
    accent,
  };
}

function readFromDocument(): VybeMarkColors {
  if (isThemePaintedOnDocument()) {
    const fromDocument = readVybeMarkFromDocument();
    if (fromDocument) return fromDocument;
  }

  const fromStorage = getVybeMarkColorsFromStorage();
  if (fromStorage) return fromStorage;

  const fallback = readVybeMarkFromDocument();
  if (fallback) return fallback;

  return {
    primary: 'hsl(var(--primary))',
    secondary: 'hsl(var(--secondary, var(--primary)))',
    accent: 'hsl(var(--accent))',
  };
}

/** Resolved HSL strings for SVG strokes — safe before AuthProvider (splash/boot). */
export function useVybeMarkColors(): VybeMarkColors {
  const [colors, setColors] = useState<VybeMarkColors>(readFromDocument);

  useLayoutEffect(() => {
    setColors(readFromDocument());
  }, []);

  useLayoutEffect(() => {
    const refresh = () => setColors(readFromDocument());
    window.addEventListener('vybeThemeChange', refresh);
    window.addEventListener('vybeThemeEquipped', refresh);
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      if (isThemePaintedOnDocument()) refresh();
    });
    observer.observe(root, { attributes: true, attributeFilter: ['data-vybe-theme-painted', 'class'] });
    return () => {
      window.removeEventListener('vybeThemeChange', refresh);
      window.removeEventListener('vybeThemeEquipped', refresh);
      observer.disconnect();
    };
  }, []);

  return colors;
}
