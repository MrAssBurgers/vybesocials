import { useEffect, useRef } from 'react';

// Preload videos by creating link preload elements
export function useVideoPreload(videoUrls: (string | null | undefined)[]) {
  const preloadedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const validUrls = videoUrls.filter((url): url is string => 
      !!url && !preloadedRef.current.has(url)
    );

    validUrls.forEach((url) => {
      // Create a link preload element
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'video';
      link.href = url;
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
      
      preloadedRef.current.add(url);

      // Also preload with fetch for better caching
      fetch(url, { mode: 'cors', credentials: 'omit' })
        .catch(() => {}); // Silently fail
    });
  }, [videoUrls]);
}

// Preload a single video element
export function preloadVideo(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.src = url;
    video.onloadeddata = () => resolve();
    video.onerror = reject;
  });
}
