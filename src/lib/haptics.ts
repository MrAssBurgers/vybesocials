// Haptic Feedback System
// Provides haptic feedback for mobile devices and simulated feedback for web
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

type HapticStyle = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

const isNative = (() => {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
})();

function capacitorHaptic(style: HapticStyle): boolean {
  if (!isNative) return false;
  try {
    switch (style) {
      case 'light':
        Haptics.impact({ style: ImpactStyle.Light }); return true;
      case 'medium':
      case 'warning':
        Haptics.impact({ style: ImpactStyle.Medium }); return true;
      case 'heavy':
        Haptics.impact({ style: ImpactStyle.Heavy }); return true;
      case 'success':
        Haptics.notification({ type: NotificationType.Success }); return true;
      case 'error':
        Haptics.notification({ type: NotificationType.Error }); return true;
    }
  } catch {
    return false;
  }
  return false;
}

// Check if haptics are enabled (stored in localStorage)
function isHapticsEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const stored = localStorage.getItem('vybe-haptics-enabled');
  return stored === null ? true : stored === 'true';
}

// Check if device supports vibration
function supportsVibration(): boolean {
  return typeof navigator !== 'undefined' && 'vibrate' in navigator;
}

const isDespia = typeof navigator !== 'undefined' &&
  navigator.userAgent.toLowerCase().includes('despia');

function nativeHaptic(style: HapticStyle): boolean {
  if (!isDespia) return false;
  try {
    const map: Record<HapticStyle, string> = {
      light: 'light',
      medium: 'medium',
      heavy: 'heavy',
      success: 'success',
      warning: 'warning',
      error: 'error',
    };
    // Despia haptic scheme — silent no-op if shell doesn't handle it
    (window as any).location.href = `haptic://impact?style=${map[style]}`;
    return true;
  } catch {
    return false;
  }
}

// Haptic patterns for different feedback styles
const HAPTIC_PATTERNS: Record<HapticStyle, number | number[]> = {
  light: 10,
  medium: 25,
  heavy: 50,
  success: [20, 50, 20],
  warning: [30, 30, 30],
  error: [50, 30, 50, 30, 50],
};

// Trigger haptic feedback
export function triggerHaptic(style: HapticStyle = 'light'): void {
  if (!isHapticsEnabled()) return;
  // Native (Despia) shell first — gives real iOS/Android haptic feedback
  nativeHaptic(style);
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
  localStorage.setItem('vybe-haptics-enabled', String(enabled));
}

export function getHapticsEnabled(): boolean {
  return isHapticsEnabled();
}
