import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { motion, AnimatePresence, useMotionValue, PanInfo } from 'framer-motion';
import { Heart, MessageCircle, Share2, Bookmark, Volume2, VolumeX } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { cn } from '@/lib/utils';

// Detect if on mobile/tablet for simpler animations
const isMobileDevice = () => typeof window !== 'undefined' && 
  (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth < 1024);

// Detect iOS/iPadOS - these need special video handling
const isIOSDevice = () => {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/i.test(ua) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

interface Clip {
  id: string;
  media_url: string;
  thumbnail_url?: string | null;
  caption?: string | null;
  author: {
    id: string;
    username: string;
    display_name?: string | null;
    avatar_url?: string | null;
  };
  likes_count: number;
  comments_count: number;
  view_count?: number;
  is_liked?: boolean;
  is_saved?: boolean;
}

interface OptimizedClipsPlayerProps {
  clips: Clip[];
  initialIndex?: number;
  onLike?: (clipId: string) => void;
  onComment?: (clipId: string) => void;
  onShare?: (clipId: string) => void;
  onSave?: (clipId: string) => void;
  onViewAuthor?: (authorId: string) => void;
}

// Memoized single clip component for performance
const ClipItem = memo(function ClipItem({
  clip,
  isActive,
  isMuted,
  onToggleMute,
  onLike,
  onComment,
  onShare,
  onSave,
  onViewAuthor,
}: {
  clip: Clip;
  isActive: boolean;
  isMuted: boolean;
  onToggleMute: () => void;
  onLike?: (clipId: string) => void;
  onComment?: (clipId: string) => void;
  onShare?: (clipId: string) => void;
  onSave?: (clipId: string) => void;
  onViewAuthor?: (authorId: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isHolding, setIsHolding] = useState(false);
  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasPlayingBeforeHoldRef = useRef(false);
  
  const signedUrl = useSignedUrl(clip.media_url);
  const thumbnailUrl = useSignedUrl(clip.thumbnail_url || null);
  const isUrlLoading = !signedUrl;
  
  // Track if this is iOS for special handling
  const isIOS = useMemo(() => isIOSDevice(), []);

  // Handle video play/pause based on visibility - with better error handling for mobile/iPad
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !signedUrl) return;

    if (isActive && !isHolding) {
      const playVideo = async () => {
        try {
          // iOS fix: Don't wait for canplay - just try to play
          // The browser will buffer as needed
          if (isIOS) {
            // Reset video to beginning to prevent stale state
            video.currentTime = 0;
          }
          
          // Ensure video is muted for autoplay (required on iOS)
          video.muted = isMuted;
          await video.play();
          setIsPlaying(true);
        } catch (err) {
          // Autoplay blocked - try muted playback
          console.log('[Clips] Autoplay blocked, trying muted');
          video.muted = true;
          try {
            await video.play();
            setIsPlaying(true);
          } catch {
            // Still blocked - wait for user tap
            console.log('[Clips] Muted autoplay also blocked');
          }
          setIsPlaying(false);
        }
      };
      
      // Small delay helps mobile browsers stabilize
      const timeout = setTimeout(playVideo, isIOS ? 150 : 50);
      return () => clearTimeout(timeout);
    } else if (!isActive) {
      video.pause();
      // iOS fix: reset video to free memory and prevent freezing
      video.currentTime = 0;
      setIsPlaying(false);
    }
  }, [isActive, signedUrl, isHolding, isMuted, isIOS]);

  // Update mute state
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // TAP = toggle mute/unmute (Instagram Reels behavior)
  const handleTap = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    // Ignore if it was a hold gesture
    if (isHolding) return;
    
    // Toggle mute state on tap
    onToggleMute();
  }, [onToggleMute, isHolding]);

  // HOLD = pause video silently (Instagram Reels behavior)
  const handleTouchStart = useCallback(() => {
    holdTimeoutRef.current = setTimeout(() => {
      const video = videoRef.current;
      if (video && !video.paused) {
        wasPlayingBeforeHoldRef.current = true;
        video.pause();
        setIsHolding(true);
        setIsPlaying(false);
      }
    }, 150); // Short delay to differentiate tap from hold
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    
    if (isHolding) {
      // Resume playback after hold release
      const video = videoRef.current;
      if (video && wasPlayingBeforeHoldRef.current) {
        video.play().then(() => setIsPlaying(true)).catch(() => {});
      }
      setIsHolding(false);
      wasPlayingBeforeHoldRef.current = false;
    }
  }, [isHolding]);

  // Cleanup hold timeout
  useEffect(() => {
    return () => {
      if (holdTimeoutRef.current) {
        clearTimeout(holdTimeoutRef.current);
      }
    };
  }, []);

  const handleDoubleTap = useCallback(() => {
    onLike?.(clip.id);
  }, [clip.id, onLike]);

  return (
    <div 
      className="relative w-full h-full bg-black"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleTouchStart}
      onMouseUp={handleTouchEnd}
      onMouseLeave={handleTouchEnd}
    >
      {/* Thumbnail/Skeleton while loading */}
      {(!isLoaded || isUrlLoading) && (
        <div className="absolute inset-0 z-10">
          {thumbnailUrl ? (
            <img 
              src={thumbnailUrl} 
              alt="" 
              className="w-full h-full object-cover"
            />
          ) : (
            <Skeleton className="w-full h-full" />
          )}
        </div>
      )}

      {/* Video - with iPad-specific optimizations */}
      {signedUrl && (
        <video
          ref={videoRef}
          src={signedUrl}
          className="w-full h-full object-cover"
          loop
          playsInline
          webkit-playsinline="true"
          muted={isMuted}
          preload={isActive ? 'metadata' : 'none'}
          onLoadedData={() => setIsLoaded(true)}
          onCanPlay={() => setIsLoaded(true)}
          onClick={handleTap}
          onDoubleClick={handleDoubleTap}
        />
      )}

      {/* Muted Icon - ONLY visible when muted, centered with pulsing animation */}
      <AnimatePresence>
        {isMuted && isActive && !isHolding && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
          >
            <motion.div
              animate={{ 
                opacity: [0.5, 0.8, 0.5],
                scale: [1, 1.05, 1],
              }}
              transition={{ 
                duration: 2, 
                repeat: Infinity, 
                ease: 'easeInOut' 
              }}
              className="h-16 w-16 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center"
            >
              <VolumeX className="h-8 w-8 text-white/80" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* NO pause indicator when holding - Instagram doesn't show one */}

      {/* Gradient overlays */}
      <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none" />
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/40 to-transparent pointer-events-none" />

      {/* Right side actions */}
      <div className="absolute right-3 bottom-24 flex flex-col items-center gap-5 z-20">
        {/* Author avatar */}
        <button
          onClick={() => onViewAuthor?.(clip.author.id)}
          className="relative"
        >
          <Avatar className="h-11 w-11 ring-2 ring-white">
            <AvatarImage src={clip.author.avatar_url || undefined} />
            <AvatarFallback>
              {(clip.author.display_name || clip.author.username)?.[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 h-5 w-5 rounded-full bg-primary flex items-center justify-center text-xs text-primary-foreground font-bold">
            +
          </div>
        </button>

        {/* Like */}
        <button
          onClick={() => onLike?.(clip.id)}
          className="flex flex-col items-center gap-1"
        >
          <div className={cn(
            "h-11 w-11 rounded-full flex items-center justify-center transition-colors",
            clip.is_liked ? "bg-destructive" : "bg-white/20"
          )}>
            <Heart className={cn(
              "h-6 w-6",
              clip.is_liked ? "text-white fill-white" : "text-white"
            )} />
          </div>
          <span className="text-white text-xs font-medium">
            {clip.likes_count > 0 ? clip.likes_count.toLocaleString() : 'Like'}
          </span>
        </button>

        {/* Comment */}
        <button
          onClick={() => onComment?.(clip.id)}
          className="flex flex-col items-center gap-1"
        >
          <div className="h-11 w-11 rounded-full bg-white/20 flex items-center justify-center">
            <MessageCircle className="h-6 w-6 text-white" />
          </div>
          <span className="text-white text-xs font-medium">
            {clip.comments_count > 0 ? clip.comments_count.toLocaleString() : 'Comment'}
          </span>
        </button>

        {/* Save */}
        <button
          onClick={() => onSave?.(clip.id)}
          className="flex flex-col items-center gap-1"
        >
          <div className={cn(
            "h-11 w-11 rounded-full flex items-center justify-center transition-colors",
            clip.is_saved ? "bg-primary" : "bg-white/20"
          )}>
            <Bookmark className={cn(
              "h-6 w-6",
              clip.is_saved ? "text-white fill-white" : "text-white"
            )} />
          </div>
          <span className="text-white text-xs font-medium">Save</span>
        </button>

        {/* Share */}
        <button
          onClick={() => onShare?.(clip.id)}
          className="flex flex-col items-center gap-1"
        >
          <div className="h-11 w-11 rounded-full bg-white/20 flex items-center justify-center">
            <Share2 className="h-6 w-6 text-white" />
          </div>
          <span className="text-white text-xs font-medium">Share</span>
        </button>

        {/* Mute toggle */}
        <button
          onClick={onToggleMute}
          className="h-9 w-9 rounded-full bg-black/50 flex items-center justify-center"
        >
          {isMuted ? (
            <VolumeX className="h-4 w-4 text-white" />
          ) : (
            <Volume2 className="h-4 w-4 text-white" />
          )}
        </button>
      </div>

      {/* Bottom info */}
      <div className="absolute left-4 right-20 bottom-6 z-20">
        <button 
          onClick={() => onViewAuthor?.(clip.author.id)}
          className="flex items-center gap-2 mb-2"
        >
          <span className="text-white font-semibold">
            @{clip.author.username}
          </span>
        </button>
        {clip.caption && (
          <p className="text-white text-sm line-clamp-2">
            {clip.caption}
          </p>
        )}
      </div>
    </div>
  );
});

export function OptimizedClipsPlayer({
  clips,
  initialIndex = 0,
  onLike,
  onComment,
  onShare,
  onSave,
  onViewAuthor,
}: OptimizedClipsPlayerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isMuted, setIsMuted] = useState(() => {
    const saved = localStorage.getItem('clips-muted');
    return saved ? saved === 'true' : true;
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const y = useMotionValue(0);
  const dragStartY = useRef(0);

  // Persist mute preference
  const handleToggleMute = useCallback(() => {
    setIsMuted(prev => {
      const newValue = !prev;
      localStorage.setItem('clips-muted', String(newValue));
      return newValue;
    });
  }, []);

  // Only render 3 clips at a time (previous, current, next)
  const visibleClips = useMemo(() => {
    const result: { clip: Clip; index: number }[] = [];
    
    if (currentIndex > 0 && clips[currentIndex - 1]) {
      result.push({ clip: clips[currentIndex - 1], index: currentIndex - 1 });
    }
    
    if (clips[currentIndex]) {
      result.push({ clip: clips[currentIndex], index: currentIndex });
    }
    
    if (currentIndex < clips.length - 1 && clips[currentIndex + 1]) {
      result.push({ clip: clips[currentIndex + 1], index: currentIndex + 1 });
    }
    
    return result;
  }, [clips, currentIndex]);

  // Handle swipe navigation
  const handleDragEnd = useCallback((event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const threshold = 50;
    const velocity = info.velocity.y;
    const offset = info.offset.y;

    if (offset < -threshold || velocity < -500) {
      // Swipe up - next clip
      if (currentIndex < clips.length - 1) {
        setCurrentIndex(prev => prev + 1);
      }
    } else if (offset > threshold || velocity > 500) {
      // Swipe down - previous clip
      if (currentIndex > 0) {
        setCurrentIndex(prev => prev - 1);
      }
    }

    y.set(0);
  }, [currentIndex, clips.length, y]);

  // Handle scroll/wheel for desktop only - use passive listener on mobile
  const handleWheel = useCallback((e: WheelEvent) => {
    // Only prevent default on desktop where wheel scroll hijacking is intentional
    if (window.matchMedia('(pointer: fine)').matches) {
      e.preventDefault();
      
      if (e.deltaY > 30 && currentIndex < clips.length - 1) {
        setCurrentIndex(prev => prev + 1);
      } else if (e.deltaY < -30 && currentIndex > 0) {
        setCurrentIndex(prev => prev - 1);
      }
    }
  }, [currentIndex, clips.length]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Only add wheel handler on desktop
    const isDesktop = window.matchMedia('(pointer: fine)').matches;
    if (isDesktop) {
      container.addEventListener('wheel', handleWheel, { passive: false });
      return () => container.removeEventListener('wheel', handleWheel);
    }
  }, [handleWheel]);

  // Use simpler rendering on mobile to prevent crashes - MUST be before early return
  const isMobile = useMemo(() => isMobileDevice(), []);

  if (clips.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-black">
        <p className="text-white/60">No clips available</p>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="relative h-full w-full bg-black overflow-hidden"
      style={{ touchAction: 'pan-y' }}
    >
      {isMobile ? (
        // Simpler mobile version - no complex animations
        <div className="h-full w-full">
          {clips[currentIndex] && (
            <ClipItem
              clip={clips[currentIndex]}
              isActive={true}
              isMuted={isMuted}
              onToggleMute={handleToggleMute}
              onLike={onLike}
              onComment={onComment}
              onShare={onShare}
              onSave={onSave}
              onViewAuthor={onViewAuthor}
            />
          )}
          {/* Touch zones for navigation */}
          <div 
            className="absolute top-0 left-0 right-0 h-1/3 z-10"
            onClick={() => currentIndex > 0 && setCurrentIndex(prev => prev - 1)}
          />
          <div 
            className="absolute bottom-0 left-0 right-0 h-1/3 z-10"
            onClick={() => currentIndex < clips.length - 1 && setCurrentIndex(prev => prev + 1)}
          />
        </div>
      ) : (
        // Desktop version with full animations
        <motion.div
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={0.2}
          onDragEnd={handleDragEnd}
          style={{ y }}
          className="h-full w-full"
        >
          <AnimatePresence mode="popLayout" initial={false}>
            {visibleClips.map(({ clip, index }) => (
              <motion.div
                key={clip.id}
                initial={{ opacity: 0, y: index > currentIndex ? '100%' : '-100%' }}
                animate={{ 
                  opacity: index === currentIndex ? 1 : 0,
                  y: index === currentIndex ? 0 : index > currentIndex ? '100%' : '-100%',
                }}
                exit={{ opacity: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="absolute inset-0"
              >
                <ClipItem
                  clip={clip}
                  isActive={index === currentIndex}
                  isMuted={isMuted}
                  onToggleMute={handleToggleMute}
                  onLike={onLike}
                  onComment={onComment}
                  onShare={onShare}
                  onSave={onSave}
                  onViewAuthor={onViewAuthor}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Progress indicators */}
      <div className="absolute top-2 left-2 right-2 flex gap-1 z-30">
        {clips.map((_, index) => (
          <div
            key={index}
            className={cn(
              "h-0.5 flex-1 rounded-full transition-colors",
              index === currentIndex ? "bg-white" : "bg-white/30"
            )}
          />
        ))}
      </div>
    </div>
  );
}
