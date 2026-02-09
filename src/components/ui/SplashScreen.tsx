import { memo, useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  
  // Random tip on mount
  const [tip] = useState(() => LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)]);
  
  // Simple animated progress using CSS transition instead of spring physics
  const [displayProgress, setDisplayProgress] = useState(0);
  const animationRef = useRef<number>();
  
  useEffect(() => {
    if (isLowEnd) {
      setDisplayProgress(progress);
      return;
    }
    
    // Cancel any pending animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    
    // Smoothly animate to target progress
    const animate = () => {
      setDisplayProgress(prev => {
        const diff = progress - prev;
        if (Math.abs(diff) < 0.5) return progress;
        // Ease towards target (lerp)
        return prev + diff * 0.15;
      });
      if (Math.abs(progress - displayProgress) > 0.5) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };
    
    animationRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [progress, isLowEnd]);

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
          {/* Clean gradient background - NO overlapping circles */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {/* Single centered gradient glow */}
            <div 
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-40"
              style={{
                background: 'radial-gradient(circle, hsl(var(--primary) / 0.4) 0%, hsl(var(--accent) / 0.2) 40%, transparent 70%)',
                filter: 'blur(60px)',
              }}
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
            <motion.h1
              className="text-3xl sm:text-4xl font-display font-black tracking-tight gradient-text"
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
              
              {/* Progress fill with gradient - using CSS transition for smooth animation */}
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-150 ease-out"
                style={{
                  width: `${Math.round(displayProgress)}%`,
                  background: 'linear-gradient(90deg, hsl(var(--primary)), hsl(var(--accent)))',
                }}
              />
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
              <span
                className="text-xs sm:text-sm tabular-nums transition-colors duration-200"
                style={{ 
                  color: showComplete ? 'hsl(var(--accent))' : 'hsl(var(--muted-foreground))'
                }}
              >
                {Math.round(displayProgress)}%
              </span>
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
