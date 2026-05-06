import { useState, useRef, useCallback, useEffect, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, Volume2, VolumeX, Loader2, AlertCircle, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/hooks/useVideoProcessor';
import { useInView } from 'react-intersection-observer';

interface VideoBubbleProps {
  src: string;
  thumbnail?: string;
  duration?: number;
  caption?: string;
  isOwn?: boolean;
  uploadProgress?: number;
  status?: 'processing' | 'uploading' | 'sent' | 'failed';
  onRetry?: () => void;
  onFullscreen?: () => void;
  className?: string;
}

export const VideoBubble = memo(function VideoBubble({
  src,
  thumbnail,
  duration,
  caption,
  isOwn = false,
  uploadProgress,
  status = 'sent',
  onRetry,
  onFullscreen,
  className,
}: VideoBubbleProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [generatedPoster, setGeneratedPoster] = useState<string | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout>();

  // Fallback: when no thumbnail prop is provided (legacy clips on Android
  // WebView where preload="metadata" doesn't paint), extract the first frame
  // ourselves so the chat bubble doesn't sit blank.
  useEffect(() => {
    if (thumbnail || generatedPoster || !src || error) return;
    let cancelled = false;
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous';
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.src = src;
    const onSeeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = v.videoWidth || 320;
        canvas.height = v.videoHeight || 320;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
          if (!cancelled) setGeneratedPoster(canvas.toDataURL('image/jpeg', 0.7));
        }
      } catch {}
      v.removeAttribute('src');
      v.load();
    };
    const onLoaded = () => {
      try { v.currentTime = Math.min(0.1, (v.duration || 1) * 0.05); } catch { onSeeked(); }
    };
    v.addEventListener('loadedmetadata', onLoaded);
    v.addEventListener('seeked', onSeeked);
    v.addEventListener('error', () => { if (!cancelled) setGeneratedPoster(null); });
    return () => {
      cancelled = true;
      v.removeEventListener('loadedmetadata', onLoaded);
      v.removeEventListener('seeked', onSeeked);
      v.removeAttribute('src');
    };
  }, [src, thumbnail, generatedPoster, error]);

  const posterSrc = thumbnail || generatedPoster || undefined;

  // Auto-pause when scrolled out of view
  const { ref: inViewRef, inView } = useInView({
    threshold: 0.5,
  });

  // Combine refs
  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      inViewRef(node);
    },
    [inViewRef]
  );

  // Pause when scrolled out of view
  useEffect(() => {
    if (!inView && isPlaying && videoRef.current) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  }, [inView, isPlaying]);

  const handlePlayPause = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!videoRef.current || status !== 'sent') return;
    
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().catch(console.error);
      setIsPlaying(true);
      
      // Hide controls after 2s of playing
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 2000);
    }
  }, [isPlaying, status]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onFullscreen?.();
  }, [onFullscreen]);

  const toggleMute = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  }, [isMuted]);

  const handleMouseEnter = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 1000);
    }
  }, [isPlaying]);

  const handleVideoEnd = useCallback(() => {
    setIsPlaying(false);
    setShowControls(true);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
    }
  }, []);

  // Progress ring for uploading state
  const progressRingRadius = 20;
  const progressRingCircumference = 2 * Math.PI * progressRingRadius;
  const progressOffset = progressRingCircumference - ((uploadProgress || 0) / 100) * progressRingCircumference;

  const isUploading = status === 'uploading' || status === 'processing';
  const isFailed = status === 'failed';

  return (
    <div
      ref={setRefs}
      className={cn(
        "relative rounded-2xl overflow-hidden cursor-pointer select-none",
        "w-48 sm:w-56 aspect-square",
        isOwn ? "ml-auto" : "mr-auto",
        className
      )}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handlePlayPause}
      onDoubleClick={handleDoubleClick}
    >
      {/* Thumbnail / Video */}
      <div className="relative w-full h-full bg-black/20">
        {/* Thumbnail shown while not playing or loading */}
        {thumbnail && (!isLoaded || !isPlaying) && (
          <img
            src={thumbnail}
            alt="Video thumbnail"
            className={cn(
              "absolute inset-0 w-full h-full object-cover",
              isUploading && "blur-sm"
            )}
          />
        )}
        
        {/* Video element */}
        <video
          ref={videoRef}
          src={src}
          className={cn(
            "absolute inset-0 w-full h-full object-cover",
            (!isPlaying || !isLoaded) && "opacity-0"
          )}
          muted={isMuted}
          playsInline
          loop
          preload="metadata"
          onLoadedData={() => setIsLoaded(true)}
          onEnded={handleVideoEnd}
          onError={() => setError(true)}
        />

        {/* Gradient overlay for controls visibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />

        {/* Play/Pause overlay */}
        <AnimatePresence>
          {(showControls || !isPlaying) && status === 'sent' && !error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <div className="p-3 rounded-full bg-black/50 backdrop-blur-sm">
                {isPlaying ? (
                  <Pause className="h-6 w-6 text-white" fill="white" />
                ) : (
                  <Play className="h-6 w-6 text-white ml-0.5" fill="white" />
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Upload progress ring */}
        {isUploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <svg className="w-14 h-14 -rotate-90">
              {/* Background circle */}
              <circle
                cx="28"
                cy="28"
                r={progressRingRadius}
                className="fill-none stroke-white/30"
                strokeWidth="3"
              />
              {/* Progress circle */}
              <circle
                cx="28"
                cy="28"
                r={progressRingRadius}
                className="fill-none stroke-white"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={progressRingCircumference}
                strokeDashoffset={progressOffset}
                style={{ transition: 'stroke-dashoffset 0.3s ease' }}
              />
            </svg>
            <div className="absolute">
              <Loader2 className="h-5 w-5 text-white animate-spin" />
            </div>
          </div>
        )}

        {/* Failed state */}
        {isFailed && (
          <div 
            className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 gap-2"
            onClick={(e) => {
              e.stopPropagation();
              onRetry?.();
            }}
          >
            <AlertCircle className="h-6 w-6 text-red-400" />
            <button className="flex items-center gap-1 text-xs text-white bg-white/20 px-3 py-1.5 rounded-full">
              <RotateCcw className="h-3 w-3" />
              Retry
            </button>
          </div>
        )}

        {/* Error state */}
        {error && status === 'sent' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <AlertCircle className="h-8 w-8 text-red-400" />
          </div>
        )}

        {/* Duration badge */}
        {duration !== undefined && !isUploading && !isFailed && (
          <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/60 text-white text-xs font-medium">
            {formatDuration(duration)}
          </div>
        )}

        {/* Mute toggle (visible when playing) */}
        <AnimatePresence>
          {isPlaying && showControls && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={toggleMute}
              className="absolute bottom-2 left-2 p-1.5 rounded-full bg-black/60"
            >
              {isMuted ? (
                <VolumeX className="h-3.5 w-3.5 text-white" />
              ) : (
                <Volume2 className="h-3.5 w-3.5 text-white" />
              )}
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Caption */}
      {caption && (
        <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent">
          <p className="text-white text-sm line-clamp-2">{caption}</p>
        </div>
      )}
    </div>
  );
});
