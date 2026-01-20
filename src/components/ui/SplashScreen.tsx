import { memo, useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence, useSpring } from 'framer-motion';
import { VYBELogo } from './VYBELogo';
import { isLowEndDevice } from '@/lib/performanceConfig';

interface SplashScreenProps {
  isVisible: boolean;
  status?: string;
  progress?: number;
}

export const SplashScreen = memo(function SplashScreen({ 
  isVisible, 
  status = 'Loading...', 
  progress = 0 
}: SplashScreenProps) {
  const showComplete = progress >= 100;
  const isLowEnd = useMemo(() => isLowEndDevice(), []);
  
  // Smooth spring animation for progress (disabled on low-end devices)
  const springProgress = useSpring(progress, isLowEnd ? { duration: 0 } : {
    stiffness: 100,
    damping: 30,
    mass: 1,
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
            scale: 1.05,
            filter: 'blur(10px)',
          }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
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
          {/* Simplified background with static glows for better performance */}
          <div className="absolute inset-0 pointer-events-none">
            {/* Primary glow - left */}
            <div 
              className="absolute top-1/2 left-1/4 w-48 h-48 sm:w-64 sm:h-64 rounded-full blur-[80px] sm:blur-[100px] -translate-y-1/2 bg-primary opacity-40"
            />
            
            {/* Accent glow - right */}
            <div 
              className="absolute top-1/2 right-1/4 w-48 h-48 sm:w-64 sm:h-64 rounded-full blur-[80px] sm:blur-[100px] -translate-y-1/2 bg-accent opacity-40"
            />

            {/* Center purple glow */}
            <div 
              className="absolute top-1/2 left-1/2 w-32 h-32 sm:w-48 sm:h-48 rounded-full blur-[60px] sm:blur-[80px] -translate-x-1/2 -translate-y-1/2 opacity-30"
              style={{ background: 'hsl(var(--neon-purple))' }}
            />
          </div>
          
          {/* Animated VYBE Logo - clean, no box */}
          <motion.div
            className="mb-6 sm:mb-10"
            animate={showComplete ? { 
              scale: [1, 1.1, 1],
            } : undefined}
            transition={{ duration: 0.5 }}
          >
            <VYBELogo size="splash" showText={false} animated={true} />
          </motion.div>

          {/* Welcome to VYBE Text */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
            className="text-center mb-6 sm:mb-8 px-4"
          >
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7, duration: 0.5 }}
              className="text-sm sm:text-base text-muted-foreground mb-2"
            >
              Welcome to
            </motion.p>
            <motion.h1
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.9, duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
              className="text-4xl sm:text-5xl font-display font-black tracking-tight"
              style={{
                background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--neon-purple)), hsl(var(--accent)))',
                backgroundSize: '200% 200%',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                animation: 'gradient-shift 4s ease infinite',
              }}
            >
              VYBE
            </motion.h1>
          </motion.div>

          {/* Progress bar container */}
          <motion.div
            initial={{ opacity: 0, y: 25 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1, duration: 0.5, ease: 'easeOut' }}
            className="w-48 sm:w-64 px-4"
          >
            {/* Progress bar background */}
            <div className="relative h-1.5 sm:h-2 bg-muted rounded-full overflow-hidden backdrop-blur-sm">
              {/* Animated background shimmer */}
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-foreground/10 to-transparent"
                animate={{ x: ['-100%', '200%'] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              />
              
              {/* Progress fill with neon gradient */}
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${displayProgress}%`,
                  background: 'linear-gradient(90deg, hsl(var(--primary)), hsl(var(--neon-purple)), hsl(var(--accent)))',
                }}
              />
              
              {/* Glow at progress tip */}
              <motion.div
                className="absolute top-1/2 -translate-y-1/2 w-4 h-4 sm:w-6 sm:h-6 rounded-full blur-md pointer-events-none bg-accent"
                style={{
                  left: `${displayProgress}%`,
                  marginLeft: '-8px',
                }}
                animate={{
                  opacity: displayProgress > 0 && displayProgress < 100 ? [0.5, 0.9, 0.5] : 0,
                }}
                transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
              />
            </div>

            {/* Status text */}
            <div className="flex justify-between items-center mt-2 sm:mt-3 h-5">
              <AnimatePresence mode="wait">
                <motion.span 
                  key={status}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  className="text-[10px] sm:text-xs text-muted-foreground truncate max-w-[100px] sm:max-w-[140px]"
                >
                  {status}
                </motion.span>
              </AnimatePresence>
              <motion.span
                className="text-xs sm:text-sm font-medium tabular-nums transition-colors duration-300"
                style={{ 
                  color: showComplete ? 'hsl(var(--accent))' : 'hsl(var(--muted-foreground))'
                }}
              >
                {displayProgress}%
              </motion.span>
            </div>
          </motion.div>

          {/* Tagline */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            transition={{ delay: 1.2, duration: 0.8 }}
            className="absolute bottom-6 sm:bottom-12 text-[10px] sm:text-xs text-muted-foreground tracking-wide px-4 text-center"
          >
            The Next Generation Social Platform
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
});