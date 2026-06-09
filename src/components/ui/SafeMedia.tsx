import { useState, memo, useCallback, forwardRef } from 'react';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { MediaFallback, MediaSkeleton } from './MediaFallback';
import { cn } from '@/lib/utils';

interface SafeImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string | null | undefined;
  caption?: string;
  showFallback?: boolean;
}

export const SafeImage = memo(forwardRef<HTMLImageElement, SafeImageProps>(
  function SafeImage({ 
    src, 
    className, 
    caption,
    showFallback = true,
    alt,
    ...props 
  }, ref) {
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    const signedUrl = useSignedUrl(src);

    const handleLoad = useCallback(() => {
      setIsLoading(false);
      setHasError(false);
    }, []);

    const handleError = useCallback(() => {
      setIsLoading(false);
      setHasError(true);
    }, []);

    // No source provided
    if (!src) {
      if (!showFallback) return null;
      return <MediaFallback type="image" caption={caption} className={className} />;
    }

    // URL is loading
    if (!signedUrl && isLoading) {
      return <MediaSkeleton className={className} />;
    }

    // Error state
    if (hasError) {
      if (!showFallback) return null;
      return <MediaFallback type="image" caption={caption} className={className} />;
    }

    return (
      <>
        {isLoading && <MediaSkeleton className={cn("absolute inset-0", className)} />}
        <img 
          ref={ref}
          src={signedUrl || src} 
          className={cn(isLoading && "opacity-0", className)} 
          alt={alt || caption || ''}
          onLoad={handleLoad}
          onError={handleError}
          loading="lazy"
          {...props} 
        />
      </>
    );
  }
));

interface SafeVideoProps extends React.VideoHTMLAttributes<HTMLVideoElement> {
  src: string | null | undefined;
  caption?: string;
  showFallback?: boolean;
}

export const SafeVideo = memo(forwardRef<HTMLVideoElement, SafeVideoProps>(
  function SafeVideo({ 
    src, 
    className, 
    caption,
    showFallback = true,
    ...props 
  }, ref) {
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    const signedUrl = useSignedUrl(src);

    const handleLoadedData = useCallback(() => {
      setIsLoading(false);
      setHasError(false);
    }, []);

    const handleError = useCallback(() => {
      setIsLoading(false);
      setHasError(true);
    }, []);

    // No source provided
    if (!src) {
      if (!showFallback) return null;
      return <MediaFallback type="video" caption={caption} className={className} />;
    }

    // URL is loading
    if (!signedUrl && isLoading) {
      return <MediaSkeleton className={className} />;
    }

    // Error state
    if (hasError) {
      if (!showFallback) return null;
      return <MediaFallback type="video" caption={caption} className={className} />;
    }

    return (
      <>
        {isLoading && <MediaSkeleton className={cn("absolute inset-0", className)} />}
        <video 
          ref={ref}
          src={signedUrl || src} 
          className={cn(isLoading && "opacity-0", className)} 
          onLoadedData={handleLoadedData}
          onError={handleError}
          {...props} 
        />
      </>
    );
  }
));

/**
 * Utility to check if a media URL is valid
 */
export { isValidMediaUrl } from '@/lib/mediaUrl';

/**
 * Filter posts to only include those with valid media
 */
export function filterValidMediaPosts<T extends { media_url?: string | null }>(
  posts: T[] | undefined
): T[] {
  if (!posts) return [];
  return posts.filter(post => isValidMediaUrl(post.media_url));
}
