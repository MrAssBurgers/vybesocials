import { isCameraSafeMode } from '@/lib/cameraSafeMode';
import { isNativeAppShell } from '@/lib/despiaBridge';

export type ARProfile = 'full' | 'lite' | 'off';

const AR_DISABLED_KEY = 'vybe.ar.disabled';

function isWebGLAvailable(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
  } catch {
    return false;
  }
}

/** User/session opt-out after a failed AR init (prevents crash loops). */
export function markARDisabledForSession(): void {
  try {
    sessionStorage.setItem(AR_DISABLED_KEY, '1');
  } catch { /* ignore */ }
}

export function clearARDisabledForSession(): void {
  try {
    sessionStorage.removeItem(AR_DISABLED_KEY);
  } catch { /* ignore */ }
}

export function isARSessionDisabled(): boolean {
  try {
    return sessionStorage.getItem(AR_DISABLED_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * full — desktop: GPU MediaPipe, full overlay quality
 * lite — phones / WebViews: CPU MediaPipe on downscaled frames
 * off  — unsupported or user disabled after crash
 */
export function getARProfile(): ARProfile {
  if (typeof window === 'undefined') return 'off';
  if (isARSessionDisabled()) return 'off';

  // Phones and Despia get CPU/lite AR — WebGL is not required for MediaPipe CPU delegate.
  if (isCameraSafeMode() || isNativeAppShell()) return 'lite';

  // Desktop without WebGL still gets lite CPU tracking.
  if (!isWebGLAvailable()) return 'lite';
  return 'full';
}

export function isARSupported(): boolean {
  return getARProfile() !== 'off';
}

export function hasSnapCameraKitToken(): boolean {
  const token = import.meta.env.VITE_SNAP_CAMERA_KIT_TOKEN;
  return typeof token === 'string' && token.length > 8;
}

/** Target detection interval (ms) per profile. */
export function getARDetectIntervalMs(profile: ARProfile): number {
  if (profile === 'lite') return 48; // ~21 fps — smooth enough, saves CPU
  if (profile === 'full') return 33; // ~30 fps
  return 999;
}

/** Downscaled width for lite-mode detection (height derived from aspect). */
export function getARDetectWidth(profile: ARProfile): number | null {
  return profile === 'lite' ? 320 : null;
}
