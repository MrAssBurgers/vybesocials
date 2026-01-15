import { memo, useState, useEffect } from 'react';
import { motion, AnimatePresence, useSpring } from 'framer-motion';

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
            scale: 1.02,
            filter: 'blur(8px)',
          }}
          transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background overflow-hidden"
        >
          {/* Subtle animated background */}
          <div className="absolute inset-0">
            <motion.div 
              className="absolute inset-0"
              animate={{ 
                background: [
                  'radial-gradient(circle at 30% 40%, hsl(var(--primary) / 0.08) 0%, transparent 50%)',
                  'radial-gradient(circle at 70% 60%, hsl(var(--primary) / 0.08) 0%, transparent 50%)',
                  'radial-gradient(circle at 30% 40%, hsl(var(--primary) / 0.08) 0%, transparent 50%)',
                ]
              }}
              transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
            />
          </div>

          {/* Welcome to VYBE - Main Content */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
            className="relative text-center mb-12"
          >
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="text-base sm:text-lg text-muted-foreground mb-3"
            >
              Welcome to
            </motion.p>
            <motion.h1
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.35, duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
              className="text-5xl sm:text-6xl md:text-7xl font-display font-black tracking-tight"
              style={{
                background: 'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--accent)) 50%, hsl(var(--primary)) 100%)',
                backgroundSize: '200% 200%',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              <motion.span
                animate={{
                  backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
                }}
                transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                style={{
                  background: 'inherit',
                  backgroundSize: 'inherit',
                  WebkitBackgroundClip: 'inherit',
                  WebkitTextFillColor: 'inherit',
                  backgroundClip: 'inherit',
                }}
              >
                VYBE
              </motion.span>
            </motion.h1>
            
            {/* Subtle glow behind text */}
            <motion.div
              className="absolute inset-0 -z-10 blur-3xl"
              style={{
                background: 'radial-gradient(circle, hsl(var(--primary) / 0.2) 0%, transparent 70%)',
              }}
              animate={{
                scale: [1, 1.1, 1],
                opacity: [0.3, 0.5, 0.3],
              }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            />
          </motion.div>

          {/* Loading Progress Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.5, ease: 'easeOut' }}
            className="w-64 sm:w-72"
          >
            {/* Progress bar */}
            <div className="relative h-1.5 bg-muted/30 rounded-full overflow-hidden">
              {/* Progress fill */}
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${displayProgress}%`,
                  background: 'linear-gradient(90deg, hsl(var(--primary)), hsl(var(--accent)))',
                }}
              />
              
              {/* Shimmer effect on progress */}
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                animate={{ x: ['-100%', '200%'] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
              />
            </div>

            {/* Status and percentage */}
            <div className="flex justify-between items-center mt-4">
              <AnimatePresence mode="wait">
                <motion.span 
                  key={status}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.2 }}
                  className="text-xs text-muted-foreground truncate max-w-[160px]"
                >
                  {status}
                </motion.span>
              </AnimatePresence>
              <motion.span
                className="text-sm font-semibold tabular-nums"
                animate={{
                  color: showComplete ? 'hsl(var(--primary))' : 'hsl(var(--foreground))',
                }}
              >
                {displayProgress}%
              </motion.span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
