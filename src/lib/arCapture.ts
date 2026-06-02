import { captureVideoFrame } from '@/lib/cameraCapture';

interface CaptureWithAROptions {
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  facingMode?: 'user' | 'environment';
  filterCSS?: string;
  /** Live AR overlay canvas (same dimensions as video feed). */
  arOverlay?: HTMLCanvasElement | null;
}

/**
 * Capture photo: video frame + optional AR overlay composited (Snap-style export).
 */
export function captureVideoFrameWithAR({
  video,
  canvas,
  facingMode,
  filterCSS,
  arOverlay,
}: CaptureWithAROptions): boolean {
  const ok = captureVideoFrame({ video, canvas, facingMode, filterCSS });
  if (!ok) return false;

  if (!arOverlay || arOverlay.width === 0 || arOverlay.height === 0) return true;

  const ctx = canvas.getContext('2d');
  if (!ctx) return true;

  try {
    ctx.drawImage(arOverlay, 0, 0, canvas.width, canvas.height);
  } catch {
    // Overlay draw failed — still return the base photo
  }
  return true;
}
