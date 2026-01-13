export type CallMediaType = 'audio' | 'video';

const PERMISSION_STORAGE_KEY = 'vybe_call_permissions';

interface PermissionState {
  audio: boolean;
  video: boolean;
  timestamp: number;
}

function getStoredPermissions(): PermissionState | null {
  try {
    const stored = localStorage.getItem(PERMISSION_STORAGE_KEY);
    if (!stored) return null;
    const state = JSON.parse(stored) as PermissionState;
    // Permissions stored for max 30 days
    const maxAge = 30 * 24 * 60 * 60 * 1000;
    if (Date.now() - state.timestamp > maxAge) {
      localStorage.removeItem(PERMISSION_STORAGE_KEY);
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

function storePermissions(audio: boolean, video: boolean): void {
  try {
    const state: PermissionState = { audio, video, timestamp: Date.now() };
    localStorage.setItem(PERMISSION_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

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
 * Check if we already have permission via the Permissions API (if available)
 */
async function checkExistingPermission(kind: 'microphone' | 'camera'): Promise<boolean> {
  try {
    if (!navigator.permissions?.query) return false;
    const result = await navigator.permissions.query({ name: kind as PermissionName });
    return result.state === 'granted';
  } catch {
    return false;
  }
}

/**
 * Requests the minimal permissions required for the call type.
 * - audio: microphone
 * - video: microphone + camera
 * 
 * Skips the prompt if permissions were already granted previously.
 */
export async function requestCallMediaPermissions(callType: CallMediaType): Promise<void> {
  assertMediaSupported();

  console.log('[mediaPermissions] Requesting permissions for:', callType);

  // Check stored permissions first
  const stored = getStoredPermissions();
  const hasStoredAudio = stored?.audio === true;
  const hasStoredVideo = stored?.video === true;

  // Also check via Permissions API
  const hasApiAudio = await checkExistingPermission('microphone');
  const hasApiVideo = callType === 'video' ? await checkExistingPermission('camera') : true;

  console.log('[mediaPermissions] Stored permissions:', { hasStoredAudio, hasStoredVideo });
  console.log('[mediaPermissions] API permissions:', { hasApiAudio, hasApiVideo });

  // If already have permissions, skip prompting
  if ((hasStoredAudio || hasApiAudio) && (callType !== 'video' || hasStoredVideo || hasApiVideo)) {
    console.log('[mediaPermissions] Permissions already granted, skipping prompt');
    return;
  }

  let audioGranted = false;
  let videoGranted = false;

  try {
    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log('[mediaPermissions] Microphone access granted');
    stopTracks(micStream);
    audioGranted = true;
  } catch (err: any) {
    console.error('[mediaPermissions] Microphone access denied:', err);
    throw new Error(callType === 'video' ? 'Microphone/Camera permission required' : 'Microphone permission required');
  }

  if (callType === 'video') {
    try {
      const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
      console.log('[mediaPermissions] Camera access granted');
      stopTracks(camStream);
      videoGranted = true;
    } catch (err: any) {
      console.warn('[mediaPermissions] Camera access denied, continuing with audio only:', err);
    }
  }

  // Store granted permissions
  storePermissions(audioGranted, videoGranted || hasStoredVideo || hasApiVideo);
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
