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
  
  // Smooth spring animation for progress
  const springProgress = useSpring(progress, isLowEnd ? { duration: 0 } : {
    stiffness: 100,
    damping: 30,
    mass: 1,
  });
  
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
            filter: 'blur(8px)',
          }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
          className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden"
          style={{
            zIndex: 2147483647,
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw',
            height: '100dvh',
            background: 'hsl(var(--background))',
          }}
        >
          {/* Clean gradient background */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {/* Soft primary glow - top left */}
            <motion.div 
              className="absolute -top-20 -left-20 w-[400px] h-[400px] rounded-full"
              style={{
                background: 'radial-gradient(circle, hsl(var(--primary) / 0.15) 0%, transparent 70%)',
              }}
              animate={isLowEnd ? {} : {
                scale: [1, 1.1, 1],
                opacity: [0.6, 0.8, 0.6],
              }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
            
            {/* Soft accent glow - bottom right */}
            <motion.div 
              className="absolute -bottom-32 -right-32 w-[500px] h-[500px] rounded-full"
              style={{
                background: 'radial-gradient(circle, hsl(var(--accent) / 0.12) 0%, transparent 70%)',
              }}
              animate={isLowEnd ? {} : {
                scale: [1.1, 1, 1.1],
                opacity: [0.5, 0.7, 0.5],
              }}
              transition={{
                duration: 5,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: 1,
              }}
            />

            {/* Center subtle purple accent */}
            <motion.div 
              className="absolute top-1/2 left-1/2 w-[300px] h-[300px] rounded-full -translate-x-1/2 -translate-y-1/2"
              style={{ 
                background: 'radial-gradient(circle, hsl(var(--neon-purple) / 0.08) 0%, transparent 60%)',
              }}
              animate={isLowEnd ? {} : {
                opacity: [0.4, 0.7, 0.4],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          </div>
          
          {/* Main content container */}
          <div className="relative z-10 flex flex-col items-center">
            {/* Logo with glow */}
            <motion.div
              className="relative mb-8"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
            >
              {/* Soft glow behind logo */}
              <motion.div
                className="absolute inset-0 rounded-full blur-3xl -z-10"
                style={{
                  background: 'linear-gradient(135deg, hsl(var(--primary) / 0.3), hsl(var(--accent) / 0.3))',
                  transform: 'scale(1.5)',
                }}
                animate={isLowEnd ? {} : {
                  opacity: [0.5, 0.8, 0.5],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />
              <VYBELogo size="splash" showText={false} animated={!isLowEnd} />
            </motion.div>

            {/* Welcome text */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="text-center mb-10"
            >
              <p className="text-sm text-muted-foreground mb-2 tracking-wide">
                Welcome to
              </p>
              <motion.h1
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4, duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
                className="text-4xl sm:text-5xl font-display font-black tracking-tight"
                style={{
                  background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--neon-purple)), hsl(var(--accent)))',
                  backgroundSize: '200% 200%',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                VYBE
              </motion.h1>
            </motion.div>

            {/* Progress bar */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.5 }}
              className="w-52 sm:w-64"
            >
              {/* Progress track */}
              <div className="relative h-1.5 bg-muted/30 rounded-full overflow-hidden backdrop-blur-sm">
                {/* Shimmer effect */}
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                  animate={{ x: ['-100%', '200%'] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                />
                
                {/* Progress fill */}
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${displayProgress}%`,
                    background: 'linear-gradient(90deg, hsl(var(--primary)), hsl(var(--accent)))',
                  }}
                />
                
                {/* Glow at tip */}
                {displayProgress > 0 && displayProgress < 100 && (
                  <motion.div
                    className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full pointer-events-none"
                    style={{
                      left: `${displayProgress}%`,
                      marginLeft: '-8px',
                      background: 'radial-gradient(circle, hsl(var(--accent)), transparent)',
                      filter: 'blur(4px)',
                    }}
                    animate={{
                      opacity: [0.6, 1, 0.6],
                    }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
                  />
                )}
              </div>

              {/* Status text */}
              <div className="flex justify-between items-center mt-3">
                <AnimatePresence mode="wait">
                  <motion.span 
                    key={status}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="text-xs text-muted-foreground truncate max-w-[140px]"
                  >
                    {status}
                  </motion.span>
                </AnimatePresence>
                <motion.span
                  className="text-xs font-medium tabular-nums"
                  style={{ 
                    color: showComplete ? 'hsl(var(--accent))' : 'hsl(var(--muted-foreground))'
                  }}
                  animate={showComplete ? { scale: [1, 1.1, 1] } : {}}
                  transition={{ duration: 0.3 }}
                >
                  {displayProgress}%
                </motion.span>
              </div>
            </motion.div>
          </div>

          {/* Tagline at bottom */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            transition={{ delay: 0.8, duration: 0.8 }}
            className="absolute bottom-8 sm:bottom-12 text-[10px] sm:text-xs text-muted-foreground tracking-widest uppercase"
          >
            Your Vibe, Your World
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
