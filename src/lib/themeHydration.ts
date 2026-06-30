/**
 * Fast theme hydration — apply the user's Vybe before / without waiting on slow network.
 */
import type { QueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { getStoredAuthUserId } from '@/lib/legacyAuthStorage';
import {
  adaptThemeToMode,
  applyThemeTokens,
  equipTheme,
  getEquippedThemeTokens,
  isThemeAlreadyApplied,
  markThemeAppliedFromBoot,
  type ThemeTokens,
} from '@/hooks/useCustomTheme';
import { ensureBootThemeApplied } from '@/lib/bootThemeApply';

function themeTokenFingerprint(tokens: ThemeTokens): string {
  return [
    tokens.colorPrimary,
    tokens.colorSecondary,
    tokens.colorAccent,
    tokens.bgMain,
    tokens.themeName ?? '',
  ].join('|');
}

export const EQUIPPED_THEME_KEY = 'vybe-equipped-theme';
const LEGACY_EQUIPPED_KEY = 'vybe-custom-theme';
export const THEME_USER_ID_KEY = 'vybe-theme-user-id';

type UserThemeRow = {
  id?: string;
  user_id?: string;
  is_active?: boolean;
  theme_tokens?: ThemeTokens | Record<string, unknown>;
};

function resolvedMode(): 'dark' | 'light' {
  return document.documentElement.classList.contains('light') ? 'light' : 'dark';
}

function scopedEquippedKey(userId: string): string {
  return `${EQUIPPED_THEME_KEY}:${userId}`;
}

export function rememberThemeUserId(userId: string): void {
  try {
    localStorage.setItem(THEME_USER_ID_KEY, userId);
  } catch {
    /* ignore */
  }
}

export function readRememberedThemeUserId(): string | null {
  try {
    return localStorage.getItem(THEME_USER_ID_KEY);
  } catch {
    return null;
  }
}

/** Persist equipped tokens for instant boot (global + per-user). */
export function persistEquippedThemeTokens(userId: string | null | undefined, tokens: ThemeTokens): void {
  try {
    const json = JSON.stringify(tokens);
    localStorage.setItem(EQUIPPED_THEME_KEY, json);
    localStorage.setItem(LEGACY_EQUIPPED_KEY, json);
    if (userId) {
      localStorage.setItem(scopedEquippedKey(userId), json);
      rememberThemeUserId(userId);
    }
    localStorage.setItem('vybe-equipped-theme-updated-at', String(Date.now()));
  } catch {
    /* ignore */
  }
}

/** Fire-and-forget: keep user_themes in sync whenever a Vybe is equipped locally. */
export function syncEquippedThemeToAccount(
  userId: string,
  tokens: ThemeTokens,
  meta?: { themeName?: string; basePreset?: string },
): void {
  void (async () => {
    try {
      await db.from('user_themes').upsert(
        {
          user_id: userId,
          theme_name: meta?.themeName ?? tokens.themeName ?? 'My Vybe',
          theme_tokens: tokens as unknown as Record<string, unknown>,
          base_preset: meta?.basePreset ?? 'classic',
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );
    } catch (err) {
      console.warn('[themeHydration] auto-save equipped theme failed', err);
    }
  })();
}

function tokensFromRow(row: UserThemeRow | null | undefined): ThemeTokens | null {
  if (!row?.is_active || !row.theme_tokens) return null;
  const tokens = row.theme_tokens as ThemeTokens;
  return tokens?.colorPrimary ? tokens : null;
}

function applyTokensNow(tokens: ThemeTokens, userId?: string | null): void {
  const mode = resolvedMode();
  const adapted = adaptThemeToMode(tokens, mode);
  if (isThemeAlreadyApplied(adapted, mode)) {
    markThemeAppliedFromBoot(tokens);
    return;
  }
  applyThemeTokens(adapted);
  if (userId) persistEquippedThemeTokens(userId, tokens);
  markThemeAppliedFromBoot(tokens);
}

/** Align react-query user-theme cache with equipped localStorage (no CSS repaint). */
export function reconcileUserThemeCache(queryClient: QueryClient | undefined, userId?: string | null): void {
  if (!queryClient) return;
  const uid = userId ?? getStoredAuthUserId() ?? readRememberedThemeUserId();
  if (!uid) return;
  const row = buildInitialUserThemeRow(uid);
  if (row) queryClient.setQueryData(['user-theme', uid], row);
}

function isBootThemePainted(): boolean {
  return typeof document !== 'undefined' && document.documentElement.hasAttribute('data-vybe-theme-painted');
}

/** Run after boot splash dismisses — avoids swapping theme colors mid-splash. */
export function runAfterSplashDismiss(fn: () => void): void {
  if (typeof document === 'undefined') {
    fn();
    return;
  }
  if (!document.body.classList.contains('splash-visible')) {
    fn();
    return;
  }
  let settled = false;
  const run = () => {
    if (settled) return;
    settled = true;
    observer.disconnect();
    clearTimeout(fallback);
    requestAnimationFrame(fn);
  };
  const observer = new MutationObserver(() => {
    if (!document.body.classList.contains('splash-visible')) run();
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  const fallback = window.setTimeout(run, 8000);
}

/** Earliest theme path — sync local paint + background DB reconcile (no await). */
export function kickstartThemeHydration(queryClient?: QueryClient): void {
  const uid = getStoredAuthUserId() ?? readRememberedThemeUserId();
  hydrateThemeFromLocalCaches(queryClient, uid);
  if (uid) {
    runAfterSplashDismiss(() => {
      void prefetchAndApplyUserTheme(uid, queryClient, { timeoutMs: 6000 });
    });
  }
}

/** Apply equipped / boot snapshot / persisted react-query theme — sync, no network. */
export function hydrateThemeFromLocalCaches(queryClient?: QueryClient, userId?: string | null): boolean {
  if (typeof document === 'undefined') return false;

  const uid = userId ?? getStoredAuthUserId() ?? readRememberedThemeUserId();

  const equipped = getEquippedThemeTokens(uid ?? undefined);
  if (equipped?.colorPrimary) {
    reconcileUserThemeCache(queryClient, uid);
    if (!isBootThemePainted() || !isThemeAlreadyApplied(equipped)) {
      applyTokensNow(equipped, uid);
    } else {
      markThemeAppliedFromBoot(equipped);
    }
    return true;
  }

  if (!isBootThemePainted()) {
    ensureBootThemeApplied();
  }

  if (queryClient && uid) {
    const cached = queryClient.getQueryData(['user-theme', uid]) as UserThemeRow | undefined;
    const tokens = tokensFromRow(cached);
    if (tokens && !isThemeAlreadyApplied(tokens)) {
      applyTokensNow(tokens, uid);
      return true;
    }
  }

  return false;
}

const inflightThemePrefetch = new Map<string, Promise<boolean>>();

/** Fetch user_themes once and apply immediately (deduped per user). */
export function prefetchAndApplyUserTheme(
  userId: string,
  queryClient?: QueryClient,
  options?: { timeoutMs?: number },
): Promise<boolean> {
  const existing = inflightThemePrefetch.get(userId);
  if (existing) return existing;

  const timeoutMs = options?.timeoutMs ?? 2500;

  const task = (async () => {
    // Instant paint from local cache — never block on network.
    hydrateThemeFromLocalCaches(queryClient, userId);

    try {
      const result = await Promise.race([
        db.from('user_themes').select('*').eq('user_id', userId).maybeSingle(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('theme timeout')), timeoutMs),
        ),
      ]);

      const row = result.data as UserThemeRow | null;
      const tokens = tokensFromRow(row);
      if (!tokens) return Boolean(getEquippedThemeTokens(userId)?.colorPrimary);

      const local = getEquippedThemeTokens(userId);
      const same =
        local &&
        themeTokenFingerprint(local) === themeTokenFingerprint(tokens);

      queryClient?.setQueryData(['user-theme', userId], row);
      if (!same) {
        equipTheme(tokens, { themeId: row?.id ?? null, silent: true, skipAutoSave: true });
      } else {
        persistEquippedThemeTokens(userId, tokens);
      }
      return true;
    } catch {
      return hydrateThemeFromLocalCaches(queryClient, userId);
    } finally {
      inflightThemePrefetch.delete(userId);
    }
  })();

  inflightThemePrefetch.set(userId, task);
  return task;
}

export function buildInitialUserThemeRow(userId: string): UserThemeRow | undefined {
  const tokens = getEquippedThemeTokens(userId);
  if (!tokens?.colorPrimary) return undefined;
  return {
    user_id: userId,
    is_active: true,
    theme_tokens: tokens,
  };
}

/** Prefer equipped localStorage over stale persisted/DB rows (prevents boot theme flash). */
export function reconcileUserThemeRowWithEquipped(
  row: UserThemeRow | null | undefined,
  userId: string | undefined,
): UserThemeRow | null {
  if (!userId) return row ?? null;
  const equipped = getEquippedThemeTokens(userId);
  if (!equipped?.colorPrimary) return row ?? null;

  const equippedRow: UserThemeRow = {
    user_id: userId,
    is_active: true,
    theme_tokens: equipped,
  };

  if (!row?.theme_tokens) return equippedRow;

  const dbTokens = row.theme_tokens as ThemeTokens;
  if (themeTokenFingerprint(equipped) === themeTokenFingerprint(dbTokens)) {
    return row;
  }

  return { ...row, is_active: true, theme_tokens: equipped };
}
