import { memo, useCallback, useState, createContext, useContext, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useCreateConversation } from '@/hooks/useMessages';
import { useChatPrefetch } from '@/hooks/useChatPrefetch';
import { triggerHaptic } from '@/lib/haptics';
import { registerMouthZoomTrigger, unregisterMouthZoomTrigger } from '@/lib/mouthZoomBridge';

interface TransitionState {
  isAnimating: boolean;
  sourceRect: DOMRect | null;
  targetUserId: string | null;
  targetUsername: string | null;
  targetAvatarUrl: string | null;
  targetDisplayName: string | null;
}

interface MouthZoomContextValue {
  startTransition: (
    e: React.MouseEvent | React.TouchEvent,
    userId: string,
    username: string,
    avatarUrl: string | null,
    displayName: string | null,
  ) => Promise<void>;
  isAnimating: boolean;
}

const MouthZoomContext = createContext<MouthZoomContextValue | null>(null);

export const useMouthZoom = () => {
  const ctx = useContext(MouthZoomContext);
  if (!ctx) {
    throw new Error('useMouthZoom must be used within MouthZoomProvider');
  }
  return ctx;
};

/**
 * MouthZoomTransition - Lightweight, GPU-accelerated portal transition
 * Uses only transform and opacity for 60fps performance
 */
export const MouthZoomProvider = memo(function MouthZoomProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const createConversation = useCreateConversation();
  const { prefetchConversation } = useChatPrefetch();
  const [transition, setTransition] = useState<TransitionState>({
    isAnimating: false,
    sourceRect: null,
    targetUserId: null,
    targetUsername: null,
    targetAvatarUrl: null,
    targetDisplayName: null,
  });
  const conversationPromiseRef = useRef<Promise<any> | null>(null);

  // Core animation logic - accepts a rect directly
  const startTransitionFromRect = useCallback(async (
    rect: DOMRect,
    userId: string,
    username: string,
    avatarUrl: string | null,
    displayName: string | null,
  ) => {
    // Haptic feedback immediately
    triggerHaptic('light');
    
    // Start prefetch BEFORE animation
    prefetchConversation(userId);
    
    // Start conversation creation immediately (don't wait)
    conversationPromiseRef.current = createConversation.mutateAsync({ memberIds: [userId] });
    
    // Start animation
    setTransition({
      isAnimating: true,
      sourceRect: rect,
      targetUserId: userId,
      targetUsername: username,
      targetAvatarUrl: avatarUrl,
      targetDisplayName: displayName,
    });

    try {
      // Wait for conversation creation (should be fast since prefetched)
      const conversation = await conversationPromiseRef.current;
      
      // Short delay for animation feel (200ms total)
      await new Promise(resolve => setTimeout(resolve, 180));
      
      // Clear overlay before navigation — avoids AnimatePresence/removeChild races.
      setTransition({
        isAnimating: false,
        sourceRect: null,
        targetUserId: null,
        targetUsername: null,
        targetAvatarUrl: null,
        targetDisplayName: null,
      });
      navigate(`/messages/${conversation.id}`, { replace: false });
    } catch (error) {
      console.error('Failed to navigate to chat:', error);
      setTransition({
        isAnimating: false,
        sourceRect: null,
        targetUserId: null,
        targetUsername: null,
        targetAvatarUrl: null,
        targetDisplayName: null,
      });
    }
  }, [createConversation, navigate, prefetchConversation]);

  // Wrapper for event-based calls (used by components)
  const startTransition = useCallback(async (
    e: React.MouseEvent | React.TouchEvent,
    userId: string,
    username: string,
    avatarUrl: string | null,
    displayName: string | null,
  ) => {
    const element = (e.currentTarget as HTMLElement);
    const rect = element.getBoundingClientRect();
    return startTransitionFromRect(rect, userId, username, avatarUrl, displayName);
  }, [startTransitionFromRect]);

  // Register with global bridge for notification clicks
  useEffect(() => {
    registerMouthZoomTrigger(startTransitionFromRect);
    return () => unregisterMouthZoomTrigger();
  }, [startTransitionFromRect]);

  const contextValue: MouthZoomContextValue = {
    startTransition,
    isAnimating: transition.isAnimating,
  };

  // Calculate center position for the animation
  const centerX = transition.sourceRect 
    ? transition.sourceRect.left + transition.sourceRect.width / 2 
    : 0;
  const centerY = transition.sourceRect 
    ? transition.sourceRect.top + transition.sourceRect.height / 2 
    : 0;

  return (
    <MouthZoomContext.Provider value={contextValue}>
      {children}
      
      {/* Lightweight Portal Transition — no AnimatePresence (prevents removeChild crash on navigate) */}
      {transition.isAnimating && transition.sourceRect && (
          <motion.div
            className="fixed inset-0 z-[9999] pointer-events-none will-change-transform"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.1 }}
          >
            {/* Simple fade backdrop */}
            <motion.div
              className="absolute inset-0 bg-background"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15 }}
            />
            
            {/* Avatar focal point - scales up from notification position */}
            <motion.div
              className="absolute flex flex-col items-center justify-center will-change-transform"
              style={{
                left: centerX,
                top: centerY,
                transform: 'translate(-50%, -50%)',
              }}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1.2, opacity: 1 }}
              transition={{
                type: 'spring',
                stiffness: 400,
                damping: 30,
                mass: 0.5,
              }}
            >
              <Avatar className="h-20 w-20 ring-4 ring-primary/40 ring-offset-2 ring-offset-background shadow-2xl">
                <AvatarImage src={transition.targetAvatarUrl || undefined} />
                <AvatarFallback className="text-2xl bg-gradient-to-br from-primary to-accent text-primary-foreground">
                  {(transition.targetDisplayName || transition.targetUsername)?.[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              
              <motion.p
                className="mt-3 font-semibold text-foreground text-center text-lg"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05, duration: 0.12 }}
              >
                {transition.targetDisplayName || transition.targetUsername}
              </motion.p>
            </motion.div>
          </motion.div>
        )}
    </MouthZoomContext.Provider>
  );
});

export default MouthZoomProvider;
