/**
 * ChatMediaBubble - Renders chat media (images, videos, audio) with signed URLs
 * and optional AI safety blur for flagged content.
 * Includes error handling with retry to prevent broken image placeholders.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Shield, Eye, Play, RefreshCw, ImageOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { normalizeMediaUrl } from '@/lib/mediaUrl';
import { cn } from '@/lib/utils';

interface ChatMediaBubbleProps {
  mediaUrl: string;
  mediaType: 'image' | 'gif' | 'video' | 'audio';
  isFlagged?: boolean;
  safetyFilterEnabled?: boolean;
  isOwn?: boolean;
  content?: string | null;
  className?: string;
}

export function ChatMediaBubble({
  mediaUrl,
  mediaType,
  isFlagged = false,
  safetyFilterEnabled = false,
  isOwn = false,
  content,
  className,
}: ChatMediaBubbleProps) {
  const [revealed, setRevealed] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [signingTimedOut, setSigningTimedOut] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Only play video bubbles while they're actually on screen. A media-heavy
  // thread with unconditional autoplay keeps many decoders alive at once and
  // makes scrolling the conversation stutter.
  useEffect(() => {
    if (mediaType !== 'video') return;
    const video = videoRef.current;
    if (!video) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [mediaType, loaded]);

  // For blob/data URLs (optimistic sends), skip signing
  const normalizedMediaUrl = normalizeMediaUrl(mediaUrl) ?? mediaUrl;
  const isLocalUrl =
    normalizedMediaUrl?.startsWith('blob:') || normalizedMediaUrl?.startsWith('data:');
  const resolvedUrl = useSignedUrl(isLocalUrl ? null : normalizedMediaUrl);
  const displayUrl = isLocalUrl ? mediaUrl : resolvedUrl;

  // Timeout: if signing hasn't resolved in 8s, treat as error
  useEffect(() => {
    if (displayUrl || isLocalUrl) {
      setSigningTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setSigningTimedOut(true), 8000);
    return () => clearTimeout(timer);
  }, [displayUrl, isLocalUrl]);

  // Should we blur this media?
  const shouldBlur = isFlagged && safetyFilterEnabled && !isOwn && !revealed;

  const handleError = useCallback(() => {
    setLoadError(true);
    setLoaded(false);
  }, []);

  const handleLoad = useCallback(() => {
    setLoaded(true);
    setLoadError(false);
  }, []);

  const handleRetry = useCallback(() => {
    setLoadError(false);
    setLoaded(false);
    setRetryCount(prev => prev + 1);
  }, []);

  // Show skeleton while URL is resolving, but show error if timed out
  if (!displayUrl && !isLocalUrl) {
    if (signingTimedOut) {
      return (
        <div className={cn("relative flex flex-col items-center justify-center rounded-xl bg-muted/50 border border-border w-full h-40", content ? "mb-2" : "", className)}>
          <ImageOff className="h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-muted-foreground text-xs">Media unavailable</p>
        </div>
      );
    }
    return <Skeleton className={cn("rounded-xl w-full h-40", className)} />;
  }

  // If we have an error, show retry UI
  if (loadError) {
    return (
      <div className={cn("relative flex flex-col items-center justify-center rounded-xl bg-muted/50 border border-border w-full h-40", content ? "mb-2" : "", className)}>
        <ImageOff className="h-8 w-8 text-muted-foreground mb-2" />
        <p className="text-muted-foreground text-xs mb-2">Failed to load media</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRetry}
          className="text-xs h-7 px-3"
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Retry
        </Button>
      </div>
    );
  }

  const url = displayUrl || mediaUrl;
  // Append retry count to bust browser cache on retry
  const cacheBustedUrl = retryCount > 0 ? `${url}${url.includes('?') ? '&' : '?'}_r=${retryCount}` : url;

  if (mediaType === 'image' || mediaType === 'gif') {
    return (
      <div className={cn("relative", content ? "mb-2" : "", className)}>
        {!loaded && <Skeleton className="rounded-xl w-full h-40 absolute inset-0" />}
        <img
          src={cacheBustedUrl}
          alt={mediaType === 'gif' ? "GIF" : "Shared image"}
          className={cn(
            "rounded-xl w-auto max-w-full max-h-52 sm:max-h-64 object-cover transition-[opacity,filter] select-none",
            shouldBlur && "blur-2xl",
            !loaded && "opacity-0 absolute"
          )}
          style={{ WebkitTouchCallout: 'none', minWidth: 80 }}
          loading="lazy"
          draggable={false}
          onContextMenu={(e) => e.preventDefault()}
          onError={handleError}
          onLoad={handleLoad}
        />
        {shouldBlur && loaded && (
          <BlurOverlay onReveal={() => setRevealed(true)} />
        )}
      </div>
    );
  }

  if (mediaType === 'video') {
    return (
      <div className={cn("relative cursor-pointer group", content ? "mb-2" : "", className)}>
        <div className="relative aspect-[9/16] w-32 sm:w-40 overflow-hidden rounded-xl bg-black">
          {!loaded && <Skeleton className="absolute inset-0 rounded-xl" />}
          <video
            ref={videoRef}
            src={cacheBustedUrl}
            className={cn(
              "absolute inset-0 w-full h-full object-cover transition-[opacity,filter] select-none",
              shouldBlur && "blur-2xl",
              !loaded && "opacity-0"
            )}
            style={{ WebkitTouchCallout: 'none' }}
            playsInline
            muted
            loop
            preload="metadata"
            draggable={false}
            onContextMenu={(e) => e.preventDefault()}
            onError={handleError}
            onLoadedData={handleLoad}
          />
          {!shouldBlur && loaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center">
                <Play className="h-5 w-5 text-black ml-0.5" />
              </div>
            </div>
          )}
        </div>
        {shouldBlur && loaded && (
          <BlurOverlay onReveal={() => setRevealed(true)} />
        )}
      </div>
    );
  }

  // Audio handled separately in ChatView since AudioMessage is a specialized component
  return null;
}

function BlurOverlay({ onReveal }: { onReveal: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-black/40 backdrop-blur-sm"
    >
      <Shield className="h-6 w-6 text-white/80 mb-2" />
      <p className="text-white/90 text-xs font-medium mb-2">Content filtered</p>
      <Button
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          onReveal();
        }}
        className="text-white/70 hover:text-white text-[10px] h-6 px-2"
      >
        <Eye className="h-3 w-3 mr-1" />
        Reveal
      </Button>
    </motion.div>
  );
}

/**
 * Hook-free signed audio URL resolver for AudioMessage
 */
export function SignedAudioUrl({ mediaUrl, children }: { mediaUrl: string; children: (url: string | null) => React.ReactNode }) {
  const isLocalUrl = mediaUrl?.startsWith('blob:') || mediaUrl?.startsWith('data:');
  const normalized = normalizeMediaUrl(mediaUrl) ?? mediaUrl;
  const resolvedUrl = useSignedUrl(isLocalUrl ? null : normalized);
  const displayUrl = isLocalUrl ? mediaUrl : resolvedUrl;
  return <>{children(displayUrl)}</>;
}
