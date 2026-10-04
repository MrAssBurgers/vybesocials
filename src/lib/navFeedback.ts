// Navigation feedback utilities - haptic and sound effects

import { getSoundSettings, premiumSounds } from '@/lib/premiumSounds';
import { triggerHaptic as sharedHaptic } from '@/lib/haptics';

// Haptic feedback for mobile devices
export const triggerHaptic = sharedHaptic;

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
