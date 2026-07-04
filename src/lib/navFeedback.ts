// Navigation feedback utilities - haptic and sound effects

import { getSoundSettings, premiumSounds } from '@/lib/premiumSounds';

// Haptic feedback for mobile devices
export const triggerHaptic = (style: 'light' | 'medium' | 'heavy' = 'light') => {
  if (!('vibrate' in navigator)) return;

  const patterns: Record<string, number | number[]> = {
    light: 10,
    medium: 20,
    heavy: [30, 10, 30],
  };

  try {
    navigator.vibrate(patterns[style]);
  } catch {
    // Vibration not supported or permission denied
  }
};

// Subtle UI tap through the shared sound mix (respects mute + volume settings)
export const playNavSound = () => {
  const settings = getSoundSettings();
  if (!settings.master || !settings.ui) return;
  premiumSounds.tap();
};

// Combined feedback for nav actions
export const triggerNavFeedback = () => {
  triggerHaptic('light');
  playNavSound();
};
