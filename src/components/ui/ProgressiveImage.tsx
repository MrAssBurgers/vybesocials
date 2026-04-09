import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface ProgressiveImageProps {
  src: string;
  alt?: string;
  className?: string;
  containerClassName?: string;
  aspectRatio?: string;
}

/**
 * Progressive image component with blur-up loading effect.
 * Shows a blurred gradient placeholder that smoothly transitions to the full image.
 */
export function ProgressiveImage({ src, alt = '', className, containerClassName, aspectRatio }: ProgressiveImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    // If image is already cached, mark as loaded immediately
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setLoaded(true);
    }
  }, [src]);

  if (error) {
    return (
      <div className={cn("bg-gradient-to-br from-muted/40 to-muted/20", containerClassName)} style={{ aspectRatio }} />
    );
  }

  return (
    <div className={cn("relative overflow-hidden", containerClassName)} style={{ aspectRatio }}>
      {/* Blur placeholder */}
      <div 
        className={cn(
          "absolute inset-0 bg-gradient-to-br from-primary/5 via-muted/20 to-accent/5 transition-opacity duration-700",
          loaded ? "opacity-0" : "opacity-100"
        )}
        style={{ filter: 'blur(20px)', transform: 'scale(1.1)' }}
      />
      
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        className={cn(
          "w-full h-full object-cover transition-all duration-500 ease-out",
          loaded ? "opacity-100 blur-0 scale-100" : "opacity-0 blur-sm scale-[1.02]",
          className
        )}
      />
    </div>
  );
}
