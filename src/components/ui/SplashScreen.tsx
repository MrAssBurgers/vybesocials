import { memo, useState, useEffect } from 'react';
import { motion, AnimatePresence, useSpring } from 'framer-motion';

interface SplashScreenProps {
  isVisible: boolean;
  status?: string;
  progress?: number;
}

// Neon V Logo Component for Splash Screen
const NeonVLogo = memo(function NeonVLogo() {
  return (
    <motion.svg
      viewBox="0 0 100 100"
      fill="none"
      className="w-28 h-28 sm:w-36 sm:h-36"
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.8, ease: [0.34, 1.56, 0.64, 1], delay: 0.2 }}
    >
      <defs>
        {/* Gradient for left stroke - pink to purple */}
        <linearGradient id="splashLeftGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ff006e" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
        
        {/* Gradient for right stroke - purple to cyan */}
        <linearGradient id="splashRightGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#00f5d4" />
        </linearGradient>
        
        {/* Glow filter */}
        <filter id="splashGlow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      
      {/* Left leg of V - pink side */}
      <motion.path
        d="M20 15 L50 85"
        stroke="url(#splashLeftGradient)"
        strokeWidth="14"
        strokeLinecap="round"
        filter="url(#splashGlow)"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 1, delay: 0.4, ease: 'easeOut' }}
      />
      
      {/* Right leg of V - cyan side */}
      <motion.path
        d="M80 15 L50 85"
        stroke="url(#splashRightGradient)"
        strokeWidth="14"
        strokeLinecap="round"
        filter="url(#splashGlow)"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 1, delay: 0.6, ease: 'easeOut' }}
      />
      
      {/* Center bright point */}
      <motion.circle
        cx="50"
        cy="85"
        r="5"
        fill="white"
        filter="url(#splashGlow)"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, delay: 1.2, ease: [0.34, 1.56, 0.64, 1] }}
      />
    </motion.svg>
  );
});

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
          className="fixed inset-0 flex flex-col items-center justify-center bg-black overflow-hidden"
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
          {/* Animated background with neon glow */}
          <div className="absolute inset-0">
            {/* Pink glow - left */}
            <motion.div 
              className="absolute top-1/2 left-1/4 w-48 h-48 sm:w-64 sm:h-64 rounded-full blur-[80px] sm:blur-[100px] -translate-y-1/2"
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
              className="absolute top-1/2 right-1/4 w-48 h-48 sm:w-64 sm:h-64 rounded-full blur-[80px] sm:blur-[100px] -translate-y-1/2"
              style={{ background: '#00f5d4' }}
              animate={{
                opacity: [0.3, 0.5, 0.3],
                scale: [1.2, 1, 1.2],
                x: [20, -20, 20],
              }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
            />
          </div>
          
          {/* Logo container */}
          <motion.div
            className="relative mb-6 sm:mb-10"
          >
            {/* Outer glow pulse */}
            <motion.div
              className="absolute inset-0 -m-8 sm:-m-12 rounded-full"
              style={{
                background: 'radial-gradient(circle, rgba(139, 92, 246, 0.3) 0%, transparent 70%)',
              }}
              animate={{
                scale: [1, 1.3, 1],
                opacity: [0.4, 0.7, 0.4],
              }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
            />
            
            {/* Spinning ring */}
            <motion.div
              className="absolute inset-0 -m-4 sm:-m-6 rounded-full"
              style={{ 
                border: '2px solid transparent',
                borderTopColor: '#ff006e',
                borderRightColor: 'rgba(0, 245, 212, 0.5)',
              }}
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            />
            
            {/* Neon V Logo */}
            <motion.div
              animate={showComplete ? { 
                scale: [1, 1.1, 1],
              } : undefined}
              transition={{ duration: 0.5 }}
            >
              <NeonVLogo />
            </motion.div>
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
              className="text-sm sm:text-base text-white/60 mb-2"
            >
              Welcome to
            </motion.p>
            <motion.h1
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.9, duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
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
            transition={{ delay: 1, duration: 0.5, ease: 'easeOut' }}
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
            transition={{ delay: 1.2, duration: 0.8 }}
            className="absolute bottom-6 sm:bottom-12 text-[10px] sm:text-xs text-white/40 tracking-wide px-4 text-center"
          >
            The Next Generation Social Platform
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
