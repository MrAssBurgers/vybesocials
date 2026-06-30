export const SPLASH_DONE_KEY = 'vybe.splash.done';

/** Skip only when splash already finished this tab session (in-app navigation). */
export function shouldSkipInitialSplash(): boolean {
  return readSplashCompleted();
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
