/**
 * Supabase Storage image transform helper.
 *
 * Supabase exposes on-the-fly image transforms via the `/render/image/` path
 * (Pro plan). For storage URLs that already point at `/object/`, we rewrite to
 * `/render/image/` and append width/quality query params. Non-Supabase URLs
 * (CDNs, gifs, blobs, data URIs) pass through unchanged.
 *
 * Use this for any user-uploaded image rendered in a feed or grid — full-res
 * JPEGs over 3G are the #1 perceived-speed killer.
 */
const RENDER_TOKEN = '/storage/v1/render/image/';
const OBJECT_TOKEN = '/storage/v1/object/';

interface TransformOpts {
  width?: number;
  height?: number;
  /** 1-100; default 75 — good balance of fidelity vs. weight. */
  quality?: number;
  /** "cover" preserves aspect + crops; "contain" fits inside box. */
  resize?: 'cover' | 'contain' | 'fill';
}

export function transformedImage(url: string | null | undefined, opts: TransformOpts = {}): string | undefined {
  if (!url) return undefined;
  // Pass through anything we can't transform.
  if (
    url.startsWith('data:') ||
    url.startsWith('blob:') ||
    url.endsWith('.gif') ||
    url.endsWith('.svg')
  ) {
    return url;
  }
  if (!url.includes('/storage/v1/')) return url;

  const transformed = url.includes(OBJECT_TOKEN)
    ? url.replace(OBJECT_TOKEN, RENDER_TOKEN)
    : url;
  // Don't double-append if already transformed.
  if (transformed.includes('width=') || transformed.includes('height=')) {
    return transformed;
  }

  const params = new URLSearchParams();
  if (opts.width) params.set('width', String(Math.round(opts.width)));
  if (opts.height) params.set('height', String(Math.round(opts.height)));
  params.set('quality', String(opts.quality ?? 75));
  if (opts.resize) params.set('resize', opts.resize);

  const sep = transformed.includes('?') ? '&' : '?';
  return `${transformed}${sep}${params.toString()}`;
}

/** Helper for srcSet — generate 1x / 2x widths from a base CSS px width. */
export function transformedSrcSet(url: string | null | undefined, baseWidth: number, opts: Omit<TransformOpts, 'width'> = {}): string | undefined {
  const x1 = transformedImage(url, { ...opts, width: baseWidth });
  const x2 = transformedImage(url, { ...opts, width: baseWidth * 2 });
  if (!x1 || !x2) return undefined;
  return `${x1} 1x, ${x2} 2x`;
}
