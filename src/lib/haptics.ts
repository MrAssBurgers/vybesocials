// Haptic Feedback System
// Provides haptic feedback for mobile devices and simulated feedback for web

type HapticStyle = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

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
