/**
 * Camera Preload Hook
 * 
 * Provides camera access on-demand from user gestures only.
 * CRITICAL: getUserMedia must be called from click/tap handlers, never from useEffect.
 */

import { useState, useCallback, useRef } from 'react';

interface CameraState {
  stream: MediaStream | null;
  isReady: boolean;
  error: string | null;
}

// Global stream cache
let globalStream: MediaStream | null = null;

/**
 * Request camera stream - MUST be called from a user gesture (click/tap)
 * Accepts optional constraints for different camera modes
 */
export async function requestCameraStream(options?: {
  facingMode?: 'user' | 'environment';
  width?: number;
  height?: number;
  audio?: boolean;
}): Promise<MediaStream | null> {
  if (globalStream?.active) return globalStream;

  const facingMode = options?.facingMode || 'user';
  const width = options?.width || 1280;
  const height = options?.height || 720;
  const audio = options?.audio ?? false;

  try {
    console.log('[Camera] Requesting camera from user gesture...', { facingMode, audio });
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: width },
        height: { ideal: height },
        facingMode,
        aspectRatio: { ideal: 9 / 16 },
      },
      audio,
    });
    globalStream = stream;
    console.log('[Camera] Camera ready');
    return stream;
  } catch (err) {
    console.warn('[Camera] Failed:', err);
    return null;
  }
}

/**
 * Stop the camera stream and release resources
 */
export function stopCameraStream() {
  if (globalStream) {
    globalStream.getTracks().forEach(track => track.stop());
    globalStream = null;
    console.log('[Camera] Stopped');
  }
}

/**
 * Get the current active stream (if any)
 */
export function getActiveStream(): MediaStream | null {
  return globalStream?.active ? globalStream : null;
}

/**
 * Hook for camera access - all methods are gesture-safe
 */
export function useCameraPreload(_enabled: boolean = true) {
  const [state, setState] = useState<CameraState>({
    stream: getActiveStream(),
    isReady: !!getActiveStream(),
    error: null,
  });

  // Start camera - call this from onClick/onTap only
  const start = useCallback(async () => {
    const existing = getActiveStream();
    if (existing) {
      setState({ stream: existing, isReady: true, error: null });
      return existing;
    }

    try {
      const stream = await requestCameraStream();
      if (stream) {
        setState({ stream, isReady: true, error: null });
      } else {
        setState({ stream: null, isReady: false, error: 'Camera unavailable' });
      }
      return stream;
    } catch (err: any) {
      setState({ stream: null, isReady: false, error: err.message });
      return null;
    }
  }, []);

  const attachToVideo = useCallback((videoElement: HTMLVideoElement | null) => {
    if (!videoElement || !state.stream) return;
    if (videoElement.srcObject !== state.stream) {
      videoElement.srcObject = state.stream;
      videoElement.play().catch(console.error);
    }
  }, [state.stream]);

  const stop = useCallback(() => {
    stopCameraStream();
    setState({ stream: null, isReady: false, error: null });
  }, []);

  return {
    stream: state.stream,
    isReady: state.isReady,
    error: state.error,
    attachToVideo,
    start,
    stop,
  };
}

/**
 * No-op warmup - camera is now only started on explicit user gesture
 */
export function useCameraWarmup() {
  const warmup = useCallback(() => {
    // Intentionally no-op: camera must only start from direct user tap
  }, []);

  return { warmup };
}

// Legacy exports for compatibility
export const preloadCameraStream = requestCameraStream;
export const stopPreloadedCamera = stopCameraStream;
export const getPreloadedStream = getActiveStream;
