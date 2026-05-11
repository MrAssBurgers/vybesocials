import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Eye } from 'lucide-react';
import { ShortCard } from './ShortCard';
import { Button } from '@/components/ui/button';
import { VideoThumbnail } from '@/components/ui/VideoThumbnail';

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

interface ClipsGridProps {
  clips: ClipPost[];
}

function ClipThumbnail({ clip, onClick }: { clip: ClipPost; onClick: () => void }) {
  const signedUrl = useSignedUrl(clip.media_url);

  const formatViewCount = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count?.toString() || '0';
  };

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="aspect-[9/16] relative group cursor-pointer overflow-hidden rounded-lg bg-muted"
      onClick={onClick}
    >
      {/* Video thumbnail */}
      <video
        src={signedUrl || ''}
        className="w-full h-full object-cover"
        muted
        preload="metadata"
        playsInline
      />

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          whileHover={{ opacity: 1, scale: 1 }}
          className="opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <div className="w-16 h-16 rounded-full bg-white/30 backdrop-blur-sm flex items-center justify-center">
            <Play className="h-8 w-8 text-white ml-1" fill="white" />
          </div>
        </motion.div>
      </div>

      {/* Play icon overlay (always visible) */}
      <div className="absolute top-2 left-2 p-1.5 rounded-full bg-black/50">
        <Play className="h-3 w-3 text-white" fill="white" />
      </div>

      {/* View count at bottom */}
      <div className="absolute bottom-2 left-2 flex items-center gap-1 text-white text-xs font-medium drop-shadow-lg">
        <Eye className="h-3.5 w-3.5" />
        <span>{formatViewCount(clip.view_count || 0)}</span>
      </div>
    </motion.div>
  );
}

export function ClipsGrid({ clips }: ClipsGridProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const handleOpen = (index: number) => {
    setSelectedIndex(index);
    document.body.style.overflow = 'hidden';
  };

  const handleClose = () => {
    setSelectedIndex(null);
    document.body.style.overflow = '';
  };

  const handlePrev = () => {
    if (selectedIndex !== null && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1);
    }
  };

  const handleNext = () => {
    if (selectedIndex !== null && selectedIndex < clips.length - 1) {
      setSelectedIndex(selectedIndex + 1);
    }
  };

  if (clips.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-4xl mb-4">🎬</p>
        <p className="text-muted-foreground">No clips yet</p>
      </div>
    );
  }

  return (
    <>
      {/* Grid of thumbnails */}
      <div className="grid grid-cols-3 gap-1">
        {clips.map((clip, index) => (
          <ClipThumbnail
            key={clip.id}
            clip={clip}
            onClick={() => handleOpen(index)}
          />
        ))}
      </div>

      {/* Full-screen modal viewer - swipe/scroll navigation, no arrows */}
      <AnimatePresence>
        {selectedIndex !== null && (
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
                if (diff > 0 && selectedIndex < clips.length - 1) {
                  setSelectedIndex(selectedIndex + 1);
                } else if (diff < 0 && selectedIndex > 0) {
                  setSelectedIndex(selectedIndex - 1);
                }
              }
            }}
          >
            {/* Close button */}
            <Button
              variant="ghost"
              size="icon-round"
              className="absolute top-4 right-4 z-10 text-white bg-black/50 hover:bg-black/70 backdrop-blur-sm"
              onClick={handleClose}
            >
              <X className="h-6 w-6" strokeWidth={2.5} />
            </Button>

            {/* Clip content */}
            <div className="w-full h-full max-w-md mx-auto">
              <ShortCard post={clips[selectedIndex]} isActive={true} />
            </div>

            {/* Clip counter - minimal, non-intrusive */}
            <div className="absolute bottom-4 right-4 text-white/50 text-xs">
              {selectedIndex + 1} / {clips.length}
            </div>

            {/* Swipe hint on first clip */}
            {selectedIndex === 0 && (
              <motion.div
                className="absolute bottom-20 left-1/2 -translate-x-1/2 pointer-events-none"
                initial={{ opacity: 1 }}
                animate={{ opacity: 0 }}
                transition={{ delay: 2, duration: 1 }}
              >
                <div className="text-white/60 text-xs flex flex-col items-center gap-1">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                  <span>Swipe</span>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}