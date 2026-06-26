/**
 * Synchronous theme prepaint — runs in index.html boot script before first paint.
 * Keep in sync with applyThemeTokens() in useCustomTheme.ts.
 */
export const BOOT_SNAPSHOT_KEY = 'vybe-boot-theme';

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

type ThemeTokensLike = {
  colorPrimary?: string;
  colorSecondary?: string;
  colorAccent?: string;
  bgMain?: string;
  bgCard?: string;
  bgGradientFrom?: string;
  bgGradientMid?: string;
  bgGradientTo?: string;
  glassBg?: string;
  glassBorder?: string;
  sidebarBg?: string;
  textPrimary?: string;
  textSecondary?: string;
  borderColor?: string;
  inputBg?: string;
  inputText?: string;
  buttonText?: string;
  neonPink?: string;
  neonPurple?: string;
  neonCyan?: string;
  borderRadius?: string;
};

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

export function readBootSnapshot(): Record<string, string> | null {
  try {
    const raw = localStorage.getItem(BOOT_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function applyBootSnapshot(snapshot: Record<string, string>): boolean {
  const root = document.documentElement;
  let applied = false;
  for (const [key, value] of Object.entries(snapshot)) {
    if (typeof value === 'string' && value.trim()) {
      root.style.setProperty(key, value.trim());
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

export function getThemeUserIdFromStorage(): string | null {
  try {
    const remembered = localStorage.getItem('vybe-theme-user-id');
    if (remembered) return remembered;

    for (const storageKey of Object.keys(localStorage)) {
      if (!storageKey.startsWith('firebase:authUser:')) continue;
      try {
        const authUser = JSON.parse(localStorage.getItem(storageKey) || 'null') as { uid?: string } | null;
        if (authUser?.uid) return authUser.uid;
      } catch {
        /* ignore */
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function readEquippedTokensFromStorage(): ThemeTokensLike | null {
  try {
    const uid = getThemeUserIdFromStorage();
    const keys: string[] = [];
    if (uid) keys.push(`vybe-equipped-theme:${uid}`);
    keys.push('vybe-equipped-theme', 'vybe-custom-theme');

    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as ThemeTokensLike;
      if (parsed?.colorPrimary) return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/** Full CSS variable paint from equipped tokens — mirrors applyThemeTokens(). */
export function applyThemeCssVars(tokens: ThemeTokensLike, mode: 'dark' | 'light'): void {
  const root = document.documentElement;
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

/**
 * Earliest paint path: snapshot (full vars) then equipped tokens (full derivation).
 * Called from public/boot-theme.js before React/CSS bundle loads.
 */
export function prepaintThemeFromStorage(): boolean {
  if (typeof document === 'undefined') return false;

  const mode = resolveBootMode();
  applyBootModeClass(mode);

  const snapshot = readBootSnapshot();
  const hadSnapshot = snapshot ? applyBootSnapshot(snapshot) : false;

  const equipped = readEquippedTokensFromStorage();
  if (equipped?.colorPrimary) {
    applyThemeCssVars(equipped, mode);
    return true;
  }

  return hadSnapshot;
}
