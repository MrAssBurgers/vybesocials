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
 * Requests high-quality permissions for the call type.
 * - audio: microphone with echo cancellation and noise suppression
 * - video: microphone + camera with 720p/1080p preference
 */
export async function requestCallMediaPermissions(callType: CallMediaType): Promise<void> {
  assertMediaSupported();

  console.log('[mediaPermissions] Requesting HIGH QUALITY permissions for:', callType);

  // High-quality audio constraints for clear voice
  const audioConstraints: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    // Request high sample rate when supported
    sampleRate: { ideal: 48000 },
    channelCount: { ideal: 1 }, // Mono for voice clarity
  };

  try {
    const micStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
    console.log('[mediaPermissions] High-quality microphone access granted');
    stopTracks(micStream);
  } catch (err: any) {
    console.error('[mediaPermissions] Microphone access denied:', err);
    // Mic is always required for calls in this app
    throw new Error(callType === 'video' ? 'Microphone/Camera permission required' : 'Microphone permission required');
  }

  if (callType === 'video') {
    // High-quality video constraints - prefer 720p minimum, 1080p ideal
    const videoConstraints: MediaTrackConstraints = {
      width: { min: 640, ideal: 1280, max: 1920 },
      height: { min: 480, ideal: 720, max: 1080 },
      frameRate: { min: 24, ideal: 30, max: 60 },
      facingMode: 'user',
      // Request higher quality when bandwidth allows
      aspectRatio: { ideal: 16/9 },
    };

    try {
      const camStream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints });
      const videoTrack = camStream.getVideoTracks()[0];
      if (videoTrack) {
        const settings = videoTrack.getSettings();
        console.log('[mediaPermissions] Camera access granted with settings:', {
          width: settings.width,
          height: settings.height,
          frameRate: settings.frameRate,
        });
      }
      stopTracks(camStream);
    } catch (err: any) {
      console.warn('[mediaPermissions] High-quality camera access denied, trying basic:', err);
      // Fallback to basic video constraints
      try {
        const basicStream = await navigator.mediaDevices.getUserMedia({ video: true });
        console.log('[mediaPermissions] Basic camera access granted');
        stopTracks(basicStream);
      } catch (fallbackErr) {
        console.warn('[mediaPermissions] Camera access denied, continuing with audio only:', fallbackErr);
        // Don't throw for camera - allow audio-only fallback
      }
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
