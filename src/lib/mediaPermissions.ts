export type CallMediaType = 'audio' | 'video';

function assertMediaSupported() {
  if (typeof navigator === 'undefined') throw new Error('Media devices not supported');
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Media devices not supported');
}

function stopTracks(stream: MediaStream) {
  stream.getTracks().forEach((t) => {
    try {
      t.stop();
    } catch {
      // ignore
    }
  });
}

/**
 * Requests the minimal permissions required for the call type.
 * - audio: microphone
 * - video: microphone + camera
 */
export async function requestCallMediaPermissions(callType: CallMediaType): Promise<void> {
  assertMediaSupported();

  console.log('[mediaPermissions] Requesting permissions for:', callType);

  try {
    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log('[mediaPermissions] Microphone access granted');
    stopTracks(micStream);
  } catch (err: any) {
    console.error('[mediaPermissions] Microphone access denied:', err);
    // Mic is always required for calls in this app
    throw new Error(callType === 'video' ? 'Microphone/Camera permission required' : 'Microphone permission required');
  }

  if (callType === 'video') {
    try {
      const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
      console.log('[mediaPermissions] Camera access granted');
      stopTracks(camStream);
    } catch (err: any) {
      console.warn('[mediaPermissions] Camera access denied, continuing with audio only:', err);
      // Don't throw for camera - allow audio-only fallback
    }
  }
}

/**
 * Android safety: after granting mic permission, ensure we can see an audio input device.
 */
export async function ensureAudioInputDevice(retries = 5, delayMs = 200): Promise<void> {
  if (typeof navigator === 'undefined') return;
  if (!navigator.mediaDevices?.enumerateDevices) return;

  console.log('[mediaPermissions] Checking for audio input devices...');

  for (let i = 0; i < retries; i++) {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter((d) => d.kind === 'audioinput');
      console.log(`[mediaPermissions] Found ${audioInputs.length} audio input device(s), attempt ${i + 1}`);
      
      if (audioInputs.length > 0) {
        return;
      }
    } catch (err) {
      console.warn('[mediaPermissions] Failed to enumerate devices:', err);
    }

    await new Promise((r) => setTimeout(r, delayMs));
  }

  // Don't throw - some devices may not report audio inputs properly but still work
  console.warn('[mediaPermissions] No audio input devices found after retries, proceeding anyway');
}

export function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent);
}

export async function nextAnimationFrame(): Promise<void> {
  if (typeof window === 'undefined') return;
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
}
