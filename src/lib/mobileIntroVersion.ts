/**
 * Intro dismiss version. Bump when MobileIntro UX should re-show for
 * logged-out users who already dismissed an older intro.
 * RootGate compares this to localStorage `vybe_intro_version`.
 */
export const VYBE_INTRO_VERSION = '3';

/** True when the user has finished the current intro version. */
export function hasCompletedCurrentIntro(): boolean {
  try {
    if (!localStorage.getItem('vybe_intro_seen')) return false;
    const seen = localStorage.getItem('vybe_intro_version');
    // Pre-versioning installs: keep dismissed. Explicit mismatch: re-show.
    if (seen == null) return true;
    return seen === VYBE_INTRO_VERSION;
  } catch {
    return true;
  }
}
