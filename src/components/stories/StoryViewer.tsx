import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { X, Pause, Play, Eye, Send, Heart, ChevronLeft, ChevronRight, Megaphone, Loader2 } from 'lucide-react';
import { StoryPollViewer } from './StoryPollViewer';
import { StoryGroup, useViewStory } from '@/hooks/useStories';
import { useStoryAccount } from '@/hooks/useStoryAccount';
import { useVisibleStory } from '@/hooks/useVisibleStory';
import { createDmChat } from '@/lib/firebase/chats';
import { insertDmMessage } from '@/lib/dmSendCore';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDistanceToNow } from 'date-fns';
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

export function StoryViewer(props: StoryViewerProps) {
  const { session, ready } = useStoryAccount();
  const opened = useRef(session).current;
  if (!ready || session.uid !== opened.uid || session.epoch !== opened.epoch) {
    return <FullscreenPortal><div role="dialog" aria-modal="true" aria-label="Story unavailable" className="fixed inset-0 z-[6000] bg-black text-white flex flex-col items-center justify-center gap-4 p-6">
      <p>Your account changed. Close stories and open them again.</p><Button onClick={props.onClose}>Close stories</Button>
    </div></FullscreenPortal>;
  }
  return <StoryViewerSession {...props} />;
}

function StoryViewerSession({ groups, initialGroupIndex, onClose }: StoryViewerProps) {
  const { profile, guard: accountGuard } = useStoryAccount();
  const viewStory = useViewStory();
  const { showAds } = useShowAds();
  
  const [groupIndex, setGroupIndex] = useState(initialGroupIndex);
  const [storyIndex, setStoryIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [direction, setDirection] = useState(0);
  const [showAdInterstitial, setShowAdInterstitial] = useState(false);
  const groupsSinceAd = useRef(0);
  
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const isLongPress = useRef(false);

  // Parent props are navigation hints only. Their private text/media may be an
  // old snapshot and must never render before this exact ID is reauthorized.
  const navigationGroup = groups[groupIndex];
  const candidateId = navigationGroup?.stories[storyIndex]?.id;
  const visible = useVisibleStory(candidateId);
  const currentStory = !visible.isError && !visible.isLoading && visible.data?.id === candidateId ? visible.data : undefined;
  const currentGroup = currentStory?.author ? { user: currentStory.author, stories: navigationGroup.stories.map(story => ({ id: story.id })) } : undefined;
  const authorizedId = useRef<string>(); authorizedId.current = currentStory?.id;
  const mounted = useRef(false);
  const sendingReply = useRef(false);
  const replyAttempt = useRef<{ key: string; id: string }>();
  useEffect(() => { mounted.current = true; return () => {
    mounted.current = false;
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  }; }, []);
  const storyGuard = useCallback((id: string) => {
    accountGuard();
    if (!mounted.current || authorizedId.current !== id) throw new Error('This story is no longer available.');
  }, [accountGuard]);
  const isOwnStory = currentGroup?.user.id === profile?.id;
  const signedAvatarUrl = useSignedUrl(currentGroup?.user.avatar_url);
  const viewedInThisViewer = useRef(new Set<string>());
  const mediaContext = useMemo(() => ({}), [currentStory?.id, currentStory?.media_url, currentStory?.media_type]);
  const currentMediaContext = useRef(mediaContext); currentMediaContext.current = mediaContext;
  const [mediaReady, setMediaReady] = useState<{ context: object; ready: boolean } | null>(null);
  const isMediaReady = mediaReady?.context === mediaContext && mediaReady.ready;
  const handleMediaReady = useCallback((ready: boolean) => {
    if (currentMediaContext.current === mediaContext) setMediaReady({ context: mediaContext, ready });
  }, [mediaContext]);

  // Hide bottom nav when story viewer is open
  useEffect(() => {
    navVisibility.setInStoryViewer(true);
    return () => {
      navVisibility.setInStoryViewer(false);
    };
  }, []);

  // Mark story as viewed
  useEffect(() => {
    if (currentStory && isMediaReady && !currentStory.has_viewed && !isOwnStory && !viewedInThisViewer.current.has(currentStory.id)) {
      // Mutation status changes and fresh audience responses can rerender the
      // viewer while this cosmetic marker is still pending.
      viewedInThisViewer.current.add(currentStory.id);
      viewStory.mutate(currentStory.id);
    }
  }, [currentStory?.id, currentStory?.has_viewed, isOwnStory, isMediaReady, viewStory]);

  // Use ref for goNext to avoid stale closure in timer
  const goNextRef = useRef<() => void>(() => {});
  useEffect(() => { goNextRef.current = goNext; });

  // Progress lives in a ref and drives the bar via direct DOM writes — React
  // state ticks would re-render the entire viewer (header, media, reply UI)
  // 4x per second for the lifetime of the story.
  const progressValueRef = useRef(0);
  const activeBarRef = useRef<HTMLDivElement | null>(null);

  const resetProgress = useCallback(() => {
    progressValueRef.current = 0;
    const bar = activeBarRef.current;
    if (bar) {
      bar.style.transition = 'none';
      bar.style.width = '0%';
      bar.setAttribute('aria-valuenow', '0');
    }
  }, []);

  // Progress timer — 4 ticks/sec; the bar's CSS transition keeps it visually
  // smooth without re-rendering the whole viewer.
  useEffect(() => {
    // Video progression follows actual playback below, including clips over 15s.
    if (isPaused || !currentStory || !isMediaReady || currentStory.media_type === 'video') return;

    const TICK_MS = 250;
    const interval = setInterval(() => {
      if (progressValueRef.current >= 100) {
        resetProgress();
        goNextRef.current();
        return;
      }
      progressValueRef.current += 100 / (5000 / TICK_MS);
      const bar = activeBarRef.current;
      if (bar) {
        bar.style.transition = 'width 250ms linear';
        bar.style.width = `${Math.min(progressValueRef.current, 100)}%`;
        bar.setAttribute('aria-valuenow', String(Math.min(progressValueRef.current, 100)));
      }
    }, TICK_MS);

    return () => clearInterval(interval);
  }, [isPaused, currentStory, isMediaReady, groupIndex, storyIndex, resetProgress]);

  const handleMediaProgress = useCallback((percent: number) => {
    if (currentMediaContext.current !== mediaContext || !currentStory) return;
    try { storyGuard(currentStory.id); } catch { return; }
    progressValueRef.current = percent;
    const bar = activeBarRef.current;
    if (bar) { bar.style.width = `${percent}%`; bar.setAttribute('aria-valuenow', String(percent)); }
  }, [mediaContext, currentStory?.id, storyGuard]);
  const handleMediaEnded = useCallback(() => {
    if (currentMediaContext.current !== mediaContext || !currentStory) return;
    try { storyGuard(currentStory.id); } catch { return; }
    goNextRef.current();
  }, [mediaContext, currentStory?.id, storyGuard]);

  // Reset progress when story changes
  useEffect(() => {
    resetProgress();
  }, [currentStory?.id, resetProgress]);

  const adTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up ad timer on unmount
  useEffect(() => {
    return () => {
      if (adTimerRef.current) clearTimeout(adTimerRef.current);
    };
  }, []);

  const goNext = useCallback(() => {
    if (!navigationGroup) { onClose(); return; }
    if (storyIndex < navigationGroup.stories.length - 1) {
      setDirection(1);
      setStoryIndex((prev) => prev + 1);
      resetProgress();
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
          resetProgress();
        }, 5000);
        return;
      }
      setDirection(1);
      setGroupIndex((prev) => prev + 1);
      setStoryIndex(0);
      resetProgress();
    } else {
      onClose();
    }
  }, [storyIndex, groupIndex, navigationGroup, groups.length, onClose, showAds, resetProgress]);

  const goPrev = useCallback(() => {
    if (progressValueRef.current > 20 && storyIndex === 0 && groupIndex === 0) {
      // Just restart current story if near beginning
      resetProgress();
      return;
    }
    
    if (storyIndex > 0) {
      setDirection(-1);
      setStoryIndex((prev) => prev - 1);
      resetProgress();
    } else if (groupIndex > 0) {
      setDirection(-1);
      setGroupIndex((prev) => prev - 1);
      setStoryIndex(groups[groupIndex - 1].stories.length - 1);
      resetProgress();
    } else {
      // Restart first story
      resetProgress();
    }
  }, [storyIndex, groupIndex, groups, resetProgress]);

  const goToNextGroup = useCallback(() => {
    if (groupIndex < groups.length - 1) {
      setDirection(1);
      setGroupIndex((prev) => prev + 1);
      setStoryIndex(0);
      resetProgress();
    } else {
      onClose();
    }
  }, [groupIndex, groups.length, onClose]);

  const goToPrevGroup = useCallback(() => {
    if (groupIndex > 0) {
      setDirection(-1);
      setGroupIndex((prev) => prev - 1);
      setStoryIndex(0);
      resetProgress();
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
    if (!text || sendingReply.current || !profile?.id || !currentGroup?.user?.id || !currentStory) return;
    if (currentGroup.user.id === profile.id) return;
    const guard = () => storyGuard(currentStory.id);
    try { guard(); } catch { return; }

    sendingReply.current = true;
    setIsSendingReply(true);
    const content = currentStory?.caption
      ? `Re: your story (“${currentStory.caption.slice(0, 80)}”) — ${text}`
      : `Re: your story — ${text}`;

    try {
      const conversationId = await createDmChat(currentGroup.user.id, guard);
      guard();
      const attemptKey = JSON.stringify([currentStory.id, conversationId, content]);
      if (replyAttempt.current?.key !== attemptKey) replyAttempt.current = { key: attemptKey, id: `story_reply_${crypto.randomUUID()}` };

      const { error } = await insertDmMessage(
        {
          conversation_id: conversationId,
          sender_id: profile.id,
          content,
          message_type: 'text',
          client_message_id: replyAttempt.current.id,
        },
        { otherProfileId: currentGroup.user.id, accountGuard: guard },
      );

      guard();
      if (error) throw error;

      replyAttempt.current = undefined;
      toast.success('Reply sent!');
      setReplyText('');
      setShowReplyInput(false);
      setIsPaused(false);
    } catch (error) {
      try { guard(); } catch { return; }
      toast.error('Could not send reply. Try again.');
    } finally {
      sendingReply.current = false;
      try { guard(); setIsSendingReply(false); } catch { /* Old viewers cannot update the next story. */ }
    }
  }, [replyText, profile?.id, currentGroup?.user?.id, currentStory, storyGuard]);

  useEffect(() => {
    setReplyText(''); setShowReplyInput(false); setIsSendingReply(false);
    setIsPaused(false);
  }, [candidateId]);

  if (!currentStory || !currentGroup) return <FullscreenPortal>
    <div role="dialog" aria-modal="true" aria-label={visible.isLoading ? 'Checking story access' : 'Story unavailable'} className="fixed inset-0 z-[6000] bg-black text-white flex flex-col items-center justify-center gap-4 p-6 text-center">
      <p>{visible.isLoading ? 'Checking story access...' : 'This story is no longer available, or your access has changed.'}</p>
      {!visible.isLoading && <Button variant="outline" onClick={() => { void visible.refetch(); }}>Check again</Button>}
      {!visible.isLoading && (storyIndex < (navigationGroup?.stories.length || 0) - 1 || groupIndex < groups.length - 1) && <Button variant="outline" onClick={goNext}>Next story</Button>}
      <Button onClick={onClose}>Close stories</Button>
    </div>
  </FullscreenPortal>;

  const slideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 18 : -18,
      opacity: 0,
      scale: 0.995,
    }),
    center: {
      x: 0,
      opacity: 1,
      scale: 1,
    },
    exit: (direction: number) => ({
      x: direction < 0 ? 18 : -18,
      opacity: 0,
      scale: 0.995,
    }),
  };

  return (
    <FullscreenPortal>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.14, ease: 'easeOut' }}
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
        <AnimatePresence mode="sync" initial={false} custom={direction}>
          <motion.div
            key={`${groupIndex}-${storyIndex}`}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ 
              x: { type: 'tween', duration: 0.16, ease: 'easeOut' },
              opacity: { duration: 0.12 },
              scale: { duration: 0.16, ease: 'easeOut' },
            }}
            className="absolute inset-0"
          >
            <StoryMedia 
              key={JSON.stringify([currentStory.id, currentStory.media_url, currentStory.media_type])}
              mediaUrl={currentStory.media_url} 
              mediaType={currentStory.media_type}
              isPaused={isPaused}
              onReadyChange={handleMediaReady}
              onProgress={handleMediaProgress}
              onEnded={handleMediaEnded}
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
              <div
                ref={i === storyIndex ? activeBarRef : undefined}
                role={i === storyIndex ? 'progressbar' : undefined}
                aria-label={i === storyIndex ? 'Story progress' : undefined}
                aria-valuemin={i === storyIndex ? 0 : undefined}
                aria-valuemax={i === storyIndex ? 100 : undefined}
                aria-valuenow={i === storyIndex ? Math.min(progressValueRef.current, 100) : undefined}
                className="h-full bg-white rounded-full origin-left"
                style={{
                  width:
                    i < storyIndex
                      ? '100%'
                      : i === storyIndex
                        ? `${Math.min(progressValueRef.current, 100)}%`
                        : '0%',
                  transition: i === storyIndex ? 'width 250ms linear' : undefined,
                }}
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
              aria-label={isPaused ? 'Play story' : 'Pause story'}
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
              aria-label="Close stories"
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
              
              <button disabled title="Story likes are currently unavailable" className="flex items-center gap-2 text-white/60 bg-black/40 rounded-full px-4 py-2.5">
                <Heart className="h-4 w-4" /><span className="text-xs">Likes unavailable</span>
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
                    aria-label="Send story reply"
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
              <Button size="icon" variant="ghost" disabled aria-label="Story likes are currently unavailable" title="Story likes are currently unavailable" className="text-white/60 h-10 w-10 flex-shrink-0">
                <Heart className="h-5 w-5" />
              </Button>
            </div>
          )}
        </div>

        {/* Pause indicator */}
        <AnimatePresence>
          {isPaused && !showReplyInput && (
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
            aria-label="Previous story group"
            className="w-20 h-32 rounded-lg overflow-hidden bg-muted"
          >
            <div className="w-full h-full flex items-center justify-center">
              <ChevronLeft className="h-8 w-8 text-white" />
            </div>
          </button>
        )}
      </div>
      
      <div className="hidden md:block absolute right-8 top-1/2 -translate-y-1/2 opacity-30 hover:opacity-50 transition-opacity">
        {groupIndex < groups.length - 1 && (
          <button
            onClick={goToNextGroup}
            aria-label="Next story group"
            className="w-20 h-32 rounded-lg overflow-hidden bg-muted"
          >
            <div className="w-full h-full flex items-center justify-center">
              <ChevronRight className="h-8 w-8 text-white" />
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
                resetProgress();
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
