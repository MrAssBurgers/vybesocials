import { memo, useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence, useSpring } from 'framer-motion';
import { VYBELogo } from './VYBELogo';
import { isLowEndDevice } from '@/lib/performanceConfig';
import { supabase } from '@/integrations/supabase/client';

interface SplashScreenProps {
  isVisible: boolean;
  status?: string;
  progress?: number;
}

// Floating particle component for ambient effect
const FloatingParticle = memo(function FloatingParticle({ 
  delay, 
  duration, 
  size, 
  startX, 
  startY 
}: { 
  delay: number; 
  duration: number; 
  size: number; 
  startX: number; 
  startY: number;
}) {
  return (
    <motion.div
      className="absolute rounded-full bg-primary/30"
      style={{
        width: size,
        height: size,
        left: `${startX}%`,
        top: `${startY}%`,
      }}
      initial={{ opacity: 0, scale: 0 }}
      animate={{
        opacity: [0, 0.6, 0.3, 0],
        scale: [0, 1, 1.2, 0.8],
        y: [0, -80, -150],
        x: [0, (Math.random() - 0.5) * 60],
      }}
      transition={{
        duration,
        delay,
        repeat: Infinity,
        ease: "easeOut",
      }}
    />
  );
});

// Orbital ring component
const OrbitalRing = memo(function OrbitalRing({ 
  size, 
  duration, 
  delay,
  reverse = false 
}: { 
  size: number; 
  duration: number; 
  delay: number;
  reverse?: boolean;
}) {
  return (
    <motion.div
      className="absolute rounded-full border border-primary/10"
      style={{
        width: size,
        height: size,
        left: '50%',
        top: '50%',
        marginLeft: -size / 2,
        marginTop: -size / 2,
      }}
      initial={{ opacity: 0, scale: 0.8, rotate: 0 }}
      animate={{ 
        opacity: [0, 0.3, 0.1],
        scale: [0.8, 1, 1.1],
        rotate: reverse ? -360 : 360,
      }}
      transition={{
        opacity: { duration: 2, delay },
        scale: { duration: 3, delay, repeat: Infinity, repeatType: "reverse" },
        rotate: { duration, repeat: Infinity, ease: "linear" },
      }}
    />
  );
});

export const SplashScreen = memo(function SplashScreen({ 
  isVisible, 
  status = 'Loading...', 
  progress = 0 
}: SplashScreenProps) {
  const [showDebug, setShowDebug] = useState(false);
  const [tapCount, setTapCount] = useState(0);

  const handleLogoTap = useCallback(() => {
    setTapCount((c) => {
      const next = c + 1;
      if (next >= 5) setShowDebug(true);
      return next;
    });
  }, []);

  const handleResetSession = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error('Sign out error:', e);
    }
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/';
  }, []);

  const showComplete = progress >= 100;
  const isLowEnd = useMemo(() => isLowEndDevice(), []);
  
  // Generate particles only once
  const particles = useMemo(() => {
    if (isLowEnd) return [];
    return Array.from({ length: 8 }, (_, i) => ({
      id: i,
      delay: i * 0.4,
      duration: 3 + Math.random() * 2,
      size: 4 + Math.random() * 6,
      startX: 30 + Math.random() * 40,
      startY: 60 + Math.random() * 20,
    }));
  }, [isLowEnd]);
  
  // Smooth spring animation for progress
  const springProgress = useSpring(progress, isLowEnd ? { duration: 0 } : {
    stiffness: 80,
    damping: 25,
    mass: 0.8,
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
          {/* Animated gradient background */}
          <motion.div 
            className="absolute inset-0 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.5 }}
          >
            {/* Primary glow - breathing animation */}
            <motion.div 
              className="absolute top-1/2 left-1/4 w-48 h-48 sm:w-72 sm:h-72 rounded-full blur-[100px] sm:blur-[120px] -translate-y-1/2 bg-primary"
              animate={isLowEnd ? {} : {
                opacity: [0.3, 0.5, 0.3],
                scale: [1, 1.15, 1],
              }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            />
            
            {/* Accent glow - offset breathing */}
            <motion.div 
              className="absolute top-1/2 right-1/4 w-48 h-48 sm:w-72 sm:h-72 rounded-full blur-[100px] sm:blur-[120px] -translate-y-1/2 bg-accent"
              animate={isLowEnd ? {} : {
                opacity: [0.3, 0.5, 0.3],
                scale: [1.1, 1, 1.1],
              }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 2 }}
            />

            {/* Center purple glow - pulsing */}
            <motion.div 
              className="absolute top-1/2 left-1/2 w-40 h-40 sm:w-56 sm:h-56 rounded-full blur-[80px] sm:blur-[100px] -translate-x-1/2 -translate-y-1/2"
              style={{ background: 'hsl(var(--neon-purple))' }}
              animate={isLowEnd ? {} : {
                opacity: [0.2, 0.35, 0.2],
                scale: [0.9, 1.05, 0.9],
              }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 1 }}
            />
          </motion.div>

          {/* Orbital rings (desktop only) */}
          {!isLowEnd && (
            <div className="absolute inset-0 pointer-events-none hidden sm:block">
              <OrbitalRing size={300} duration={20} delay={0.5} />
              <OrbitalRing size={400} duration={30} delay={1} reverse />
              <OrbitalRing size={500} duration={40} delay={1.5} />
            </div>
          )}

          {/* Floating particles */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {particles.map((p) => (
              <FloatingParticle key={p.id} {...p} />
            ))}
          </div>
          
          {/* Logo with breathing glow */}
          <motion.div
            className="mb-6 sm:mb-10 cursor-pointer select-none relative"
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ 
              opacity: 1, 
              scale: showComplete ? [1, 1.08, 1] : 1,
              y: 0,
            }}
            transition={{ 
              opacity: { duration: 0.8, ease: "easeOut" },
              scale: { duration: 0.6, ease: [0.34, 1.56, 0.64, 1] },
              y: { duration: 0.8, ease: "easeOut" },
            }}
            onClick={handleLogoTap}
          >
            {/* Logo glow backdrop */}
            <motion.div
              className="absolute inset-0 -m-8 rounded-full blur-2xl bg-primary/20"
              animate={isLowEnd ? {} : {
                opacity: [0.3, 0.5, 0.3],
                scale: [1, 1.2, 1],
              }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
            />
            <VYBELogo size="splash" showText={false} animated={true} />
          </motion.div>

          {/* Welcome text with staggered reveal */}
          <motion.div className="text-center mb-6 sm:mb-8 px-4">
            <motion.p
              initial={{ opacity: 0, y: 15, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ delay: 0.6, duration: 0.6, ease: "easeOut" }}
              className="text-sm sm:text-base text-muted-foreground mb-2"
            >
              Welcome to
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, scale: 0.85, filter: 'blur(10px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              transition={{ delay: 0.8, duration: 0.7, ease: [0.34, 1.56, 0.64, 1] }}
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

          {/* Progress section with smooth entrance */}
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 1, duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
            className="w-56 sm:w-72 px-4"
          >
            {/* Progress bar container */}
            <div className="relative h-1.5 sm:h-2 bg-muted/50 rounded-full overflow-hidden backdrop-blur-sm border border-border/30">
              {/* Animated shimmer */}
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-foreground/5 to-transparent"
                animate={{ x: ['-100%', '200%'] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
              />
              
              {/* Progress fill */}
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${displayProgress}%`,
                  background: 'linear-gradient(90deg, hsl(var(--primary)), hsl(var(--neon-purple)), hsl(var(--accent)))',
                  boxShadow: '0 0 12px hsl(var(--primary) / 0.5)',
                }}
                transition={{ type: "spring", stiffness: 100, damping: 25 }}
              />
              
              {/* Glowing tip */}
              {displayProgress > 0 && displayProgress < 100 && (
                <motion.div
                  className="absolute top-1/2 -translate-y-1/2 w-5 h-5 sm:w-7 sm:h-7 rounded-full blur-md pointer-events-none"
                  style={{
                    left: `${displayProgress}%`,
                    marginLeft: '-10px',
                    background: 'radial-gradient(circle, hsl(var(--accent)) 0%, transparent 70%)',
                  }}
                  animate={{ opacity: [0.6, 1, 0.6] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                />
              )}
            </div>

            {/* Status row */}
            <div className="flex justify-between items-center mt-3 h-5">
              <AnimatePresence mode="wait">
                <motion.span 
                  key={status}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  className="text-[10px] sm:text-xs text-muted-foreground truncate max-w-[120px] sm:max-w-[160px]"
                >
                  {status}
                </motion.span>
              </AnimatePresence>
              <motion.span
                className="text-xs sm:text-sm font-semibold tabular-nums"
                animate={{ 
                  color: showComplete ? 'hsl(var(--accent))' : 'hsl(var(--muted-foreground))',
                  scale: showComplete ? [1, 1.1, 1] : 1,
                }}
                transition={{ duration: 0.3 }}
              >
                {displayProgress}%
              </motion.span>
            </div>
          </motion.div>

          {/* Tagline with fade in */}
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 0.5, y: 0 }}
            transition={{ delay: 1.4, duration: 0.8, ease: "easeOut" }}
            className="absolute bottom-16 sm:bottom-20 text-[10px] sm:text-xs text-muted-foreground tracking-widest uppercase px-4 text-center"
          >
            The Next Generation Social Platform
          </motion.p>

          {/* Debug reset button */}
          <AnimatePresence>
            {showDebug && (
              <motion.button
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.9 }}
                onClick={handleResetSession}
                className="absolute bottom-4 sm:bottom-8 px-4 py-2 text-xs bg-destructive/80 text-destructive-foreground rounded-full font-medium backdrop-blur-sm"
              >
                Reset Session
              </motion.button>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
