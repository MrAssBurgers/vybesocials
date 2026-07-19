/**
 * Cross-platform NFC capability detection and error mapping.
 *
 * NFC is currently feature-flagged OFF (`NFC_ENABLED` in nfcFeature.ts).
 * When re-enabled: Android store builds prefer the native `nfc://` bridge;
 * Web NFC (NDEFReader) must not run inside the Despia WebView.
 */

import { isDespiaRuntime, isAndroidUA, isIOSUA, openAppSettings } from '@/lib/despiaBridge';
import { NFC_ENABLED } from '@/lib/nfcFeature';

export function preferNativeNfc(): boolean {
  if (!NFC_ENABLED) return false;
  return isDespiaRuntime() && (isAndroidUA() || isIOSUA());
}

/** True when any NFC path is available (native shell or Android Chrome Web NFC). */
export function isNfcSupported(): boolean {
  if (!NFC_ENABLED || typeof window === 'undefined') return false;
  if (preferNativeNfc()) return true;
  return 'NDEFReader' in window && isAndroidUA();
}

/** Web NFC is only valid outside the Despia shell (e.g. Android Chrome). */
export function isWebNfcAvailable(): boolean {
  if (!NFC_ENABLED || typeof window === 'undefined') return false;
  if (preferNativeNfc()) return false;
  return 'NDEFReader' in window && isAndroidUA();
}

export function mapNfcErrorMessage(
  error?: string | null,
  errName?: string,
): string {
  const raw = `${error || ''} ${errName || ''}`.toLowerCase();

  if (
    errName === 'NotAllowedError' ||
    raw.includes('permission') ||
    raw.includes('denied') ||
    raw.includes('declined')
  ) {
    return preferNativeNfc()
      ? 'NFC permission declined — open Settings, enable NFC for VYBE, and turn on NFC on your phone.'
      : 'NFC permission denied — allow NFC for this site in Chrome settings.';
  }

  if (
    errName === 'NotSupportedError' ||
    raw.includes('disabled') ||
    raw.includes('not enabled') ||
    raw.includes('nfc off')
  ) {
    return 'NFC is turned off — enable NFC in your phone settings (Settings → Connected devices → NFC).';
  }

  if (raw.includes('timeout')) return 'No NFC tag detected — try again or use QR.';
  if (raw.includes('not_despia')) return 'NFC requires the VYBE app.';
  if (error) return error;
  return 'NFC unavailable on this device';
}

export function isNfcPermissionError(error?: string | null, errName?: string): boolean {
  const raw = `${error || ''} ${errName || ''}`.toLowerCase();
  return (
    errName === 'NotAllowedError' ||
    raw.includes('permission') ||
    raw.includes('denied') ||
    raw.includes('declined')
  );
}

export function showNfcError(error?: string | null, errName?: string): string {
  const message = mapNfcErrorMessage(error, errName);
  if (isNfcPermissionError(error, errName) && preferNativeNfc()) {
    void openAppSettings();
  }
  return message;
}
