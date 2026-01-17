import { memo, useState, useEffect } from 'react';
import { motion, AnimatePresence, useSpring } from 'framer-motion';
import vybeLogo from '@/assets/vybe-logo.png';

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

  // Prevent body scroll when splash is visible
  useEffect(() => {
    if (isVisible) {
      document.body.style.overflow = 'hidden';
      // Hide bottom nav by adding a class
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
          className="fixed inset-0 flex flex-col items-center justify-center bg-black overflow-hidden"
          style={{
            zIndex: 2147483647, // Maximum z-index to be above everything
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw',
            height: '100dvh', // Dynamic viewport height for mobile (falls back to 100vh)
          }}
        >
          {/* Animated background with neon glow */}
          <div className="absolute inset-0">
            {/* Pink glow - left */}
            <motion.div 
              className="absolute top-1/2 left-1/4 w-64 h-64 rounded-full blur-[100px]"
              style={{ background: '#ff006e' }}
              animate={{
                opacity: [0.3, 0.5, 0.3],
                scale: [1, 1.2, 1],
                x: [-20, 20, -20],
              }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            />
            
            {/* Cyan glow - right */}
            <motion.div 
              className="absolute top-1/2 right-1/4 w-64 h-64 rounded-full blur-[100px]"
              style={{ background: '#00f5d4' }}
              animate={{
                opacity: [0.3, 0.5, 0.3],
                scale: [1.2, 1, 1.2],
                x: [20, -20, 20],
              }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
            />
            
            {/* Floating particles */}
            {[...Array(6)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute rounded-full"
                style={{
                  width: 4 + (i % 3) * 2,
                  height: 4 + (i % 3) * 2,
                  left: `${15 + i * 14}%`,
                  top: `${20 + (i % 4) * 18}%`,
                  background: i % 2 === 0 ? '#ff006e' : '#00f5d4',
                }}
                animate={{
                  y: [0, -30, 0],
                  opacity: [0.3, 0.8, 0.3],
                  scale: [1, 1.3, 1],
                }}
                transition={{
                  duration: 2 + i * 0.3,
                  repeat: Infinity,
                  delay: i * 0.2,
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
            className="relative mb-8 sm:mb-10"
          >
            {/* Outer glow pulse - pink */}
            <motion.div
              className="absolute -inset-16 sm:-inset-20 rounded-full"
              style={{
                background: 'radial-gradient(circle, rgba(255, 0, 110, 0.3) 0%, transparent 70%)',
              }}
              animate={{
                scale: [1, 1.3, 1],
                opacity: [0.4, 0.7, 0.4],
              }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
            />
            
            {/* Outer glow pulse - cyan */}
            <motion.div
              className="absolute -inset-12 sm:-inset-16 rounded-full"
              style={{
                background: 'radial-gradient(circle, rgba(0, 245, 212, 0.25) 0%, transparent 60%)',
              }}
              animate={{
                scale: [1.2, 1, 1.2],
                opacity: [0.3, 0.6, 0.3],
              }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
            />
            
            {/* Spinning ring */}
            <motion.div
              className="absolute -inset-6 sm:-inset-8 rounded-full"
              style={{ 
                border: '2px solid transparent',
                borderTopColor: '#ff006e',
                borderRightColor: 'rgba(0, 245, 212, 0.5)',
              }}
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            />
            
            {/* Logo image with glow effect */}
            <motion.img
              src={vybeLogo}
              alt="VYBE"
              className="relative z-10 w-24 h-24 sm:w-32 sm:h-32 object-contain"
              animate={showComplete ? { 
                scale: [1, 1.15, 1],
              } : {
                filter: [
                  'drop-shadow(0 0 20px rgba(255, 0, 110, 0.6)) drop-shadow(0 0 40px rgba(0, 245, 212, 0.4))',
                  'drop-shadow(0 0 30px rgba(0, 245, 212, 0.6)) drop-shadow(0 0 50px rgba(255, 0, 110, 0.4))',
                  'drop-shadow(0 0 20px rgba(255, 0, 110, 0.6)) drop-shadow(0 0 40px rgba(0, 245, 212, 0.4))',
                ],
              }}
              transition={{ 
                duration: showComplete ? 0.5 : 3, 
                repeat: showComplete ? 0 : Infinity, 
                ease: 'easeInOut' 
              }}
            />
          </motion.div>

          {/* Welcome to VYBE Text */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
            className="text-center mb-6 sm:mb-8 px-4"
          >
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="text-sm sm:text-base text-white/60 mb-2"
            >
              Welcome to
            </motion.p>
            <motion.h1
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
              className="text-4xl sm:text-5xl font-display font-black tracking-tight"
              style={{
                background: 'linear-gradient(135deg, #ff006e, #8338ec, #00f5d4)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              VYBE
            </motion.h1>
          </motion.div>

          {/* Progress bar container */}
          <motion.div
            initial={{ opacity: 0, y: 25 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.5, ease: 'easeOut' }}
            className="w-48 sm:w-64 px-4"
          >
            {/* Progress bar background */}
            <div className="relative h-1.5 sm:h-2 bg-white/10 rounded-full overflow-hidden backdrop-blur-sm">
              {/* Animated background shimmer */}
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                animate={{ x: ['-100%', '200%'] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              />
              
              {/* Progress fill with neon gradient */}
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${displayProgress}%`,
                  background: 'linear-gradient(90deg, #ff006e, #8338ec, #00f5d4)',
                }}
              />
              
              {/* Glow at progress tip */}
              <motion.div
                className="absolute top-1/2 -translate-y-1/2 w-4 h-4 sm:w-6 sm:h-6 rounded-full blur-md pointer-events-none"
                style={{
                  left: `${displayProgress}%`,
                  marginLeft: '-8px',
                  background: '#00f5d4',
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
                  className="text-[10px] sm:text-xs text-white/50 truncate max-w-[100px] sm:max-w-[140px]"
                >
                  {status}
                </motion.span>
              </AnimatePresence>
              <motion.span
                className="text-xs sm:text-sm font-medium tabular-nums transition-colors duration-300"
                style={{ 
                  color: showComplete ? '#00f5d4' : 'rgba(255, 255, 255, 0.5)'
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
            transition={{ delay: 1, duration: 0.8 }}
            className="absolute bottom-6 sm:bottom-12 text-[10px] sm:text-xs text-white/40 tracking-wide px-4 text-center"
          >
            The Next Generation Social Platform
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
