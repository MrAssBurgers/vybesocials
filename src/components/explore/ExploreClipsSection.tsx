import { memo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Eye, X, ChevronUp, Volume2, VolumeX } from 'lucide-react';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ShortCard } from '@/components/posts/ShortCard';

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

function ClipViewer({
  clips,
  selectedIndex,
  onClose,
  onNavigate,
}: {
  clips: ClipPost[];
  selectedIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}) {
  const [isMuted, setIsMuted] = useState(true);
  
  const handleSwipe = useCallback((direction: 'up' | 'down') => {
    if (direction === 'up' && selectedIndex < clips.length - 1) {
      onNavigate(selectedIndex + 1);
    } else if (direction === 'down' && selectedIndex > 0) {
      onNavigate(selectedIndex - 1);
    }
  }, [selectedIndex, clips.length, onNavigate]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black flex items-center justify-center"
      onTouchStart={(e) => {
        const touch = e.touches[0];
        (e.currentTarget as any)._touchStartY = touch.clientY;
      }}
      onTouchEnd={(e) => {
        const startY = (e.currentTarget as any)._touchStartY;
        const endY = e.changedTouches[0].clientY;
        const diff = startY - endY;
        if (Math.abs(diff) > 50) {
          handleSwipe(diff > 0 ? 'up' : 'down');
        }
      }}
    >
      {/* Close button */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-4 right-4 z-20 text-white hover:bg-white/20 rounded-full"
        onClick={onClose}
      >
        <X className="h-6 w-6" />
      </Button>

      {/* Mute toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-4 left-4 z-20 text-white hover:bg-white/20 rounded-full"
        onClick={() => setIsMuted(!isMuted)}
      >
        {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
      </Button>

      {/* Clip content */}
      <div className="w-full h-full max-w-md mx-auto">
        <ShortCard 
          post={clips[selectedIndex]} 
          isActive={true}
          globalMuted={isMuted}
          onToggleMute={() => setIsMuted(!isMuted)}
        />
      </div>

      {/* Clip counter */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 backdrop-blur-sm px-4 py-2 rounded-full">
        <span className="text-white/80 text-sm font-medium">
          {selectedIndex + 1} / {clips.length}
        </span>
      </div>

      {/* Navigation hints */}
      {selectedIndex > 0 && (
        <button
          onClick={() => handleSwipe('down')}
          className="absolute top-20 left-1/2 -translate-x-1/2 text-white/60 hover:text-white transition-colors"
        >
          <ChevronUp className="h-8 w-8" />
        </button>
      )}
      
      {selectedIndex < clips.length - 1 && (
        <button
          onClick={() => handleSwipe('up')}
          className="absolute bottom-20 left-1/2 -translate-x-1/2 text-white/60 hover:text-white transition-colors rotate-180"
        >
          <ChevronUp className="h-8 w-8" />
        </button>
      )}

      {/* Swipe hint on first clip */}
      {selectedIndex === 0 && (
        <motion.div
          className="absolute bottom-32 left-1/2 -translate-x-1/2 pointer-events-none"
          initial={{ opacity: 1, y: 0 }}
          animate={{ opacity: 0, y: -10 }}
          transition={{ delay: 2, duration: 1 }}
        >
          <div className="text-white/60 text-xs flex flex-col items-center gap-1">
            <ChevronUp className="h-4 w-4 rotate-180" />
            <span>Swipe for more</span>
          </div>
        </motion.div>
      )}
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
    document.body.style.overflow = 'hidden';
  }, []);

  const handleClose = useCallback(() => {
    setSelectedIndex(null);
    document.body.style.overflow = '';
  }, []);

  const handleNavigate = useCallback((index: number) => {
    if (index >= 0 && index < clips.length) {
      setSelectedIndex(index);
    }
  }, [clips.length]);

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
      {/* Grid of clip thumbnails - 3 columns on mobile, 4-5 on larger screens */}
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

      {/* Full-screen viewer */}
      <AnimatePresence>
        {selectedIndex !== null && (
          <ClipViewer
            clips={clips}
            selectedIndex={selectedIndex}
            onClose={handleClose}
            onNavigate={handleNavigate}
          />
        )}
      </AnimatePresence>
    </>
  );
});
