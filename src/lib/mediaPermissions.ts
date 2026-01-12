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

  try {
    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stopTracks(micStream);
  } catch {
    // Mic is always required for calls in this app
    throw new Error(callType === 'video' ? 'Microphone/Camera permission required' : 'Microphone permission required');
  }

  if (callType === 'video') {
    try {
      const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
      stopTracks(camStream);
    } catch {
      throw new Error('Microphone/Camera permission required');
    }
  }
}

/**
 * Android safety: after granting mic permission, ensure we can see an audio input device.
 */
export async function ensureAudioInputDevice(retries = 5, delayMs = 150): Promise<void> {
  if (typeof navigator === 'undefined') return;
  if (!navigator.mediaDevices?.enumerateDevices) return;

  for (let i = 0; i < retries; i++) {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const hasAudioInput = devices.some((d) => d.kind === 'audioinput');
    if (hasAudioInput) return;

    await new Promise((r) => setTimeout(r, delayMs));
  }

  throw new Error('Microphone permission required');
}

export function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent);
}

export async function nextAnimationFrame(): Promise<void> {
  if (typeof window === 'undefined') return;
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
}
