import { memo, useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence, useSpring } from 'framer-motion';
import { VYBELogo } from './VYBELogo';
import { isLowEndDevice } from '@/lib/performanceConfig';

interface SplashScreenProps {
  isVisible: boolean;
  status?: string;
  progress?: number;
}

// Floating particle component
const FloatingParticle = memo(({ delay, duration, size, x, y }: { 
  delay: number; 
  duration: number; 
  size: number;
  x: number;
  y: number;
}) => (
  <motion.div
    className="absolute rounded-full"
    style={{
      width: size,
      height: size,
      left: `${x}%`,
      top: `${y}%`,
      background: 'linear-gradient(135deg, hsl(var(--primary) / 0.6), hsl(var(--accent) / 0.6))',
      boxShadow: `0 0 ${size * 2}px hsl(var(--primary) / 0.4)`,
    }}
    initial={{ opacity: 0, scale: 0 }}
    animate={{
      opacity: [0, 0.8, 0.4, 0.8, 0],
      scale: [0, 1, 1.2, 1, 0],
      y: [0, -30, -60, -90, -120],
      x: [0, 10, -10, 15, 0],
    }}
    transition={{
      duration,
      delay,
      repeat: Infinity,
      ease: 'easeInOut',
    }}
  />
));
FloatingParticle.displayName = 'FloatingParticle';

// Generate random particles
const generateParticles = (count: number) => {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    delay: Math.random() * 3,
    duration: 3 + Math.random() * 2,
    size: 4 + Math.random() * 8,
    x: 10 + Math.random() * 80,
    y: 40 + Math.random() * 40,
  }));
};

export const SplashScreen = memo(function SplashScreen({ 
  isVisible, 
  status = 'Loading...', 
  progress = 0 
}: SplashScreenProps) {
  const showComplete = progress >= 100;
  const isLowEnd = useMemo(() => isLowEndDevice(), []);
  const particles = useMemo(() => isLowEnd ? [] : generateParticles(12), [isLowEnd]);
  
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
            scale: 1.1,
            filter: 'blur(20px)',
          }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
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
          {/* Animated background with pulsing glows */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {/* Primary animated glow - left */}
            <motion.div 
              className="absolute top-1/2 left-1/4 w-64 h-64 sm:w-80 sm:h-80 rounded-full blur-[100px] sm:blur-[120px] -translate-y-1/2 bg-primary"
              animate={{
                opacity: [0.3, 0.6, 0.3],
                scale: [1, 1.2, 1],
                x: [0, 20, 0],
              }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
            
            {/* Accent animated glow - right */}
            <motion.div 
              className="absolute top-1/2 right-1/4 w-64 h-64 sm:w-80 sm:h-80 rounded-full blur-[100px] sm:blur-[120px] -translate-y-1/2 bg-accent"
              animate={{
                opacity: [0.3, 0.5, 0.3],
                scale: [1.1, 1, 1.1],
                x: [0, -20, 0],
              }}
              transition={{
                duration: 5,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: 0.5,
              }}
            />

            {/* Center pulsing purple glow */}
            <motion.div 
              className="absolute top-1/2 left-1/2 w-48 h-48 sm:w-64 sm:h-64 rounded-full blur-[80px] sm:blur-[100px] -translate-x-1/2 -translate-y-1/2"
              style={{ background: 'hsl(var(--neon-purple))' }}
              animate={{
                opacity: [0.2, 0.5, 0.2],
                scale: [0.8, 1.3, 0.8],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />

            {/* Rotating gradient ring */}
            {!isLowEnd && (
              <motion.div
                className="absolute top-1/2 left-1/2 w-[300px] h-[300px] sm:w-[400px] sm:h-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-20"
                style={{
                  background: 'conic-gradient(from 0deg, transparent, hsl(var(--primary)), transparent, hsl(var(--accent)), transparent)',
                }}
                animate={{ rotate: 360 }}
                transition={{
                  duration: 8,
                  repeat: Infinity,
                  ease: 'linear',
                }}
              />
            )}

            {/* Floating particles */}
            {particles.map((p) => (
              <FloatingParticle key={p.id} {...p} />
            ))}
          </div>
          
          {/* Animated VYBE Logo with glow */}
          <motion.div
            className="mb-8 sm:mb-12 relative"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.8, ease: [0.34, 1.56, 0.64, 1] }}
          >
            {/* Logo glow effect */}
            <motion.div
              className="absolute inset-0 blur-2xl"
              style={{
                background: 'linear-gradient(135deg, hsl(var(--primary) / 0.5), hsl(var(--accent) / 0.5))',
              }}
              animate={{
                opacity: [0.4, 0.8, 0.4],
                scale: [1, 1.2, 1],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
            <motion.div
              animate={showComplete ? { 
                scale: [1, 1.15, 1],
              } : {
                scale: [1, 1.05, 1],
              }}
              transition={{ 
                duration: showComplete ? 0.5 : 2,
                repeat: showComplete ? 0 : Infinity,
                ease: 'easeInOut',
              }}
            >
              <VYBELogo size="splash" showText={false} animated={true} />
            </motion.div>
          </motion.div>

          {/* Welcome Text with staggered animation */}
          <motion.div
            className="text-center mb-8 sm:mb-10 px-4"
          >
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.6 }}
              className="text-sm sm:text-base text-muted-foreground mb-2"
            >
              Welcome to
            </motion.p>
            <motion.h1
              initial={{ scale: 0.5, opacity: 0, rotateX: 90 }}
              animate={{ scale: 1, opacity: 1, rotateX: 0 }}
              transition={{ delay: 0.5, duration: 0.8, ease: [0.34, 1.56, 0.64, 1] }}
              className="text-5xl sm:text-6xl font-display font-black tracking-tight relative"
            >
              <motion.span
                style={{
                  background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--neon-purple)), hsl(var(--accent)))',
                  backgroundSize: '300% 300%',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
                animate={{
                  backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
                }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: 'linear',
                }}
              >
                VYBE
              </motion.span>
              {/* Text glow */}
              <motion.span
                className="absolute inset-0 blur-lg opacity-50"
                style={{
                  background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))',
                  backgroundSize: '300% 300%',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
                animate={{
                  backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
                }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: 'linear',
                }}
              >
                VYBE
              </motion.span>
            </motion.h1>
          </motion.div>

          {/* Enhanced progress bar */}
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.7, duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
            className="w-56 sm:w-72 px-4"
          >
            {/* Progress bar container with glow */}
            <div className="relative">
              {/* Outer glow */}
              <motion.div
                className="absolute -inset-2 rounded-full blur-md"
                style={{
                  background: `linear-gradient(90deg, hsl(var(--primary) / ${displayProgress / 200}), hsl(var(--accent) / ${displayProgress / 200}))`,
                }}
              />
              
              {/* Progress bar background */}
              <div className="relative h-2 sm:h-3 bg-muted/50 rounded-full overflow-hidden backdrop-blur-xl border border-white/10">
                {/* Animated shimmer */}
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                  animate={{ x: ['-100%', '200%'] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                />
                
                {/* Progress fill with animated gradient */}
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${displayProgress}%`,
                  }}
                >
                  <motion.div
                    className="absolute inset-0 rounded-full"
                    style={{
                      background: 'linear-gradient(90deg, hsl(var(--primary)), hsl(var(--neon-purple)), hsl(var(--accent)))',
                      backgroundSize: '200% 100%',
                    }}
                    animate={{
                      backgroundPosition: ['0% 0%', '100% 0%', '0% 0%'],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: 'linear',
                    }}
                  />
                  {/* Inner shine */}
                  <div className="absolute inset-0 rounded-full bg-gradient-to-b from-white/30 to-transparent" />
                </motion.div>
                
                {/* Glowing orb at progress tip */}
                {displayProgress > 0 && displayProgress < 100 && (
                  <motion.div
                    className="absolute top-1/2 -translate-y-1/2 w-6 h-6 sm:w-8 sm:h-8 rounded-full pointer-events-none"
                    style={{
                      left: `${displayProgress}%`,
                      marginLeft: '-12px',
                      background: 'radial-gradient(circle, hsl(var(--accent)), transparent)',
                    }}
                    animate={{
                      opacity: [0.6, 1, 0.6],
                      scale: [1, 1.3, 1],
                    }}
                    transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
                  />
                )}
              </div>
            </div>

            {/* Status and percentage */}
            <div className="flex justify-between items-center mt-3 sm:mt-4">
              <AnimatePresence mode="wait">
                <motion.span 
                  key={status}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.2 }}
                  className="text-xs sm:text-sm text-muted-foreground truncate max-w-[120px] sm:max-w-[160px]"
                >
                  {status}
                </motion.span>
              </AnimatePresence>
              <motion.span
                className="text-sm sm:text-base font-bold tabular-nums"
                style={{ 
                  background: showComplete 
                    ? 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))'
                    : 'linear-gradient(135deg, hsl(var(--muted-foreground)), hsl(var(--muted-foreground)))',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
                animate={showComplete ? { scale: [1, 1.2, 1] } : {}}
                transition={{ duration: 0.3 }}
              >
                {displayProgress}%
              </motion.span>
            </div>
          </motion.div>

          {/* Tagline with fade in */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 0.6, y: 0 }}
            transition={{ delay: 1, duration: 0.8 }}
            className="absolute bottom-8 sm:bottom-14 text-xs sm:text-sm text-muted-foreground tracking-widest uppercase px-4 text-center"
          >
            The Next Generation Social Platform
          </motion.p>

          {/* Bottom gradient fade */}
          <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent pointer-events-none" />
        </motion.div>
      )}
    </AnimatePresence>
  );
});
