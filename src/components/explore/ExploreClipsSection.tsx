import { memo, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Eye, X } from 'lucide-react';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ShortCard } from '@/components/posts/ShortCard';
import { MobileShortCard } from '@/components/posts/MobileShortCard';
import { useIsMobileOrTablet } from '@/hooks/use-mobile';
import { useVideoPreload } from '@/hooks/useVideoPreload';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { supabase } from '@/integrations/supabase/client';

interface ClipPost {
  id: string;
  media_url: string;
  thumbnail_url?: string | null;
  caption: string;
  tags: string[];
  author: {
    id: string;
    username: string;
    avatar_url: string | null;
  };
  like_count: number;
  comment_count: number;
  is_liked: boolean;
  is_bookmarked: boolean;
  view_count?: number;
}

interface ExploreClipsSectionProps {
  clips: ClipPost[];
  title?: string;
}

const ClipThumbnail = memo(function ClipThumbnail({ 
  clip, 
  onClick,
  index 
}: { 
  clip: ClipPost; 
  onClick: () => void;
  index: number;
}) {
  const signedUrl = useSignedUrl(clip.thumbnail_url || clip.media_url);
  const [imageError, setImageError] = useState(false);

  const formatViewCount = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count?.toString() || '0';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="aspect-[9/16] relative group cursor-pointer overflow-hidden rounded-2xl bg-card/50 border border-border/30"
      onClick={onClick}
    >
      {/* Video thumbnail */}
      {!imageError && signedUrl ? (
        <img
          src={signedUrl}
          alt={clip.caption || 'Clip'}
          className="w-full h-full object-cover"
          onError={() => setImageError(true)}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-neon-pink/20 to-neon-purple/20">
          <Play className="h-12 w-12 text-muted-foreground" />
        </div>
      )}

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-300 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          whileHover={{ opacity: 1, scale: 1 }}
          className="opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <div className="w-16 h-16 rounded-full bg-white/30 backdrop-blur-sm flex items-center justify-center border border-white/20">
            <Play className="h-8 w-8 text-white ml-1" fill="white" />
          </div>
        </motion.div>
      </div>

      {/* Play icon (always visible) */}
      <div className="absolute top-3 left-3 p-2 rounded-full bg-black/60 backdrop-blur-sm">
        <Play className="h-3 w-3 text-white" fill="white" />
      </div>

      {/* Caption preview */}
      {clip.caption && (
        <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
          <p className="text-white text-xs font-medium line-clamp-2">{clip.caption}</p>
        </div>
      )}

      {/* View count */}
      <div className="absolute top-3 right-3 flex items-center gap-1 text-white text-xs font-medium bg-black/60 backdrop-blur-sm px-2 py-1 rounded-full">
        <Eye className="h-3 w-3" />
        <span>{formatViewCount(clip.view_count || 0)}</span>
      </div>
    </motion.div>
  );
});

// Full-screen TikTok-style clip viewer
const BOTTOM_NAV_HEIGHT = 80;

function FullscreenClipViewer({
  clips,
  startIndex,
  onClose,
}: {
  clips: ClipPost[];
  startIndex: number;
  onClose: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [globalMuted, setGlobalMuted] = useState(() => {
    const stored = localStorage.getItem('vybe-clips-muted');
    return stored !== null ? stored === 'true' : true;
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const observerRef = useRef<IntersectionObserver | null>(null);
  
  const { isMobileOrTablet } = useIsMobileOrTablet();
  const { isSlowConnection } = useNetworkStatus();
  
  // Smart preload videos around current position
  const videoUrls = useMemo(() => clips.map(c => c.media_url), [clips]);
  useVideoPreload(videoUrls, { 
    currentIndex, 
    preloadDepth: isSlowConnection ? 1 : 2,
    enabled: !isSlowConnection 
  });

  // Lock body scroll when viewer is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Scroll to starting clip on mount
  useEffect(() => {
    const target = itemRefs.current[startIndex];
    if (target) {
      target.scrollIntoView({ behavior: 'instant', block: 'start' });
    }
  }, [startIndex]);

  // IntersectionObserver to track current clip
  useEffect(() => {
    if (!clips?.length) return;

    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const index = itemRefs.current.findIndex((ref) => ref === entry.target);
            if (index !== -1 && index !== currentIndex) {
              setCurrentIndex(index);
            }
          }
        });
      },
      {
        root: containerRef.current,
        threshold: 0.6,
      }
    );

    itemRefs.current.forEach((ref) => {
      if (ref) observerRef.current?.observe(ref);
    });

    return () => {
      observerRef.current?.disconnect();
    };
  }, [clips?.length, currentIndex]);

  // Keyboard navigation (desktop)
  useEffect(() => {
    if (isMobileOrTablet) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        scrollToIndex(currentIndex + 1);
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        scrollToIndex(currentIndex - 1);
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, clips?.length, isMobileOrTablet, onClose]);

  const scrollToIndex = useCallback((index: number) => {
    if (index < 0 || index >= clips.length) return;
    const target = itemRefs.current[index];
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [clips.length]);

  const handleToggleMute = useCallback(() => {
    setGlobalMuted(prev => {
      const next = !prev;
      localStorage.setItem('vybe-clips-muted', String(next));
      localStorage.setItem('clips-muted', String(next));
      // DB sync (fire-and-forget)
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (!user?.id) return;
        supabase
          .from('user_preferences' as any)
          .upsert({
            user_id: user.id,
            clips_muted: next,
            updated_at: new Date().toISOString(),
          } as any, { onConflict: 'user_id' })
          .then(() => {});
      });
      return next;
    });
  }, []);

  const containerHeight = isMobileOrTablet ? `calc(100dvh - ${BOTTOM_NAV_HEIGHT}px)` : '100dvh';
  const CardComponent = isMobileOrTablet ? MobileShortCard : ShortCard;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black"
    >
      <div
        ref={containerRef}
        className="overflow-y-scroll scrollbar-hide bg-black"
        style={{ 
          height: containerHeight,
          scrollSnapType: 'y mandatory',
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch',
          scrollSnapStop: 'always',
        }}
      >
        <div className="flex flex-col w-full">
          {clips.map((clip, index) => (
            <div
              key={clip.id}
              ref={(el) => { itemRefs.current[index] = el; }}
              className="w-full flex-shrink-0 flex justify-center"
              style={{ 
                height: containerHeight,
                scrollSnapAlign: 'start',
                scrollSnapStop: 'always',
              }}
            >
              <div className="relative h-full w-full max-w-[500px]">
                <CardComponent 
                  post={clip} 
                  isActive={index === currentIndex}
                  globalMuted={globalMuted}
                  onToggleMute={handleToggleMute}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Close button */}
        <Button
          variant="ghost"
          size="icon"
          className="fixed top-4 left-4 z-30 w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white hover:bg-black/60"
          onClick={onClose}
        >
          <X className="w-5 h-5" />
        </Button>

        {/* Progress indicator (desktop only) */}
        {!isMobileOrTablet && (
          <div className="fixed right-2 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-1 pointer-events-none">
            {clips.slice(Math.max(0, currentIndex - 3), currentIndex + 4).map((_, idx) => {
              const actualIdx = Math.max(0, currentIndex - 3) + idx;
              return (
                <div
                  key={actualIdx}
                  className="w-1 rounded-full bg-white transition-all duration-200"
                  style={{
                    height: actualIdx === currentIndex ? 20 : 6,
                    opacity: actualIdx === currentIndex ? 1 : 0.3,
                  }}
                />
              );
            })}
          </div>
        )}

        {/* Swipe hint on first clip (mobile) */}
        {currentIndex === startIndex && isMobileOrTablet && (
          <motion.div 
            className="fixed bottom-24 left-1/2 -translate-x-1/2 pointer-events-none z-20"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ delay: 2, duration: 1 }}
          >
            <div className="text-white/70 text-sm flex flex-col items-center animate-pulse">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
              <span className="font-medium">Swipe up</span>
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

export const ExploreClipsSection = memo(function ExploreClipsSection({ 
  clips,
  title = "Clips"
}: ExploreClipsSectionProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const handleOpen = useCallback((index: number) => {
    setSelectedIndex(index);
  }, []);

  const handleClose = useCallback(() => {
    setSelectedIndex(null);
  }, []);

  if (clips.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-neon-pink/20 to-neon-cyan/20 flex items-center justify-center mb-4 border border-border/50">
          <Play className="h-7 w-7 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-1 text-foreground">No clips yet</h3>
        <p className="text-muted-foreground text-sm">Be the first to share a clip!</p>
      </div>
    );
  }

  return (
    <>
      {/* Grid of clip thumbnails */}
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3">
        {clips.map((clip, index) => (
          <ClipThumbnail
            key={clip.id}
            clip={clip}
            index={index}
            onClick={() => handleOpen(index)}
          />
        ))}
      </div>

      {/* Full-screen TikTok-style viewer */}
      <AnimatePresence>
        {selectedIndex !== null && (
          <FullscreenClipViewer
            clips={clips}
            startIndex={selectedIndex}
            onClose={handleClose}
          />
        )}
      </AnimatePresence>
    </>
  );
});
