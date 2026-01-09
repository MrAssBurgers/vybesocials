import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, X, ChevronUp, ChevronDown, Eye } from 'lucide-react';
import { ShortCard } from './ShortCard';
import { Button } from '@/components/ui/button';
import { useSignedUrl } from '@/hooks/useSignedUrl';

interface ClipPost {
  id: string;
  media_url: string;
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

      {/* Full-screen modal viewer */}
      <AnimatePresence>
        {selectedIndex !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black flex items-center justify-center"
          >
            {/* Close button */}
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-4 right-4 z-10 text-white hover:bg-white/20"
              onClick={handleClose}
            >
              <X className="h-6 w-6" />
            </Button>

            {/* Navigation arrows */}
            {selectedIndex > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-4 left-1/2 -translate-x-1/2 z-10 text-white hover:bg-white/20"
                onClick={handlePrev}
              >
                <ChevronUp className="h-6 w-6" />
              </Button>
            )}
            {selectedIndex < clips.length - 1 && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 text-white hover:bg-white/20"
                onClick={handleNext}
              >
                <ChevronDown className="h-6 w-6" />
              </Button>
            )}

            {/* Clip content */}
            <div className="w-full h-full max-w-md mx-auto">
              <ShortCard post={clips[selectedIndex]} isActive={true} />
            </div>

            {/* Clip counter */}
            <div className="absolute bottom-4 right-4 text-white/70 text-sm">
              {selectedIndex + 1} / {clips.length}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}