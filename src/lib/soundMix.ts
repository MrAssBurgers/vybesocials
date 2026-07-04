import type { VybeSoundKey } from './vybeSoundAssets';
import { VYBE_SOUNDS } from './vybeSoundAssets';

export type SoundMixCategory = 'messages' | 'calls' | 'ui';

/** Base master trim — keeps bundled WAVs comfortable on phone speakers. */
const BASE_MASTER = 0.52;

const CATEGORY_TRIM: Record<SoundMixCategory, number> = {
  ui: 0.38,
  messages: 0.46,
  calls: 0.5,
};

/** Per-asset trim relative to category (tuned for public/sounds/*.wav). */
const BUNDLED_TRIM: Record<string, number> = {
  [VYBE_SOUNDS.dmSent]: 0.58,
  [VYBE_SOUNDS.dmReceived]: 0.62,
  [VYBE_SOUNDS.postLiked]: 0.52,
  [VYBE_SOUNDS.sharePost]: 0.48,
  [VYBE_SOUNDS.comment]: 0.54,
  [VYBE_SOUNDS.vybeNotification]: 0.56,
  [VYBE_SOUNDS.callRing]: 0.44,
};

const URL_TO_KEY: Record<string, VybeSoundKey> = Object.fromEntries(
  (Object.entries(VYBE_SOUNDS) as [VybeSoundKey, string][]).map(([key, url]) => [url, key]),
);

export function getUserVolumeMultiplier(): number {
  if (typeof window === 'undefined') return 0.72;
  try {
    const raw = localStorage.getItem('vybe-sound-settings');
    if (!raw) return 0.72;
    const parsed = JSON.parse(raw) as { volume?: number };
    if (typeof parsed.volume !== 'number') return 0.72;
    return Math.max(0.15, Math.min(1, parsed.volume / 100));
  } catch {
    return 0.72;
  }
}

export function resolveBundledGain(
  url: string,
  category: SoundMixCategory,
  override?: number,
): number {
  if (override != null) {
    return BASE_MASTER * CATEGORY_TRIM[category] * Math.max(0, Math.min(1, override));
  }
  const assetTrim = BUNDLED_TRIM[url] ?? 0.55;
  return BASE_MASTER * CATEGORY_TRIM[category] * assetTrim * getUserVolumeMultiplier();
}

export function resolveSynthGain(category: SoundMixCategory, voiceGain: number): number {
  return voiceGain * BASE_MASTER * CATEGORY_TRIM[category] * getUserVolumeMultiplier();
}

let outputBus: {
  input: GainNode;
  master: GainNode;
  ctx: AudioContext;
} | null = null;

/** Shared warmth + soft compression so nothing clips or spikes. */
export function getSoundOutputBus(ctx: AudioContext): GainNode {
  if (outputBus?.ctx === ctx) return outputBus.input;

  const input = ctx.createGain();
  const warmth = ctx.createBiquadFilter();
  warmth.type = 'lowpass';
  warmth.frequency.value = 7800;
  warmth.Q.value = 0.65;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -20;
  compressor.knee.value = 14;
  compressor.ratio.value = 2.8;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.14;

  const master = ctx.createGain();
  master.gain.value = 1;

  input.connect(warmth);
  warmth.connect(compressor);
  compressor.connect(master);
  master.connect(ctx.destination);

  outputBus = { input, master, ctx };
  return input;
}

export function bundledSoundLabel(url: string): string | undefined {
  return URL_TO_KEY[url];
}
