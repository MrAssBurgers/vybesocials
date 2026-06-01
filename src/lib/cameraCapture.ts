import { isNativeAppShell } from '@/lib/despiaBridge';

interface CaptureFrameOptions {
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  facingMode?: 'user' | 'environment';
  filterCSS?: string;
}

/**
 * Draw video frame to canvas for photo export.
 * Skips ctx.filter on native shells — some Android WebViews hard-crash on canvas filters.
 */
export function captureVideoFrame({
  video,
  canvas,
  facingMode = 'environment',
  filterCSS,
}: CaptureFrameOptions): boolean {
  if (!video.videoWidth || !video.videoHeight) return false;

  const ctx = canvas.getContext('2d');
  if (!ctx) return false;

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (facingMode === 'user') {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }

  const useFilter = Boolean(filterCSS) && !isNativeAppShell();
  if (useFilter) {
    try {
      ctx.filter = filterCSS!;
      ctx.drawImage(video, 0, 0);
    } catch {
      ctx.filter = 'none';
      ctx.drawImage(video, 0, 0);
    }
  } else {
    ctx.filter = 'none';
    ctx.drawImage(video, 0, 0);
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return true;
}
