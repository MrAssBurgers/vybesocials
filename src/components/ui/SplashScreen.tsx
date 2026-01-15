import { memo, useState, useEffect } from 'react';
import { motion, AnimatePresence, useSpring, useTransform } from 'framer-motion';

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
  
  // Smooth spring animation for progress
  const springProgress = useSpring(progress, {
    stiffness: 100,
    damping: 30,
    mass: 1,
  });
  
  // Animated display progress
  const [displayProgress, setDisplayProgress] = useState(0);
  
  useEffect(() => {
    const unsubscribe = springProgress.on('change', (v) => {
      setDisplayProgress(Math.round(v));
    });
    return unsubscribe;
  }, [springProgress]);
  
  useEffect(() => {
    springProgress.set(progress);
  }, [progress, springProgress]);

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
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background overflow-hidden"
        >
          {/* Animated background gradients */}
          <div className="absolute inset-0">
            <motion.div 
              className="absolute inset-0"
              animate={{ 
                background: [
                  'radial-gradient(circle at 30% 30%, hsl(var(--primary) / 0.12) 0%, transparent 50%)',
                  'radial-gradient(circle at 70% 70%, hsl(var(--primary) / 0.12) 0%, transparent 50%)',
                  'radial-gradient(circle at 70% 30%, hsl(var(--primary) / 0.12) 0%, transparent 50%)',
                  'radial-gradient(circle at 30% 70%, hsl(var(--primary) / 0.12) 0%, transparent 50%)',
                  'radial-gradient(circle at 30% 30%, hsl(var(--primary) / 0.12) 0%, transparent 50%)',
                ]
              }}
              transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
            />
            
            {/* Floating particles */}
            {[...Array(8)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute rounded-full bg-primary/15"
                style={{
                  width: 6 + (i % 3) * 4,
                  height: 6 + (i % 3) * 4,
                  left: `${10 + i * 11}%`,
                  top: `${15 + (i % 4) * 20}%`,
                }}
                animate={{
                  y: [0, -40, 0],
                  x: [0, (i % 2 === 0 ? 15 : -15), 0],
                  opacity: [0.2, 0.6, 0.2],
                  scale: [1, 1.2, 1],
                }}
                transition={{
                  duration: 3 + i * 0.4,
                  repeat: Infinity,
                  delay: i * 0.3,
                  ease: 'easeInOut',
                }}
              />
            ))}
          </div>
          
          {/* Logo container */}
          <motion.div
            initial={{ scale: 0.3, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ 
              duration: 0.8, 
              ease: [0.34, 1.56, 0.64, 1],
              delay: 0.1
            }}
            className="relative mb-10"
          >
            {/* Outer glow pulse */}
            <motion.div
              className="absolute -inset-12 rounded-full"
              style={{
                background: 'radial-gradient(circle, hsl(var(--primary) / 0.25) 0%, transparent 70%)',
              }}
              animate={{
                scale: [1, 1.3, 1],
                opacity: [0.4, 0.7, 0.4],
              }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
            />
            
            {/* Inner glow */}
            <motion.div
              className="absolute -inset-6 rounded-full"
              style={{
                background: 'radial-gradient(circle, hsl(var(--primary) / 0.4) 0%, transparent 60%)',
              }}
              animate={{
                scale: [1.1, 1, 1.1],
                opacity: [0.3, 0.5, 0.3],
              }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
            />
            
            {/* Spinning ring */}
            <motion.div
              className="absolute -inset-5 rounded-full border-2 border-primary/20"
              style={{ borderTopColor: 'hsl(var(--primary) / 0.8)', borderRightColor: 'hsl(var(--primary) / 0.4)' }}
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
            />
            
            {/* Logo icon */}
            <motion.div
              className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden flex items-center justify-center shadow-2xl"
              animate={showComplete ? { 
                scale: [1, 1.15, 1],
                boxShadow: [
                  '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                  '0 25px 50px -12px hsl(var(--primary) / 0.4)',
                  '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                ]
              } : {}}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            >
              {/* Animated gradient background */}
              <motion.div 
                className="absolute inset-0"
                animate={{
                  background: [
                    'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--accent)) 100%)',
                    'linear-gradient(180deg, hsl(var(--primary)) 0%, hsl(var(--accent)) 100%)',
                    'linear-gradient(225deg, hsl(var(--primary)) 0%, hsl(var(--accent)) 100%)',
                    'linear-gradient(270deg, hsl(var(--primary)) 0%, hsl(var(--accent)) 100%)',
                    'linear-gradient(315deg, hsl(var(--primary)) 0%, hsl(var(--accent)) 100%)',
                    'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--accent)) 100%)',
                  ]
                }}
                transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
              />
              
              {/* Glass overlay */}
              <div className="absolute inset-0 bg-white/10 backdrop-blur-[1px]" />
              
              {/* V Logo */}
              <svg viewBox="0 0 32 32" fill="none" className="relative z-10 w-12 h-12 sm:w-14 sm:h-14">
                <motion.path
                  d="M6 8L16 24L26 8"
                  stroke="white"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 1, delay: 0.3, ease: [0.4, 0, 0.2, 1] }}
                />
                <motion.path
                  d="M10 6C10 6 12 10 16 10C20 10 22 6 22 6"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 0.7 }}
                  transition={{ duration: 0.8, delay: 0.7, ease: [0.4, 0, 0.2, 1] }}
                />
                <motion.circle
                  cx="16"
                  cy="24"
                  r="2"
                  fill="white"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.4, delay: 1.1, ease: [0.34, 1.56, 0.64, 1] }}
                />
              </svg>
              
              {/* Shine sweep */}
              <motion.div 
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent"
                initial={{ x: '-100%' }}
                animate={{ x: '200%' }}
                transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 2, ease: 'easeInOut' }}
              />
            </motion.div>
          </motion.div>

          {/* Welcome to VYBE Text */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
            className="text-center mb-8"
          >
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="text-sm sm:text-base text-muted-foreground mb-2"
            >
              Welcome to
            </motion.p>
            <motion.h1
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
              className="text-4xl sm:text-5xl font-display font-black tracking-tight gradient-text"
            >
              VYBE
            </motion.h1>
          </motion.div>

          {/* Progress bar container */}
          <motion.div
            initial={{ opacity: 0, y: 25 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.5, ease: 'easeOut' }}
            className="w-56 sm:w-64"
          >
            {/* Progress bar background */}
            <div className="relative h-2 bg-muted/20 rounded-full overflow-hidden backdrop-blur-sm border border-white/5">
              {/* Animated background shimmer */}
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"
                animate={{ x: ['-100%', '200%'] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              />
              
              {/* Progress fill - using spring animation */}
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${displayProgress}%`,
                  background: 'linear-gradient(90deg, hsl(var(--primary)), hsl(var(--accent)), hsl(var(--primary)))',
                  backgroundSize: '200% 100%',
                }}
                animate={{ 
                  backgroundPosition: ['0% 0%', '100% 0%'],
                }}
                transition={{ 
                  backgroundPosition: { duration: 2, repeat: Infinity, ease: 'linear' }
                }}
              />
              
              {/* Glow at progress tip */}
              <motion.div
                className="absolute top-1/2 -translate-y-1/2 w-6 h-6 rounded-full blur-md pointer-events-none"
                style={{
                  left: `${displayProgress}%`,
                  marginLeft: '-12px',
                  background: 'hsl(var(--primary))',
                }}
                animate={{
                  opacity: displayProgress > 0 && displayProgress < 100 ? [0.5, 0.9, 0.5] : 0,
                }}
                transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
              />
            </div>

            {/* Status text */}
            <div className="flex justify-between items-center mt-3 h-5">
              <AnimatePresence mode="wait">
                <motion.span 
                  key={status}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  className="text-xs text-muted-foreground truncate max-w-[140px]"
                >
                  {status}
                </motion.span>
              </AnimatePresence>
              <motion.span
                className="text-sm font-medium tabular-nums transition-colors duration-300"
                style={{ 
                  color: showComplete ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'
                }}
              >
                {displayProgress}%
              </motion.span>
            </div>
          </motion.div>

          {/* Tagline */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            transition={{ delay: 1, duration: 0.8 }}
            className="absolute bottom-8 sm:bottom-12 text-xs text-muted-foreground tracking-wide"
          >
            The Next Generation Social Platform
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
