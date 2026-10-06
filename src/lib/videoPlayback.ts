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

type UnlockEntry = { video: HTMLVideoElement; onAudible?: () => void; isCurrent: () => boolean };

const pendingUnlocks: UnlockEntry[] = [];
let unlockBound = false;

export function cancelVideoAudioUnlock(video: HTMLVideoElement): void {
  for (let index = pendingUnlocks.length - 1; index >= 0; index--) {
    if (pendingUnlocks[index].video === video) pendingUnlocks.splice(index, 1);
  }
}

/** Unmute videos that had to start silent because autoplay blocked sound. */
export function releasePendingAudioUnlocks(): void {
  const batch = pendingUnlocks.splice(0, pendingUnlocks.length);
  for (const entry of batch) {
    if (!entry.video.isConnected || !entry.isCurrent()) continue;
    entry.video.muted = false;
    entry.onAudible?.();
  }
}

function armAudioUnlock(entry: UnlockEntry): void {
  cancelVideoAudioUnlock(entry.video);
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
  isCurrent: () => boolean = () => true,
): Promise<PlayAudioResult> {
  cancelVideoAudioUnlock(video);
  if (!isCurrent()) return 'blocked';
  if (preferMuted) {
    video.muted = true;
    try {
      await video.play();
      return isCurrent() ? 'silent' : 'blocked';
    } catch {
      return 'blocked';
    }
  }

  video.muted = false;
  try {
    await video.play();
    return isCurrent() ? 'sound' : 'blocked';
  } catch (error) {
    // pause()/source changes interrupt pending play. Retrying those requests
    // can start a clip that the viewer already left. Only autoplay policy gets
    // a muted fallback; codec/network failures keep their existing recovery UI.
    const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
    const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
    if (!isCurrent() || (name !== 'NotAllowedError' && message !== 'NotAllowedError')) return 'blocked';
    video.muted = true;
    try {
      await video.play();
    } catch {
      return 'blocked';
    }
    if (!isCurrent()) return 'blocked';
    armAudioUnlock({ video, onAudible, isCurrent });
    return 'silent';
  }
}
