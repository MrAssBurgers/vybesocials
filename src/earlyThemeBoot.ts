/**
 * Run equipped theme boot immediately after base CSS loads, before the App module graph.
 */
import { ensureBootThemeApplied } from '@/lib/bootThemeApply';
import { getEquippedThemeTokens } from '@/hooks/useCustomTheme';
import { kickstartThemeHydration } from '@/lib/themeHydration';
import { reinforceSplashTheme } from '@/lib/theme/themePrepaint';
import '@/lib/signedUrlCache';

if (typeof window !== 'undefined') {
  ensureBootThemeApplied();
  kickstartThemeHydration();

  if (document.documentElement.hasAttribute('data-vybe-theme-painted')) {
    reinforceSplashTheme();
    const equipped = getEquippedThemeTokens();
    const primary = document.documentElement.style.getPropertyValue('--primary').trim();
    if (equipped?.colorPrimary && !primary) {
      ensureBootThemeApplied();
    }
  }

  (window as Window & { __VYBE_APP_LOADED__?: boolean }).__VYBE_APP_LOADED__ = true;
}
