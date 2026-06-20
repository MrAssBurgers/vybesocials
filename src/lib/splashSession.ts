import { getCachedCurrentProfile } from '@/lib/profileCache';
import { hasStoredSupabaseSession } from '@/lib/supabaseStorageKey';
import { getWasLoggedIn } from '@/lib/wasLoggedIn';

export const SPLASH_DONE_KEY = 'vybe.splash.done';

/** Returning users — skip animated splash; hydrate auth/DMs in background. */
export function shouldSkipInitialSplash(): boolean {
  if (readSplashCompleted()) return true;
  try {
    if (getWasLoggedIn() || hasStoredSupabaseSession() || getCachedCurrentProfile()) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export function readSplashCompleted(): boolean {
  try {
    return sessionStorage.getItem(SPLASH_DONE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markSplashCompleted(): void {
  try {
    sessionStorage.setItem(SPLASH_DONE_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function isSetupRoutePath(pathname: string): boolean {
  return /^\/(onboarding|auth|login|signup|complete-profile)(\/|$)/.test(pathname);
}
