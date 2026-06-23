// Premium Sound System
// Soft, satisfying, modern - Apple/Snapchat-level polish
// Low-mid frequencies, soft attacks, smooth decays

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
const lastSoundTime: Record<string, number> = {};

// Track active oscillators for clean stop
const activeOscillators: Set<OscillatorNode> = new Set();

// Settings stored in localStorage
const SOUND_SETTINGS_KEY = 'vybe-sound-settings';
const CUSTOM_SOUNDS_KEY = 'vybe-custom-sounds';

export interface SoundSettings {
  master: boolean;
  messages: boolean;
  calls: boolean;
  ui: boolean;
}

export interface CustomSoundConfig {
  message_tone?: string; // URL to custom audio file
  call_ringtone?: string;
}

const DEFAULT_SETTINGS: SoundSettings = {
  master: true,
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

// Get custom sound URLs
export function getCustomSounds(): CustomSoundConfig {
  if (typeof window === 'undefined') return {};
  try {
    const stored = localStorage.getItem(CUSTOM_SOUNDS_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return {};
}

// Update custom sounds
export function updateCustomSounds(updates: Partial<CustomSoundConfig>): void {
  if (typeof window === 'undefined') return;
  const current = getCustomSounds();
  const newConfig = { ...current, ...updates };
  localStorage.setItem(CUSTOM_SOUNDS_KEY, JSON.stringify(newConfig));
}

// Clear a custom sound
export function clearCustomSound(type: 'message_tone' | 'call_ringtone'): void {
  if (typeof window === 'undefined') return;
  const current = getCustomSounds();
  delete current[type];
  localStorage.setItem(CUSTOM_SOUNDS_KEY, JSON.stringify(current));
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

// ============= REFINED SOUND CONFIGS =============
// Lower frequencies, softer attacks, reduced volumes for premium feel

const SOUND_CONFIGS: Record<PremiumSoundType, {
  category: SoundCategory;
  frequencies: number[];
  durations: number[];
  volumes: number[];
  types: OscillatorType[];
  delays: number[];
  detune?: number[]; // Subtle detuning for warmth
}> = {
  // Message send - soft "whoosh" tick (nearly silent)
  messageSend: {
    category: 'messages',
    frequencies: [600, 800], // Lower frequencies
    durations: [0.05, 0.04],
    volumes: [0.008, 0.005], // Very quiet
    types: ['sine', 'sine'],
    delays: [0, 0.015],
    detune: [0, 5],
  },
  
  // Message receive — soft VYBE pop (Snap-style, not sharp)
  messageReceive: {
    category: 'messages',
    frequencies: [784, 988, 1175],
    durations: [0.09, 0.08, 0.11],
    volumes: [0.035, 0.028, 0.022],
    types: ['sine', 'sine', 'triangle'],
    delays: [0, 0.04, 0.09],
    detune: [0, 4, -3],
  },

  // DM notification — iconic two-note VYBE chime (warm, satisfying)
  notification: {
    category: 'messages',
    frequencies: [659.25, 987.77, 1318.51],
    durations: [0.12, 0.14, 0.18],
    volumes: [0.06, 0.05, 0.035],
    types: ['sine', 'sine', 'triangle'],
    delays: [0, 0.07, 0.14],
    detune: [0, 2, -4],
  },
  
  // UI tap - near-silent tactile click
  tap: {
    category: 'ui',
    frequencies: [500], // Lower frequency
    durations: [0.03],
    volumes: [0.006], // Nearly silent
    types: ['sine'],
    delays: [0],
  },
  
  // Toggle switch - soft click
  toggle: {
    category: 'ui',
    frequencies: [400, 550], // Lower
    durations: [0.04, 0.03],
    volumes: [0.01, 0.007],
    types: ['sine', 'sine'],
    delays: [0, 0.02],
    detune: [0, 4],
  },
  
  // Success - gentle ascending chime
  success: {
    category: 'ui',
    frequencies: [440, 523, 659], // A4, C5, E5 - warm major
    durations: [0.10, 0.10, 0.14],
    volumes: [0.018, 0.015, 0.02],
    types: ['sine', 'sine', 'sine'],
    delays: [0, 0.06, 0.12],
    detune: [0, 2, -2],
  },
  
  // Error - soft low tone (not alarming)
  error: {
    category: 'ui',
    frequencies: [180, 150], // Low and soft
    durations: [0.12, 0.15],
    volumes: [0.02, 0.015],
    types: ['sine', 'sine'],
    delays: [0, 0.08],
  },
  
  // Call ring - warm harmonic pulse
  callRing: {
    category: 'calls',
    frequencies: [392, 494, 587], // G4, B4, D5 - pleasant
    durations: [0.18, 0.15, 0.12],
    volumes: [0.03, 0.025, 0.02], // Softer peaks
    types: ['sine', 'sine', 'sine'],
    delays: [0, 0.1, 0.2],
    detune: [0, 3, -3],
  },
  
  // Call connect - warm ascending tone
  callConnect: {
    category: 'calls',
    frequencies: [392, 494, 587, 784],
    durations: [0.12, 0.12, 0.12, 0.18],
    volumes: [0.025, 0.02, 0.025, 0.015],
    types: ['sine', 'sine', 'sine', 'sine'],
    delays: [0, 0.08, 0.16, 0.24],
    detune: [0, 2, 4, 0],
  },
  
  // Call end - soft descending tone
  callEnd: {
    category: 'calls',
    frequencies: [587, 494, 392],
    durations: [0.10, 0.10, 0.14],
    volumes: [0.02, 0.02, 0.015],
    types: ['sine', 'sine', 'sine'],
    delays: [0, 0.08, 0.16],
  },
};

// Create a smooth tone with soft envelope
function createTone(
  ctx: AudioContext,
  frequency: number,
  duration: number,
  volume: number,
  type: OscillatorType,
  startTime: number,
  detune: number = 0
): void {
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startTime);
  oscillator.detune.setValueAtTime(detune, startTime);
  
  // Softer attack (15ms) and smooth release
  const attackTime = Math.min(0.015, duration * 0.2);
  const releaseTime = duration * 0.6; // Longer release for smoothness
  
  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(volume, startTime + attackTime);
  gainNode.gain.setValueAtTime(volume, startTime + duration - releaseTime);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  
  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.02);
  
  // Track for cleanup
  activeOscillators.add(oscillator);
  oscillator.onended = () => activeOscillators.delete(oscillator);
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
        now + config.delays[i],
        config.detune?.[i] || 0
      );
    });
  } catch (e) {
    // Sound generation failed silently
  }
}

// Preview a sound (ignores settings, for settings page)
// Plays full, longer, louder version so user can actually hear it
export function previewSound(soundType: PremiumSoundType): void {
  const config = SOUND_CONFIGS[soundType];
  const ctx = getAudioContext();
  if (!ctx) return;
  
  try {
    const now = ctx.currentTime;
    
    // For preview, play the sound multiple times or extend durations
    // to make it clearly audible
    const previewMultiplier = soundType === 'callRing' ? 3 : 2;
    const volumeBoost = 4; // Make it much louder for preview
    const durationBoost = 3; // Make durations longer
    
    for (let repeat = 0; repeat < previewMultiplier; repeat++) {
      const repeatDelay = repeat * 0.4; // Space out repeats
      
      config.frequencies.forEach((freq, i) => {
        createTone(
          ctx,
          freq,
          config.durations[i] * durationBoost,
          Math.min(config.volumes[i] * volumeBoost, 0.15), // Much louder for preview
          config.types[i],
          now + config.delays[i] + repeatDelay,
          config.detune?.[i] || 0
        );
      });
    }
  } catch (e) {
    // Sound generation failed silently
  }
}

// Custom audio cache
const customAudioCache: Map<string, AudioBuffer> = new Map();

// Play custom audio file (for custom ringtones)
export async function playCustomAudio(url: string, loop: boolean = false): Promise<{ stop: () => void } | null> {
  const ctx = getAudioContext();
  if (!ctx) return null;
  
  try {
    let buffer = customAudioCache.get(url);
    
    if (!buffer) {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      buffer = await ctx.decodeAudioData(arrayBuffer);
      customAudioCache.set(url, buffer);
    }
    
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = loop;
    source.connect(ctx.destination);
    source.start();
    
    return {
      stop: () => {
        try {
          source.stop();
        } catch {}
      }
    };
  } catch (e) {
    console.error('Failed to play custom audio:', e);
    return null;
  }
}

// Message sound with smart debouncing for rapid messages
let messageDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingMessageCount = 0;

export function playMessageReceiveSound(): void {
  if (!isCategoryEnabled('messages')) return;
  
  pendingMessageCount++;
  
  if (messageDebounceTimer) {
    clearTimeout(messageDebounceTimer);
  }
  
  messageDebounceTimer = setTimeout(() => {
    if (pendingMessageCount > 0) {
      // Check for custom sound first
      const custom = getCustomSounds();
      if (custom.message_tone) {
        playCustomAudio(custom.message_tone);
      } else {
        playPremiumSound('messageReceive');
      }
      pendingMessageCount = 0;
    }
  }, 200);
}

// Play satisfying notification sound for DM notifications
export function playNotificationSound(): void {
  if (!isCategoryEnabled('messages')) return;
  
  // Check for custom sound first
  const custom = getCustomSounds();
  if (custom.message_tone) {
    playCustomAudio(custom.message_tone);
  } else {
    playPremiumSound('notification');
  }
}

// Call sound loops with proper cleanup
let callRingInterval: ReturnType<typeof setInterval> | null = null;
let ringbackInterval: ReturnType<typeof setInterval> | null = null;
let customRingPlayer: { stop: () => void } | null = null;

export async function startRinging(): Promise<void> {
  if (!isCategoryEnabled('calls')) return;
  stopAllCallSounds();
  
  const custom = getCustomSounds();
  if (custom.call_ringtone) {
    // Play custom ringtone in loop
    customRingPlayer = await playCustomAudio(custom.call_ringtone, true);
  } else {
    playPremiumSound('callRing');
    callRingInterval = setInterval(() => {
      playPremiumSound('callRing');
    }, 2000);
  }
}

export async function startRingback(): Promise<void> {
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
  if (customRingPlayer) {
    customRingPlayer.stop();
    customRingPlayer = null;
  }
  // Kill ALL active oscillators immediately (prevents lingering ring tones)
  activeOscillators.forEach(osc => {
    try { osc.stop(); } catch { /* already stopped */ }
  });
  activeOscillators.clear();
  
  // Also stop callSounds system (has its own oscillator tracking)
  import('./callSounds').then(m => m.stopAllCallSounds()).catch(() => {});
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
  
  // Custom sounds
  getCustomSounds,
  updateCustomSounds,
  clearCustomSound,
  playCustomAudio,
  
  // Preview (for settings page)
  preview: previewSound,
};