/**
 * Camera Preload Hook
 * 
 * Pre-starts the camera stream so video appears instantly when a call begins.
 * Like FaceTime - shows your video immediately while connecting.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

interface CameraPreloadState {
  stream: MediaStream | null;
  isReady: boolean;
  error: string | null;
}

// Global preloaded stream cache - keeps camera warm across component mounts
let globalPreloadedStream: MediaStream | null = null;
let preloadPromise: Promise<MediaStream> | null = null;

/**
 * Preload camera stream globally (call this early, e.g., when call buttons are visible)
 */
export async function preloadCameraStream(): Promise<MediaStream | null> {
  // Already preloaded
  if (globalPreloadedStream && globalPreloadedStream.active) {
    return globalPreloadedStream;
  }

  // Already preloading
  if (preloadPromise) {
    return preloadPromise;
  }

  preloadPromise = (async () => {
    try {
      console.log('[CameraPreload] Starting camera preload...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
        audio: false, // Audio handled separately by Daily
      });
      
      globalPreloadedStream = stream;
      console.log('[CameraPreload] Camera preloaded successfully');
      return stream;
    } catch (err) {
      console.warn('[CameraPreload] Failed to preload camera:', err);
      return null;
    } finally {
      preloadPromise = null;
    }
  })();

  return preloadPromise;
}

/**
 * Stop the preloaded camera stream
 */
export function stopPreloadedCamera() {
  if (globalPreloadedStream) {
    globalPreloadedStream.getTracks().forEach(track => track.stop());
    globalPreloadedStream = null;
    console.log('[CameraPreload] Preloaded camera stopped');
  }
}

/**
 * Get the current preloaded stream (if any)
 */
export function getPreloadedStream(): MediaStream | null {
  if (globalPreloadedStream?.active) {
    return globalPreloadedStream;
  }
  return null;
}

/**
 * Hook for instant camera access in video calls
 */
export function useCameraPreload(enabled: boolean = true) {
  const [state, setState] = useState<CameraPreloadState>({
    stream: getPreloadedStream(),
    isReady: !!getPreloadedStream()?.active,
    error: null,
  });
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const mountedRef = useRef(true);

  // Start preloading when enabled
  useEffect(() => {
    if (!enabled) {
      setState({ stream: null, isReady: false, error: null });
      return;
    }

    mountedRef.current = true;

    const startPreload = async () => {
      // Check for existing stream first
      const existing = getPreloadedStream();
      if (existing) {
        setState({ stream: existing, isReady: true, error: null });
        return;
      }

      try {
        const stream = await preloadCameraStream();
        if (mountedRef.current && stream) {
          setState({ stream, isReady: true, error: null });
        }
      } catch (err: any) {
        if (mountedRef.current) {
          setState({ stream: null, isReady: false, error: err.message });
        }
      }
    };

    startPreload();

    return () => {
      mountedRef.current = false;
    };
  }, [enabled]);

  // Attach stream to video element
  const attachToVideo = useCallback((videoElement: HTMLVideoElement | null) => {
    if (!videoElement || !state.stream) return;
    
    if (videoElement.srcObject !== state.stream) {
      videoElement.srcObject = state.stream;
      videoElement.play().catch(console.error);
    }
  }, [state.stream]);

  // Stop and cleanup
  const stop = useCallback(() => {
    stopPreloadedCamera();
    setState({ stream: null, isReady: false, error: null });
  }, []);

  return {
    stream: state.stream,
    isReady: state.isReady,
    error: state.error,
    attachToVideo,
    stop,
  };
}

/**
 * Hook to preload camera when hovering over call buttons (anticipatory loading)
 */
export function useCameraWarmup() {
  const warmup = useCallback(() => {
    // Start preloading on hover/focus
    preloadCameraStream();
  }, []);

  return { warmup };
}
