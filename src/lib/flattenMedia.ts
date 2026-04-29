/**
 * Flatten text/sticker overlays into the underlying media so the saved
 * post permanently contains the user's edits.
 *
 * - Photos: drawn onto a <canvas> and exported via canvas.toBlob().
 * - Videos: composited frame-by-frame using requestVideoFrameCallback (or rAF
 *   fallback) and re-encoded with MediaRecorder. Audio is preserved.
 *
 * Overlays are positioned in *percent* of the source media so they survive
 * different display sizes. Rotation is in degrees, scale is multiplicative.
 */

export interface FlattenOverlay {
  /** unique id for React keys / debug */
  id: string;
  /** percent from the left edge of the media (0..100) — anchor is overlay center */
  xPct: number;
  /** percent from the top edge of the media (0..100) — anchor is overlay center */
  yPct: number;
  /** rotation in degrees */
  rotation?: number;
  /** uniform scale multiplier */
  scale?: number;
  /**
   * Either rendered HTML/SVG (image overlays, emoji, stickers) provided as an
   * HTMLImageElement / loaded sticker URL, or a text overlay.
   */
  kind: 'text' | 'image';
  /** for kind='text' */
  text?: string;
  fontSize?: number; // in pixels relative to a 1080-wide canvas
  color?: string;
  background?: string; // optional pill background
  fontWeight?: number | string;
  /** for kind='image' */
  imageUrl?: string;
  widthPct?: number; // percent of source width
}

interface FlattenOptions {
  /** Reference width used to scale font sizes. Defaults to 1080. */
  referenceWidth?: number;
  /** mime type for the output. Defaults to 'image/jpeg' for photos. */
  imageMimeType?: string;
  /** quality for jpeg/webp encoding (0..1). */
  imageQuality?: number;
  /** mime for video encoding. Falls back to a supported codec automatically. */
  videoMimeType?: string;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function drawOverlays(
  ctx: CanvasRenderingContext2D,
  overlays: FlattenOverlay[],
  width: number,
  height: number,
  referenceWidth: number,
  imageCache: Map<string, HTMLImageElement>,
) {
  const scaleFactor = width / referenceWidth;

  for (const o of overlays) {
    ctx.save();
    const x = (o.xPct / 100) * width;
    const y = (o.yPct / 100) * height;
    ctx.translate(x, y);
    if (o.rotation) ctx.rotate((o.rotation * Math.PI) / 180);
    const s = (o.scale ?? 1) * scaleFactor;
    ctx.scale(s, s);

    if (o.kind === 'text' && o.text) {
      const size = o.fontSize ?? 36;
      ctx.font = `${o.fontWeight ?? 600} ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const lines = o.text.split('\n');
      const lineHeight = size * 1.25;
      const totalHeight = lineHeight * lines.length;

      if (o.background) {
        const padX = size * 0.5;
        const padY = size * 0.25;
        const widest = Math.max(...lines.map(l => ctx.measureText(l).width));
        ctx.fillStyle = o.background;
        const bx = -widest / 2 - padX;
        const by = -totalHeight / 2 - padY;
        const bw = widest + padX * 2;
        const bh = totalHeight + padY * 2;
        const r = Math.min(bh / 2, 14);
        // rounded rect
        ctx.beginPath();
        ctx.moveTo(bx + r, by);
        ctx.arcTo(bx + bw, by, bx + bw, by + bh, r);
        ctx.arcTo(bx + bw, by + bh, bx, by + bh, r);
        ctx.arcTo(bx, by + bh, bx, by, r);
        ctx.arcTo(bx, by, bx + bw, by, r);
        ctx.closePath();
        ctx.fill();
      }

      ctx.fillStyle = o.color ?? '#ffffff';
      lines.forEach((line, i) => {
        const ly = -totalHeight / 2 + lineHeight / 2 + i * lineHeight;
        ctx.fillText(line, 0, ly);
      });
    } else if (o.kind === 'image' && o.imageUrl) {
      const img = imageCache.get(o.imageUrl);
      if (img) {
        const w = ((o.widthPct ?? 25) / 100) * referenceWidth;
        const h = (img.height / img.width) * w;
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
      }
    }

    ctx.restore();
  }
}

/** Bake overlays into a photo (Blob/File) and return a new JPEG Blob. */
export async function flattenPhoto(
  source: Blob,
  overlays: FlattenOverlay[],
  opts: FlattenOptions = {},
): Promise<Blob> {
  const url = URL.createObjectURL(source);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable');
    ctx.drawImage(img, 0, 0);

    const imageOverlays = overlays.filter(o => o.kind === 'image' && o.imageUrl);
    const cache = new Map<string, HTMLImageElement>();
    await Promise.all(imageOverlays.map(async o => {
      try { cache.set(o.imageUrl!, await loadImage(o.imageUrl!)); } catch {}
    }));

    drawOverlays(ctx, overlays, canvas.width, canvas.height, opts.referenceWidth ?? 1080, cache);

    const out: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        b => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
        opts.imageMimeType ?? 'image/jpeg',
        opts.imageQuality ?? 0.92,
      );
    });
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function pickVideoMime(preferred?: string): string {
  const candidates = [
    preferred,
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(c)) return c;
  }
  return 'video/webm';
}

/** Bake overlays into a video and return a new Blob (webm/mp4 depending on browser). */
export async function flattenVideo(
  source: Blob,
  overlays: FlattenOverlay[],
  opts: FlattenOptions = {},
): Promise<Blob> {
  if (typeof MediaRecorder === 'undefined') {
    // Best-effort fallback: return the original; caller can decide what to do.
    return source;
  }

  const url = URL.createObjectURL(source);
  const video = document.createElement('video');
  video.src = url;
  video.muted = false;
  video.playsInline = true;
  video.crossOrigin = 'anonymous';

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('Failed to load video'));
  });

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    URL.revokeObjectURL(url);
    throw new Error('2D context unavailable');
  }

  // Preload sticker images
  const cache = new Map<string, HTMLImageElement>();
  await Promise.all(
    overlays
      .filter(o => o.kind === 'image' && o.imageUrl)
      .map(async o => {
        try { cache.set(o.imageUrl!, await loadImage(o.imageUrl!)); } catch {}
      }),
  );

  // Build composited stream — video from canvas, audio from original element.
  const fps = 30;
  const canvasStream = (canvas as HTMLCanvasElement).captureStream(fps);

  // Try to grab the original audio track via captureStream on the <video>.
  let audioTrack: MediaStreamTrack | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyVideo = video as any;
  try {
    const vStream: MediaStream | undefined =
      anyVideo.captureStream?.() ?? anyVideo.mozCaptureStream?.();
    audioTrack = vStream?.getAudioTracks?.()[0] ?? null;
    if (audioTrack) canvasStream.addTrack(audioTrack);
  } catch {
    // audio capture not available — silent video
  }

  const mime = pickVideoMime(opts.videoMimeType);
  const recorder = new MediaRecorder(canvasStream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

  const referenceWidth = opts.referenceWidth ?? 1080;

  let stop = () => {};
  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
    recorder.onerror = e => reject((e as ErrorEvent).error ?? new Error('Recorder error'));
  });

  const drawFrame = () => {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    drawOverlays(ctx, overlays, canvas.width, canvas.height, referenceWidth, cache);
  };

  // Use rVFC if available for accurate sync; otherwise rAF.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasRvfc = typeof (video as any).requestVideoFrameCallback === 'function';
  let cancelled = false;

  const rvfcLoop = () => {
    if (cancelled) return;
    drawFrame();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (video as any).requestVideoFrameCallback(rvfcLoop);
  };
  const rafLoop = () => {
    if (cancelled) return;
    drawFrame();
    requestAnimationFrame(rafLoop);
  };

  recorder.start(250);
  await video.play();

  if (hasRvfc) rvfcLoop(); else rafLoop();

  stop = () => {
    cancelled = true;
    try { recorder.state !== 'inactive' && recorder.stop(); } catch {}
    try { video.pause(); } catch {}
  };

  video.onended = () => stop();

  try {
    const out = await done;
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Convenience: dispatch to photo or video flattener based on Blob type. */
export async function flattenMedia(
  source: Blob,
  overlays: FlattenOverlay[],
  opts: FlattenOptions = {},
): Promise<Blob> {
  if (overlays.length === 0) return source;
  if (source.type.startsWith('video/')) return flattenVideo(source, overlays, opts);
  return flattenPhoto(source, overlays, opts);
}
