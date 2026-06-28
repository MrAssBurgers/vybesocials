// Premium Sound System — bundled WAV assets + synthesized fallback for UI micro-sounds

import { ALL_VYBE_SOUND_URLS, VYBE_SOUNDS } from './vybeSoundAssets';

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

const SOUND_SETTINGS_KEY = 'vybe-sound-settings';
const CUSTOM_SOUNDS_KEY = 'vybe-custom-sounds';

export interface SoundSettings {
  master: boolean;
  messages: boolean;
  calls: boolean;
  ui: boolean;
}

export interface CustomSoundConfig {
  message_tone?: string;
  call_ringtone?: string;
}

const DEFAULT_SETTINGS: SoundSettings = {
  master: true,
  messages: true,
  calls: true,
  ui: true,
};

const BUNDLED_BY_TYPE: Partial<Record<PremiumSoundType, string>> = {
  messageSend: VYBE_SOUNDS.dmSent,
  messageReceive: VYBE_SOUNDS.dmReceived,
  notification: VYBE_SOUNDS.dmReceived,
  success: VYBE_SOUNDS.sharePost,
  callRing: VYBE_SOUNDS.callRing,
};

export function getSoundSettings(): SoundSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const stored = localStorage.getItem(SOUND_SETTINGS_KEY);
    if (stored) return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
  } catch { /* ignore */ }
  return DEFAULT_SETTINGS;
}

export function updateSoundSettings(updates: Partial<SoundSettings>): void {
  if (typeof window === 'undefined') return;
  const current = getSoundSettings();
  localStorage.setItem(SOUND_SETTINGS_KEY, JSON.stringify({ ...current, ...updates }));
}

export function getCustomSounds(): CustomSoundConfig {
  if (typeof window === 'undefined') return {};
  try {
    const stored = localStorage.getItem(CUSTOM_SOUNDS_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return {};
}

export function updateCustomSounds(updates: Partial<CustomSoundConfig>): void {
  if (typeof window === 'undefined') return;
  const current = getCustomSounds();
  localStorage.setItem(CUSTOM_SOUNDS_KEY, JSON.stringify({ ...current, ...updates }));
}

export function clearCustomSound(type: 'message_tone' | 'call_ringtone'): void {
  if (typeof window === 'undefined') return;
  const current = getCustomSounds();
  delete current[type];
  localStorage.setItem(CUSTOM_SOUNDS_KEY, JSON.stringify(current));
}

function isCategoryEnabled(category: SoundCategory): boolean {
  const settings = getSoundSettings();
  if (!settings.master) return false;
  return settings[category];
}

const lastSoundTime: Record<string, number> = {};
function shouldDebounce(soundId: string, minInterval = 500): boolean {
  const now = Date.now();
  const lastTime = lastSoundTime[soundId] || 0;
  if (now - lastTime < minInterval) return true;
  lastSoundTime[soundId] = now;
  return false;
}

let audioContext: AudioContext | null = null;
const activeOscillators: Set<OscillatorNode> = new Set();
const audioBufferCache = new Map<string, AudioBuffer>();
let preloadPromise: Promise<void> | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  if (audioContext.state === 'suspended') void audioContext.resume();
  return audioContext;
}

/** Warm decode all bundled sounds after first user gesture. */
export function preloadVybeSounds(): Promise<void> {
  if (preloadPromise) return preloadPromise;
  preloadPromise = (async () => {
    const ctx = getAudioContext();
    if (!ctx) return;
    await Promise.all(
      ALL_VYBE_SOUND_URLS.map(async (url) => {
        if (audioBufferCache.has(url)) return;
        try {
          const res = await fetch(url);
          const buf = await res.arrayBuffer();
          const decoded = await ctx.decodeAudioData(buf.slice(0));
          audioBufferCache.set(url, decoded);
        } catch {
          /* fallback to synth on play */
        }
      }),
    );
  })();
  return preloadPromise;
}

if (typeof window !== 'undefined') {
  const warm = () => {
    void preloadVybeSounds();
    window.removeEventListener('pointerdown', warm);
    window.removeEventListener('keydown', warm);
  };
  window.addEventListener('pointerdown', warm, { once: true, passive: true });
  window.addEventListener('keydown', warm, { once: true });
}

async function loadBuffer(url: string): Promise<AudioBuffer | null> {
  const cached = audioBufferCache.get(url);
  if (cached) return cached;
  const ctx = getAudioContext();
  if (!ctx) return null;
  try {
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    const decoded = await ctx.decodeAudioData(buf.slice(0));
    audioBufferCache.set(url, decoded);
    return decoded;
  } catch {
    return null;
  }
}

export async function playCustomAudio(
  url: string,
  loop = false,
  volume = 0.92,
): Promise<{ stop: () => void } | null> {
  const ctx = getAudioContext();
  if (!ctx) return null;
  try {
    const buffer = await loadBuffer(url);
    if (!buffer) return null;
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = buffer;
    source.loop = loop;
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start();
    return {
      stop: () => {
        try {
          source.stop();
        } catch { /* already stopped */ }
      },
    };
  } catch {
    return null;
  }
}

async function playBundledUrl(
  url: string,
  category: SoundCategory,
  options?: { loop?: boolean; volume?: number; debounceMs?: number },
): Promise<{ stop: () => void } | null> {
  const debounceMs = options?.debounceMs ?? 150;
  if (shouldDebounce(url, debounceMs)) return null;

  const ok = await import('@/lib/deviceSilentMode').then((m) =>
    m.shouldPlayNotificationSound(category),
  );
  if (!ok || !isCategoryEnabled(category)) return null;

  void preloadVybeSounds();
  return playCustomAudio(url, options?.loop ?? false, options?.volume ?? 0.92);
}

function playSynth(soundType: PremiumSoundType): void {
  const configs: Record<PremiumSoundType, {
    category: SoundCategory;
    frequencies: number[];
    durations: number[];
    volumes: number[];
    types: OscillatorType[];
    delays: number[];
    detune?: number[];
  }> = {
    messageSend: { category: 'messages', frequencies: [600, 800], durations: [0.05, 0.04], volumes: [0.008, 0.005], types: ['sine', 'sine'], delays: [0, 0.015], detune: [0, 5] },
    messageReceive: { category: 'messages', frequencies: [784, 988, 1175], durations: [0.09, 0.08, 0.11], volumes: [0.035, 0.028, 0.022], types: ['sine', 'sine', 'triangle'], delays: [0, 0.04, 0.09], detune: [0, 4, -3] },
    notification: { category: 'messages', frequencies: [659.25, 987.77, 1318.51], durations: [0.12, 0.14, 0.18], volumes: [0.06, 0.05, 0.035], types: ['sine', 'sine', 'triangle'], delays: [0, 0.07, 0.14], detune: [0, 2, -4] },
    tap: { category: 'ui', frequencies: [500], durations: [0.03], volumes: [0.006], types: ['sine'], delays: [0] },
    toggle: { category: 'ui', frequencies: [400, 550], durations: [0.04, 0.03], volumes: [0.01, 0.007], types: ['sine', 'sine'], delays: [0, 0.02], detune: [0, 4] },
    success: { category: 'ui', frequencies: [440, 523, 659], durations: [0.10, 0.10, 0.14], volumes: [0.018, 0.015, 0.02], types: ['sine', 'sine', 'sine'], delays: [0, 0.06, 0.12], detune: [0, 2, -2] },
    error: { category: 'ui', frequencies: [180, 150], durations: [0.12, 0.15], volumes: [0.02, 0.015], types: ['sine', 'sine'], delays: [0, 0.08] },
    callRing: { category: 'calls', frequencies: [392, 494, 587], durations: [0.18, 0.15, 0.12], volumes: [0.03, 0.025, 0.02], types: ['sine', 'sine', 'sine'], delays: [0, 0.1, 0.2], detune: [0, 3, -3] },
    callConnect: { category: 'calls', frequencies: [392, 494, 587, 784], durations: [0.12, 0.12, 0.12, 0.18], volumes: [0.025, 0.02, 0.025, 0.015], types: ['sine', 'sine', 'sine', 'sine'], delays: [0, 0.08, 0.16, 0.24], detune: [0, 2, 4, 0] },
    callEnd: { category: 'calls', frequencies: [587, 494, 392], durations: [0.10, 0.10, 0.14], volumes: [0.02, 0.02, 0.015], types: ['sine', 'sine', 'sine'], delays: [0, 0.08, 0.16] },
  };

  const config = configs[soundType];
  void import('@/lib/deviceSilentMode').then(({ shouldPlayNotificationSound }) =>
    shouldPlayNotificationSound(config.category).then((allowed) => {
      if (!allowed || !isCategoryEnabled(config.category)) return;
      if (shouldDebounce(soundType, 150)) return;
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      config.frequencies.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = config.types[i];
        osc.frequency.setValueAtTime(freq, now);
        osc.detune.setValueAtTime(config.detune?.[i] || 0, now);
        const dur = config.durations[i];
        const vol = config.volumes[i];
        const start = now + config.delays[i];
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(vol, start + Math.min(0.015, dur * 0.2));
        gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
        osc.start(start);
        osc.stop(start + dur + 0.02);
        activeOscillators.add(osc);
        osc.onended = () => activeOscillators.delete(osc);
      });
    }),
  );
}

export function playPremiumSound(soundType: PremiumSoundType): void {
  const bundled = BUNDLED_BY_TYPE[soundType];
  if (bundled) {
    const category = soundType === 'success' ? 'ui' : soundType === 'callRing' ? 'calls' : 'messages';
    void playBundledUrl(bundled, category).catch(() => playSynth(soundType));
    return;
  }
  playSynth(soundType);
}

export function previewSound(soundType: PremiumSoundType): void {
  const bundled = BUNDLED_BY_TYPE[soundType];
  if (bundled) {
    void playCustomAudio(bundled, false, 1);
    return;
  }
  playSynth(soundType);
}

export function previewBundledSound(url: string): void {
  void playCustomAudio(url, false, 1);
}

let messageDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingMessageCount = 0;

export function playMessageReceiveSound(): void {
  if (!isCategoryEnabled('messages')) return;
  pendingMessageCount++;
  if (messageDebounceTimer) clearTimeout(messageDebounceTimer);
  messageDebounceTimer = setTimeout(() => {
    if (pendingMessageCount <= 0) return;
    const custom = getCustomSounds();
    if (custom.message_tone) {
      void playCustomAudio(custom.message_tone);
    } else {
      void playBundledUrl(VYBE_SOUNDS.dmReceived, 'messages', { debounceMs: 200 });
    }
    pendingMessageCount = 0;
  }, 200);
}

export function playNotificationSound(): void {
  if (!isCategoryEnabled('messages')) return;
  const custom = getCustomSounds();
  if (custom.message_tone) {
    void playCustomAudio(custom.message_tone);
    return;
  }
  void playBundledUrl(VYBE_SOUNDS.dmReceived, 'messages');
}

export function playLikeNotificationSound(): void {
  void playBundledUrl(VYBE_SOUNDS.postLiked, 'messages', { debounceMs: 400 });
}

export function playCommentNotificationSound(): void {
  void playBundledUrl(VYBE_SOUNDS.comment, 'messages', { debounceMs: 400 });
}

export function playVybeNotificationSound(): void {
  void playBundledUrl(VYBE_SOUNDS.vybeNotification, 'messages', { debounceMs: 300 });
}

export function playSharePostSound(): void {
  void playBundledUrl(VYBE_SOUNDS.sharePost, 'ui', { debounceMs: 250 });
}

let callRingInterval: ReturnType<typeof setInterval> | null = null;
let ringbackInterval: ReturnType<typeof setInterval> | null = null;
let customRingPlayer: { stop: () => void } | null = null;
let bundledRingPlayer: { stop: () => void } | null = null;

export async function startRinging(): Promise<void> {
  if (!isCategoryEnabled('calls')) return;
  stopAllCallSounds();

  const custom = getCustomSounds();
  if (custom.call_ringtone) {
    customRingPlayer = await playCustomAudio(custom.call_ringtone, true);
    return;
  }

  bundledRingPlayer = await playBundledUrl(VYBE_SOUNDS.callRing, 'calls', { loop: true, volume: 0.88, debounceMs: 0 });
  if (!bundledRingPlayer) {
    playPremiumSound('callRing');
    callRingInterval = setInterval(() => playPremiumSound('callRing'), 2000);
  }
}

export async function startRingback(): Promise<void> {
  if (!isCategoryEnabled('calls')) return;
  stopAllCallSounds();
  bundledRingPlayer = await playBundledUrl(VYBE_SOUNDS.callRing, 'calls', { loop: true, volume: 0.75, debounceMs: 0 });
  if (!bundledRingPlayer) {
    playPremiumSound('callRing');
    ringbackInterval = setInterval(() => playPremiumSound('callRing'), 3000);
  }
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
  if (bundledRingPlayer) {
    bundledRingPlayer.stop();
    bundledRingPlayer = null;
  }
  activeOscillators.forEach((osc) => {
    try {
      osc.stop();
    } catch { /* ignore */ }
  });
  activeOscillators.clear();
  import('./callSounds').then((m) => m.stopAllCallSounds()).catch(() => {});
}

export function playCallConnect(): void {
  stopAllCallSounds();
  playPremiumSound('callConnect');
}

export function playCallEnd(): void {
  stopAllCallSounds();
  playPremiumSound('callEnd');
}

export const premiumSounds = {
  messageSend: () => void playBundledUrl(VYBE_SOUNDS.dmSent, 'messages'),
  messageReceive: playMessageReceiveSound,
  notification: playNotificationSound,
  likeNotification: playLikeNotificationSound,
  commentNotification: playCommentNotificationSound,
  vybeNotification: playVybeNotificationSound,
  sharePost: playSharePostSound,
  tap: () => playPremiumSound('tap'),
  toggle: () => playPremiumSound('toggle'),
  success: () => playSharePostSound(),
  error: () => playPremiumSound('error'),
  startRinging,
  startRingback,
  stopAllCallSounds,
  callConnect: playCallConnect,
  callEnd: playCallEnd,
  getSettings: getSoundSettings,
  updateSettings: updateSoundSettings,
  getCustomSounds,
  updateCustomSounds,
  clearCustomSound,
  playCustomAudio,
  preview: previewSound,
  preload: preloadVybeSounds,
};
