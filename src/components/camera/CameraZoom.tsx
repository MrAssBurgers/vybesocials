import { useCallback, useRef, useEffect } from 'react';

interface UsePinchZoomOptions {
  videoRef: React.RefObject<HTMLVideoElement>;
  streamRef: React.RefObject<MediaStream | null>;
  minZoom?: number;
  maxZoom?: number;
}

/**
 * Hook for pinch-to-zoom on camera viewfinder.
 * Uses CSS transform for smooth visual zoom + native track constraints when available.
 */
export function usePinchZoom({ videoRef, streamRef, minZoom = 1, maxZoom = 5 }: UsePinchZoomOptions) {
  const zoomRef = useRef(1);
  const lastDistRef = useRef<number | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const applyZoom = useCallback((zoom: number) => {
    zoomRef.current = zoom;

    // Try native track zoom first
    const track = streamRef.current?.getVideoTracks()[0];
    if (track) {
      const capabilities = track.getCapabilities?.() as any;
      if (capabilities?.zoom) {
        const nativeMin = capabilities.zoom.min || 1;
        const nativeMax = capabilities.zoom.max || 1;
        const nativeZoom = nativeMin + (zoom - minZoom) / (maxZoom - minZoom) * (nativeMax - nativeMin);
        try {
          (track as any).applyConstraints({ advanced: [{ zoom: nativeZoom }] });
        } catch { /* fallback to CSS */ }
      }
    }

    // Always apply CSS transform for visual feedback
    if (videoRef.current) {
      videoRef.current.style.transform = `scale(${zoom})${videoRef.current.style.transform.includes('scaleX') ? ' scaleX(-1)' : ''}`;
    }
  }, [videoRef, streamRef, minZoom, maxZoom]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (e.touches.length < 2) {
      lastDistRef.current = null;
      return;
    }

    e.preventDefault();
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.hypot(dx, dy);

    if (lastDistRef.current !== null) {
      const scale = dist / lastDistRef.current;
      const newZoom = Math.min(maxZoom, Math.max(minZoom, zoomRef.current * scale));

      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = requestAnimationFrame(() => applyZoom(newZoom));
    }

    lastDistRef.current = dist;
  }, [applyZoom, minZoom, maxZoom]);

  const handleTouchEnd = useCallback(() => {
    lastDistRef.current = null;
  }, []);

  const resetZoom = useCallback(() => {
    zoomRef.current = 1;
    if (videoRef.current) {
      videoRef.current.style.transform = '';
    }
  }, [videoRef]);

  return {
    zoom: zoomRef,
    handleTouchMove,
    handleTouchEnd,
    resetZoom,
    applyZoom,
  };
}

interface CameraZoomIndicatorProps {
  zoom: number;
  visible: boolean;
}

export function CameraZoomIndicator({ zoom, visible }: CameraZoomIndicatorProps) {
  if (!visible || zoom <= 1.05) return null;

  return (
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none">
      <div className="bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full">
        <span className="text-white font-mono text-sm font-medium">
          {zoom.toFixed(1)}×
        </span>
      </div>
    </div>
  );
}
