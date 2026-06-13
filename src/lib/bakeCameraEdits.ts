/**
 * Bake CameraEditor overlays and drawings into photo/video blobs.
 * Does not re-apply camera filters — capture already bakes filter for photos.
 */

import { flattenVideo, type FlattenOverlay } from '@/lib/flattenMedia';

export interface CameraTextOverlay {
  id: string;
  text: string;
  imageUrl?: string;
  x: number;
  y: number;
  color: string;
  fontSize: number;
  scale: number;
  rotation: number;
}

export interface CameraDrawPath {
  id: string;
  points: { x: number; y: number }[];
  color: string;
  width: number;
}

interface BakeOptions {
  /** Editor container size — maps object-contain overlay coords to media pixels */
  displayWidth?: number;
  displayHeight?: number;
  imageQuality?: number;
}

interface ContainedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // blob:/data: URLs break when crossOrigin is set
    if (!url.startsWith('blob:') && !url.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function computeContainedRect(
  mediaW: number,
  mediaH: number,
  containerW: number,
  containerH: number,
): ContainedRect {
  const mediaAspect = mediaW / mediaH;
  const containerAspect = containerW / containerH;

  if (mediaAspect > containerAspect) {
    const width = containerW;
    const height = containerW / mediaAspect;
    return { x: 0, y: (containerH - height) / 2, width, height };
  }

  const height = containerH;
  const width = containerH * mediaAspect;
  return { x: (containerW - width) / 2, y: 0, width, height };
}

function mapPoint(
  xPct: number,
  yPct: number,
  contained: ContainedRect,
  containerW: number,
  containerH: number,
  mediaW: number,
  mediaH: number,
): { x: number; y: number } {
  const cx = (xPct / 100) * containerW;
  const cy = (yPct / 100) * containerH;
  const rx = (cx - contained.x) / contained.width;
  const ry = (cy - contained.y) / contained.height;
  return { x: rx * mediaW, y: ry * mediaH };
}

function drawPaths(
  ctx: CanvasRenderingContext2D,
  drawings: CameraDrawPath[],
  contained: ContainedRect,
  containerW: number,
  containerH: number,
  mediaW: number,
  mediaH: number,
) {
  const strokeScale = mediaW / contained.width;

  for (const path of drawings) {
    if (path.points.length < 2) continue;
    ctx.beginPath();
    ctx.strokeStyle = path.color;
    ctx.lineWidth = path.width * strokeScale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    path.points.forEach((point, i) => {
      const { x, y } = mapPoint(point.x, point.y, contained, containerW, containerH, mediaW, mediaH);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
}

function drawCameraOverlays(
  ctx: CanvasRenderingContext2D,
  overlays: CameraTextOverlay[],
  contained: ContainedRect,
  containerW: number,
  containerH: number,
  mediaW: number,
  mediaH: number,
  imageCache: Map<string, HTMLImageElement>,
) {
  const fontScale = mediaW / Math.max(contained.width, 1);
  const maxImageCss = 200;

  for (const overlay of overlays) {
    const { x, y } = mapPoint(overlay.x, overlay.y, contained, containerW, containerH, mediaW, mediaH);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((overlay.rotation * Math.PI) / 180);
    ctx.scale(overlay.scale, overlay.scale);

    if (overlay.imageUrl) {
      const img = imageCache.get(overlay.imageUrl);
      if (img) {
        const cssW = Math.min(maxImageCss, img.naturalWidth);
        const cssH = (img.naturalHeight / img.naturalWidth) * cssW;
        const w = cssW * fontScale;
        const h = cssH * fontScale;
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
      }
    } else if (overlay.text) {
      const size = overlay.fontSize * fontScale;
      ctx.font = `600 ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = overlay.color;
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowOffsetX = 2 * fontScale;
      ctx.shadowOffsetY = 2 * fontScale;
      ctx.shadowBlur = 4 * fontScale;
      ctx.fillText(overlay.text, 0, 0);
      ctx.shadowColor = 'transparent';
    }

    ctx.restore();
  }
}

function toFlattenOverlays(
  overlays: CameraTextOverlay[],
  contained: ContainedRect,
  containerW: number,
  containerH: number,
  mediaW: number,
  mediaH: number,
): FlattenOverlay[] {
  const fontScale = mediaW / Math.max(contained.width, 1);

  return overlays.map((overlay) => {
    const { x, y } = mapPoint(overlay.x, overlay.y, contained, containerW, containerH, mediaW, mediaH);
    const xPct = (x / mediaW) * 100;
    const yPct = (y / mediaH) * 100;

    if (overlay.imageUrl) {
      const widthPct = ((200 * fontScale * overlay.scale) / mediaW) * 100;
      return {
        id: overlay.id,
        xPct,
        yPct,
        rotation: overlay.rotation,
        scale: overlay.scale,
        kind: 'image' as const,
        imageUrl: overlay.imageUrl,
        widthPct,
      };
    }

    return {
      id: overlay.id,
      xPct,
      yPct,
      rotation: overlay.rotation,
      scale: overlay.scale,
      kind: 'text' as const,
      text: overlay.text,
      fontSize: overlay.fontSize * fontScale,
      color: overlay.color,
      fontWeight: 600,
    };
  });
}

async function bakePhoto(
  source: Blob,
  overlays: CameraTextOverlay[],
  drawings: CameraDrawPath[],
  opts: BakeOptions,
): Promise<Blob> {
  const url = URL.createObjectURL(source);
  try {
    const img = await loadImage(url);
    const mediaW = img.naturalWidth;
    const mediaH = img.naturalHeight;
    const containerW = Math.max(opts.displayWidth ?? mediaW, 1);
    const containerH = Math.max(opts.displayHeight ?? mediaH, 1);
    const contained = computeContainedRect(mediaW, mediaH, containerW, containerH);

    const canvas = document.createElement('canvas');
    canvas.width = mediaW;
    canvas.height = mediaH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable');

    ctx.drawImage(img, 0, 0);

    const imageCache = new Map<string, HTMLImageElement>();
    await Promise.all(
      overlays
        .filter((o) => o.imageUrl)
        .map(async (o) => {
          try {
            imageCache.set(o.imageUrl!, await loadImage(o.imageUrl!));
          } catch {
            /* skip broken sticker images */
          }
        }),
    );

    drawPaths(ctx, drawings, contained, containerW, containerH, mediaW, mediaH);
    drawCameraOverlays(ctx, overlays, contained, containerW, containerH, mediaW, mediaH, imageCache);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
        'image/jpeg',
        opts.imageQuality ?? 0.92,
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Bake overlays/drawings into camera media. Returns original blob when there is nothing to bake. */
export async function bakeCameraEdits(
  source: Blob | File,
  mediaType: 'photo' | 'video',
  overlays: CameraTextOverlay[],
  drawings: CameraDrawPath[],
  opts: BakeOptions = {},
): Promise<Blob> {
  if (overlays.length === 0 && drawings.length === 0) {
    return source;
  }

  if (mediaType === 'photo') {
    return bakePhoto(source, overlays, drawings, opts);
  }

  // Video: best-effort overlay bake via flattenVideo; drawings skipped if re-encode unavailable.
  if (typeof MediaRecorder === 'undefined') {
    return source;
  }

  const probeUrl = URL.createObjectURL(source);
  let mediaW = 0;
  let mediaH = 0;
  try {
    const video = document.createElement('video');
    video.src = probeUrl;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Failed to load video'));
    });
    mediaW = video.videoWidth;
    mediaH = video.videoHeight;
  } finally {
    URL.revokeObjectURL(probeUrl);
  }

  if (!mediaW || !mediaH) return source;

  const containerW = Math.max(opts.displayWidth ?? mediaW, 1);
  const containerH = Math.max(opts.displayHeight ?? mediaH, 1);
  const contained = computeContainedRect(mediaW, mediaH, containerW, containerH);
  const flattenOverlays = toFlattenOverlays(overlays, contained, containerW, containerH, mediaW, mediaH);

  try {
    return await flattenVideo(source, flattenOverlays, { referenceWidth: mediaW });
  } catch {
    return source;
  }
}

export function bakedCameraFileName(mediaType: 'photo' | 'video', mimeType: string): string {
  if (mediaType === 'video') {
    return mimeType.includes('mp4') ? 'camera-video.mp4' : 'camera-video.webm';
  }
  return 'camera-photo.jpg';
}
