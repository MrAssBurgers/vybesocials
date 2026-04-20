import { useState, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Expand, Minimize2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MediaFallback, MediaSkeleton } from '@/components/ui/MediaFallback';
import { isValidMediaUrl } from '@/components/ui/SafeMedia';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

interface FitImageProps {
  src: string;
  alt?: string;
  className?: string;
  maxHeight?: string;
  showExpandButton?: boolean;
  mode?: 'fit' | 'fill';
  onModeChange?: (mode: 'fit' | 'fill') => void;
}

export const FitImage = memo(function FitImage({ 
  src, 
  alt = '', 
  className,
  maxHeight = '500px',
  showExpandButton = true,
  mode = 'fit',
  onModeChange,
}: FitImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [lightboxZoom, setLightboxZoom] = useState(1);

  if (!isValidMediaUrl(src)) {
    return <MediaFallback type="image" caption={alt} className={className} />;
  }

  if (hasError) {
    return <MediaFallback type="image" caption={alt} className={className} />;
  }

  const handleDoubleClick = () => {
    setIsLightboxOpen(true);
  };

  const handleZoom = (delta: number) => {
    setLightboxZoom(prev => Math.min(Math.max(prev + delta, 0.5), 3));
  };

  return (
    <>
      <div 
        className={cn(
          "relative w-full overflow-hidden bg-muted/30",
          className
        )}
        style={{ maxHeight }}
      >
        {/* Blurred background for letterboxing effect */}
        {mode === 'fit' && isLoaded && (
          <div 
            className="absolute inset-0 blur-2xl scale-110 opacity-30"
            style={{ 
              backgroundImage: `url(${src})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
        )}
        
        {/* Loading skeleton */}
        {!isLoaded && <MediaSkeleton className="absolute inset-0" />}
        
        {/* Main image */}
        <img
          src={src}
          alt={alt}
          className={cn(
            "relative w-full transition-opacity duration-300",
            mode === 'fit' ? 'object-contain' : 'object-cover',
            isLoaded ? 'opacity-100' : 'opacity-0'
          )}
          style={{ maxHeight }}
          loading="eager"
          decoding="async"
          onLoad={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
          onDoubleClick={handleDoubleClick}
        />

        {/* Controls overlay */}
        {isLoaded && (
          <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {onModeChange && (
              <Button
                variant="secondary"
                size="icon"
                className="h-7 w-7 bg-black/50 hover:bg-black/70 text-white border-0"
                onClick={() => onModeChange(mode === 'fit' ? 'fill' : 'fit')}
              >
                {mode === 'fit' ? (
                  <Expand className="h-3.5 w-3.5" />
                ) : (
                  <Minimize2 className="h-3.5 w-3.5" />
                )}
              </Button>
            )}
            {showExpandButton && (
              <Button
                variant="secondary"
                size="icon"
                className="h-7 w-7 bg-black/50 hover:bg-black/70 text-white border-0"
                onClick={() => setIsLightboxOpen(true)}
              >
                <Expand className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Lightbox */}
      <Dialog open={isLightboxOpen} onOpenChange={setIsLightboxOpen}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-black/95 border-0">
          <DialogTitle className="sr-only">Image Preview</DialogTitle>
          <div className="relative w-full h-full min-h-[50vh] flex items-center justify-center">
            {/* Close button */}
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-4 right-4 z-10 text-white hover:bg-white/10"
              onClick={() => setIsLightboxOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>

            {/* Zoom controls */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex gap-2 bg-black/50 rounded-full p-1">
              <Button
                variant="ghost"
                size="sm"
                className="text-white hover:bg-white/10 px-3"
                onClick={() => handleZoom(-0.25)}
              >
                −
              </Button>
              <span className="text-white text-sm flex items-center px-2">
                {Math.round(lightboxZoom * 100)}%
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="text-white hover:bg-white/10 px-3"
                onClick={() => handleZoom(0.25)}
              >
                +
              </Button>
            </div>

            {/* Zoomable image */}
            <motion.img
              src={src}
              alt={alt}
              className="max-w-full max-h-[90vh] object-contain cursor-grab active:cursor-grabbing"
              style={{ transform: `scale(${lightboxZoom})` }}
              drag
              dragConstraints={{ left: -200, right: 200, top: -200, bottom: 200 }}
              dragElastic={0.1}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
});

export default FitImage;
