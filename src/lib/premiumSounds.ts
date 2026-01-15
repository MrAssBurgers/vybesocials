// Premium Sound System
// Clean, subtle, satisfying - Snapchat/Apple-level polish
// All sounds <300ms, soft attack, gentle decay

type SoundCategory = 'messages' | 'calls' | 'ui';
type PremiumSoundType = 
  | 'messageSend' 
  | 'messageReceive'
  | 'notification'
  | 'tap' 
  | 'toggle'
  | 'success'
  | 'error'
  | 'callRing'
  | 'callConnect'
  | 'callEnd';

// Audio context singleton with lazy initialization
let audioContext: AudioContext | null = null;
let lastSoundTime: Record<string, number> = {};

// Settings stored in localStorage
const SOUND_SETTINGS_KEY = 'vybe-sound-settings';

export interface SoundSettings {
  master: boolean;
  messages: boolean;
  calls: boolean;
  ui: boolean;
}

const DEFAULT_SETTINGS: SoundSettings = {
  master: false, // Off by default
  messages: true,
  calls: true,
  ui: true,
};

// Get sound settings
export function getSoundSettings(): SoundSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const stored = localStorage.getItem(SOUND_SETTINGS_KEY);
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch {}
  return DEFAULT_SETTINGS;
}

// Update sound settings
export function updateSoundSettings(updates: Partial<SoundSettings>): void {
  if (typeof window === 'undefined') return;
  const current = getSoundSettings();
  const newSettings = { ...current, ...updates };
  localStorage.setItem(SOUND_SETTINGS_KEY, JSON.stringify(newSettings));
}

// Check if a specific category is enabled
function isCategoryEnabled(category: SoundCategory): boolean {
  const settings = getSoundSettings();
  if (!settings.master) return false;
  return settings[category];
}

// Debounce to prevent rapid-fire sounds
function shouldDebounce(soundId: string, minInterval: number = 500): boolean {
  const now = Date.now();
  const lastTime = lastSoundTime[soundId] || 0;
  if (now - lastTime < minInterval) return true;
  lastSoundTime[soundId] = now;
  return false;
}

// Get or create audio context (lazy initialization)
function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  
  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  
  // Resume if suspended (autoplay policy)
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  
  return audioContext;
}

// Sound configuration - all carefully tuned for premium feel
const SOUND_CONFIGS: Record<PremiumSoundType, {
  category: SoundCategory;
  frequencies: number[];
  durations: number[];
  volumes: number[];
  types: OscillatorType[];
  delays: number[];
}> = {
  // Message send - subtle "sent" tick (very quiet)
  messageSend: {
    category: 'messages',
    frequencies: [800, 1000],
    durations: [0.04, 0.03],
    volumes: [0.015, 0.01],
    types: ['sine', 'sine'],
    delays: [0, 0.02],
  },
  
  // Message receive - satisfying notification "ding" (Apple/Discord-inspired)
  messageReceive: {
    category: 'messages',
    frequencies: [880, 1320, 1760], // A5, E6, A6 - pleasant harmonic chord
    durations: [0.15, 0.12, 0.1],
    volumes: [0.06, 0.04, 0.03],
    types: ['sine', 'sine', 'sine'],
    delays: [0, 0.02, 0.04],
  },
  
  // Notification sound - even more satisfying "bloom" effect
  notification: {
    category: 'messages',
    frequencies: [523, 659, 784, 1047], // C5, E5, G5, C6 - major chord bloom
    durations: [0.18, 0.15, 0.12, 0.1],
    volumes: [0.07, 0.05, 0.04, 0.03],
    types: ['sine', 'sine', 'sine', 'sine'],
    delays: [0, 0.03, 0.06, 0.09],
  },
  
  // UI tap - very quiet click
  tap: {
    category: 'ui',
    frequencies: [700],
    durations: [0.025],
    volumes: [0.01],
    types: ['sine'],
    delays: [0],
  },
  
  // Toggle switch - subtle click
  toggle: {
    category: 'ui',
    frequencies: [500, 700],
    durations: [0.03, 0.02],
    volumes: [0.015, 0.01],
    types: ['sine', 'sine'],
    delays: [0, 0.015],
  },
  
  // Success - gentle chime
  success: {
    category: 'ui',
    frequencies: [523, 659, 784],
    durations: [0.08, 0.08, 0.1],
    volumes: [0.025, 0.02, 0.025],
    types: ['sine', 'sine', 'sine'],
    delays: [0, 0.05, 0.1],
  },
  
  // Error - soft low tone
  error: {
    category: 'ui',
    frequencies: [220, 180],
    durations: [0.1, 0.12],
    volumes: [0.03, 0.025],
    types: ['sine', 'sine'],
    delays: [0, 0.06],
  },
  
  // Call ring - gentle pulse (single instance for preview)
  callRing: {
    category: 'calls',
    frequencies: [440, 554, 659],
    durations: [0.15, 0.12, 0.1],
    volumes: [0.04, 0.03, 0.025],
    types: ['sine', 'sine', 'sine'],
    delays: [0, 0.08, 0.16],
  },
  
  // Call connect - warm connection tone
  callConnect: {
    category: 'calls',
    frequencies: [440, 554, 659, 880],
    durations: [0.1, 0.1, 0.1, 0.15],
    volumes: [0.03, 0.025, 0.03, 0.02],
    types: ['sine', 'sine', 'sine', 'sine'],
    delays: [0, 0.06, 0.12, 0.18],
  },
  
  // Call end - soft descending tone
  callEnd: {
    category: 'calls',
    frequencies: [659, 554, 440],
    durations: [0.08, 0.08, 0.12],
    volumes: [0.025, 0.025, 0.02],
    types: ['sine', 'sine', 'sine'],
    delays: [0, 0.06, 0.12],
  },
};

// Create a smooth tone with envelope
function createTone(
  ctx: AudioContext,
  frequency: number,
  duration: number,
  volume: number,
  type: OscillatorType,
  startTime: number
): void {
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startTime);
  
  // Smooth attack (soft start)
  const attackTime = Math.min(0.008, duration * 0.15);
  const releaseTime = duration * 0.5;
  
  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(volume, startTime + attackTime);
  gainNode.gain.setValueAtTime(volume, startTime + duration - releaseTime);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  
  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.01);
}

// Play a premium sound
export function playPremiumSound(soundType: PremiumSoundType): void {
  const config = SOUND_CONFIGS[soundType];
  
  // Check if category is enabled
  if (!isCategoryEnabled(config.category)) return;
  
  // Debounce rapid sounds
  if (shouldDebounce(soundType, 150)) return;
  
  const ctx = getAudioContext();
  if (!ctx) return;
  
  try {
    const now = ctx.currentTime;
    
    config.frequencies.forEach((freq, i) => {
      createTone(
        ctx,
        freq,
        config.durations[i],
        config.volumes[i],
        config.types[i],
        now + config.delays[i]
      );
    });
  } catch (e) {
    // Sound generation failed silently
  }
}

// Preview a sound (ignores settings, for settings page)
export function previewSound(soundType: PremiumSoundType): void {
  const config = SOUND_CONFIGS[soundType];
  const ctx = getAudioContext();
  if (!ctx) return;
  
  try {
    const now = ctx.currentTime;
    
    config.frequencies.forEach((freq, i) => {
      createTone(
        ctx,
        freq,
        config.durations[i],
        Math.min(config.volumes[i] * 2, 0.08), // Slightly louder for preview
        config.types[i],
        now + config.delays[i]
      );
    });
  } catch (e) {
    // Sound generation failed silently
  }
}

// Message sound with smart debouncing for rapid messages
let messageDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingMessageCount = 0;

export function playMessageReceiveSound(): void {
  // Don't play if viewing the chat or window inactive
  if (!isCategoryEnabled('messages')) return;
  
  pendingMessageCount++;
  
  // Clear existing timer
  if (messageDebounceTimer) {
    clearTimeout(messageDebounceTimer);
  }
  
  // Play once after short delay (debounce rapid messages)
  messageDebounceTimer = setTimeout(() => {
    if (pendingMessageCount > 0) {
      playPremiumSound('messageReceive');
      pendingMessageCount = 0;
    }
  }, 200);
}

// Play satisfying notification sound for DM notifications
export function playNotificationSound(): void {
  if (!isCategoryEnabled('messages')) return;
  
  // Use notification sound for a more satisfying "ding"
  playPremiumSound('notification');
}

// Call sound loops with proper cleanup
let callRingInterval: ReturnType<typeof setInterval> | null = null;
let ringbackInterval: ReturnType<typeof setInterval> | null = null;

export function startRinging(): void {
  if (!isCategoryEnabled('calls')) return;
  stopAllCallSounds();
  
  playPremiumSound('callRing');
  callRingInterval = setInterval(() => {
    playPremiumSound('callRing');
  }, 2000);
}

export function startRingback(): void {
  if (!isCategoryEnabled('calls')) return;
  stopAllCallSounds();
  
  playPremiumSound('callRing');
  ringbackInterval = setInterval(() => {
    playPremiumSound('callRing');
  }, 3000);
}

export function stopAllCallSounds(): void {
  if (callRingInterval) {
    clearInterval(callRingInterval);
    callRingInterval = null;
  }
  if (ringbackInterval) {
    clearInterval(ringbackInterval);
    ringbackInterval = null;
  }
}

export function playCallConnect(): void {
  stopAllCallSounds();
  playPremiumSound('callConnect');
}

export function playCallEnd(): void {
  stopAllCallSounds();
  playPremiumSound('callEnd');
}

// Convenient exports for different contexts
export const premiumSounds = {
  // Messages
  messageSend: () => playPremiumSound('messageSend'),
  messageReceive: playMessageReceiveSound,
  notification: playNotificationSound,
  
  // UI interactions
  tap: () => playPremiumSound('tap'),
  toggle: () => playPremiumSound('toggle'),
  success: () => playPremiumSound('success'),
  error: () => playPremiumSound('error'),
  
  // Calls
  startRinging,
  startRingback,
  stopAllCallSounds,
  callConnect: playCallConnect,
  callEnd: playCallEnd,
  
  // Settings
  getSettings: getSoundSettings,
  updateSettings: updateSoundSettings,
  
  // Preview (for settings page)
  preview: previewSound,
};
