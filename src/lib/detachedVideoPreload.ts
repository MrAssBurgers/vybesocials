const active = new Set<() => void>();
type Options = { preload: 'metadata' | 'auto'; event: 'loadedmetadata' | 'loadeddata' | 'canplaythrough'; timeout: number; signal?: AbortSignal; seekFirstFrame?: boolean; crossOrigin?: boolean };
/** Hidden media owns a single deadline and releases its decoder exactly once. */
export function preloadDetachedVideo(url: string, options: Options): Promise<void> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) { reject(new DOMException('Preload canceled', 'AbortError')); return; }
    const video = document.createElement('video');
    let finished = false;
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', cancel);
      active.delete(cancel);
      video.onloadedmetadata = video.onloadeddata = video.oncanplaythrough = video.onerror = null;
      video.removeAttribute('src');
      try { video.load(); } catch { /* optional decoder release */ }
      if (error) reject(error); else resolve();
    };
    const cancel = () => finish(new DOMException('Preload canceled', 'AbortError'));
    active.add(cancel);
    options.signal?.addEventListener('abort', cancel, { once: true });
    video.preload = options.preload;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('webkit-playsinline', 'true');
    if (options.crossOrigin) video.crossOrigin = 'anonymous';
    if (options.seekFirstFrame) video.onloadedmetadata = () => { if (!finished) { try { video.currentTime = 0.1; } catch { /* metadata may not permit a seek yet */ } } };
    video[`on${options.event}`] = () => finish();
    video.onerror = () => finish(new Error('Video preload failed'));
    const timer = setTimeout(() => finish(new Error('Video preload timed out')), options.timeout);
    video.src = url;
  });
}
export function cancelDetachedVideoPreloads(): void {
  for (const cancel of [...active]) cancel();
}
