// Haptic Feedback System
// Provides haptic feedback for the Despia native shell, with a web vibration fallback.
import despia from 'despia-native';
import { readDevicePreference, subscribeDevicePreference, writeDevicePreference } from './devicePreferences';

type HapticStyle = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

// Check if haptics are enabled (stored in localStorage)
function isHapticsEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const stored = readDevicePreference('vybe-haptics-enabled');
  return stored === null ? true : stored === 'true';
}

// Check if device supports vibration
function supportsVibration(): boolean {
  return typeof navigator !== 'undefined' && 'vibrate' in navigator;
}

const isDespia = typeof navigator !== 'undefined' &&
  navigator.userAgent.toLowerCase().includes('despia');

// Map our 6 internal styles → Despia's 5 real schemes.
// Despia has no `medium`; light is the closest taptic.
const DESPIA_SCHEME: Record<HapticStyle, 'lighthaptic://' | 'heavyhaptic://' | 'successhaptic://' | 'warninghaptic://' | 'errorhaptic://'> = {
  light: 'lighthaptic://',
  medium: 'lighthaptic://',
  heavy: 'heavyhaptic://',
  success: 'successhaptic://',
  warning: 'warninghaptic://',
  error: 'errorhaptic://',
};

function nativeHaptic(style: HapticStyle): boolean {
  if (!isDespia) return false;
  try {
    despia(DESPIA_SCHEME[style]);
    return true;
  } catch {
    return false;
  }
}

// Haptic patterns for browser/PWA fallback (navigator.vibrate)
const HAPTIC_PATTERNS: Record<HapticStyle, number | number[]> = {
  light: 10,
  medium: 25,
  heavy: 50,
  success: [20, 50, 20],
  warning: [30, 30, 30],
  error: [50, 30, 50, 30, 50],
};

// Trigger haptic feedback
let lastHapticAt = -Infinity;
export function triggerHaptic(style: HapticStyle = 'light'): void {
  if (!isHapticsEnabled()) return;
  // Nested gesture/button handlers may both request feedback for one tap.
  const now = performance.now();
  if (now - lastHapticAt < 40) return;
  lastHapticAt = now;
  // Despia native shell — real Taptic Engine / vibrator. Short-circuit web fallback to avoid double-buzz.
  if (nativeHaptic(style)) return;
  if (!supportsVibration()) return;
  try {
    navigator.vibrate(HAPTIC_PATTERNS[style]);
  } catch {
    // Vibration not supported or permission denied
  }
}

// Specific haptic triggers for common actions
export const haptics = {
  // Light feedback for UI interactions
  tap: () => triggerHaptic('light'),
  
  // Medium feedback for confirmations
  select: () => triggerHaptic('medium'),
  
  // Strong feedback for important actions
  impact: () => triggerHaptic('heavy'),
  
  // Success feedback (like, follow, etc.)
  success: () => triggerHaptic('success'),
  
  // Warning feedback
  warning: () => triggerHaptic('warning'),
  
  // Error feedback
  error: () => triggerHaptic('error'),
  
  // Post/send action
  send: () => triggerHaptic('medium'),
  
  // Like/reaction
  like: () => triggerHaptic('light'),
  
  // Navigation
  navigate: () => triggerHaptic('light'),
};

// Settings management
export function setHapticsEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  writeDevicePreference('vybe-haptics-enabled', String(enabled));
}

export function getHapticsEnabled(): boolean {
  return isHapticsEnabled();
}

subscribeDevicePreference('vybe-haptics-enabled', () => {
  if (isHapticsEnabled()) return;
  lastHapticAt = -Infinity;
  try { if (supportsVibration()) navigator.vibrate(0); } catch { /* Unsupported device. */ }
});
