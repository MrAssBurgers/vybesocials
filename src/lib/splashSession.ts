export const SPLASH_DONE_KEY = 'vybe.splash.done';

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
