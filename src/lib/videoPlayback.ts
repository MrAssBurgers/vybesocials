import { readFeedPreference, writeFeedPreference } from '@/lib/feedReliability';

/** New key so an old silent default (`vybe-clips-muted=true`) does not keep videos quiet. */
const SOUND_KEY = 'vybe-clips-sound';

/** True when the viewer explicitly muted. Missing key means sound on. */
export function readClipsMutedPreference(): boolean {
  return readFeedPreference(SOUND_KEY) === '0';
}

export function writeClipsMutedPreference(muted: boolean): void {
  writeFeedPreference(SOUND_KEY, muted ? '0' : '1');
  writeFeedPreference('vybe-clips-muted', muted ? 'true' : 'false');
}

export type PlayAudioResult = 'sound' | 'silent' | 'blocked';

type UnlockEntry = { video: HTMLVideoElement; onAudible?: () => void };

const pendingUnlocks: UnlockEntry[] = [];
let unlockBound = false;

/** Unmute videos that had to start silent because autoplay blocked sound. */
export function releasePendingAudioUnlocks(): void {
  const batch = pendingUnlocks.splice(0, pendingUnlocks.length);
  for (const entry of batch) {
    if (!entry.video.isConnected) continue;
    entry.video.muted = false;
    entry.onAudible?.();
  }
}

function armAudioUnlock(entry: UnlockEntry): void {
  pendingUnlocks.push(entry);
  if (unlockBound || typeof document === 'undefined') return;
  unlockBound = true;
  document.addEventListener('pointerdown', releasePendingAudioUnlocks, { capture: true, passive: true });
}

/**
 * Play with sound when the browser allows it.
 * If autoplay blocks sound, start muted and unmute on the next tap.
 * That fallback is not saved as the viewer's mute choice.
 */
export async function playWithAudio(
  video: HTMLVideoElement,
  preferMuted: boolean,
  onAudible?: () => void,
): Promise<PlayAudioResult> {
  if (preferMuted) {
    video.muted = true;
    try {
      await video.play();
      return 'silent';
    } catch {
      return 'blocked';
    }
  }

  video.muted = false;
  try {
    await video.play();
    return 'sound';
  } catch {
    video.muted = true;
    try {
      await video.play();
    } catch {
      return 'blocked';
    }
    armAudioUnlock({ video, onAudible });
    return 'silent';
  }
}
