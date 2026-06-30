import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { usePremiumStatus } from './usePremiumStatus';
import { isNativePerfMode } from '@/lib/nativePerfMode';
import { generateVybeTheme } from '@/lib/aiThemeGeneration';
import { getStoredAuthUserId } from '@/lib/legacyAuthStorage';
import { prefetchAndApplyUserTheme, persistEquippedThemeTokens, syncEquippedThemeToAccount } from '@/lib/themeHydration';
import { BOOT_SNAPSHOT_KEY, THEME_SNAPSHOT_KEYS } from '@/lib/theme/themePrepaint';
import { collectThemeUserContext, type ThemeUserContext } from '@/lib/theme/themeUserContext';
import type { VybeDNA } from '@/hooks/useVybeDNA';

// Free-tier cooldown for AI theme generation (Pro users skip this)
const AI_THEME_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours
const AI_THEME_COOLDOWN_KEY = 'vybe-ai-theme-last-gen';

export interface ThemeTokens {
  colorPrimary: string;
  colorSecondary: string;
  colorAccent: string;
  bgMain: string;
  bgCard: string;
  bgGradientFrom?: string;
  bgGradientTo?: string;
  bgGradientMid?: string;
  sidebarBg?: string;
  navBg?: string;
  inputBg?: string;
  inputText?: string; // Text color inside input fields for proper contrast
  buttonText?: string; // Text color on primary buttons for proper contrast
  glassBg?: string;
  glassBorder?: string;
  textPrimary: string;
  textSecondary: string;
  borderColor?: string;
  borderRadius: 'small' | 'medium' | 'large';
  mode: 'light' | 'dark';
  themeName?: string;
  // Neon/accent colors for highlights
  neonPink?: string;
  neonPurple?: string;
  neonCyan?: string;
  // Animation settings
  animationSpeed?: 'slow' | 'normal' | 'fast' | 'instant';
  animationStyle?: 'smooth' | 'bouncy' | 'snappy' | 'none';
  // Background image and effects (AI-generated)
  backgroundImage?: string; // URL to background image
  backgroundEffect?: 'none' | 'particles' | 'stars' | 'bubbles' | 'aurora' | 'rain' | 'snow' | 'fireflies' | 'geometric';
  backgroundOverlay?: string; // HSL color for overlay
  backgroundBlur?: number; // 0-20 blur amount
  backgroundOpacity?: number; // 0-100 opacity of bg image
}

export const THEME_PRESETS: Record<string, ThemeTokens> = {
  classic: {
    colorPrimary: '330 100% 60%',
    colorSecondary: '240 10% 12%',
    colorAccent: '185 100% 50%',
    bgMain: '240 10% 4%',
    bgCard: '240 10% 6%',
    bgGradientFrom: '240 10% 4%',
    bgGradientMid: '240 10% 8%',
    bgGradientTo: '240 10% 4%',
    glassBg: '240 10% 10%',
    glassBorder: '240 10% 20%',
    sidebarBg: '240 10% 6%',
    navBg: '240 10% 6%',
    inputBg: '240 10% 18%',
    textPrimary: '0 0% 98%',
    textSecondary: '240 5% 55%',
    borderColor: '240 10% 18%',
    borderRadius: 'medium',
    mode: 'dark',
    neonPink: '330 100% 60%',
    neonPurple: '280 100% 60%',
    neonCyan: '185 100% 50%',
  },
  midnight: {
    colorPrimary: '220 90% 56%',
    colorSecondary: '230 25% 18%',
    colorAccent: '200 100% 62%',
    bgMain: '230 25% 8%',
    bgCard: '230 20% 14%',
    bgGradientFrom: '230 25% 6%',
    bgGradientMid: '230 30% 12%',
    bgGradientTo: '230 25% 8%',
    glassBg: '230 20% 12%',
    glassBorder: '230 20% 22%',
    sidebarBg: '230 25% 10%',
    navBg: '230 25% 10%',
    inputBg: '230 20% 20%',
    textPrimary: '210 40% 98%',
    textSecondary: '215 20% 65%',
    borderColor: '230 20% 22%',
    borderRadius: 'medium',
    mode: 'dark',
    neonPink: '220 90% 56%',
    neonPurple: '260 80% 60%',
    neonCyan: '200 100% 62%',
  },
  neon: {
    colorPrimary: '330 100% 60%',
    colorSecondary: '280 100% 50%',
    colorAccent: '160 100% 50%',
    bgMain: '270 50% 6%',
    bgCard: '270 40% 12%',
    bgGradientFrom: '280 60% 4%',
    bgGradientMid: '300 50% 10%',
    bgGradientTo: '260 50% 6%',
    glassBg: '270 40% 15%',
    glassBorder: '280 50% 30%',
    sidebarBg: '270 45% 10%',
    navBg: '270 45% 10%',
    inputBg: '270 35% 18%',
    textPrimary: '0 0% 100%',
    textSecondary: '270 30% 70%',
    borderColor: '280 50% 30%',
    borderRadius: 'large',
    mode: 'dark',
    neonPink: '330 100% 65%',
    neonPurple: '280 100% 60%',
    neonCyan: '160 100% 50%',
  },
  soft: {
    colorPrimary: '340 65% 55%',
    colorSecondary: '200 50% 85%',
    colorAccent: '160 50% 50%',
    bgMain: '30 30% 96%',
    bgCard: '0 0% 100%',
    bgGradientFrom: '30 30% 98%',
    bgGradientMid: '340 20% 96%',
    bgGradientTo: '30 30% 96%',
    glassBg: '0 0% 100%',
    glassBorder: '240 5% 90%',
    sidebarBg: '0 0% 98%',
    navBg: '0 0% 98%',
    inputBg: '240 5% 92%',
    textPrimary: '240 10% 20%',
    textSecondary: '240 5% 50%',
    borderColor: '240 5% 85%',
    borderRadius: 'large',
    mode: 'light',
    neonPink: '340 65% 55%',
    neonPurple: '280 50% 60%',
    neonCyan: '160 50% 50%',
  },
  cyberpunk: {
    colorPrimary: '55 100% 50%',
    colorSecondary: '330 100% 50%',
    colorAccent: '180 100% 50%',
    bgMain: '240 20% 4%',
    bgCard: '240 15% 10%',
    bgGradientFrom: '240 25% 3%',
    bgGradientMid: '280 30% 8%',
    bgGradientTo: '240 20% 5%',
    glassBg: '240 20% 12%',
    glassBorder: '55 80% 30%',
    sidebarBg: '240 18% 8%',
    navBg: '240 18% 8%',
    inputBg: '240 15% 16%',
    textPrimary: '55 100% 90%',
    textSecondary: '55 50% 60%',
    borderColor: '55 60% 25%',
    borderRadius: 'small',
    mode: 'dark',
    neonPink: '330 100% 55%',
    neonPurple: '280 100% 60%',
    neonCyan: '180 100% 50%',
  },
  minimal: {
    colorPrimary: '0 0% 15%',
    colorSecondary: '0 0% 85%',
    colorAccent: '0 0% 40%',
    bgMain: '0 0% 100%',
    bgCard: '0 0% 98%',
    bgGradientFrom: '0 0% 100%',
    bgGradientMid: '0 0% 98%',
    bgGradientTo: '0 0% 100%',
    glassBg: '0 0% 100%',
    glassBorder: '0 0% 90%',
    sidebarBg: '0 0% 98%',
    navBg: '0 0% 98%',
    inputBg: '0 0% 95%',
    textPrimary: '0 0% 10%',
    textSecondary: '0 0% 45%',
    borderColor: '0 0% 88%',
    borderRadius: 'small',
    mode: 'light',
    neonPink: '0 0% 30%',
    neonPurple: '0 0% 40%',
    neonCyan: '0 0% 50%',
  },
};

const BORDER_RADIUS_MAP = {
  small: '0.375rem',
  medium: '0.75rem',
  large: '1.25rem',
};

export function useUserTheme() {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: ['user-theme', userId],
    queryFn: async () => {
      if (!userId) return null;

      const { data, error } = await db
        .from('user_themes')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!userId,
    staleTime: 60000,
    initialData: () => {
      if (!userId) return undefined;
      const tokens = getEquippedThemeTokens(userId);
      if (!tokens?.colorPrimary) return undefined;
      return {
        user_id: userId,
        is_active: true,
        theme_tokens: tokens,
      };
    },
  });
}

const EQUIPPED_THEME_KEY = 'vybe-equipped-theme';
const EQUIPPED_THEME_ID_KEY = 'vybe-equipped-theme-id';
/** @deprecated use EQUIPPED_THEME_KEY — kept for reads during migration */
const LEGACY_EQUIPPED_KEY = 'vybe-custom-theme';

/** Read the user's actively equipped theme tokens (localStorage is the live source). */
export function getEquippedThemeTokens(userId?: string | null): ThemeTokens | null {
  try {
    const uid =
      userId ??
      getStoredAuthUserId() ??
      (typeof localStorage !== 'undefined' ? localStorage.getItem('vybe-theme-user-id') : null);

    const keys: string[] = [];
    if (uid) keys.push(`${EQUIPPED_THEME_KEY}:${uid}`);
    keys.push(EQUIPPED_THEME_KEY, LEGACY_EQUIPPED_KEY);

    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as ThemeTokens;
      if (parsed?.colorPrimary) return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/** Persist + apply the equipped theme — single entry point for equip/save. */
export function equipTheme(
  tokens: ThemeTokens,
  options?: { themeId?: string | null; silent?: boolean; skipAutoSave?: boolean },
) {
  const uid = getStoredAuthUserId();
  persistEquippedThemeTokens(uid, tokens);
  if (options?.themeId) {
    localStorage.setItem(EQUIPPED_THEME_ID_KEY, options.themeId);
  } else if (options?.themeId === null) {
    localStorage.removeItem(EQUIPPED_THEME_ID_KEY);
  }
  if (uid && !options?.skipAutoSave) {
    syncEquippedThemeToAccount(uid, tokens, { themeName: tokens.themeName });
  }
  _lastAppliedThemeHash = '';
  const resolved = document.documentElement.classList.contains('light') ? 'light' : 'dark';
  applyThemeTokens(adaptThemeToMode(tokens, resolved));
  if (!options?.silent) {
    window.dispatchEvent(new CustomEvent('vybeThemeEquipped', { detail: tokens }));
  }
}

let _lastAppliedThemeHash = '';
function themeApplyHash(tokens: ThemeTokens, mode: 'dark' | 'light'): string {
  return `${mode}:${tokens.colorPrimary}:${tokens.bgMain}:${tokens.colorAccent}:${tokens.themeName ?? ''}`;
}

/** Skip redundant re-apply when boot already painted the equipped theme. */
export function markThemeAppliedFromBoot(tokens: ThemeTokens): void {
  const mode = document.documentElement.classList.contains('light') ? 'light' : 'dark';
  _lastAppliedThemeHash = themeApplyHash(adaptThemeToMode(tokens, mode), mode);
}

export function resetThemeApplyState(): void {
  _lastAppliedThemeHash = '';
}


// Preview lock — while a theme designer/preview is open, the previewed tokens
// own the CSS variables. Without this, useApplyUserTheme's MutationObserver
// (mode class changes) and query refetches re-apply the OLD saved theme over
// the preview, causing a visible flicker back to the previous theme.
let _themePreviewLock = false;
export function setThemePreviewLock(locked: boolean) { _themePreviewLock = locked; }
export function isThemePreviewLocked() { return _themePreviewLock; }

let _isSavingTheme = false;
export function isSavingTheme() { return _isSavingTheme; }

export function useSaveTheme() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      themeTokens,
      themeName,
      basePreset,
      silent = false,
    }: {
      themeTokens: ThemeTokens;
      themeName: string;
      basePreset: string;
      silent?: boolean;
    }) => {
      const userId = user?.id;
      if (!userId) throw new Error('Not authenticated');

      _isSavingTheme = true;

      const payload = {
        user_id: userId,
        theme_name: themeName,
        theme_tokens: themeTokens as any,
        base_preset: basePreset,
        is_active: true,
        updated_at: new Date().toISOString(),
      };

      const { error } = await db
        .from('user_themes')
        .upsert(payload, {
          onConflict: 'user_id',
        });

      if (error) throw error;

      // Return the saved data so onSuccess can use it for optimistic update
      return { ...payload, silent };
    },
    onSuccess: (savedData) => {
      const tokens = savedData.theme_tokens as ThemeTokens;
      // Keep equipped tokens in localStorage so navigation/refetches can't swap themes
      equipTheme(tokens, { themeId: null, silent: true, skipAutoSave: true });

      queryClient.setQueryData(['user-theme', user?.id], (old: any) => ({
        ...old,
        ...savedData,
      }));
      queryClient.invalidateQueries({ queryKey: ['user-theme'] });
      if (!(savedData as any).silent) {
        toast.success('Theme saved!');
      }
      setTimeout(() => { _isSavingTheme = false; }, 500);
    },
    onError: (error: any) => {
      _isSavingTheme = false;
      console.error('Failed to save theme:', error);
      toast.error('Failed to save theme');
    },
  });
}

export function useResetTheme() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const userId = user?.id;
      if (!userId) throw new Error('Not authenticated');

      const { error } = await db
        .from('user_themes')
        .delete()
        .eq('user_id', userId);

      if (error) throw error;
      
      // Reset fonts to defaults
      localStorage.removeItem('vybe-font-body');
      localStorage.removeItem('vybe-font-display');
      localStorage.removeItem('vybe-anim-speed');
      localStorage.removeItem('vybe-anim-style');
      localStorage.removeItem('vybe-custom-animations');
      
      // Reset font CSS variables to defaults
      const root = document.documentElement;
      root.style.removeProperty('--font-body');
      root.style.removeProperty('--font-display');
      root.style.fontFamily = 'system-ui, sans-serif';
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-theme'] });
      localStorage.removeItem(EQUIPPED_THEME_KEY);
      localStorage.removeItem(LEGACY_EQUIPPED_KEY);
      localStorage.removeItem(EQUIPPED_THEME_ID_KEY);
      _lastAppliedThemeHash = '';
      applyThemeTokens(THEME_PRESETS.classic);
      toast.success('Theme reset to default');
    },
    onError: (error: any) => {
      console.error('Failed to reset theme:', error);
      toast.error('Failed to reset theme');
    },
  });
}

export function useGenerateTheme() {
  const { isPremium } = usePremiumStatus();
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      prompt,
      typedPrompt,
      basePreset = 'classic',
      selectedVibe,
      interests,
      selectedFont,
      selectedAnimation,
      userContext: userContextOverride,
    }: {
      prompt: string;
      typedPrompt?: string;
      basePreset?: string;
      selectedVibe?: string | null;
      interests?: string[];
      selectedFont?: string | null;
      selectedAnimation?: { speed?: string; style?: string } | null;
      userContext?: ThemeUserContext | null;
    }) => {
      // Free-tier cooldown: 1 AI theme generation per 24h.
      // Pro users skip this entirely.
      if (!isPremium) {
        const lastGenStr = localStorage.getItem(AI_THEME_COOLDOWN_KEY);
        const lastGen = lastGenStr ? parseInt(lastGenStr, 10) : 0;
        const elapsed = Date.now() - lastGen;
        if (lastGen && elapsed < AI_THEME_COOLDOWN_MS) {
          const hoursLeft = Math.ceil((AI_THEME_COOLDOWN_MS - elapsed) / (60 * 60 * 1000));
          throw new Error(
            `Free plan: 1 AI theme per day. Try again in ${hoursLeft}h, or upgrade to VYBE Pro for unlimited.`
          );
        }
      }

      const dna = user?.id
        ? queryClient.getQueryData<VybeDNA>(['vybe-dna', user.id])
        : undefined;
      const equipped = getEquippedThemeTokens(user?.id);
      const userContext =
        userContextOverride ??
        collectThemeUserContext({
          profile,
          dna,
          equippedTheme: equipped,
        });

      const result = await generateVybeTheme({
        prompt,
        typedPrompt,
        basePreset,
        selectedVibe,
        interests,
        selectedFont,
        selectedAnimation,
        userContext,
      });

      // Stamp cooldown for free users on success (any source)
      if (!isPremium) {
        localStorage.setItem(AI_THEME_COOLDOWN_KEY, String(Date.now()));
      }

      if (result.aiFallback && result.notice) {
        toast.message(result.notice, { duration: 7000 });
      } else if (result.source === 'local' && result.notice) {
        toast.message(result.notice, { duration: 6000 });
      } else if (result.source === 'prompt' || result.source === 'brand') {
        toast.success(`Theme matched: ${(result.theme as { themeName?: string }).themeName || 'Your VYBE'}`);
      } else if (result.source === 'client' || result.source === 'cloud') {
        toast.success('Theme generated');
      }

      return sanitizeThemeTokens(result.theme as ThemeTokens & { themeName: string });
    },
    onError: (error: any) => {
      console.error('Failed to generate theme:', error);
      const msg = error?.message || '';
      if (msg.includes('Free plan')) {
        toast.error(msg);
      } else if (msg.includes('Rate limit')) {
        toast.error('Too many requests. Please wait a moment.');
      } else if (msg.includes('credits')) {
        toast.error('AI credits exhausted. Please add funds.');
      } else if (msg.includes('GEMINI_API_KEY') || msg.includes('VYBE AI') || msg.includes('API key')) {
        toast.error(msg);
      } else {
        toast.error(msg || 'Failed to generate theme. Try again.');
      }
    },
  });
}

// Helper to safely get HSL value with fallback
function safeHSL(value: string | undefined, fallback: string): string {
  if (!value || typeof value !== 'string') return fallback;
  // Basic validation - should have at least a number
  const trimmed = value.trim();
  if (!trimmed || !/\d/.test(trimmed)) return fallback;
  return trimmed;
}

// Helper to adjust HSL lightness
function adjustLightness(hsl: string, amount: number): string {
  try {
    const parts = hsl.split(' ');
    if (parts.length >= 3) {
      const lightness = parseFloat(parts[2].replace('%', ''));
      if (isNaN(lightness)) return hsl;
      const newLightness = Math.max(0, Math.min(100, lightness + amount));
      return `${parts[0]} ${parts[1]} ${newLightness}%`;
    }
  } catch {
    // Return original if parsing fails
  }
  return hsl;
}

function parseHSLParts(hsl: string): { h: string; s: string; l: number } | null {
  const parts = hsl.trim().split(/\s+/);
  if (parts.length < 3) return null;
  const l = parseFloat(parts[2].replace('%', ''));
  if (Number.isNaN(l)) return null;
  return { h: parts[0], s: parts[1], l };
}

function clampHSLLightness(hsl: string | undefined, min: number, max: number, fallback: string): string {
  const value = safeHSL(hsl, fallback);
  const parts = parseHSLParts(value);
  if (!parts) return fallback;
  const clamped = Math.max(min, Math.min(max, parts.l));
  return `${parts.h} ${parts.s} ${clamped}%`;
}

function isAchromaticHsl(hsl: string | undefined): boolean {
  const parts = parseHSLParts(safeHSL(hsl, ''));
  if (!parts) return false;
  const sat = parseFloat(parts.s.replace('%', ''));
  return Number.isFinite(sat) && sat < 10;
}

function clampPrimaryHsl(
  value: string | undefined,
  mode: 'light' | 'dark',
  fallback: string,
): string {
  if (isAchromaticHsl(value)) {
    return safeHSL(value, fallback);
  }
  return clampHSLLightness(
    value,
    mode === 'dark' ? 42 : 32,
    mode === 'dark' ? 72 : 58,
    fallback,
  );
}

const VALID_BG_EFFECTS = new Set<ThemeTokens['backgroundEffect']>([
  'none', 'particles', 'stars', 'bubbles', 'aurora', 'rain', 'snow', 'fireflies', 'geometric',
]);

/**
 * Clamp AI-generated palettes so text, borders, and surfaces stay readable on every device.
 */
export function sanitizeThemeTokens(tokens: ThemeTokens): ThemeTokens {
  const mode: 'light' | 'dark' = tokens.mode === 'light' ? 'light' : 'dark';
  const sanitized: ThemeTokens = { ...tokens, mode };

  if (mode === 'dark') {
    sanitized.bgMain = clampHSLLightness(tokens.bgMain, 2, 12, '240 10% 4%');
    sanitized.bgCard = clampHSLLightness(tokens.bgCard, 4, 16, '240 10% 6%');
    sanitized.textPrimary = clampHSLLightness(tokens.textPrimary, 88, 98, '0 0% 98%');
    sanitized.textSecondary = clampHSLLightness(tokens.textSecondary, 52, 72, '240 5% 65%');
    sanitized.borderColor = clampHSLLightness(tokens.borderColor, 14, 30, '240 10% 20%');
    sanitized.glassBorder = clampHSLLightness(tokens.glassBorder, 16, 34, sanitized.borderColor);
    sanitized.glassBg = clampHSLLightness(tokens.glassBg, 4, 18, sanitized.bgCard);
    sanitized.inputBg = clampHSLLightness(tokens.inputBg, 6, 20, sanitized.bgCard);
    sanitized.inputText = clampHSLLightness(tokens.inputText, 88, 98, sanitized.textPrimary);
    sanitized.sidebarBg = clampHSLLightness(tokens.sidebarBg, 4, 16, sanitized.bgCard);
    sanitized.navBg = clampHSLLightness(tokens.navBg, 4, 16, sanitized.bgCard);
    sanitized.colorPrimary = clampPrimaryHsl(tokens.colorPrimary, 'dark', '330 100% 60%');
  } else {
    sanitized.bgMain = clampHSLLightness(tokens.bgMain, 92, 100, '0 0% 98%');
    sanitized.bgCard = clampHSLLightness(tokens.bgCard, 96, 100, '0 0% 100%');
    sanitized.textPrimary = clampHSLLightness(tokens.textPrimary, 8, 22, '240 10% 12%');
    sanitized.textSecondary = clampHSLLightness(tokens.textSecondary, 32, 48, '240 5% 45%');
    sanitized.borderColor = clampHSLLightness(tokens.borderColor, 76, 90, '240 5% 85%');
    sanitized.glassBorder = clampHSLLightness(tokens.glassBorder, 72, 90, sanitized.borderColor);
    sanitized.glassBg = clampHSLLightness(tokens.glassBg, 90, 100, sanitized.bgCard);
    sanitized.inputBg = clampHSLLightness(tokens.inputBg, 88, 98, '240 5% 94%');
    sanitized.inputText = clampHSLLightness(tokens.inputText, 8, 22, sanitized.textPrimary);
    sanitized.sidebarBg = clampHSLLightness(tokens.sidebarBg, 94, 100, sanitized.bgCard);
    sanitized.navBg = clampHSLLightness(tokens.navBg, 94, 100, sanitized.bgCard);
    sanitized.colorPrimary = clampPrimaryHsl(tokens.colorPrimary, 'light', '330 85% 50%');
  }

  sanitized.bgGradientFrom = clampHSLLightness(tokens.bgGradientFrom, mode === 'dark' ? 2 : 92, mode === 'dark' ? 14 : 100, sanitized.bgMain);
  sanitized.bgGradientMid = clampHSLLightness(tokens.bgGradientMid, mode === 'dark' ? 4 : 94, mode === 'dark' ? 16 : 100, sanitized.bgCard);
  sanitized.bgGradientTo = clampHSLLightness(tokens.bgGradientTo, mode === 'dark' ? 2 : 92, mode === 'dark' ? 14 : 100, sanitized.bgMain);
  sanitized.colorSecondary = clampHSLLightness(tokens.colorSecondary, mode === 'dark' ? 10 : 78, mode === 'dark' ? 28 : 96, sanitized.bgCard);
  sanitized.colorAccent = clampHSLLightness(tokens.colorAccent, mode === 'dark' ? 40 : 35, mode === 'dark' ? 72 : 62, sanitized.colorPrimary);

  const primaryL = parseHSLParts(sanitized.colorPrimary)?.l ?? 50;
  sanitized.buttonText = primaryL > 55 ? '0 0% 8%' : '0 0% 100%';

  sanitized.borderRadius = ['small', 'medium', 'large'].includes(tokens.borderRadius)
    ? tokens.borderRadius
    : 'medium';

  if (!VALID_BG_EFFECTS.has(tokens.backgroundEffect)) {
    sanitized.backgroundEffect = 'none';
  } else if (isNativePerfMode() && tokens.backgroundEffect && !['none', 'stars'].includes(tokens.backgroundEffect)) {
    sanitized.backgroundEffect = 'none';
  }

  sanitized.backgroundBlur = Math.max(0, Math.min(12, tokens.backgroundBlur ?? 0));
  sanitized.backgroundOpacity = Math.max(0, Math.min(70, tokens.backgroundOpacity ?? 40));

  if (isNativePerfMode() && sanitized.animationSpeed === 'fast') {
    sanitized.animationSpeed = 'normal';
  }

  return sanitized;
}

// Helper to invert HSL lightness for mode switching (dark<->light)
function invertLightness(hsl: string): string {
  try {
    const parts = hsl.split(' ');
    if (parts.length >= 3) {
      const lightness = parseFloat(parts[2].replace('%', ''));
      if (isNaN(lightness)) return hsl;
      const inverted = 100 - lightness;
      return `${parts[0]} ${parts[1]} ${inverted}%`;
    }
  } catch {}
  return hsl;
}

// Helper to shift lightness toward light or dark range
function shiftToMode(hsl: string, targetMode: 'light' | 'dark', type: 'bg' | 'text' | 'border' | 'accent'): string {
  try {
    const parts = hsl.split(' ');
    if (parts.length < 3) return hsl;
    const h = parts[0];
    const s = parts[1];
    const l = parseFloat(parts[2].replace('%', ''));
    if (isNaN(l)) return hsl;

    let newL = l;
    if (targetMode === 'light') {
      // For light mode: backgrounds should be bright, text should be dark
      if (type === 'bg') newL = Math.max(88, Math.min(100, 100 - l * 0.15));
      else if (type === 'text') newL = Math.max(5, Math.min(35, 100 - l));
      else if (type === 'border') newL = Math.max(75, Math.min(92, 100 - l * 0.3));
      else newL = Math.max(30, Math.min(60, l)); // accents stay vivid
    } else {
      // For dark mode: backgrounds should be dark, text should be bright
      if (type === 'bg') newL = Math.max(2, Math.min(15, l * 0.15));
      else if (type === 'text') newL = Math.max(85, Math.min(98, 100 - l));
      else if (type === 'border') newL = Math.max(12, Math.min(25, l * 0.3));
      else newL = Math.max(45, Math.min(70, l)); // accents stay vivid
    }
    return `${h} ${s} ${newL}%`;
  } catch {}
  return hsl;
}

/**
 * Adapt a set of VYBE theme tokens to a target mode (dark/light).
 * Keeps the same hue/saturation palette but shifts lightness values
 * so the theme looks natural in the target mode.
 */
export function adaptThemeToMode(tokens: ThemeTokens, targetMode: 'dark' | 'light'): ThemeTokens {
  // If the theme already matches the target mode, return as-is
  if (tokens.mode === targetMode) return tokens;

  return {
    ...tokens,
    mode: targetMode,
    // Primary colors keep their hue but adjust slightly for contrast
    colorPrimary: tokens.colorPrimary, // Keep primary vibrant
    colorSecondary: shiftToMode(tokens.colorSecondary, targetMode, 'accent'),
    colorAccent: tokens.colorAccent, // Keep accent vibrant
    // Backgrounds
    bgMain: shiftToMode(tokens.bgMain, targetMode, 'bg'),
    bgCard: shiftToMode(tokens.bgCard, targetMode, 'bg'),
    bgGradientFrom: tokens.bgGradientFrom ? shiftToMode(tokens.bgGradientFrom, targetMode, 'bg') : undefined,
    bgGradientMid: tokens.bgGradientMid ? shiftToMode(tokens.bgGradientMid, targetMode, 'bg') : undefined,
    bgGradientTo: tokens.bgGradientTo ? shiftToMode(tokens.bgGradientTo, targetMode, 'bg') : undefined,
    // Glass & nav
    glassBg: tokens.glassBg ? shiftToMode(tokens.glassBg, targetMode, 'bg') : undefined,
    glassBorder: tokens.glassBorder ? shiftToMode(tokens.glassBorder, targetMode, 'border') : undefined,
    sidebarBg: tokens.sidebarBg ? shiftToMode(tokens.sidebarBg, targetMode, 'bg') : undefined,
    navBg: tokens.navBg ? shiftToMode(tokens.navBg, targetMode, 'bg') : undefined,
    inputBg: tokens.inputBg ? shiftToMode(tokens.inputBg, targetMode, 'border') : undefined,
    // Text
    textPrimary: shiftToMode(tokens.textPrimary, targetMode, 'text'),
    textSecondary: shiftToMode(tokens.textSecondary, targetMode, 'text'),
    inputText: tokens.inputText ? shiftToMode(tokens.inputText, targetMode, 'text') : undefined,
    buttonText: tokens.buttonText ? shiftToMode(tokens.buttonText, targetMode, 'text') : undefined,
    // Borders
    borderColor: tokens.borderColor ? shiftToMode(tokens.borderColor, targetMode, 'border') : undefined,
    // Neons stay vibrant
    neonPink: tokens.neonPink,
    neonPurple: tokens.neonPurple,
    neonCyan: tokens.neonCyan,
  };
}

/**
 * Apply theme tokens to CSS variables.
 * 
 * CRITICAL: This function ONLY applies UI colors and settings.
 * It NEVER touches background image CSS variables (--bg-image-url, etc.)
 * Background images are managed separately via useApplyActiveBackground.
 * 
 * @param tokens - Theme tokens to apply
 * @param options.preserveBackground - If true, don't touch any background-related CSS (default: true)
 */
export function applyThemeTokens(tokens: ThemeTokens, options?: { preserveBackground?: boolean }) {
  if (!tokens || typeof tokens !== 'object') {
    console.error('Invalid theme tokens provided');
    return;
  }

  tokens = sanitizeThemeTokens(tokens);

  // ALWAYS preserve background by default - background image is a separate setting!
  const preserveBackground = options?.preserveBackground !== false;

  try {
    const root = document.documentElement;
    
    // Default fallbacks for critical values
    const defaultDark = '240 10% 4%';
    const defaultLight = '0 0% 98%';
    const defaultPrimary = '330 100% 60%';
    const defaultText = tokens.mode === 'dark' ? '0 0% 98%' : '240 10% 20%';
    const defaultMuted = tokens.mode === 'dark' ? '240 5% 55%' : '240 5% 50%';
    const defaultBg = tokens.mode === 'dark' ? defaultDark : defaultLight;
    
    // === PRIMARY COLORS ===
    root.style.setProperty('--primary', safeHSL(tokens.colorPrimary, defaultPrimary));
    root.style.setProperty('--secondary', safeHSL(tokens.colorSecondary, '240 10% 12%'));
    root.style.setProperty('--accent', safeHSL(tokens.colorAccent, '185 100% 50%'));
    root.style.setProperty('--ring', safeHSL(tokens.colorPrimary, defaultPrimary));
    
    // === BACKGROUNDS - The main ones that need to change ===
    const bgMain = safeHSL(tokens.bgMain, defaultBg);
    const bgCard = safeHSL(tokens.bgCard, tokens.mode === 'dark' ? '240 10% 6%' : '0 0% 100%');
    
    root.style.setProperty('--background', bgMain);
    root.style.setProperty('--card', bgCard);
    root.style.setProperty('--popover', bgCard);
    
    // Gradient backgrounds
    const gradientFrom = safeHSL(tokens.bgGradientFrom, bgMain);
    const gradientMid = safeHSL(tokens.bgGradientMid, bgCard);
    const gradientTo = safeHSL(tokens.bgGradientTo, bgMain);
    // Match AI-generated UI gradients (ThemePreviewCanvas) — not just primary/secondary/accent
    root.style.setProperty('--gradient-start', gradientFrom);
    root.style.setProperty('--gradient-mid', gradientMid);
    root.style.setProperty('--gradient-end', gradientTo);
    
    // Glass effects
    const glassBg = safeHSL(tokens.glassBg, bgCard);
    const glassBorder = safeHSL(tokens.glassBorder, safeHSL(tokens.borderColor, tokens.mode === 'dark' ? '240 10% 20%' : '240 5% 90%'));
    root.style.setProperty('--glass', glassBg);
    root.style.setProperty('--glass-border', glassBorder);
    
    // Muted backgrounds
    const mutedBg = adjustLightness(bgCard, tokens.mode === 'dark' ? 5 : -5);
    root.style.setProperty('--muted', mutedBg);
    
    // === SIDEBAR ===
    const sidebarBg = safeHSL(tokens.sidebarBg, bgCard);
    const primaryHsl = safeHSL(tokens.colorPrimary, defaultPrimary);
    // Nav/chip highlights follow primary — not raw colorSecondary (often a clashing hue).
    const sidebarAccent =
      tokens.mode === 'dark'
        ? adjustLightness(primaryHsl, -38)
        : adjustLightness(primaryHsl, 36);
    root.style.setProperty('--sidebar-background', sidebarBg);
    root.style.setProperty('--sidebar-foreground', safeHSL(tokens.textPrimary, defaultText));
    root.style.setProperty('--sidebar-primary', primaryHsl);
    root.style.setProperty('--sidebar-primary-foreground', tokens.mode === 'dark' ? '0 0% 100%' : '0 0% 0%');
    root.style.setProperty('--sidebar-accent', sidebarAccent);
    root.style.setProperty('--sidebar-accent-foreground', safeHSL(tokens.textPrimary, defaultText));
    root.style.setProperty('--sidebar-border', safeHSL(tokens.borderColor, glassBorder));
    root.style.setProperty('--sidebar-ring', safeHSL(tokens.colorPrimary, defaultPrimary));
    
    // === TEXT COLORS ===
    root.style.setProperty('--foreground', safeHSL(tokens.textPrimary, defaultText));
    root.style.setProperty('--muted-foreground', safeHSL(tokens.textSecondary, defaultMuted));
    root.style.setProperty('--card-foreground', safeHSL(tokens.textPrimary, defaultText));
    root.style.setProperty('--popover-foreground', safeHSL(tokens.textPrimary, defaultText));
    root.style.setProperty('--primary-foreground', safeHSL(tokens.buttonText, tokens.mode === 'dark' ? '0 0% 100%' : '0 0% 0%'));
    root.style.setProperty('--secondary-foreground', safeHSL(tokens.textPrimary, defaultText));
    root.style.setProperty('--accent-foreground', tokens.mode === 'dark' ? '0 0% 100%' : '0 0% 0%');
    
    // === BORDERS & INPUTS ===
    const borderColor = safeHSL(tokens.borderColor, tokens.mode === 'dark' ? '240 10% 18%' : '240 5% 85%');
    const inputBg = safeHSL(tokens.inputBg, borderColor);
    const inputText = safeHSL(tokens.inputText, safeHSL(tokens.textPrimary, defaultText));
    root.style.setProperty('--border', borderColor);
    root.style.setProperty('--input', inputBg);
    root.style.setProperty('--input-foreground', inputText);
    
    // === NEON/ACCENT COLORS ===
    root.style.setProperty('--neon-pink', safeHSL(tokens.neonPink, safeHSL(tokens.colorPrimary, defaultPrimary)));
    root.style.setProperty('--neon-purple', safeHSL(tokens.neonPurple, safeHSL(tokens.colorSecondary, '280 100% 60%')));
    root.style.setProperty('--neon-cyan', safeHSL(tokens.neonCyan, safeHSL(tokens.colorAccent, '185 100% 50%')));

    // Brand stream stops for liquid text / CTA (never bg gradient vars)
    const brandPrimary = safeHSL(tokens.colorPrimary, defaultPrimary);
    const brandSecondary = safeHSL(tokens.colorSecondary, '280 100% 60%');
    const brandAccent = safeHSL(tokens.colorAccent, '185 100% 50%');
    root.style.setProperty('--vybe-brand-primary', brandPrimary);
    root.style.setProperty('--vybe-brand-secondary', brandSecondary);
    root.style.setProperty('--vybe-brand-accent', brandAccent);
    root.style.setProperty('--vybe-brand-pink', safeHSL(tokens.neonPink, brandPrimary));
    root.style.setProperty('--vybe-brand-purple', safeHSL(tokens.neonPurple, brandSecondary));
    root.style.setProperty('--vybe-brand-cyan', safeHSL(tokens.neonCyan, brandAccent));
    
    // === CHART COLORS ===
    root.style.setProperty('--chart-1', safeHSL(tokens.colorPrimary, defaultPrimary));
    root.style.setProperty('--chart-2', safeHSL(tokens.colorSecondary, '240 10% 12%'));
    root.style.setProperty('--chart-3', safeHSL(tokens.colorAccent, '185 100% 50%'));
    root.style.setProperty('--chart-4', safeHSL(tokens.neonPink, safeHSL(tokens.colorPrimary, defaultPrimary)));
    root.style.setProperty('--chart-5', safeHSL(tokens.neonCyan, safeHSL(tokens.colorAccent, '185 100% 50%')));
    
    // === BORDER RADIUS ===
    const validRadius = ['small', 'medium', 'large'].includes(tokens.borderRadius) ? tokens.borderRadius : 'medium';
    root.style.setProperty('--radius', BORDER_RADIUS_MAP[validRadius]);
    
    // === ANIMATION SETTINGS ===
    const animSpeed = tokens.animationSpeed || 'normal';
    const animStyle = tokens.animationStyle || 'smooth';
    
    const speedMap = { slow: '1.5', normal: '1', fast: '0.6', instant: '0.1' };
    root.style.setProperty('--anim-speed', speedMap[animSpeed] || '1');
    
    const easingMap = {
      smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
      bouncy: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      snappy: 'cubic-bezier(0.22, 1, 0.36, 1)',
      none: 'linear',
    };
    root.style.setProperty('--anim-easing', easingMap[animStyle] || easingMap.smooth);
    
    root.dataset.animSpeed = animSpeed;
    root.dataset.animStyle = animStyle;
    
    // === BACKGROUND IMAGE & EFFECTS ===
    // CRITICAL: Only touch background image CSS if explicitly NOT preserving background
    // This ensures changing UI colors never removes the user's background image
    if (!preserveBackground) {
      root.dataset.bgEffect = tokens.backgroundEffect || 'none';
      
      if (tokens.backgroundImage) {
        root.style.setProperty('--bg-image-url', `url(${tokens.backgroundImage})`);
        root.style.setProperty('--bg-image-opacity', String((tokens.backgroundOpacity ?? 50) / 100));
        root.style.setProperty('--bg-image-blur', `${tokens.backgroundBlur ?? 0}px`);
        root.dataset.hasBgImage = 'true';
      } else {
        root.style.removeProperty('--bg-image-url');
        root.style.removeProperty('--bg-image-opacity');
        root.style.removeProperty('--bg-image-blur');
        root.dataset.hasBgImage = 'false';
      }
      
      if (tokens.backgroundOverlay) {
        root.style.setProperty('--bg-overlay', safeHSL(tokens.backgroundOverlay, '0 0% 0%'));
      } else {
        root.style.removeProperty('--bg-overlay');
      }
    }
    // When preserveBackground is true (the default), we simply don't touch any
    // --bg-image-* variables, so the user's background image stays intact!
    
    // === LIGHT MODE SPECIFIC ===
    if (tokens.mode === 'light') {
      root.style.setProperty('--light-bg-start', gradientFrom);
      root.style.setProperty('--light-bg-mid', gradientMid);
    }
    
    // === MODE CLASS ===
    // Only set the class if it doesn't already match - avoids triggering MutationObserver loops
    const currentMode = root.classList.contains('light') ? 'light' : 'dark';
    const targetMode = tokens.mode === 'light' ? 'light' : 'dark';
    if (currentMode !== targetMode) {
      root.classList.remove('light', 'dark');
      root.classList.add(targetMode);
    }
    
    // Snapshot all the CSS variables we just set so the next page boot can
    // replay them BEFORE React mounts — eliminates the splash-screen flash
    // where the app shows preset/default colors before the user's saved
    // theme is fetched. Read by the inline script in index.html.
    try {
      const snap: Record<string, string> = {};
      for (const k of THEME_SNAPSHOT_KEYS) {
        const v = root.style.getPropertyValue(k);
        if (v) snap[k] = v.trim();
      }
      localStorage.setItem(BOOT_SNAPSHOT_KEY, JSON.stringify(snap));
      const uid = getStoredAuthUserId();
      if (uid) localStorage.setItem('vybe-theme-user-id', uid);
    } catch {
      // best-effort only
    }

    // Dispatch custom event for dynamic favicon and other theme-dependent features
    window.dispatchEvent(new CustomEvent('vybeThemeChange', { detail: tokens }));
  } catch (error) {
    console.error('Error applying theme tokens:', error);
  }
}

/**
 * Apply ONLY background image CSS variables.
 * Used by the background customizer - separate from theme colors.
 */
export function applyBackgroundImage(imageUrl: string | null, opacity?: number, blur?: number) {
  const root = document.documentElement;
  
  if (imageUrl) {
    root.style.setProperty('--bg-image-url', `url(${imageUrl})`);
    root.style.setProperty('--bg-image-opacity', String((opacity ?? 30) / 100));
    root.style.setProperty('--bg-image-blur', `${blur ?? 0}px`);
    root.dataset.hasBgImage = 'true';
  } else {
    root.style.removeProperty('--bg-image-url');
    root.style.removeProperty('--bg-image-opacity');
    root.style.removeProperty('--bg-image-blur');
    root.dataset.hasBgImage = 'false';
  }
}

// Track if we're currently applying a theme to prevent MutationObserver loops
let _isApplyingTheme = false;

export function useApplyUserTheme() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: userTheme } = useUserTheme();
  const didMountApply = useRef(false);

  const applyForMode = useCallback((resolved: 'dark' | 'light', force = false) => {
    if (_isApplyingTheme || _isSavingTheme || _themePreviewLock) return;

    let tokens = getEquippedThemeTokens(user?.id);

    // Active DB row is source of truth once loaded.
    if (userTheme?.is_active && userTheme.theme_tokens) {
      const dbTokens = userTheme.theme_tokens as unknown as ThemeTokens;
      if (dbTokens?.colorPrimary) {
        persistEquippedThemeTokens(user?.id ?? null, dbTokens);
        tokens = dbTokens;
      }
    }

    if (!tokens?.colorPrimary) return;

    const hash = themeApplyHash(tokens, resolved);
    if (!force && hash === _lastAppliedThemeHash) return;

    _isApplyingTheme = true;
    _lastAppliedThemeHash = hash;
    try {
      applyThemeTokens(adaptThemeToMode(tokens, resolved));
    } catch {
      /* ignore */
    } finally {
      setTimeout(() => { _isApplyingTheme = false; }, 50);
    }
  }, [user?.id, userTheme]);

  // Re-adapt equipped theme when light/dark mode changes — same tokens, no DB/localStorage swap
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          const resolved = document.documentElement.classList.contains('light') ? 'light' : 'dark';
          requestAnimationFrame(() => {
            _lastAppliedThemeHash = '';
            applyForMode(resolved);
          });
          break;
        }
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [applyForMode]);

  useLayoutEffect(() => {
    const resolvedMode = document.documentElement.classList.contains('light') ? 'light' : 'dark';
    const forceFirst = !didMountApply.current;
    didMountApply.current = true;
    applyForMode(resolvedMode, forceFirst);

    const uid = user?.id ?? getStoredAuthUserId();
    if (uid) {
      void prefetchAndApplyUserTheme(uid, queryClient, { timeoutMs: 6000 });
    }
  }, [userTheme, applyForMode, user?.id, queryClient]);

  // Re-apply when another tab or equipTheme updates storage
  useEffect(() => {
    const onEquipped = () => {
      _lastAppliedThemeHash = '';
      const resolved = document.documentElement.classList.contains('light') ? 'light' : 'dark';
      applyForMode(resolved);
    };
    const onStorage = (e: StorageEvent) => {
      if (
        e.key === EQUIPPED_THEME_KEY ||
        e.key === LEGACY_EQUIPPED_KEY ||
        e.key === EQUIPPED_THEME_ID_KEY
      ) {
        onEquipped();
      }
    };
    window.addEventListener('vybeThemeEquipped', onEquipped);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('vybeThemeEquipped', onEquipped);
      window.removeEventListener('storage', onStorage);
    };
  }, [applyForMode]);
}

/**
 * useApplyActiveBackground - DEPRECATED
 * Background is now managed solely by AppBackgroundProvider which applies
 * directly to document.body. This legacy hook is a no-op to prevent
 * competing background systems from conflicting.
 */
export function useApplyActiveBackground() {
  // No-op: AppBackgroundProvider is the single source of truth for backgrounds
}
