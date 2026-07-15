/**
 * Platform signals for choosing popup vs redirect vs Despia oauth://.
 * Do not use screen width alone.
 */
import { isDespiaRuntime, isNativeAppShell } from '@/lib/despiaBridge';
import {
  isAppleTouchDevice,
  isEmbeddedAppleWebView,
  isMobileSafariBrowser,
  isStandaloneApp,
} from '@/lib/deviceDetection';
import { isNativePlatform } from '@/lib/capacitor';

export type OAuthStrategy = 'despia' | 'capacitor-native' | 'redirect' | 'popup';

export type OAuthPlatformInfo = {
  strategy: OAuthStrategy;
  isIOS: boolean;
  isAndroidWebView: boolean;
  isStandalonePWA: boolean;
  isDespia: boolean;
  isCapacitorNative: boolean;
  isMobileSafari: boolean;
  supportsReliablePopup: boolean;
};

export function detectOAuthPlatform(
  opts?: {
    despia?: boolean;
    capacitor?: boolean;
    ua?: string;
    standalone?: boolean;
  },
): OAuthPlatformInfo {
  const ua =
    opts?.ua ??
    (typeof navigator !== 'undefined' ? navigator.userAgent || '' : '');
  const isDespia = opts?.despia ?? isDespiaRuntime();
  const isCapacitorNative = opts?.capacitor ?? isNativePlatform;
  const isStandalonePWA = opts?.standalone ?? isStandaloneApp();
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || isAppleTouchDevice();
  const isAndroidWebView =
    /Android/i.test(ua) && (/; wv\)/i.test(ua) || /Version\/4\.0.*Chrome/i.test(ua));
  const isMobileSafari = isMobileSafariBrowser();
  const embeddedWebView = isEmbeddedAppleWebView() || isNativeAppShell();

  const supportsReliablePopup =
    !isIOS &&
    !isAndroidWebView &&
    !isStandalonePWA &&
    !isDespia &&
    !isCapacitorNative &&
    !isMobileSafari &&
    !embeddedWebView;

  let strategy: OAuthStrategy = 'popup';
  if (isDespia) strategy = 'despia';
  else if (isCapacitorNative) strategy = 'capacitor-native';
  else if (
    isIOS ||
    isAndroidWebView ||
    isStandalonePWA ||
    isMobileSafari ||
    !supportsReliablePopup
  ) {
    strategy = 'redirect';
  }

  return {
    strategy,
    isIOS,
    isAndroidWebView,
    isStandalonePWA,
    isDespia,
    isCapacitorNative,
    isMobileSafari,
    supportsReliablePopup,
  };
}

export function shouldUseRedirectOAuthPlatform(info = detectOAuthPlatform()): boolean {
  return info.strategy === 'redirect';
}
