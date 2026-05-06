/**
 * Call Media Warmup
 *
 * Pre-acquires camera + microphone so the moment the user joins a call,
 * tracks are already live and the in-call UI gets video/audio instantly
 * instead of waiting for a fresh getUserMedia prompt.
 *
 * The warmed stream is consumed by P2PConnection / LiveKit on the next
 * getUserMedia call (browsers reuse the active capture devices), and is
 * auto-released after CALL_WARMUP_TTL_MS to avoid holding the camera.
 */

const CALL_WARMUP_TTL_MS = 12_000;

let warmStream: MediaStream | null = null;
let warmReleaseTimer: ReturnType<typeof setTimeout> | null = null;
let warmingPromise: Promise<MediaStream | null> | null = null;

function releaseWarmStream() {
  if (warmStream) {
    try { warmStream.getTracks().forEach((t) => t.stop()); } catch {}
  }
  warmStream = null;
  if (warmReleaseTimer) { clearTimeout(warmReleaseTimer); warmReleaseTimer = null; }
}

export async function warmCallMedia(callType: 'audio' | 'video'): Promise<MediaStream | null> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null;
  // Skip warmup on native Android WebView / Despia / Capacitor: a duplicate
  // getUserMedia while P2PConnection.connect()'s own gUM is in flight crashes
  // the WebView process (the "FaceTime crashes the whole app" bug).
  const ua = navigator.userAgent || '';
  if (/despia|vybeapp|; wv\)|\bwv\b/i.test(ua) || (window as any).Capacitor?.isNativePlatform?.()) {
    return null;
  }
  if (warmStream) return warmStream;
  if (warmingPromise) return warmingPromise;

  warmingPromise = (async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: callType === 'video' ? { facingMode: 'user' } : false,
      });
      warmStream = stream;
      // Auto-release if the call doesn't claim the stream in time
      if (warmReleaseTimer) clearTimeout(warmReleaseTimer);
      warmReleaseTimer = setTimeout(() => releaseWarmStream(), CALL_WARMUP_TTL_MS);
      return stream;
    } catch (err) {
      // Permission denied / no device — not fatal; the real connect path
      // will surface the error inline.
      console.warn('[callMediaWarmup] failed:', (err as Error)?.message);
      return null;
    } finally {
      warmingPromise = null;
    }
  })();

  return warmingPromise;
}

export function consumeWarmCallMedia(): MediaStream | null {
  const s = warmStream;
  warmStream = null;
  if (warmReleaseTimer) { clearTimeout(warmReleaseTimer); warmReleaseTimer = null; }
  return s;
}

export function clearWarmCallMedia() {
  releaseWarmStream();
}
