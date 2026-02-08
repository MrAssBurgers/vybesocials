import { memo, useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence, useSpring } from 'framer-motion';
import { VYBELogo } from './VYBELogo';
import { isLowEndDevice } from '@/lib/performanceConfig';

interface SplashScreenProps {
  isVisible: boolean;
  status?: string;
  progress?: number;
}

// Fun loading tips that rotate
const LOADING_TIPS = [
  "Tip: Double-tap to like posts ❤️",
  "Tip: Swipe up for more clips 🎬",
  "Tip: Hold messages to react 😊",
  "Tip: Bump phones to add friends 📱",
  "Tip: Pull down to refresh feeds 🔄",
];

export const SplashScreen = memo(function SplashScreen({ 
  isVisible, 
  status = 'Loading...', 
  progress = 0 
}: SplashScreenProps) {
  const showComplete = progress >= 100;
  const isLowEnd = useMemo(() => isLowEndDevice(), []);
  
  // Generate stable ID for mobile style injection
  const splashTextId = useMemo(() => `splash-text-${Math.random().toString(36).slice(2, 9)}`, []);
  
  // Random tip on mount
  const [tip] = useState(() => LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)]);
  
  // Smooth spring animation for progress (disabled on low-end devices)
  const springProgress = useSpring(progress, isLowEnd ? { duration: 0 } : {
    stiffness: 120,
    damping: 25,
    mass: 0.8,
  });
  
  // Animated display progress
  const [displayProgress, setDisplayProgress] = useState(0);
  
  useEffect(() => {
    if (isLowEnd) {
      setDisplayProgress(progress);
      return;
    }
    const unsubscribe = springProgress.on('change', (v) => {
      setDisplayProgress(Math.round(v));
    });
    return unsubscribe;
  }, [springProgress, isLowEnd, progress]);
  
  useEffect(() => {
    springProgress.set(progress);
  }, [progress, springProgress]);

  // Prevent body scroll and hide nav when splash is visible
  useEffect(() => {
    if (isVisible) {
      document.body.style.overflow = 'hidden';
      document.body.classList.add('splash-visible');
    } else {
      document.body.style.overflow = '';
      document.body.classList.remove('splash-visible');
    }
    return () => {
      document.body.style.overflow = '';
      document.body.classList.remove('splash-visible');
    };
  }, [isVisible]);

  return (
    <AnimatePresence mode="wait">
      {isVisible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ 
            opacity: 0, 
            scale: 1.02,
          }}
          transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
          className="fixed inset-0 flex flex-col items-center justify-center bg-background overflow-hidden"
          style={{
            zIndex: 2147483647,
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw',
            height: '100dvh',
          }}
        >
          {/* Optimized background with static glows */}
          <div className="absolute inset-0 pointer-events-none">
            <div 
              className="absolute top-1/2 left-1/4 w-48 h-48 sm:w-64 sm:h-64 rounded-full blur-[80px] sm:blur-[100px] -translate-y-1/2 bg-primary opacity-30"
            />
            <div 
              className="absolute top-1/2 right-1/4 w-48 h-48 sm:w-64 sm:h-64 rounded-full blur-[80px] sm:blur-[100px] -translate-y-1/2 bg-accent opacity-30"
            />
            <div 
              className="absolute top-1/2 left-1/2 w-32 h-32 sm:w-48 sm:h-48 rounded-full blur-[60px] sm:blur-[80px] -translate-x-1/2 -translate-y-1/2 opacity-20"
              style={{ background: 'hsl(var(--neon-purple))' }}
            />
          </div>
          
          {/* Animated VYBE Logo */}
          <motion.div
            className="mb-4 sm:mb-6"
            animate={showComplete ? { scale: [1, 1.08, 1] } : undefined}
            transition={{ duration: 0.4 }}
          >
            <VYBELogo size="splash" showText={false} animated={!isLowEnd} />
          </motion.div>

          {/* Welcome Text */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            className="text-center mb-6 sm:mb-8 px-4"
          >
            <style>{`
              @media (max-width: 1024px) {
                #${splashTextId} {
                  color: hsl(var(--primary)) !important;
                  -webkit-text-fill-color: hsl(var(--primary)) !important;
                  background-clip: unset !important;
                  -webkit-background-clip: unset !important;
                  background-image: none !important;
                  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
                  opacity: 1 !important;
                }
              }
            `}</style>
            <motion.h1
              id={splashTextId}
              className="text-3xl sm:text-4xl font-display font-black tracking-tight"
              style={{
                background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--neon-purple)), hsl(var(--accent)))',
                backgroundSize: '200% 200%',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                animation: isLowEnd ? 'none' : 'gradient-shift 4s ease infinite',
              }}
            >
              VYBE
            </motion.h1>
          </motion.div>

          {/* Progress bar container */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.4 }}
            className="w-56 sm:w-72 px-4"
          >
            {/* Progress bar background */}
            <div className="relative h-2 sm:h-2.5 bg-muted/50 rounded-full overflow-hidden backdrop-blur-sm">
              {/* Shimmer effect */}
              {!isLowEnd && (
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-foreground/5 to-transparent"
                  animate={{ x: ['-100%', '200%'] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                />
              )}
              
              {/* Progress fill with gradient */}
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${displayProgress}%`,
                  background: 'linear-gradient(90deg, hsl(var(--primary)), hsl(var(--neon-purple)), hsl(var(--accent)))',
                }}
                transition={{ duration: 0.1 }}
              />
              
              {/* Glow at progress tip */}
              {!isLowEnd && displayProgress > 0 && displayProgress < 100 && (
                <motion.div
                  className="absolute top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 rounded-full blur-md bg-accent/60"
                  style={{
                    left: `${displayProgress}%`,
                    marginLeft: '-8px',
                  }}
                  animate={{ opacity: [0.4, 0.8, 0.4] }}
                  transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
                />
              )}
            </div>

            {/* Status text - more prominent */}
            <div className="flex flex-col items-center mt-3 sm:mt-4 gap-1">
              <AnimatePresence mode="wait">
                <motion.span 
                  key={status}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.15 }}
                  className="text-sm sm:text-base font-medium text-foreground/80"
                >
                  {status}
                </motion.span>
              </AnimatePresence>
              <motion.span
                className="text-xs sm:text-sm tabular-nums transition-colors duration-200"
                style={{ 
                  color: showComplete ? 'hsl(var(--accent))' : 'hsl(var(--muted-foreground))'
                }}
              >
                {displayProgress}%
              </motion.span>
            </div>
          </motion.div>

          {/* Loading tip */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            transition={{ delay: 0.8, duration: 0.5 }}
            className="absolute bottom-16 sm:bottom-20 text-xs sm:text-sm text-muted-foreground px-6 text-center max-w-xs"
          >
            {tip}
          </motion.p>

          {/* Tagline */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.3 }}
            transition={{ delay: 0.5, duration: 0.5 }}
            className="absolute bottom-6 sm:bottom-8 text-[10px] sm:text-xs text-muted-foreground tracking-wide"
          >
            The Next Generation Social Platform
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
