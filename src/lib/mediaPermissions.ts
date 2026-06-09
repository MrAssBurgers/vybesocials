export type CallMediaType = 'audio' | 'video';

function assertMediaSupported() {
  if (typeof navigator === 'undefined') throw new Error('Media devices not supported');
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Media devices not supported');
}

/**
 * Check if a permission is already granted using the Permissions API.
 * Returns true if granted, false if denied, null if unknown/unsupported.
 */
async function checkPermissionStatus(name: 'microphone' | 'camera'): Promise<boolean | null> {
  try {
    if (!navigator.permissions?.query) return null;
    const result = await navigator.permissions.query({ name: name as PermissionName });
    if (result.state === 'granted') return true;
    if (result.state === 'denied') return false;
    return null; // 'prompt' - we don't know yet
  } catch {
    return null; // Not supported on this browser
  }
}

/**
 * Request media permissions for a call.
 * 
 * MOBILE OPTIMIZATION: Instead of creating full streams and destroying them
 * (which causes race conditions when Daily.js requests the same devices),
 * we first check the Permissions API. Only fall back to getUserMedia if
 * the permission state is unknown ('prompt').
 * 
 * Daily.js will handle the actual stream creation with its own constraints.
 */
const SESSION_CACHE_KEY = 'vybe-media-perms-granted';

function readPermCache(): { mic?: boolean; cam?: boolean } {
  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function writePermCache(patch: { mic?: boolean; cam?: boolean }) {
  try {
    const cur = readPermCache();
    sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({ ...cur, ...patch }));
  } catch {}
}

export async function requestCallMediaPermissions(callType: CallMediaType): Promise<void> {
  assertMediaSupported();

  // Fast path: session cache (skip the full probe entirely on subsequent calls)
  const cached = readPermCache();
  if (cached.mic && (callType === 'audio' || cached.cam)) {
    console.log('[mediaPermissions] Session cache hit — skipping probe');
    return;
  }

  console.log('[mediaPermissions] Checking permissions for:', callType);

  // Release any existing camera stream (e.g. VybeSnapCamera) before requesting new media
  try {
    const { stopCameraStream } = await import('@/hooks/useCameraPreload');
    const { isAcquiringPostCamera } = await import('@/lib/postCameraStream');
    stopCameraStream();
    for (let i = 0; i < 10 && isAcquiringPostCamera(); i += 1) {
      await new Promise((r) => setTimeout(r, 50));
    }
    await new Promise(r => setTimeout(r, 100));
  } catch {
    // Non-critical
  }

  // Step 1: Check mic permission via Permissions API (fast, no stream creation)
  const micStatus = await checkPermissionStatus('microphone');
  
  if (micStatus === false) {
    throw new Error(callType === 'video' ? 'Microphone/Camera permission required' : 'Microphone permission required');
  }

  // If mic permission is unknown ('prompt'), we must request via getUserMedia
  if (micStatus === null) {
    try {
      console.log('[mediaPermissions] Requesting microphone permission...');
      const micStream = await navigator.mediaDevices.getUserMedia({ 
        audio: true // Use simple constraints - Daily will set its own
      });
      // Stop immediately - we just needed the permission grant
      micStream.getTracks().forEach(t => t.stop());
      // Small delay to let OS release the device before Daily requests it
      await new Promise(r => setTimeout(r, 100));
      console.log('[mediaPermissions] Microphone permission granted');
      writePermCache({ mic: true });
    } catch (err: any) {
      console.error('[mediaPermissions] Microphone access denied:', err);
      throw new Error(callType === 'video' ? 'Microphone/Camera permission required' : 'Microphone permission required');
    }
  } else {
    writePermCache({ mic: true });
    console.log('[mediaPermissions] Microphone already granted (skipping getUserMedia)');
  }

  if (callType === 'video') {
    const camStatus = await checkPermissionStatus('camera');
    
    if (camStatus === false) {
      console.warn('[mediaPermissions] Camera permission denied, continuing with audio only');
      return; // Don't throw - allow audio-only fallback
    }

    if (camStatus === null) {
      try {
        console.log('[mediaPermissions] Requesting camera permission...');
        const camStream = await navigator.mediaDevices.getUserMedia({ 
          video: true // Simple constraints - Daily handles quality
        });
        camStream.getTracks().forEach(t => t.stop());
        await new Promise(r => setTimeout(r, 100));
        console.log('[mediaPermissions] Camera permission granted');
        writePermCache({ cam: true });
      } catch (err: any) {
        console.warn('[mediaPermissions] Camera access denied, continuing with audio only:', err);
        // Don't throw for camera - allow audio-only fallback
      }
    } else {
      writePermCache({ cam: true });
      console.log('[mediaPermissions] Camera already granted (skipping getUserMedia)');
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
