/**
 * Run equipped theme boot immediately after base CSS loads, before the App module graph.
 */
import { ensureBootThemeApplied } from '@/lib/bootThemeApply';
import { kickstartThemeHydration } from '@/lib/themeHydration';
import '@/lib/signedUrlCache';

if (typeof window !== 'undefined') {
  ensureBootThemeApplied();
  kickstartThemeHydration();
  (window as Window & { __VYBE_APP_LOADED__?: boolean }).__VYBE_APP_LOADED__ = true;
}
