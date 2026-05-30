import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { X, Pause, Play, Eye, Send, Heart, ChevronUp, Users, Megaphone, Loader2 } from 'lucide-react';
import { StoryPollViewer } from './StoryPollViewer';
import { StoryGroup, useViewStory } from '@/hooks/useStories';
import { useStoryLikes, useLikeStory } from '@/hooks/useStoryLikes';
import { useCreateConversation } from '@/hooks/useMessages';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { StoryMedia } from './StoryMedia';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { navVisibility } from '@/lib/navVisibility';
import { useShowAds } from '@/hooks/useShowAds';
import { AdUnit } from '@/components/ads/AdUnit';
import { AD_SLOTS } from '@/components/ads/FeedAdCard';
import { FullscreenPortal } from '@/components/layout/FullscreenPortal';

interface StoryViewerProps {
  groups: StoryGroup[];
  initialGroupIndex: number;
  onClose: () => void;
}

export function StoryViewer({ groups, initialGroupIndex, onClose }: StoryViewerProps) {
  const { profile } = useAuth();
  const viewStory = useViewStory();
  const likeStory = useLikeStory();
  const createConversation = useCreateConversation();
  const { showAds } = useShowAds();
  
  const [groupIndex, setGroupIndex] = useState(initialGroupIndex);
  const [storyIndex, setStoryIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [direction, setDirection] = useState(0);
  const [showLikesPanel, setShowLikesPanel] = useState(false);
  const [likeAnimating, setLikeAnimating] = useState(false);
  const [showAdInterstitial, setShowAdInterstitial] = useState(false);
  const groupsSinceAd = useRef(0);
  
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const isLongPress = useRef(false);

  const currentGroup = groups[groupIndex];
  const currentStory = currentGroup?.stories[storyIndex];
  const isOwnStory = currentGroup?.user.id === profile?.id;
  const signedAvatarUrl = useSignedUrl(currentGroup?.user.avatar_url);
  
  // Get like data for current story
  const { data: likeData } = useStoryLikes(currentStory?.id);

  const STORY_DURATION = currentStory?.media_type === 'video' ? 15000 : 5000;

  // Hide bottom nav when story viewer is open
  useEffect(() => {
    navVisibility.setInStoryViewer(true);
    return () => {
      navVisibility.setInStoryViewer(false);
    };
  }, []);

  // Mark story as viewed
  useEffect(() => {
    if (currentStory && !currentStory.has_viewed && !isOwnStory) {
      viewStory.mutate(currentStory.id);
    }
  }, [currentStory?.id, currentStory?.has_viewed, isOwnStory, viewStory]);

  // Use ref for goNext to avoid stale closure in timer
  const goNextRef = useRef<() => void>(() => {});
  useEffect(() => { goNextRef.current = goNext; });

  // Progress timer
  useEffect(() => {
    if (isPaused || !currentStory) return;

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          goNextRef.current();
          return 0;
        }
        return prev + (100 / (STORY_DURATION / 50));
      });
    }, 50);

    return () => clearInterval(interval);
  }, [isPaused, currentStory, groupIndex, storyIndex, STORY_DURATION]);

  // Reset progress when story changes
  useEffect(() => {
    setProgress(0);
  }, [currentStory?.id]);

  const adTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up ad timer on unmount
  useEffect(() => {
    return () => {
      if (adTimerRef.current) clearTimeout(adTimerRef.current);
    };
  }, []);

  const goNext = useCallback(() => {
    if (storyIndex < currentGroup.stories.length - 1) {
      setDirection(1);
      setStoryIndex((prev) => prev + 1);
      setProgress(0);
    } else if (groupIndex < groups.length - 1) {
      groupsSinceAd.current += 1;
      // Show ad interstitial every 3 groups
      if (showAds && groupsSinceAd.current >= 3) {
        groupsSinceAd.current = 0;
        setShowAdInterstitial(true);
        setIsPaused(true);
        // Auto-dismiss after 5 seconds (with cleanup)
        if (adTimerRef.current) clearTimeout(adTimerRef.current);
        adTimerRef.current = setTimeout(() => {
          adTimerRef.current = null;
          setShowAdInterstitial(false);
          setIsPaused(false);
          setDirection(1);
          setGroupIndex((prev) => prev + 1);
          setStoryIndex(0);
          setProgress(0);
        }, 5000);
        return;
      }
      setDirection(1);
      setGroupIndex((prev) => prev + 1);
      setStoryIndex(0);
      setProgress(0);
    } else {
      onClose();
    }
  }, [storyIndex, groupIndex, currentGroup?.stories.length, groups.length, onClose, showAds]);

  const goPrev = useCallback(() => {
    if (progress > 20 && storyIndex === 0 && groupIndex === 0) {
      // Just restart current story if near beginning
      setProgress(0);
      return;
    }
    
    if (storyIndex > 0) {
      setDirection(-1);
      setStoryIndex((prev) => prev - 1);
      setProgress(0);
    } else if (groupIndex > 0) {
      setDirection(-1);
      setGroupIndex((prev) => prev - 1);
      setStoryIndex(groups[groupIndex - 1].stories.length - 1);
      setProgress(0);
    } else {
      // Restart first story
      setProgress(0);
    }
  }, [storyIndex, groupIndex, groups, progress]);

  const goToNextGroup = useCallback(() => {
    if (groupIndex < groups.length - 1) {
      setDirection(1);
      setGroupIndex((prev) => prev + 1);
      setStoryIndex(0);
      setProgress(0);
    } else {
      onClose();
    }
  }, [groupIndex, groups.length, onClose]);

  const goToPrevGroup = useCallback(() => {
    if (groupIndex > 0) {
      setDirection(-1);
      setGroupIndex((prev) => prev - 1);
      setStoryIndex(0);
      setProgress(0);
    }
  }, [groupIndex]);

  const handleTouchStart = useCallback(() => {
    isLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      setIsPaused(true);
    }, 150);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
    if (isLongPress.current) {
      setIsPaused(false);
    }
    isLongPress.current = false;
  }, []);

  const handleClick = (e: React.MouseEvent | React.TouchEvent) => {
    if (isLongPress.current) return;
    
    const target = e.target as HTMLElement;
    if (target.closest('input') || target.closest('button')) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = 'touches' in e ? e.changedTouches[0].clientX : e.clientX;
    const x = clientX - rect.left;
    
    if (x < rect.width / 3) {
      goPrev();
    } else {
      goNext();
    }
  };

  const handleDragEnd = useCallback((e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const threshold = 50;
    const velocity = 0.5;
    
    const absX = Math.abs(info.offset.x);
    const absY = Math.abs(info.offset.y);
    
    // Determine dominant axis — only fire one handler
    if (absY > absX && info.offset.y > 100) {
      // Vertical swipe down — close
      onClose();
    } else if (absX > absY && (absX > threshold || Math.abs(info.velocity.x) > velocity)) {
      // Horizontal swipe — navigate between groups
      if (info.offset.x > 0) {
        goToPrevGroup();
      } else {
        goToNextGroup();
      }
    }
  }, [goToNextGroup, goToPrevGroup, onClose]);

  const handleReply = useCallback(async () => {
    const text = replyText.trim();
    if (!text || !profile?.id || !currentGroup?.user?.id) return;
    if (currentGroup.user.id === profile.id) return;

    setIsSendingReply(true);
    const content = currentStory?.caption
      ? `Re: your story (“${currentStory.caption.slice(0, 80)}”) — ${text}`
      : `Re: your story — ${text}`;

    try {
      const conversation = await createConversation.mutateAsync({
        memberIds: [currentGroup.user.id],
      });

      const { error } = await supabase.from('messages').insert({
        conversation_id: conversation.id,
        sender_id: profile.id,
        content,
        message_type: 'text',
      });

      if (error) throw error;

      toast.success('Reply sent!');
      setReplyText('');
      setShowReplyInput(false);
      setIsPaused(false);
    } catch (error) {
      console.error('[StoryViewer] reply failed:', error);
      toast.error('Could not send reply. Try again.');
    } finally {
      setIsSendingReply(false);
    }
  }, [replyText, profile?.id, currentGroup?.user?.id, currentStory?.caption, createConversation]);

  const handleLike = useCallback(() => {
    if (!currentStory || likeStory.isPending) return;
    
    const action = likeData?.hasLiked ? 'unlike' : 'like';
    
    // Animate heart
    if (action === 'like') {
      setLikeAnimating(true);
      setTimeout(() => setLikeAnimating(false), 600);
    }
    
    likeStory.mutate({ storyId: currentStory.id, action });
  }, [currentStory, likeData?.hasLiked, likeStory]);

  if (!currentStory) return null;

  const slideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? '100%' : '-100%',
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction < 0 ? '100%' : '-100%',
      opacity: 0,
    }),
  };

  return (
    <FullscreenPortal>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[6000] bg-black flex items-center justify-center"
      >
      {/* Story Container */}
      <motion.div 
        className="relative w-full h-full md:w-[400px] md:h-[700px] md:rounded-2xl overflow-hidden bg-black"
        drag
        dragSnapToOrigin
        dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
        dragElastic={0.3}
        onDragEnd={handleDragEnd}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleTouchStart}
        onMouseUp={handleTouchEnd}
        onMouseLeave={handleTouchEnd}
        onClick={handleClick}
        style={{ touchAction: 'pan-y' }}
      >
        {/* Story Content with Slide Animation */}
        <AnimatePresence mode="popLayout" custom={direction}>
          <motion.div
            key={`${groupIndex}-${storyIndex}`}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ 
              x: { type: 'tween', duration: 0.3, ease: 'easeInOut' },
              opacity: { duration: 0.2 }
            }}
            className="absolute inset-0"
          >
            <StoryMedia 
              mediaUrl={currentStory.media_url} 
              mediaType={currentStory.media_type}
              isPaused={isPaused}
            />
          </motion.div>
        </AnimatePresence>

        {/* Gradient overlays */}
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />

        {/* Progress bars */}
        <div className="absolute top-2 inset-x-2 flex gap-1 z-10 pointer-events-none">
          {currentGroup.stories.map((_, i) => (
            <div key={i} className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-white rounded-full origin-left"
                style={{
                  width: i < storyIndex ? '100%' : i === storyIndex ? `${progress}%` : '0%'
                }}
                transition={{ duration: 0.05 }}
              />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="absolute top-6 inset-x-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9 ring-2 ring-white">
              <AvatarImage src={signedAvatarUrl || undefined} />
              <AvatarFallback className="text-xs">{currentGroup.user.username?.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-white font-semibold text-sm leading-tight">
                {currentGroup.user.display_name || currentGroup.user.username}
              </p>
              <p className="text-white/70 text-xs">
                {formatDistanceToNow(new Date(currentStory.created_at), { addSuffix: true })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                setIsPaused(!isPaused);
              }}
              className="text-white hover:bg-white/20 h-8 w-8"
            >
              {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="text-white hover:bg-white/20 h-8 w-8"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Close friends badge */}
        {currentStory.is_close_friends_only && (
          <div className="absolute top-16 right-4 z-10 pointer-events-none">
            <div className="bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
              <span>⭐</span>
              <span>Close Friends</span>
            </div>
          </div>
        )}

        {/* Poll/Question Sticker */}
        {(currentStory as any).poll_data && (
          <div className="absolute bottom-28 inset-x-0 z-10">
            <StoryPollViewer
              storyId={currentStory.id}
              pollData={(currentStory as any).poll_data}
              isOwner={isOwnStory}
            />
          </div>
        )}

        {/* Caption */}
        {currentStory.caption && (
          <div className="absolute bottom-24 inset-x-4 z-10 pointer-events-none">
            <p className="text-white text-center text-sm bg-black/40 rounded-xl px-4 py-2.5 backdrop-blur-sm">
              {currentStory.caption}
            </p>
          </div>
        )}

        {/* Bottom section */}
        <div className="absolute bottom-4 inset-x-4 z-10">
          {isOwnStory ? (
            // View count + likes for own stories
            <div className="flex justify-center gap-3">
              <button 
                className="flex items-center gap-2 text-white bg-black/40 backdrop-blur-sm rounded-full px-4 py-2.5"
                onClick={(e) => e.stopPropagation()}
              >
                <Eye className="h-4 w-4" />
                <span className="text-sm font-medium">{currentStory.view_count || 0}</span>
              </button>
              
              <button 
                className="flex items-center gap-2 text-white bg-black/40 backdrop-blur-sm rounded-full px-4 py-2.5"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowLikesPanel(true);
                  setIsPaused(true);
                }}
              >
                <Heart className="h-4 w-4 fill-current text-rose-500" />
                <span className="text-sm font-medium">{likeData?.count || 0}</span>
              </button>
            </div>
          ) : (
            // Reply input + like button for others' stories
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <Input
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={`Reply to ${currentGroup.user.username}...`}
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/50 rounded-full h-10 pr-10 backdrop-blur-sm"
                  disabled={isSendingReply}
                  onFocus={() => {
                    setIsPaused(true);
                    setShowReplyInput(true);
                  }}
                  onBlur={() => {
                    if (!replyText) {
                      setIsPaused(false);
                      setShowReplyInput(false);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isSendingReply) {
                      handleReply();
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
                {(replyText || isSendingReply) && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-white hover:bg-white/20"
                    disabled={isSendingReply || !replyText.trim()}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleReply();
                    }}
                  >
                    {isSendingReply ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>
              <Button
                size="icon"
                variant="ghost"
                className={cn(
                  "text-white hover:bg-white/20 h-10 w-10 flex-shrink-0 transition-transform",
                  likeAnimating && "scale-125"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  handleLike();
                }}
              >
                <Heart className={cn(
                  "h-5 w-5 transition-all",
                  likeData?.hasLiked && "fill-current text-rose-500",
                  likeAnimating && "animate-pulse"
                )} />
              </Button>
            </div>
          )}
        </div>

        {/* Like animation overlay */}
        <AnimatePresence>
          {likeAnimating && (
            <motion.div
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0 }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"
            >
              <Heart className="h-24 w-24 text-rose-500 fill-current" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Likes panel for story owners */}
        <AnimatePresence>
          {showLikesPanel && (
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="absolute inset-x-0 bottom-0 h-[60%] bg-black/90 backdrop-blur-xl rounded-t-3xl z-30"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-white font-semibold flex items-center gap-2">
                    <Heart className="h-5 w-5 text-rose-500 fill-current" />
                    {likeData?.count || 0} Likes
                  </h3>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white"
                    onClick={() => {
                      setShowLikesPanel(false);
                      setIsPaused(false);
                    }}
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </div>
                <ScrollArea className="h-[calc(100%-60px)]">
                  {likeData?.likes && likeData.likes.length > 0 ? (
                    <div className="space-y-3">
                      {likeData.likes.map((like) => (
                        <div key={like.id} className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={like.profile?.avatar_url || undefined} />
                            <AvatarFallback>{like.profile?.username?.[0]?.toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <span className="text-white font-medium">
                            {like.profile?.display_name || like.profile?.username}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-white/50 text-center py-8">No likes yet</p>
                  )}
                </ScrollArea>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Pause indicator */}
        <AnimatePresence>
          {isPaused && !showReplyInput && !showLikesPanel && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              <div className="bg-black/50 rounded-full p-4 backdrop-blur-sm">
                <Pause className="h-8 w-8 text-white" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Side previews for desktop */}
      <div className="hidden md:block absolute left-8 top-1/2 -translate-y-1/2 opacity-30 hover:opacity-50 transition-opacity">
        {groupIndex > 0 && (
          <button
            onClick={goToPrevGroup}
            className="w-20 h-32 rounded-lg overflow-hidden bg-muted"
          >
            <div className="w-full h-full flex items-center justify-center">
              <Avatar className="h-12 w-12">
                <AvatarImage src={groups[groupIndex - 1].user.avatar_url || undefined} />
                <AvatarFallback>{groups[groupIndex - 1].user.username?.charAt(0)}</AvatarFallback>
              </Avatar>
            </div>
          </button>
        )}
      </div>
      
      <div className="hidden md:block absolute right-8 top-1/2 -translate-y-1/2 opacity-30 hover:opacity-50 transition-opacity">
        {groupIndex < groups.length - 1 && (
          <button
            onClick={goToNextGroup}
            className="w-20 h-32 rounded-lg overflow-hidden bg-muted"
          >
            <div className="w-full h-full flex items-center justify-center">
              <Avatar className="h-12 w-12">
                <AvatarImage src={groups[groupIndex + 1].user.avatar_url || undefined} />
                <AvatarFallback>{groups[groupIndex + 1].user.username?.charAt(0)}</AvatarFallback>
              </Avatar>
            </div>
          </button>
        )}
      </div>

      {/* Ad interstitial overlay */}
      <AnimatePresence>
        {showAdInterstitial && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[60] bg-background/95 backdrop-blur-md flex flex-col items-center justify-center gap-4 p-6"
          >
            <div className="flex items-center gap-1.5 mb-2">
              <Megaphone className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Sponsored</span>
            </div>
            <AdUnit 
              slot={AD_SLOTS.STORY_INTERSTITIAL} 
              format="rectangle" 
              responsive 
              className="w-full max-w-sm min-h-[250px] rounded-xl overflow-hidden"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowAdInterstitial(false);
                setIsPaused(false);
                setDirection(1);
                setGroupIndex((prev) => prev + 1);
                setStoryIndex(0);
                setProgress(0);
              }}
              className="text-muted-foreground"
            >
              Skip →
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
      </motion.div>
    </FullscreenPortal>
  );
}
