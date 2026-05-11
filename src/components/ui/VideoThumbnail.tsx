import { memo, useState, useEffect, useRef } from 'react';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { cn } from '@/lib/utils';

// In-memory poster cache so re-mounting the grid is instant
const posterCache = new Map<string, string>();

interface VideoThumbnailProps {
  videoUrl: string;
  thumbnailUrl?: string | null;
  alt?: string;
  className?: string;
  onError?: () => void;
}

export const VideoThumbnail = memo(function VideoThumbnail({
  videoUrl,
  thumbnailUrl,
  alt = 'Video thumbnail',
  className,
  onError,
}: VideoThumbnailProps) {
  const [generatedThumbnail, setGeneratedThumbnail] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  
  const signedThumbnail = useSignedUrl(thumbnailUrl);
  const signedVideo = useSignedUrl(videoUrl);

  // If we have a signed thumbnail URL, use it
  const displayUrl = signedThumbnail || generatedThumbnail;

  // Generate thumbnail from video if no thumbnail URL exists
  useEffect(() => {
    if (signedThumbnail || !signedVideo || generatedThumbnail) return;

    const video = document.createElement('video');
    videoRef.current = video;
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.preload = 'metadata';

    const handleLoadedData = () => {
      // Seek to 1 second or 10% of video duration
      video.currentTime = Math.min(1, video.duration * 0.1);
    };

    const handleSeeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 360;
        
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          setGeneratedThumbnail(dataUrl);
          setIsLoading(false);
        }
      } catch (err) {
        console.warn('Failed to generate thumbnail:', err);
        setHasError(true);
        setIsLoading(false);
      }
      
      // Cleanup
      video.src = '';
      video.load();
    };

    const handleError = () => {
      setHasError(true);
      setIsLoading(false);
      onError?.();
    };

    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('error', handleError);

    video.src = signedVideo;
    video.load();

    return () => {
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('error', handleError);
      video.src = '';
      videoRef.current = null;
    };
  }, [signedVideo, signedThumbnail, generatedThumbnail, onError]);

  // Handle signed thumbnail loading
  useEffect(() => {
    if (signedThumbnail) {
      setIsLoading(false);
    }
  }, [signedThumbnail]);

  if (hasError || (!displayUrl && !isLoading)) {
    return (
      <div className={cn(
        "w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/50",
        className
      )}>
        <Play className="h-12 w-12 text-muted-foreground/50" />
      </div>
    );
  }

  if (isLoading && !displayUrl) {
    return (
      <div className={cn(
        "w-full h-full bg-gradient-to-br from-muted to-muted/50 animate-pulse",
        className
      )} />
    );
  }

  return (
    <img
      src={displayUrl || ''}
      alt={alt}
      className={cn("w-full h-full object-cover", className)}
      onError={() => {
        setHasError(true);
        onError?.();
      }}
    />
  );
});
