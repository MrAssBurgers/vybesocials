// Premium Sound System — bundled WAV assets + synthesized fallback for UI micro-sounds

import { ALL_VYBE_SOUND_URLS, VYBE_SOUNDS } from './vybeSoundAssets';
import { readDevicePreference, subscribeDevicePreference, writeDevicePreference } from './devicePreferences';
import { reportAccountSnapshot, reportAccountSubscribe } from './reportModerationService';
import {
  getSoundOutputBus,
  resolveBundledGain,
  resolveSynthGain,
  type SoundMixCategory,
} from './soundMix';
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
const customSoundsKey = () => {
  const uid = reportAccountSnapshot().uid;
  // Historical unowned URLs are deliberately not adopted by a new account.
  return uid ? `${CUSTOM_SOUNDS_KEY}:${uid}` : null;
};

export interface SoundSettings {
  master: boolean;
  messages: boolean;
  calls: boolean;
  ui: boolean;
  /** 0–100 perceived loudness (default 72). */
  volume: number;
}

export interface CustomSoundConfig {
  message_tone?: string;
  call_ringtone?: string;
}

const DEFAULT_SETTINGS: SoundSettings = {
  master: true,
  messages: true,
  calls: true,
  ui: false,
  volume: 72,
};

const BUNDLED_BY_TYPE: Partial<Record<PremiumSoundType, string>> = {
  messageSend: VYBE_SOUNDS.dmSent,
  messageReceive: VYBE_SOUNDS.dmReceived,
  notification: VYBE_SOUNDS.dmReceived,
  callRing: VYBE_SOUNDS.callRing,
};

const CATEGORY_BY_TYPE: Record<PremiumSoundType, SoundMixCategory> = {
  messageSend: 'messages', messageReceive: 'messages', notification: 'messages',
  tap: 'ui', toggle: 'ui', success: 'ui', error: 'ui',
  callRing: 'calls', callConnect: 'calls', callEnd: 'calls',
};

function normalizeSoundSettings(value: unknown): SoundSettings {
  const parsed = value && typeof value === 'object' ? value as Partial<SoundSettings> : {};
  return {
    master: typeof parsed.master === 'boolean' ? parsed.master : DEFAULT_SETTINGS.master,
    messages: typeof parsed.messages === 'boolean' ? parsed.messages : DEFAULT_SETTINGS.messages,
    calls: typeof parsed.calls === 'boolean' ? parsed.calls : DEFAULT_SETTINGS.calls,
    ui: typeof parsed.ui === 'boolean' ? parsed.ui : DEFAULT_SETTINGS.ui,
    volume: typeof parsed.volume === 'number' && Number.isFinite(parsed.volume)
      ? Math.max(0, Math.min(100, parsed.volume)) : DEFAULT_SETTINGS.volume,
  };
}

export function getSoundSettings(): SoundSettings {
  try {
    const stored = readDevicePreference(SOUND_SETTINGS_KEY);
    if (stored) return normalizeSoundSettings(JSON.parse(stored));
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}

export function updateSoundSettings(updates: Partial<SoundSettings>): void {
  if (typeof window === 'undefined') return;
  const current = getSoundSettings();
  writeDevicePreference(SOUND_SETTINGS_KEY, JSON.stringify(normalizeSoundSettings({ ...current, ...updates })));
}

export function getCustomSounds(): CustomSoundConfig {
  if (typeof window === 'undefined') return {};
  try {
    const key = customSoundsKey();
    const stored = key ? readDevicePreference(key) : null;
    if (stored) {
      const parsed = JSON.parse(stored) as CustomSoundConfig | null;
      return {
        ...(typeof parsed?.message_tone === 'string' ? { message_tone: parsed.message_tone } : {}),
        ...(typeof parsed?.call_ringtone === 'string' ? { call_ringtone: parsed.call_ringtone } : {}),
      };
    }
  } catch { /* ignore */ }
  return {};
}

export function updateCustomSounds(updates: Partial<CustomSoundConfig>): void {
  if (typeof window === 'undefined') return;
  const key = customSoundsKey();
  if (!key) return;
  const current = getCustomSounds();
  writeDevicePreference(key, JSON.stringify({ ...current, ...updates }));
}

export function clearCustomSound(type: 'message_tone' | 'call_ringtone'): void {
  if (typeof window === 'undefined') return;
  const key = customSoundsKey();
  if (!key) return;
  const current = getCustomSounds();
  delete current[type];
  writeDevicePreference(key, JSON.stringify(current));
}

function isCategoryEnabled(category: SoundMixCategory): boolean {
  const settings = getSoundSettings();
  if (!settings.master || settings.volume === 0) return false;
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
const activeOscillators = new Map<OscillatorNode, SoundMixCategory>();
// Muting invalidates pending downloads/silent-mode checks, even if quickly unmuted.
const categoryGeneration: Record<SoundMixCategory, number> = { messages: 0, calls: 0, ui: 0 };
const audioBufferCache = new Map<string, AudioBuffer>();
const activePlayers = new Map<() => void, { category: SoundMixCategory; refreshVolume: () => void }>();
let preloadPromise: Promise<void> | null = null;
let audioSession = reportAccountSnapshot();
reportAccountSubscribe(() => {
  const next = reportAccountSnapshot();
  if (next === audioSession) return;
  audioSession = next;
  (['messages', 'calls', 'ui'] as const).forEach(category => {
    categoryGeneration[category]++;
    stopSynthCategory(category);
  });
  activePlayers.forEach((_, stop) => stop());
  stopAllCallSounds();
  if (messageDebounceTimer) clearTimeout(messageDebounceTimer);
  messageDebounceTimer = null;
  pendingMessageCount = 0;
});

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioContext || audioContext.state === 'closed') {
    try {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  if (audioContext.state === 'suspended') void audioContext.resume().catch(() => {});
  return audioContext;
}

/** Call synchronously from a deliberate preview gesture, before async checks.
 * Resuming a suspended context after a download can lose mobile activation. */
export function prepareSoundPreview(): void {
  const settings = getSoundSettings();
  if (settings.master && settings.volume > 0) getAudioContext();
}

/** Warm decode all bundled sounds after first user gesture. */
export function preloadVybeSounds(): Promise<void> {
  const settings = getSoundSettings();
  if (!settings.master || settings.volume === 0) return Promise.resolve();
  if (preloadPromise) return preloadPromise;
  preloadPromise = (async () => {
    const ctx = getAudioContext();
    if (!ctx) return;
    await Promise.all(
      ALL_VYBE_SOUND_URLS.map(async (url) => {
        if (audioBufferCache.has(url)) return;
        try {
          const res = await fetch(url);
          if (!res.ok) return;
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
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const decoded = await ctx.decodeAudioData(buf.slice(0));
    audioBufferCache.set(url, decoded);
    // Uploaded tones can change often; do not retain unlimited decoded audio.
    if (audioBufferCache.size > 24) audioBufferCache.delete(audioBufferCache.keys().next().value!);
    return decoded;
  } catch {
    return null;
  }
}

export async function playCustomAudio(
  url: string,
  loop = false,
  volume?: number,
  category: SoundMixCategory = 'messages',
  cancelled: () => boolean = () => false,
  onEnded?: () => void,
): Promise<{ stop: () => void } | null> {
  if (cancelled() || !isCategoryEnabled(category)) return null;
  const generation = categoryGeneration[category];
  const session = reportAccountSnapshot();
  const isCancelled = () => cancelled() || generation !== categoryGeneration[category] || session !== reportAccountSnapshot();
  const allowed = await import('@/lib/deviceSilentMode').then(m => m.shouldPlayNotificationSound(category)).catch(() => false);
  if (!allowed || isCancelled()) return null;
  const ctx = getAudioContext();
  if (!ctx) return null;
  let releaseOnFailure: (() => void) | undefined;
  try {
    const buffer = await loadBuffer(url);
    // Download/decoding may finish after a call ends or the user turns sound off.
    if (!buffer || isCancelled() || !isCategoryEnabled(category)) return null;
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    const bus = getSoundOutputBus(ctx);
    source.buffer = buffer;
    source.loop = loop;
    const peak = resolveBundledGain(url, category, volume);
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.012);
    source.connect(gain);
    gain.connect(bus);
    let stopped = false;
    let notified = false;
    const notifyEnded = () => { if (!notified) { notified = true; onEnded?.(); } };
    const cleanup = () => {
      activePlayers.delete(stop);
      source.disconnect();
      gain.disconnect();
      notifyEnded();
    };
    releaseOnFailure = () => { source.disconnect(); gain.disconnect(); };
    const stop = () => {
      if (stopped) return;
      stopped = true;
      activePlayers.delete(stop);
      try {
        const t = ctx.currentTime;
        gain.gain.cancelScheduledValues(t);
        gain.gain.setValueAtTime(gain.gain.value, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
        source.stop(t + 0.05);
      } catch { /* already stopped */ }
      notifyEnded();
    };
    source.onended = cleanup;
    source.start();
    activePlayers.set(stop, { category, refreshVolume: () => {
      const t = ctx.currentTime;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(gain.gain.value, t);
      gain.gain.linearRampToValueAtTime(resolveBundledGain(url, category, volume), t + 0.04);
    } });
    return { stop };
  } catch {
    releaseOnFailure?.();
    return null;
  }
}

async function playBundledUrl(
  url: string,
  category: SoundMixCategory,
  options?: { loop?: boolean; volume?: number; debounceMs?: number; cancelled?: () => boolean },
): Promise<{ stop: () => void } | null> {
  if (!isCategoryEnabled(category)) return null;
  const generation = categoryGeneration[category];
  const cancelled = () => !!options?.cancelled?.() || generation !== categoryGeneration[category];
  const debounceMs = options?.debounceMs ?? 150;
  if (shouldDebounce(url, debounceMs)) return null;

  const ok = await import('@/lib/deviceSilentMode').then((m) =>
    m.shouldPlayNotificationSound(category),
  ).catch(() => false);
  if (!ok || cancelled() || !isCategoryEnabled(category)) return null;

  void preloadVybeSounds();
  return playCustomAudio(url, options?.loop ?? false, options?.volume, category, cancelled);
}

function playSynth(soundType: PremiumSoundType, cancelled: () => boolean = () => false): void {
  const configs: Record<PremiumSoundType, {
    category: SoundMixCategory;
    frequencies: number[];
    durations: number[];
    volumes: number[];
    types: OscillatorType[];
    delays: number[];
    detune?: number[];
  }> = {
    messageSend: { category: 'messages', frequencies: [620, 740], durations: [0.04, 0.035], volumes: [0.006, 0.004], types: ['sine', 'sine'], delays: [0, 0.012], detune: [0, 3] },
    messageReceive: { category: 'messages', frequencies: [880, 1174.66], durations: [0.07, 0.12], volumes: [0.012, 0.01], types: ['sine', 'triangle'], delays: [0, 0.05], detune: [0, -2] },
    notification: { category: 'messages', frequencies: [783.99, 987.77], durations: [0.08, 0.14], volumes: [0.014, 0.011], types: ['sine', 'sine'], delays: [0, 0.06], detune: [0, 2] },
    tap: { category: 'ui', frequencies: [620], durations: [0.022], volumes: [0.0045], types: ['sine'], delays: [0] },
    toggle: { category: 'ui', frequencies: [480, 640], durations: [0.028, 0.022], volumes: [0.005, 0.0035], types: ['sine', 'sine'], delays: [0, 0.016], detune: [0, 3] },
    success: { category: 'ui', frequencies: [523.25, 659.25, 783.99], durations: [0.07, 0.07, 0.1], volumes: [0.008, 0.007, 0.009], types: ['sine', 'sine', 'sine'], delays: [0, 0.05, 0.1], detune: [0, 1, -1] },
    error: { category: 'ui', frequencies: [220, 185], durations: [0.09, 0.11], volumes: [0.009, 0.007], types: ['sine', 'sine'], delays: [0, 0.06] },
    callRing: { category: 'calls', frequencies: [440, 554.37, 659.25], durations: [0.16, 0.14, 0.12], volumes: [0.014, 0.012, 0.01], types: ['sine', 'sine', 'sine'], delays: [0, 0.09, 0.18], detune: [0, 2, -2] },
    callConnect: { category: 'calls', frequencies: [523.25, 659.25, 783.99], durations: [0.1, 0.1, 0.16], volumes: [0.012, 0.01, 0.008], types: ['sine', 'sine', 'sine'], delays: [0, 0.07, 0.14], detune: [0, 2, 0] },
    callEnd: { category: 'calls', frequencies: [587.33, 493.88, 392], durations: [0.08, 0.08, 0.12], volumes: [0.01, 0.009, 0.007], types: ['sine', 'sine', 'sine'], delays: [0, 0.07, 0.14] },
  };

  const config = configs[soundType];
  if (!isCategoryEnabled(config.category)) return;
  const generation = categoryGeneration[config.category];
  void import('@/lib/deviceSilentMode').then(({ shouldPlayNotificationSound }) =>
    shouldPlayNotificationSound(config.category).then((allowed) => {
      if (cancelled() || generation !== categoryGeneration[config.category] || !allowed || !isCategoryEnabled(config.category)) return;
      if (shouldDebounce(soundType, 150)) return;
      const ctx = getAudioContext();
      if (!ctx) return;
      const bus = getSoundOutputBus(ctx);
      const now = ctx.currentTime;
      config.frequencies.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const toneFilter = ctx.createBiquadFilter();
        toneFilter.type = 'lowpass';
        toneFilter.frequency.value = 4200;
        toneFilter.Q.value = 0.5;
        const gain = ctx.createGain();
        osc.connect(toneFilter);
        toneFilter.connect(gain);
        gain.connect(bus);
        osc.type = config.types[i];
        osc.frequency.setValueAtTime(freq, now);
        osc.detune.setValueAtTime(config.detune?.[i] || 0, now);
        const dur = config.durations[i];
        const vol = resolveSynthGain(config.category, config.volumes[i]);
        const start = now + config.delays[i];
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(vol, start + Math.min(0.012, dur * 0.25));
        gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
        osc.start(start);
        osc.stop(start + dur + 0.02);
        activeOscillators.set(osc, config.category);
        osc.onended = () => {
          activeOscillators.delete(osc);
          osc.disconnect();
          toneFilter.disconnect();
          gain.disconnect();
        };
      });
    }),
  ).catch(() => {});
}

export function playPremiumSound(soundType: PremiumSoundType): void {
  const bundled = BUNDLED_BY_TYPE[soundType];
  if (bundled) {
    const category = CATEGORY_BY_TYPE[soundType];
    void playBundledUrl(bundled, category).catch(() => playSynth(soundType));
    return;
  }
  playSynth(soundType);
}

export function previewSound(soundType: PremiumSoundType): void {
  const bundled = BUNDLED_BY_TYPE[soundType];
  if (bundled) {
    const category = CATEGORY_BY_TYPE[soundType];
    void playCustomAudio(bundled, false, undefined, category);
    return;
  }
  playSynth(soundType);
}

export function previewBundledSound(url: string, category: SoundMixCategory = 'messages'): void {
  void playCustomAudio(url, false, undefined, category);
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
      void playCustomAudio(custom.message_tone, false, undefined, 'messages');
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
    void playCustomAudio(custom.message_tone, false, undefined, 'messages');
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
let callSoundGeneration = 0;

export async function startRinging(): Promise<void> {
  if (!isCategoryEnabled('calls')) return;
  stopAllCallSounds();
  const generation = callSoundGeneration;
  const cancelled = () => generation !== callSoundGeneration;

  const custom = getCustomSounds();
  if (custom.call_ringtone) {
    const player = await playCustomAudio(custom.call_ringtone, true, undefined, 'calls', cancelled);
    if (cancelled()) { player?.stop(); return; }
    customRingPlayer = player;
    return;
  }

  const player = await playBundledUrl(VYBE_SOUNDS.callRing, 'calls', { loop: true, debounceMs: 0, cancelled });
  if (cancelled()) { player?.stop(); return; }
  bundledRingPlayer = player;
  if (!bundledRingPlayer && !cancelled() && isCategoryEnabled('calls')) {
    playSynth('callRing', cancelled);
    callRingInterval = setInterval(() => playSynth('callRing', cancelled), 2000);
  }
}

export async function startRingback(): Promise<void> {
  if (!isCategoryEnabled('calls')) return;
  stopAllCallSounds();
  const generation = callSoundGeneration;
  const cancelled = () => generation !== callSoundGeneration;
  const player = await playBundledUrl(VYBE_SOUNDS.callRing, 'calls', { loop: true, debounceMs: 0, cancelled });
  if (cancelled()) { player?.stop(); return; }
  bundledRingPlayer = player;
  if (!bundledRingPlayer && !cancelled() && isCategoryEnabled('calls')) {
    playSynth('callRing', cancelled);
    ringbackInterval = setInterval(() => playSynth('callRing', cancelled), 3000);
  }
}

export function stopAllCallSounds(): void {
  callSoundGeneration++;
  categoryGeneration.calls++;
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
  activePlayers.forEach((player, stop) => { if (player.category === 'calls') stop(); });
  stopSynthCategory('calls');
}

function stopSynthCategory(category: SoundMixCategory): void {
  activeOscillators.forEach((activeCategory, osc) => {
    if (activeCategory !== category) return;
    activeOscillators.delete(osc);
    try {
      osc.stop();
    } catch { /* ignore */ }
  });
}

subscribeDevicePreference(SOUND_SETTINGS_KEY, () => {
  (['messages', 'calls', 'ui'] as const).forEach(category => {
    if (!isCategoryEnabled(category)) {
      categoryGeneration[category]++;
      stopSynthCategory(category);
    }
  });
  activePlayers.forEach((player, stop) => {
    if (!isCategoryEnabled(player.category)) stop();
    else player.refreshVolume();
  });
  if (!isCategoryEnabled('messages')) {
    if (messageDebounceTimer) clearTimeout(messageDebounceTimer);
    messageDebounceTimer = null;
    pendingMessageCount = 0;
  }
  if (!isCategoryEnabled('calls')) stopAllCallSounds();
});

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
  success: () => playPremiumSound('success'),
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
