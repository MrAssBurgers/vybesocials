import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, Pause, Play, Eye } from 'lucide-react';
import { StoryGroup, useViewStory } from '@/hooks/useStories';
import { useAuth } from '@/lib/auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface StoryViewerProps {
  groups: StoryGroup[];
  initialGroupIndex: number;
  onClose: () => void;
}

export function StoryViewer({ groups, initialGroupIndex, onClose }: StoryViewerProps) {
  const { profile } = useAuth();
  const viewStory = useViewStory();
  
  const [groupIndex, setGroupIndex] = useState(initialGroupIndex);
  const [storyIndex, setStoryIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const currentGroup = groups[groupIndex];
  const currentStory = currentGroup?.stories[storyIndex];
  const isOwnStory = currentGroup?.user.id === profile?.id;

  const STORY_DURATION = 5000; // 5 seconds per story

  // Mark story as viewed
  useEffect(() => {
    if (currentStory && !currentStory.has_viewed && !isOwnStory) {
      viewStory.mutate(currentStory.id);
    }
  }, [currentStory?.id, isOwnStory]);

  // Progress timer
  useEffect(() => {
    if (isPaused || !currentStory) return;

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          goNext();
          return 0;
        }
        return prev + (100 / (STORY_DURATION / 100));
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isPaused, currentStory, groupIndex, storyIndex]);

  const goNext = useCallback(() => {
    if (storyIndex < currentGroup.stories.length - 1) {
      setStoryIndex((prev) => prev + 1);
      setProgress(0);
    } else if (groupIndex < groups.length - 1) {
      setGroupIndex((prev) => prev + 1);
      setStoryIndex(0);
      setProgress(0);
    } else {
      onClose();
    }
  }, [storyIndex, groupIndex, currentGroup?.stories.length, groups.length, onClose]);

  const goPrev = useCallback(() => {
    if (storyIndex > 0) {
      setStoryIndex((prev) => prev - 1);
      setProgress(0);
    } else if (groupIndex > 0) {
      setGroupIndex((prev) => prev - 1);
      setStoryIndex(groups[groupIndex - 1].stories.length - 1);
      setProgress(0);
    }
  }, [storyIndex, groupIndex, groups]);

  const handleClick = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width / 3) {
      goPrev();
    } else if (x > (rect.width * 2) / 3) {
      goNext();
    }
  };

  if (!currentStory) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black flex items-center justify-center"
    >
      {/* Desktop navigation arrows */}
      <Button
        variant="ghost"
        size="icon"
        onClick={goPrev}
        disabled={groupIndex === 0 && storyIndex === 0}
        className="hidden md:flex absolute left-4 text-white hover:bg-white/20 z-20"
      >
        <ChevronLeft className="h-8 w-8" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        onClick={goNext}
        className="hidden md:flex absolute right-4 text-white hover:bg-white/20 z-20"
      >
        <ChevronRight className="h-8 w-8" />
      </Button>

      {/* Story Container */}
      <div 
        className="relative w-full h-full md:w-[400px] md:h-[700px] md:rounded-2xl overflow-hidden"
        onClick={handleClick}
        onMouseDown={() => setIsPaused(true)}
        onMouseUp={() => setIsPaused(false)}
        onMouseLeave={() => setIsPaused(false)}
        onTouchStart={() => setIsPaused(true)}
        onTouchEnd={() => setIsPaused(false)}
      >
        {/* Story Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStory.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0"
          >
            {currentStory.media_type === 'video' ? (
              <video
                src={currentStory.media_url}
                className="w-full h-full object-cover"
                autoPlay
                muted
                playsInline
              />
            ) : (
              <img
                src={currentStory.media_url}
                alt=""
                className="w-full h-full object-cover"
              />
            )}
          </motion.div>
        </AnimatePresence>

        {/* Gradient overlays */}
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/60 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/60 to-transparent" />

        {/* Progress bars */}
        <div className="absolute top-2 inset-x-2 flex gap-1 z-10">
          {currentGroup.stories.map((_, i) => (
            <div key={i} className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-white rounded-full"
                initial={{ width: 0 }}
                animate={{ 
                  width: i < storyIndex ? '100%' : i === storyIndex ? `${progress}%` : '0%' 
                }}
              />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="absolute top-6 inset-x-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 border-2 border-white">
              <AvatarImage src={currentGroup.user.avatar_url || undefined} />
              <AvatarFallback>{currentGroup.user.username?.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-white font-semibold text-sm">
                {currentGroup.user.display_name || currentGroup.user.username}
              </p>
              <p className="text-white/70 text-xs">
                {formatDistanceToNow(new Date(currentStory.created_at), { addSuffix: true })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                setIsPaused(!isPaused);
              }}
              className="text-white hover:bg-white/20"
            >
              {isPaused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="text-white hover:bg-white/20"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Caption */}
        {currentStory.caption && (
          <div className="absolute bottom-20 inset-x-4 z-10">
            <p className="text-white text-center text-sm bg-black/30 rounded-lg px-4 py-2 backdrop-blur-sm">
              {currentStory.caption}
            </p>
          </div>
        )}

        {/* View count for own stories */}
        {isOwnStory && (
          <div className="absolute bottom-8 inset-x-0 flex justify-center z-10">
            <div className="flex items-center gap-2 text-white bg-black/30 rounded-full px-4 py-2">
              <Eye className="h-4 w-4" />
              <span className="text-sm">{currentStory.view_count} views</span>
            </div>
          </div>
        )}

        {/* Close friends badge */}
        {currentStory.is_close_friends_only && (
          <div className="absolute top-20 right-4 z-10">
            <div className="bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-full">
              ⭐ Close Friends
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
