/**
 * Synchronous theme prepaint — runs in index.html boot script before first paint.
 * Keep in sync with applyThemeTokens() in useCustomTheme.ts.
 */
import {
  BOOT_SNAPSHOT_KEY,
  readEquippedThemeTokens,
  readBootSnapshot,
  type EquippedThemeTokens,
} from '@/lib/theme/equippedThemeStorage';

export { BOOT_SNAPSHOT_KEY } from '@/lib/theme/equippedThemeStorage';

export const THEME_SNAPSHOT_KEYS = [
  '--primary', '--secondary', '--accent', '--ring', '--background', '--card', '--popover',
  '--gradient-start', '--gradient-mid', '--gradient-end', '--glass', '--glass-border',
  '--muted', '--sidebar-background', '--sidebar-foreground', '--sidebar-primary',
  '--sidebar-primary-foreground', '--sidebar-accent', '--sidebar-accent-foreground',
  '--sidebar-border', '--sidebar-ring', '--foreground', '--muted-foreground',
  '--card-foreground', '--popover-foreground', '--primary-foreground',
  '--secondary-foreground', '--accent-foreground', '--border', '--input',
  '--input-foreground', '--neon-pink', '--neon-purple', '--neon-cyan',
  '--vybe-brand-primary', '--vybe-brand-secondary', '--vybe-brand-accent',
  '--vybe-brand-pink', '--vybe-brand-purple', '--vybe-brand-cyan',
  '--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5', '--radius',
  '--light-bg-start', '--light-bg-mid',
] as const;

/** Vars required by #vybe-static-boot mesh, wordmark, and progress bar. */
export const SPLASH_THEME_VAR_KEYS = [
  '--primary',
  '--secondary',
  '--accent',
  '--background',
  '--card',
  '--foreground',
  '--muted-foreground',
] as const;

export const SPLASH_BOOT_ID = 'vybe-static-boot';

type ThemeTokensLike = EquippedThemeTokens;

function shiftToMode(hsl: string, targetMode: 'dark' | 'light', type: 'bg' | 'text' | 'border' | 'accent'): string {
  try {
    const parts = hsl.split(' ');
    if (parts.length < 3) return hsl;
    const h = parts[0];
    const s = parts[1];
    const l = parseFloat(parts[2].replace('%', ''));
    if (Number.isNaN(l)) return hsl;

    let newL = l;
    if (targetMode === 'light') {
      if (type === 'bg') newL = Math.max(88, Math.min(100, 100 - l * 0.15));
      else if (type === 'text') newL = Math.max(5, Math.min(35, 100 - l));
      else if (type === 'border') newL = Math.max(75, Math.min(92, 100 - l * 0.3));
      else newL = Math.max(30, Math.min(60, l));
    } else {
      if (type === 'bg') newL = Math.max(2, Math.min(15, l * 0.15));
      else if (type === 'text') newL = Math.max(85, Math.min(98, 100 - l));
      else if (type === 'border') newL = Math.max(12, Math.min(25, l * 0.3));
      else newL = Math.max(45, Math.min(70, l));
    }
    return `${h} ${s} ${newL}%`;
  } catch {
    return hsl;
  }
}

/** Adapt equipped tokens to xd-theme mode — must run before first paint. */
export function adaptThemeToMode<T extends ThemeTokensLike>(tokens: T, targetMode: 'dark' | 'light'): T {
  if (tokens.mode === targetMode) return tokens;

  return {
    ...tokens,
    mode: targetMode,
    colorPrimary: tokens.colorPrimary,
    colorSecondary: shiftToMode(tokens.colorSecondary ?? '240 10% 12%', targetMode, 'accent'),
    colorAccent: tokens.colorAccent,
    bgMain: shiftToMode(tokens.bgMain ?? '240 10% 4%', targetMode, 'bg'),
    bgCard: shiftToMode(tokens.bgCard ?? '240 10% 6%', targetMode, 'bg'),
    bgGradientFrom: tokens.bgGradientFrom ? shiftToMode(tokens.bgGradientFrom, targetMode, 'bg') : undefined,
    bgGradientMid: tokens.bgGradientMid ? shiftToMode(tokens.bgGradientMid, targetMode, 'bg') : undefined,
    bgGradientTo: tokens.bgGradientTo ? shiftToMode(tokens.bgGradientTo, targetMode, 'bg') : undefined,
    glassBg: tokens.glassBg ? shiftToMode(tokens.glassBg, targetMode, 'bg') : undefined,
    glassBorder: tokens.glassBorder ? shiftToMode(tokens.glassBorder, targetMode, 'border') : undefined,
    sidebarBg: tokens.sidebarBg ? shiftToMode(tokens.sidebarBg, targetMode, 'bg') : undefined,
    inputBg: tokens.inputBg ? shiftToMode(tokens.inputBg, targetMode, 'border') : undefined,
    textPrimary: shiftToMode(tokens.textPrimary ?? '0 0% 98%', targetMode, 'text'),
    textSecondary: shiftToMode(tokens.textSecondary ?? '240 5% 55%', targetMode, 'text'),
    inputText: tokens.inputText ? shiftToMode(tokens.inputText, targetMode, 'text') : undefined,
    buttonText: tokens.buttonText ? shiftToMode(tokens.buttonText, targetMode, 'text') : undefined,
    borderColor: tokens.borderColor ? shiftToMode(tokens.borderColor, targetMode, 'border') : undefined,
    neonPink: tokens.neonPink,
    neonPurple: tokens.neonPurple,
    neonCyan: tokens.neonCyan,
  } as T;
}

const BORDER_RADIUS_MAP: Record<string, string> = {
  small: '0.375rem',
  medium: '0.75rem',
  large: '1.25rem',
};

function safeHSL(value: string | undefined, fallback: string): string {
  if (!value || typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed || !/\d/.test(trimmed)) return fallback;
  return trimmed;
}

function adjustLightness(hsl: string, amount: number): string {
  try {
    const parts = hsl.split(' ');
    if (parts.length >= 3) {
      const lightness = parseFloat(parts[2].replace('%', ''));
      if (Number.isNaN(lightness)) return hsl;
      const newLightness = Math.max(0, Math.min(100, lightness + amount));
      return `${parts[0]} ${parts[1]} ${newLightness}%`;
    }
  } catch {
    /* ignore */
  }
  return hsl;
}

export { readBootSnapshot } from '@/lib/theme/equippedThemeStorage';

export function applyBootSnapshot(
  snapshot: Record<string, string>,
  target: HTMLElement = document.documentElement,
): boolean {
  let applied = false;
  for (const [key, value] of Object.entries(snapshot)) {
    if (typeof value === 'string' && value.trim()) {
      target.style.setProperty(key, value.trim());
      applied = true;
    }
  }
  return applied && Boolean(snapshot['--primary']?.trim());
}

export function resolveBootMode(): 'dark' | 'light' {
  let mode = localStorage.getItem('xd-theme') || 'dark';
  if (mode === 'system') {
    mode =
      window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
  }
  return mode === 'light' ? 'light' : 'dark';
}

export function applyBootModeClass(mode: 'dark' | 'light'): void {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(mode);
}

export { resolveThemeUserId as getThemeUserIdFromStorage } from '@/lib/theme/equippedThemeStorage';
export { readEquippedThemeTokens as readEquippedTokensFromStorage } from '@/lib/theme/equippedThemeStorage';

/** Full CSS variable paint from equipped tokens — mirrors applyThemeTokens(). */
export function applyThemeCssVars(
  tokens: ThemeTokensLike,
  mode: 'dark' | 'light',
  target: HTMLElement = document.documentElement,
): void {
  const root = target;
  const defaultDark = '240 10% 4%';
  const defaultLight = '0 0% 98%';
  const defaultPrimary = '330 100% 60%';
  const defaultText = mode === 'dark' ? '0 0% 98%' : '240 10% 20%';
  const defaultMuted = mode === 'dark' ? '240 5% 55%' : '240 5% 50%';
  const defaultBg = mode === 'dark' ? defaultDark : defaultLight;

  const primaryHsl = safeHSL(tokens.colorPrimary, defaultPrimary);
  root.style.setProperty('--primary', primaryHsl);
  root.style.setProperty('--secondary', safeHSL(tokens.colorSecondary, '240 10% 12%'));
  root.style.setProperty('--accent', safeHSL(tokens.colorAccent, '185 100% 50%'));
  root.style.setProperty('--ring', primaryHsl);

  const bgMain = safeHSL(tokens.bgMain, defaultBg);
  const bgCard = safeHSL(tokens.bgCard, mode === 'dark' ? '240 10% 6%' : '0 0% 100%');
  root.style.setProperty('--background', bgMain);
  root.style.setProperty('--card', bgCard);
  root.style.setProperty('--popover', bgCard);

  const gradientFrom = safeHSL(tokens.bgGradientFrom, bgMain);
  const gradientMid = safeHSL(tokens.bgGradientMid, bgCard);
  const gradientTo = safeHSL(tokens.bgGradientTo, bgMain);
  root.style.setProperty('--gradient-start', gradientFrom);
  root.style.setProperty('--gradient-mid', gradientMid);
  root.style.setProperty('--gradient-end', gradientTo);

  const glassBorder = safeHSL(
    tokens.glassBorder,
    safeHSL(tokens.borderColor, mode === 'dark' ? '240 10% 20%' : '240 5% 90%'),
  );
  root.style.setProperty('--glass', safeHSL(tokens.glassBg, bgCard));
  root.style.setProperty('--glass-border', glassBorder);
  root.style.setProperty('--muted', adjustLightness(bgCard, mode === 'dark' ? 5 : -5));

  const sidebarBg = safeHSL(tokens.sidebarBg, bgCard);
  const sidebarAccent =
    mode === 'dark'
      ? adjustLightness(primaryHsl, -38)
      : adjustLightness(primaryHsl, 36);
  root.style.setProperty('--sidebar-background', sidebarBg);
  root.style.setProperty('--sidebar-foreground', safeHSL(tokens.textPrimary, defaultText));
  root.style.setProperty('--sidebar-primary', primaryHsl);
  root.style.setProperty('--sidebar-primary-foreground', mode === 'dark' ? '0 0% 100%' : '0 0% 0%');
  root.style.setProperty('--sidebar-accent', sidebarAccent);
  root.style.setProperty('--sidebar-accent-foreground', safeHSL(tokens.textPrimary, defaultText));
  root.style.setProperty('--sidebar-border', safeHSL(tokens.borderColor, glassBorder));
  root.style.setProperty('--sidebar-ring', primaryHsl);

  root.style.setProperty('--foreground', safeHSL(tokens.textPrimary, defaultText));
  root.style.setProperty('--muted-foreground', safeHSL(tokens.textSecondary, defaultMuted));
  root.style.setProperty('--card-foreground', safeHSL(tokens.textPrimary, defaultText));
  root.style.setProperty('--popover-foreground', safeHSL(tokens.textPrimary, defaultText));
  root.style.setProperty(
    '--primary-foreground',
    safeHSL(tokens.buttonText, mode === 'dark' ? '0 0% 100%' : '0 0% 0%'),
  );
  root.style.setProperty('--secondary-foreground', safeHSL(tokens.textPrimary, defaultText));
  root.style.setProperty('--accent-foreground', mode === 'dark' ? '0 0% 100%' : '0 0% 0%');

  const borderColor = safeHSL(tokens.borderColor, mode === 'dark' ? '240 10% 18%' : '240 5% 85%');
  root.style.setProperty('--border', borderColor);
  root.style.setProperty('--input', safeHSL(tokens.inputBg, borderColor));
  root.style.setProperty('--input-foreground', safeHSL(tokens.inputText, safeHSL(tokens.textPrimary, defaultText)));

  root.style.setProperty('--neon-pink', safeHSL(tokens.neonPink, primaryHsl));
  root.style.setProperty('--neon-purple', safeHSL(tokens.neonPurple, safeHSL(tokens.colorSecondary, '280 100% 60%')));
  root.style.setProperty('--neon-cyan', safeHSL(tokens.neonCyan, safeHSL(tokens.colorAccent, '185 100% 50%')));

  const brandSecondary = safeHSL(tokens.colorSecondary, '280 100% 60%');
  const brandAccent = safeHSL(tokens.colorAccent, '185 100% 50%');
  root.style.setProperty('--vybe-brand-primary', primaryHsl);
  root.style.setProperty('--vybe-brand-secondary', brandSecondary);
  root.style.setProperty('--vybe-brand-accent', brandAccent);
  root.style.setProperty('--vybe-brand-pink', safeHSL(tokens.neonPink, primaryHsl));
  root.style.setProperty('--vybe-brand-purple', safeHSL(tokens.neonPurple, brandSecondary));
  root.style.setProperty('--vybe-brand-cyan', safeHSL(tokens.neonCyan, brandAccent));

  root.style.setProperty('--chart-1', primaryHsl);
  root.style.setProperty('--chart-2', safeHSL(tokens.colorSecondary, '240 10% 12%'));
  root.style.setProperty('--chart-3', safeHSL(tokens.colorAccent, '185 100% 50%'));
  root.style.setProperty('--chart-4', safeHSL(tokens.neonPink, primaryHsl));
  root.style.setProperty('--chart-5', safeHSL(tokens.neonCyan, safeHSL(tokens.colorAccent, '185 100% 50%')));

  const validRadius = ['small', 'medium', 'large'].includes(tokens.borderRadius ?? '')
    ? (tokens.borderRadius as string)
    : 'medium';
  root.style.setProperty('--radius', BORDER_RADIUS_MAP[validRadius] ?? BORDER_RADIUS_MAP.medium);

  if (mode === 'light') {
    root.style.setProperty('--light-bg-start', gradientFrom);
    root.style.setProperty('--light-bg-mid', gradientMid);
  }
}

export function getSplashBootElement(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.getElementById(SPLASH_BOOT_ID);
}

export function isSplashVisible(): boolean {
  return typeof document !== 'undefined' && document.body.classList.contains('splash-visible');
}

function copyRootSplashVarsToElement(el: HTMLElement): boolean {
  const root = document.documentElement;
  let applied = false;
  for (const key of SPLASH_THEME_VAR_KEYS) {
    const value = root.style.getPropertyValue(key);
    if (value?.trim()) {
      el.style.setProperty(key, value.trim());
      applied = true;
    }
  }
  return applied;
}

/**
 * Paint equipped theme vars on #vybe-static-boot so the loading screen is immune
 * to :root classic defaults from index.css overwriting html inline vars.
 */
export function applySplashScopedTheme(): boolean {
  const boot = getSplashBootElement();
  if (!boot) return false;

  const mode = resolveBootMode();
  const equipped = readEquippedThemeTokens();
  if (equipped?.colorPrimary) {
    applyThemeCssVars(adaptThemeToMode(equipped, mode), mode, boot);
    return true;
  }

  const snapshot = readBootSnapshot();
  if (snapshot) {
    const splashSnap: Record<string, string> = {};
    for (const key of SPLASH_THEME_VAR_KEYS) {
      const value = snapshot[key];
      if (value?.trim()) splashSnap[key] = value.trim();
    }
    if (applyBootSnapshot(splashSnap, boot)) return true;
  }

  return copyRootSplashVarsToElement(boot);
}

/** Re-stamp html + splash-scoped vars (no React, no full applyThemeTokens). */
export function reinforceSplashTheme(): boolean {
  const painted = prepaintThemeFromStorage();
  const scoped = applySplashScopedTheme();
  return painted || scoped;
}

/** Capture inline CSS vars on html into vybe-boot-theme for the next cold boot. */
export function writeBootSnapshotFromDocument(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const snap: Record<string, string> = {};
  for (const key of THEME_SNAPSHOT_KEYS) {
    const value = root.style.getPropertyValue(key);
    if (value) snap[key] = value.trim();
  }
  if (!snap['--primary']?.trim()) return;
  try {
    localStorage.setItem(BOOT_SNAPSHOT_KEY, JSON.stringify(snap));
    localStorage.setItem('vybe-boot-theme-updated-at', String(Date.now()));
  } catch {
    /* ignore */
  }
}

/**
 * Earliest paint path: equipped tokens first, snapshot fallback.
 * Called from public/boot-theme.js before React/CSS bundle loads.
 */
export function prepaintThemeFromStorage(): boolean {
  if (typeof document === 'undefined') return false;

  const mode = resolveBootMode();
  const root = document.documentElement;
  applyBootModeClass(mode);
  root.setAttribute('data-vybe-boot-mode', mode);

  const equipped = readEquippedThemeTokens();
  if (equipped?.colorPrimary) {
    applyThemeCssVars(adaptThemeToMode(equipped, mode), mode);
    applySplashScopedTheme();
    return true;
  }

  const snapshot = readBootSnapshot();
  if (snapshot) {
    const applied = applyBootSnapshot(snapshot);
    if (applied) applySplashScopedTheme();
    return applied;
  }

  return false;
}
