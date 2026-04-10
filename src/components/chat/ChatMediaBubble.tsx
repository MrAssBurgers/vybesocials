/**
 * ChatMediaBubble - Renders chat media (images, videos, audio) with signed URLs
 * and optional AI safety blur for flagged content.
 * Includes error handling with retry to prevent broken image placeholders.
 */

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Shield, Eye, Play, RefreshCw, ImageOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useSignedUrl } from '@/hooks/useSignedUrl';
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

  // For blob/data URLs (optimistic sends), skip signing
  const isLocalUrl = mediaUrl?.startsWith('blob:') || mediaUrl?.startsWith('data:');
  const resolvedUrl = useSignedUrl(isLocalUrl ? null : mediaUrl);
  const displayUrl = isLocalUrl ? mediaUrl : resolvedUrl;

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

  // Show skeleton while URL is resolving (not local, not yet resolved)
  if (!displayUrl && !isLocalUrl) {
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
            "rounded-xl max-w-full max-h-52 sm:max-h-64 object-cover transition-all",
            shouldBlur && "blur-2xl",
            !loaded && "opacity-0 absolute"
          )}
          loading="lazy"
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
            src={cacheBustedUrl}
            className={cn(
              "absolute inset-0 w-full h-full object-cover transition-all",
              shouldBlur && "blur-2xl",
              !loaded && "opacity-0"
            )}
            playsInline
            muted
            loop
            autoPlay
            preload="metadata"
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
  const resolvedUrl = useSignedUrl(isLocalUrl ? null : mediaUrl);
  const displayUrl = isLocalUrl ? mediaUrl : resolvedUrl;
  return <>{children(displayUrl)}</>;
}
