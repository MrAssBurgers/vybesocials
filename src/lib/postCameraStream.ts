import { isCameraSafeMode } from '@/lib/cameraSafeMode';

/** Prevents overlapping getUserMedia — crashes Android/iOS WebViews instantly. */
let acquiring = false;

export function isAcquiringPostCamera(): boolean {
  return acquiring;
}

/**
 * Open post/create camera stream.
 * Always starts VIDEO-ONLY; add audio later inside a tap handler (startRecording).
 */
export async function acquirePostCameraStream(facingMode: 'user' | 'environment'): Promise<MediaStream | null> {
  if (acquiring) {
    console.warn('[postCameraStream] Skipping overlapping getUserMedia');
    return null;
  }
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return null;
  }

  const safe = isCameraSafeMode();
  acquiring = true;

  try {
    const videoConstraints: MediaTrackConstraints = safe
      ? { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }
      : { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } };

    try {
      return await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false,
      });
    } catch {
      await new Promise((r) => setTimeout(r, 300));
      return await navigator.mediaDevices.getUserMedia({
        video: safe ? { facingMode } : { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
    }
  } catch (err) {
    console.warn('[postCameraStream] getUserMedia failed:', err);
    return null;
  } finally {
    acquiring = false;
  }
}

/** Attach mic for video recording — must run inside user gesture (capture button). */
export async function attachAudioToStream(stream: MediaStream): Promise<boolean> {
  if (!navigator.mediaDevices?.getUserMedia) return false;
  if (stream.getAudioTracks().length > 0) return true;

  try {
    const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    audioStream.getAudioTracks().forEach((t) => stream.addTrack(t));
    return true;
  } catch (err) {
    console.warn('[postCameraStream] audio track failed:', err);
    return false;
  }
}

export function stopStream(stream: MediaStream | null) {
  if (!stream) return;
  try {
    stream.getTracks().forEach((t) => t.stop());
  } catch {
    /* ignore */
  }
}
