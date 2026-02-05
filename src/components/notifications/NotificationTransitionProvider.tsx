import { memo, useState, createContext, useContext, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Heart, MessageCircle, UserPlus, FileText } from 'lucide-react';
import { triggerHaptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';

type TransitionType = 'chat' | 'post' | 'profile';

interface TransitionTarget {
  type: TransitionType;
  // Chat-specific
  userId?: string;
  username?: string;
  avatarUrl?: string | null;
  displayName?: string | null;
  // Post-specific
  postId?: string;
  // Profile-specific (uses userId/username/avatarUrl above)
}

interface TransitionState {
  isAnimating: boolean;
  sourceRect: DOMRect | null;
  target: TransitionTarget | null;
}

interface NotificationTransitionContextValue {
  triggerTransition: (
    e: React.MouseEvent | React.TouchEvent,
    target: TransitionTarget,
  ) => void;
  isAnimating: boolean;
}

const NotificationTransitionContext = createContext<NotificationTransitionContextValue | null>(null);

export const useNotificationTransition = () => {
  const ctx = useContext(NotificationTransitionContext);
  if (!ctx) {
    throw new Error('useNotificationTransition must be used within NotificationTransitionProvider');
  }
  return ctx;
};

/**
 * NotificationTransitionProvider - Smooth animated transitions for all notification types
 * - Chat: Avatar zoom with ripple effect
 * - Post: Content preview card expand
 * - Profile: Avatar slide-in
 */
export const NotificationTransitionProvider = memo(function NotificationTransitionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const [transition, setTransition] = useState<TransitionState>({
    isAnimating: false,
    sourceRect: null,
    target: null,
  });
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const triggerTransition = useCallback((
    e: React.MouseEvent | React.TouchEvent,
    target: TransitionTarget,
  ) => {
    const element = e.currentTarget as HTMLElement;
    const rect = element.getBoundingClientRect();

    // Haptic feedback
    triggerHaptic('light');

    // Start animation
    setTransition({
      isAnimating: true,
      sourceRect: rect,
      target,
    });

    // Clear any existing timeout
    if (animationTimeoutRef.current) {
      clearTimeout(animationTimeoutRef.current);
    }

    // Navigate after animation
    const animationDuration = target.type === 'chat' ? 280 : 200;
    
    animationTimeoutRef.current = setTimeout(() => {
      // Navigate based on type
      switch (target.type) {
        case 'chat':
          // Chat navigation is handled by MouthZoom separately
          // This is a fallback
          if (target.userId) {
            navigate(`/messages`);
          }
          break;
        case 'post':
          if (target.postId) {
            navigate(`/p/${target.postId}`);
          }
          break;
        case 'profile':
          if (target.username) {
            navigate(`/u/${target.username}`);
          }
          break;
      }

      // Reset after navigation
      requestAnimationFrame(() => {
        setTransition({
          isAnimating: false,
          sourceRect: null,
          target: null,
        });
      });
    }, animationDuration);
  }, [navigate]);

  const contextValue: NotificationTransitionContextValue = {
    triggerTransition,
    isAnimating: transition.isAnimating,
  };

  // Calculate animation center
  const centerX = transition.sourceRect 
    ? transition.sourceRect.left + transition.sourceRect.width / 2 
    : 0;
  const centerY = transition.sourceRect 
    ? transition.sourceRect.top + transition.sourceRect.height / 2 
    : 0;

  // Get icon for transition type
  const getTransitionIcon = () => {
    if (!transition.target) return null;
    switch (transition.target.type) {
      case 'post':
        return <Heart className="h-6 w-6 text-primary fill-primary" />;
      case 'profile':
        return <UserPlus className="h-6 w-6 text-primary" />;
      default:
        return <MessageCircle className="h-6 w-6 text-primary" />;
    }
  };

  return (
    <NotificationTransitionContext.Provider value={contextValue}>
      {children}

      {/* Transition Overlay */}
      <AnimatePresence>
        {transition.isAnimating && transition.sourceRect && transition.target && (
          <motion.div
            className="fixed inset-0 z-[9999] pointer-events-none will-change-transform"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
          >
            {/* Backdrop with directional blur */}
            <motion.div
              className="absolute inset-0 bg-background/95 backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            />

            {/* Ripple effect from source */}
            <motion.div
              className="absolute rounded-full bg-primary/20"
              style={{
                left: centerX,
                top: centerY,
                transform: 'translate(-50%, -50%)',
              }}
              initial={{ width: 0, height: 0, opacity: 0.8 }}
              animate={{ 
                width: Math.max(window.innerWidth, window.innerHeight) * 2.5, 
                height: Math.max(window.innerWidth, window.innerHeight) * 2.5,
                opacity: 0 
              }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />

            {/* Focal content based on type */}
            {transition.target.type === 'post' ? (
              // Post transition: Card preview
              <motion.div
                className="absolute flex flex-col items-center justify-center will-change-transform"
                style={{
                  left: centerX,
                  top: centerY,
                  transform: 'translate(-50%, -50%)',
                }}
                initial={{ scale: 0.3, opacity: 0, rotate: -5 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                exit={{ scale: 1.2, opacity: 0 }}
                transition={{
                  type: 'spring',
                  stiffness: 500,
                  damping: 30,
                  mass: 0.5,
                }}
              >
                <motion.div 
                  className="bg-card rounded-2xl p-6 shadow-2xl border border-border flex items-center gap-4"
                  initial={{ y: 20 }}
                  animate={{ y: 0 }}
                >
                  <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-primary/30 to-accent/30 flex items-center justify-center">
                    <FileText className="h-8 w-8 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Opening post...</p>
                    <p className="text-sm text-muted-foreground">Loading content</p>
                  </div>
                </motion.div>
              </motion.div>
            ) : transition.target.type === 'profile' ? (
              // Profile transition: Avatar slide
              <motion.div
                className="absolute flex flex-col items-center justify-center will-change-transform"
                style={{
                  left: centerX,
                  top: centerY,
                  transform: 'translate(-50%, -50%)',
                }}
                initial={{ scale: 0.5, opacity: 0, x: -30 }}
                animate={{ scale: 1, opacity: 1, x: 0 }}
                exit={{ scale: 0.8, opacity: 0, x: 30 }}
                transition={{
                  type: 'spring',
                  stiffness: 400,
                  damping: 28,
                }}
              >
                <Avatar className="h-24 w-24 ring-4 ring-primary/40 ring-offset-4 ring-offset-background shadow-2xl">
                  <AvatarImage src={transition.target.avatarUrl || undefined} />
                  <AvatarFallback className="text-3xl bg-gradient-to-br from-primary to-accent text-primary-foreground">
                    {(transition.target.displayName || transition.target.username)?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                
                <motion.div
                  className="mt-4 text-center"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 }}
                >
                  <p className="font-bold text-lg text-foreground">
                    {transition.target.displayName || transition.target.username}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    @{transition.target.username}
                  </p>
                </motion.div>
              </motion.div>
            ) : (
              // Chat transition: Avatar with message icon (fallback)
              <motion.div
                className="absolute flex flex-col items-center justify-center will-change-transform"
                style={{
                  left: centerX,
                  top: centerY,
                  transform: 'translate(-50%, -50%)',
                }}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1.1, opacity: 1 }}
                transition={{
                  type: 'spring',
                  stiffness: 400,
                  damping: 30,
                }}
              >
                <Avatar className="h-20 w-20 ring-4 ring-primary/40 ring-offset-2 ring-offset-background shadow-2xl">
                  <AvatarImage src={transition.target.avatarUrl || undefined} />
                  <AvatarFallback className="text-2xl bg-gradient-to-br from-primary to-accent text-primary-foreground">
                    {(transition.target.displayName || transition.target.username)?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                
                <motion.p
                  className="mt-3 font-semibold text-foreground text-center text-lg"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05, duration: 0.12 }}
                >
                  {transition.target.displayName || transition.target.username}
                </motion.p>
              </motion.div>
            )}

            {/* Progress indicator */}
            <motion.div
              className="absolute bottom-8 left-1/2 -translate-x-1/2"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <div className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-2 h-2 rounded-full bg-primary"
                    animate={{
                      scale: [1, 1.3, 1],
                      opacity: [0.5, 1, 0.5],
                    }}
                    transition={{
                      duration: 0.6,
                      repeat: Infinity,
                      delay: i * 0.15,
                    }}
                  />
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </NotificationTransitionContext.Provider>
  );
});

export default NotificationTransitionProvider;
