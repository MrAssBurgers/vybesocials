import { memo, useCallback, useState, useRef, createContext, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useSpring, useTransform } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useCreateConversation } from '@/hooks/useMessages';
import { useChatPrefetch } from '@/hooks/useChatPrefetch';
import { triggerHaptic } from '@/lib/haptics';

interface TransitionState {
  isAnimating: boolean;
  phase: 'idle' | 'press' | 'zoom' | 'morphing' | 'complete';
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
 * MouthZoomTransition - Premium iOS-quality portal transition from notification to chat
 * Creates an immersive "entering the conversation" feel with exponential zoom and depth effects
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
    phase: 'idle',
    sourceRect: null,
    targetUserId: null,
    targetUsername: null,
    targetAvatarUrl: null,
    targetDisplayName: null,
  });
  const overlayRef = useRef<HTMLDivElement>(null);

  // Spring for smooth exponential zoom
  const zoomProgress = useSpring(0, {
    stiffness: 280,
    damping: 28,
    mass: 0.8,
  });

  // Transform zoom progress to scale (1 -> 1.5 -> 2.5 -> 3.5)
  const scale = useTransform(zoomProgress, [0, 0.3, 0.6, 1], [1, 1.5, 2.5, 3.5]);
  
  // Border radius animation (16 -> 40 -> 0)
  const borderRadius = useTransform(zoomProgress, [0, 0.4, 0.8, 1], [16, 40, 20, 0]);
  
  // Vignette intensity (0 -> 80 -> 0)
  const vignetteOpacity = useTransform(zoomProgress, [0, 0.5, 1], [0, 0.8, 0]);

  const startTransition = useCallback(async (
    e: React.MouseEvent | React.TouchEvent,
    userId: string,
    username: string,
    avatarUrl: string | null,
    displayName: string | null,
  ) => {
    const element = (e.currentTarget as HTMLElement);
    const rect = element.getBoundingClientRect();
    
    // Instant haptic feedback
    triggerHaptic('light');
    
    // Phase 1: Press feedback (scale down slightly)
    setTransition({
      isAnimating: true,
      phase: 'press',
      sourceRect: rect,
      targetUserId: userId,
      targetUsername: username,
      targetAvatarUrl: avatarUrl,
      targetDisplayName: displayName,
    });

    // Start prefetching immediately
    prefetchConversation(userId);

    // Wait for press animation
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Phase 2: Start mouth zoom
    setTransition(prev => ({ ...prev, phase: 'zoom' }));
    zoomProgress.set(1);
    
    // Haptic during zoom
    setTimeout(() => triggerHaptic('medium'), 100);

    try {
      // Create/get conversation while animation runs
      const conversation = await createConversation.mutateAsync({ memberIds: [userId] });
      
      // Phase 3: Morphing into chat
      setTransition(prev => ({ ...prev, phase: 'morphing' }));
      
      // Wait for animation to complete (total ~300ms)
      await new Promise(resolve => setTimeout(resolve, 250));
      
      // Navigate to chat
      navigate(`/messages/${conversation.id}`);
      
      // Brief delay before cleanup
      setTimeout(() => {
        zoomProgress.set(0);
        setTransition({
          isAnimating: false,
          phase: 'idle',
          sourceRect: null,
          targetUserId: null,
          targetUsername: null,
          targetAvatarUrl: null,
          targetDisplayName: null,
        });
      }, 100);
    } catch (error) {
      console.error('Failed to navigate to chat:', error);
      zoomProgress.set(0);
      setTransition({
        isAnimating: false,
        phase: 'idle',
        sourceRect: null,
        targetUserId: null,
        targetUsername: null,
        targetAvatarUrl: null,
        targetDisplayName: null,
      });
    }
  }, [createConversation, navigate, prefetchConversation, zoomProgress]);

  const contextValue: MouthZoomContextValue = {
    startTransition,
    isAnimating: transition.isAnimating,
  };

  return (
    <MouthZoomContext.Provider value={contextValue}>
      {children}
      
      {/* Portal Transition Overlay */}
      <AnimatePresence>
        {transition.isAnimating && transition.sourceRect && (
          <motion.div
            ref={overlayRef}
            className="fixed inset-0 z-[9999] pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
          >
            {/* Radial vignette / depth effect */}
            <motion.div
              className="absolute inset-0"
              style={{
                background: 'radial-gradient(circle at center, transparent 30%, hsl(var(--background) / 0.95) 100%)',
                opacity: vignetteOpacity,
              }}
            />
            
            {/* Backdrop blur layer */}
            <motion.div
              className="absolute inset-0 backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: transition.phase === 'zoom' || transition.phase === 'morphing' ? 1 : 0 }}
              transition={{ duration: 0.15 }}
            />
            
            {/* Expanding notification card - the "mouth" */}
            <motion.div
              className="absolute bg-background overflow-hidden border border-border will-change-transform"
              style={{
                left: transition.sourceRect.left,
                top: transition.sourceRect.top,
                width: transition.sourceRect.width,
                height: transition.sourceRect.height,
                transformOrigin: 'center center',
                borderRadius,
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)',
              }}
              initial={{ 
                scale: 1,
                x: 0,
                y: 0,
              }}
              animate={{
                scale: transition.phase === 'press' ? 0.96 : 
                       transition.phase === 'zoom' || transition.phase === 'morphing' ? 1 : 1,
                x: transition.phase === 'morphing' ? -transition.sourceRect.left : 0,
                y: transition.phase === 'morphing' ? -transition.sourceRect.top : 0,
                width: transition.phase === 'morphing' ? '100vw' : transition.sourceRect.width,
                height: transition.phase === 'morphing' ? '100dvh' : transition.sourceRect.height,
              }}
              transition={{
                type: 'spring',
                stiffness: 400,
                damping: 35,
                mass: 0.8,
              }}
            >
              {/* Avatar focal point - stays centered during zoom */}
              <motion.div
                className="absolute flex flex-col items-center justify-center"
                style={{
                  left: '50%',
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                }}
                initial={{ scale: 1 }}
                animate={{
                  scale: transition.phase === 'zoom' ? 1.2 : 
                         transition.phase === 'morphing' ? 0.9 : 1,
                }}
                transition={{
                  type: 'spring',
                  stiffness: 300,
                  damping: 25,
                }}
              >
                {/* Avatar with glow ring */}
                <motion.div
                  className="relative"
                  animate={{
                    boxShadow: transition.phase === 'zoom' 
                      ? '0 0 40px hsl(var(--primary) / 0.5), 0 0 80px hsl(var(--primary) / 0.3)'
                      : '0 0 0px hsl(var(--primary) / 0)',
                  }}
                  style={{ borderRadius: '50%' }}
                >
                  <Avatar className="h-16 w-16 ring-4 ring-primary/50 ring-offset-2 ring-offset-background">
                    <AvatarImage src={transition.targetAvatarUrl || undefined} />
                    <AvatarFallback className="text-xl bg-gradient-to-br from-primary to-accent text-primary-foreground">
                      {(transition.targetDisplayName || transition.targetUsername)?.[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  
                  {/* Pulse ring effect */}
                  <motion.div
                    className="absolute inset-0 rounded-full border-2 border-primary/60"
                    initial={{ scale: 1, opacity: 1 }}
                    animate={transition.phase === 'zoom' ? {
                      scale: [1, 1.5, 2],
                      opacity: [0.8, 0.4, 0],
                    } : { scale: 1, opacity: 0 }}
                    transition={{
                      duration: 0.6,
                      repeat: transition.phase === 'zoom' ? Infinity : 0,
                      repeatDelay: 0.1,
                    }}
                  />
                </motion.div>
                
                {/* Username appearing below avatar */}
                <motion.p
                  className="mt-3 font-semibold text-foreground text-center"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{
                    opacity: transition.phase === 'zoom' || transition.phase === 'morphing' ? 1 : 0,
                    y: transition.phase === 'zoom' || transition.phase === 'morphing' ? 0 : 10,
                  }}
                  transition={{ delay: 0.1, duration: 0.2 }}
                >
                  {transition.targetDisplayName || transition.targetUsername}
                </motion.p>
              </motion.div>
              
              {/* Chat content emergence (shows during morphing phase) */}
              <AnimatePresence>
                {transition.phase === 'morphing' && (
                  <>
                    {/* Chat header */}
                    <motion.div
                      className="absolute top-0 left-0 right-0 flex items-center gap-3 p-4 border-b border-border bg-background/95 backdrop-blur-sm"
                      initial={{ opacity: 0, y: -20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.05, duration: 0.2 }}
                    >
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={transition.targetAvatarUrl || undefined} />
                        <AvatarFallback>
                          {(transition.targetDisplayName || transition.targetUsername)?.[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-semibold">
                          {transition.targetDisplayName || transition.targetUsername}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          @{transition.targetUsername}
                        </p>
                      </div>
                    </motion.div>
                    
                    {/* Message skeleton placeholders - emerge from depth */}
                    <motion.div
                      className="absolute inset-x-0 top-20 bottom-20 p-4 space-y-4 overflow-hidden"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.1, duration: 0.15 }}
                    >
                      {[...Array(5)].map((_, i) => (
                        <motion.div 
                          key={i} 
                          className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}
                          initial={{ opacity: 0, scale: 0.8, y: 20 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          transition={{ 
                            delay: 0.12 + i * 0.03, 
                            duration: 0.2,
                            type: 'spring',
                            stiffness: 300,
                            damping: 25,
                          }}
                        >
                          <div 
                            className={`rounded-2xl px-4 py-3 max-w-[70%] ${
                              i % 2 === 0 ? 'bg-primary/20' : 'bg-muted'
                            }`}
                            style={{ width: `${45 + Math.random() * 25}%` }}
                          >
                            <div className="h-4 bg-foreground/10 rounded animate-pulse" />
                          </div>
                        </motion.div>
                      ))}
                    </motion.div>
                    
                    {/* Input bar sliding up */}
                    <motion.div
                      className="absolute bottom-0 left-0 right-0 p-4 border-t border-border bg-background/95 backdrop-blur-sm"
                      initial={{ y: 100, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ 
                        delay: 0.15, 
                        type: 'spring', 
                        stiffness: 350, 
                        damping: 28 
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-11 bg-muted rounded-full" />
                        <div className="h-11 w-11 bg-primary/40 rounded-full flex items-center justify-center">
                          <div className="w-5 h-5 border-2 border-primary-foreground/60 rounded-full" />
                        </div>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </MouthZoomContext.Provider>
  );
});

export default MouthZoomProvider;
