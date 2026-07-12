import { useState, useEffect, useMemo } from 'react';
import { useFastSignedUrl } from '@/hooks/useFastSignedUrl';
import { normalizeMediaUrl } from '@/lib/mediaUrl';
import { transformedImage } from '@/lib/imageTransform';
import { injectImagePreload } from '@/lib/imagePreload';

/**
 * Thumb-first image src — paints instantly, upgrades to full res in the background.
 * No opacity fade; the first available pixels show immediately.
 */
export function useProgressiveImageSrc({
  full,
  thumb,
  eager = false,
  fullWidth = 1080,
  thumbWidth = 420,
}: {
  full: string | null | undefined;
  thumb?: string | null;
  eager?: boolean;
  fullWidth?: number;
  thumbWidth?: number;
}): { src: string | undefined; isFullRes: boolean } {
  const signedFull = useFastSignedUrl(full);
  const signedThumb = useFastSignedUrl(thumb);

  const thumbSrc = useMemo(() => {
    const raw = signedThumb || normalizeMediaUrl(thumb);
    if (!raw) return undefined;
    return transformedImage(raw, { width: thumbWidth, quality: eager ? 74 : 70 }) ?? raw;
  }, [signedThumb, thumb, thumbWidth, eager]);

  const fullSrc = useMemo(() => {
    const raw = signedFull || normalizeMediaUrl(full);
    if (!raw) return undefined;
    return transformedImage(raw, { width: fullWidth, quality: eager ? 86 : 82 }) ?? raw;
  }, [signedFull, full, fullWidth, eager]);

  const instantSrc = thumbSrc || fullSrc;
  const [src, setSrc] = useState(instantSrc);
  const [isFullRes, setIsFullRes] = useState(!thumbSrc || thumbSrc === fullSrc);

  useEffect(() => {
    setSrc(instantSrc);
    const alreadyFull = !thumbSrc || !fullSrc || thumbSrc === fullSrc;
    setIsFullRes(alreadyFull);

    if (eager && instantSrc) injectImagePreload(instantSrc);
    if (alreadyFull || !fullSrc) return;

    let cancelled = false;
    const img = new Image();
    img.decoding = eager ? 'sync' : 'async';
    if (eager && 'fetchPriority' in img) {
      (img as HTMLImageElement & { fetchPriority?: string }).fetchPriority = 'high';
    }
    img.onload = () => {
      if (!cancelled) {
        setSrc(fullSrc);
        setIsFullRes(true);
      }
    };
    img.src = fullSrc;
    return () => { cancelled = true; };
  }, [instantSrc, fullSrc, thumbSrc, eager]);

  return { src, isFullRes };
}
