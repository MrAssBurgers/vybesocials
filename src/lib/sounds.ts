// Sound Design System - Wrapper for backward compatibility
// Now uses the premium sound system under the hood

import { premiumSounds, getSoundSettings, updateSoundSettings } from './premiumSounds';

export type SoundType = 'tap' | 'pop' | 'success' | 'send' | 'receive' | 'error' | 'navigate';

// Play a sound - routes to premium sound system
export function playSound(type: SoundType): void {
  switch (type) {
    case 'tap':
    case 'navigate':
      premiumSounds.tap();
      break;
    case 'pop':
      premiumSounds.toggle();
      break;
    case 'success':
      premiumSounds.success();
      break;
    case 'send':
      premiumSounds.messageSend();
      break;
    case 'receive':
      premiumSounds.messageReceive();
      break;
    case 'error':
      premiumSounds.error();
      break;
  }
}

// Specific sound triggers (backward compatible API)
export const sounds = {
  tap: () => premiumSounds.tap(),
  pop: () => premiumSounds.toggle(),
  success: () => premiumSounds.success(),
  send: () => premiumSounds.messageSend(),
  receive: () => premiumSounds.messageReceive(),
  error: () => premiumSounds.error(),
  navigate: () => premiumSounds.tap(),
};

// Settings management - routes to premium sound system
export function setSoundsEnabled(enabled: boolean): void {
  updateSoundSettings({ master: enabled });
}

export function getSoundsEnabled(): boolean {
  return getSoundSettings().master;
}
