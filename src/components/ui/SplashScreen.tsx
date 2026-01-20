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

// Floating particle component with color variety
const FloatingParticle = memo(function FloatingParticle({ 
  delay, 
  duration, 
  size, 
  startX, 
  startY,
  colorIndex,
}: { 
  delay: number; 
  duration: number; 
  size: number; 
  startX: number; 
  startY: number;
  colorIndex: number;
}) {
  const colors = [
    'hsl(var(--primary))',
    'hsl(var(--accent))',
    'hsl(var(--neon-purple))',
    'hsl(var(--neon-cyan))',
    'hsl(var(--neon-pink))',
  ];
  const color = colors[colorIndex % colors.length];
  
  return (
    <motion.div
      className="absolute rounded-full"
      style={{
        width: size,
        height: size,
        left: `${startX}%`,
        top: `${startY}%`,
        background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
        boxShadow: `0 0 ${size * 2}px ${color}`,
      }}
      initial={{ opacity: 0, scale: 0 }}
      animate={{
        opacity: [0, 0.8, 0.5, 0],
        scale: [0, 1.2, 1.5, 0.5],
        y: [0, -100, -180],
        x: [0, (Math.random() - 0.5) * 80],
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

// Glowing orb component for background depth
const GlowingOrb = memo(function GlowingOrb({
  size,
  color,
  x,
  y,
  delay,
  duration,
}: {
  size: number;
  color: string;
  x: string;
  y: string;
  delay: number;
  duration: number;
}) {
  return (
    <motion.div
      className="absolute rounded-full pointer-events-none"
      style={{
        width: size,
        height: size,
        left: x,
        top: y,
        background: `radial-gradient(circle at 30% 30%, ${color}, transparent 70%)`,
        filter: `blur(${size / 3}px)`,
      }}
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{
        opacity: [0.3, 0.6, 0.3],
        scale: [0.9, 1.1, 0.9],
        x: [0, 20, 0],
        y: [0, -15, 0],
      }}
      transition={{
        duration,
        delay,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    />
  );
});

// Orbital ring component with gradient
const OrbitalRing = memo(function OrbitalRing({ 
  size, 
  duration, 
  delay,
  reverse = false,
  colorStart,
  colorEnd,
}: { 
  size: number; 
  duration: number; 
  delay: number;
  reverse?: boolean;
  colorStart?: string;
  colorEnd?: string;
}) {
  return (
    <motion.div
      className="absolute rounded-full"
      style={{
        width: size,
        height: size,
        left: '50%',
        top: '50%',
        marginLeft: -size / 2,
        marginTop: -size / 2,
        border: '1px solid transparent',
        background: `linear-gradient(${reverse ? '45deg' : '-45deg'}, ${colorStart || 'hsl(var(--primary) / 0.2)'}, transparent, ${colorEnd || 'hsl(var(--accent) / 0.2)'})`,
        WebkitMask: 'linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0)',
        WebkitMaskComposite: 'xor',
        maskComposite: 'exclude',
      }}
      initial={{ opacity: 0, scale: 0.8, rotate: 0 }}
      animate={{ 
        opacity: [0, 0.5, 0.2],
        scale: [0.8, 1, 1.05],
        rotate: reverse ? -360 : 360,
      }}
      transition={{
        opacity: { duration: 2, delay },
        scale: { duration: 4, delay, repeat: Infinity, repeatType: "reverse" },
        rotate: { duration, repeat: Infinity, ease: "linear" },
      }}
    />
  );
});

// Sparkle component for extra polish
const Sparkle = memo(function Sparkle({
  x,
  y,
  delay,
  size,
}: {
  x: string;
  y: string;
  delay: number;
  size: number;
}) {
  return (
    <motion.div
      className="absolute pointer-events-none"
      style={{
        left: x,
        top: y,
        width: size,
        height: size,
      }}
      initial={{ opacity: 0, scale: 0, rotate: 0 }}
      animate={{
        opacity: [0, 1, 0],
        scale: [0, 1, 0],
        rotate: [0, 180],
      }}
      transition={{
        duration: 2,
        delay,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    >
      <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
        <path
          d="M12 0L13.5 10.5L24 12L13.5 13.5L12 24L10.5 13.5L0 12L10.5 10.5L12 0Z"
          fill="url(#sparkle-gradient)"
        />
        <defs>
          <linearGradient id="sparkle-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="hsl(var(--primary))" />
            <stop offset="50%" stopColor="hsl(var(--neon-cyan))" />
            <stop offset="100%" stopColor="hsl(var(--accent))" />
          </linearGradient>
        </defs>
      </svg>
    </motion.div>
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
  
  // Generate particles with varied colors
  const particles = useMemo(() => {
    if (isLowEnd) return [];
    return Array.from({ length: 12 }, (_, i) => ({
      id: i,
      delay: i * 0.3,
      duration: 3 + Math.random() * 2,
      size: 6 + Math.random() * 8,
      startX: 20 + Math.random() * 60,
      startY: 55 + Math.random() * 25,
      colorIndex: i,
    }));
  }, [isLowEnd]);
  
  // Generate sparkles
  const sparkles = useMemo(() => {
    if (isLowEnd) return [];
    return Array.from({ length: 6 }, (_, i) => ({
      id: i,
      x: `${15 + Math.random() * 70}%`,
      y: `${20 + Math.random() * 60}%`,
      delay: i * 0.5 + Math.random() * 2,
      size: 8 + Math.random() * 12,
    }));
  }, [isLowEnd]);
  
  // Generate glowing orbs
  const orbs = useMemo(() => {
    if (isLowEnd) return [];
    return [
      { size: 120, color: 'hsl(var(--neon-pink) / 0.4)', x: '10%', y: '20%', delay: 0, duration: 6 },
      { size: 100, color: 'hsl(var(--neon-cyan) / 0.4)', x: '80%', y: '30%', delay: 1, duration: 7 },
      { size: 80, color: 'hsl(var(--neon-yellow) / 0.3)', x: '15%', y: '70%', delay: 2, duration: 5 },
      { size: 90, color: 'hsl(var(--neon-purple) / 0.4)', x: '75%', y: '75%', delay: 1.5, duration: 6 },
    ];
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
          {/* Multi-layer animated gradient background */}
          <motion.div 
            className="absolute inset-0 pointer-events-none overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.5 }}
          >
            {/* Base gradient layer */}
            <div 
              className="absolute inset-0"
              style={{
                background: 'radial-gradient(ellipse at 50% 50%, hsl(var(--primary) / 0.15) 0%, transparent 60%)',
              }}
            />
            
            {/* Primary neon pink glow - top left */}
            <motion.div 
              className="absolute -top-20 -left-20 w-64 h-64 sm:w-96 sm:h-96 rounded-full"
              style={{
                background: 'radial-gradient(circle, hsl(var(--neon-pink) / 0.5) 0%, hsl(var(--primary) / 0.3) 40%, transparent 70%)',
                filter: 'blur(60px)',
              }}
              animate={isLowEnd ? {} : {
                opacity: [0.4, 0.7, 0.4],
                scale: [1, 1.2, 1],
                x: [0, 30, 0],
                y: [0, 20, 0],
              }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            />
            
            {/* Cyan glow - top right */}
            <motion.div 
              className="absolute -top-10 -right-10 w-56 h-56 sm:w-80 sm:h-80 rounded-full"
              style={{
                background: 'radial-gradient(circle, hsl(var(--neon-cyan) / 0.5) 0%, hsl(var(--accent) / 0.3) 40%, transparent 70%)',
                filter: 'blur(50px)',
              }}
              animate={isLowEnd ? {} : {
                opacity: [0.3, 0.6, 0.3],
                scale: [1.1, 0.9, 1.1],
                x: [0, -25, 0],
              }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 1 }}
            />
            
            {/* Center purple/magenta glow - main focus */}
            <motion.div 
              className="absolute top-1/2 left-1/2 w-72 h-72 sm:w-[28rem] sm:h-[28rem] rounded-full -translate-x-1/2 -translate-y-1/2"
              style={{
                background: 'radial-gradient(circle, hsl(var(--neon-purple) / 0.4) 0%, hsl(var(--primary) / 0.2) 50%, transparent 70%)',
                filter: 'blur(80px)',
              }}
              animate={isLowEnd ? {} : {
                opacity: [0.3, 0.5, 0.3],
                scale: [0.95, 1.1, 0.95],
              }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
            />

            {/* Accent glow - bottom left */}
            <motion.div 
              className="absolute -bottom-20 -left-10 w-60 h-60 sm:w-80 sm:h-80 rounded-full"
              style={{
                background: 'radial-gradient(circle, hsl(var(--accent) / 0.5) 0%, hsl(var(--neon-cyan) / 0.3) 40%, transparent 70%)',
                filter: 'blur(60px)',
              }}
              animate={isLowEnd ? {} : {
                opacity: [0.35, 0.6, 0.35],
                scale: [1, 1.15, 1],
                y: [0, -30, 0],
              }}
              transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut", delay: 2 }}
            />

            {/* Yellow/warm glow - bottom right */}
            <motion.div 
              className="absolute -bottom-10 -right-20 w-48 h-48 sm:w-72 sm:h-72 rounded-full"
              style={{
                background: 'radial-gradient(circle, hsl(var(--neon-yellow) / 0.4) 0%, hsl(var(--primary) / 0.2) 50%, transparent 70%)',
                filter: 'blur(50px)',
              }}
              animate={isLowEnd ? {} : {
                opacity: [0.25, 0.5, 0.25],
                scale: [1.1, 0.95, 1.1],
                x: [0, -20, 0],
              }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 3 }}
            />
            
            {/* Floating glowing orbs */}
            {orbs.map((orb, i) => (
              <GlowingOrb key={i} {...orb} />
            ))}
          </motion.div>

          {/* Enhanced orbital rings (desktop only) */}
          {!isLowEnd && (
            <div className="absolute inset-0 pointer-events-none hidden sm:block">
              <OrbitalRing 
                size={280} 
                duration={18} 
                delay={0.3} 
                colorStart="hsl(var(--neon-pink) / 0.3)"
                colorEnd="hsl(var(--neon-purple) / 0.3)"
              />
              <OrbitalRing 
                size={380} 
                duration={25} 
                delay={0.8} 
                reverse 
                colorStart="hsl(var(--neon-cyan) / 0.25)"
                colorEnd="hsl(var(--accent) / 0.25)"
              />
              <OrbitalRing 
                size={480} 
                duration={35} 
                delay={1.2}
                colorStart="hsl(var(--primary) / 0.2)"
                colorEnd="hsl(var(--neon-yellow) / 0.2)"
              />
              <OrbitalRing 
                size={580} 
                duration={45} 
                delay={1.8} 
                reverse
                colorStart="hsl(var(--accent) / 0.15)"
                colorEnd="hsl(var(--neon-pink) / 0.15)"
              />
            </div>
          )}

          {/* Sparkles */}
          {!isLowEnd && (
            <div className="absolute inset-0 pointer-events-none">
              {sparkles.map((s) => (
                <Sparkle key={s.id} {...s} />
              ))}
            </div>
          )}

          {/* Floating particles with color variety */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {particles.map((p) => (
              <FloatingParticle key={p.id} {...p} />
            ))}
          </div>
          
          {/* Logo with multi-layer breathing glow */}
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
            {/* Outer glow ring - pink */}
            <motion.div
              className="absolute inset-0 -m-16 sm:-m-20 rounded-full"
              style={{
                background: 'radial-gradient(circle, hsl(var(--neon-pink) / 0.3) 0%, transparent 70%)',
                filter: 'blur(30px)',
              }}
              animate={isLowEnd ? {} : {
                opacity: [0.3, 0.6, 0.3],
                scale: [0.9, 1.1, 0.9],
              }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            />
            
            {/* Middle glow ring - purple */}
            <motion.div
              className="absolute inset-0 -m-12 sm:-m-14 rounded-full"
              style={{
                background: 'radial-gradient(circle, hsl(var(--neon-purple) / 0.4) 0%, transparent 70%)',
                filter: 'blur(25px)',
              }}
              animate={isLowEnd ? {} : {
                opacity: [0.4, 0.7, 0.4],
                scale: [1, 1.15, 1],
              }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
            />
            
            {/* Inner glow - cyan accent */}
            <motion.div
              className="absolute inset-0 -m-8 sm:-m-10 rounded-full"
              style={{
                background: 'radial-gradient(circle, hsl(var(--neon-cyan) / 0.3) 0%, hsl(var(--accent) / 0.2) 50%, transparent 70%)',
                filter: 'blur(20px)',
              }}
              animate={isLowEnd ? {} : {
                opacity: [0.3, 0.5, 0.3],
                scale: [1.1, 0.95, 1.1],
              }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 1 }}
            />
            
            {/* Core glow - primary */}
            <motion.div
              className="absolute inset-0 -m-4 sm:-m-6 rounded-full"
              style={{
                background: 'radial-gradient(circle, hsl(var(--primary) / 0.5) 0%, transparent 70%)',
                filter: 'blur(15px)',
              }}
              animate={isLowEnd ? {} : {
                opacity: [0.5, 0.8, 0.5],
                scale: [1, 1.08, 1],
              }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
            />
            
            <VYBELogo size="splash" showText={false} animated={true} />
          </motion.div>

          {/* Welcome text with staggered reveal and glow */}
          <motion.div className="text-center mb-6 sm:mb-8 px-4 relative">
            <motion.p
              initial={{ opacity: 0, y: 15, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ delay: 0.6, duration: 0.6, ease: "easeOut" }}
              className="text-sm sm:text-base text-muted-foreground mb-2"
            >
              Welcome to
            </motion.p>
            
            {/* Text glow backdrop */}
            <motion.div
              className="absolute left-1/2 top-1/2 w-48 h-16 sm:w-64 sm:h-20 -translate-x-1/2 -translate-y-1/4 rounded-full"
              style={{
                background: 'radial-gradient(ellipse, hsl(var(--primary) / 0.3) 0%, hsl(var(--neon-purple) / 0.2) 50%, transparent 80%)',
                filter: 'blur(20px)',
              }}
              animate={isLowEnd ? {} : {
                opacity: [0.4, 0.7, 0.4],
                scale: [1, 1.1, 1],
              }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            />
            
            <motion.h1
              initial={{ opacity: 0, scale: 0.85, filter: 'blur(10px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              transition={{ delay: 0.8, duration: 0.7, ease: [0.34, 1.56, 0.64, 1] }}
              className="text-4xl sm:text-5xl font-display font-black tracking-tight relative"
              style={{
                background: 'linear-gradient(135deg, hsl(var(--neon-pink)), hsl(var(--primary)), hsl(var(--neon-purple)), hsl(var(--neon-cyan)), hsl(var(--accent)))',
                backgroundSize: '300% 300%',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                animation: 'gradient-shift 3s ease infinite',
                textShadow: '0 0 40px hsl(var(--primary) / 0.5)',
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
            className="w-60 sm:w-80 px-4 relative"
          >
            {/* Progress bar glow backdrop */}
            <motion.div
              className="absolute inset-x-0 -top-3 -bottom-3 rounded-full"
              style={{
                background: 'radial-gradient(ellipse at center, hsl(var(--primary) / 0.2) 0%, transparent 70%)',
                filter: 'blur(10px)',
              }}
              animate={isLowEnd ? {} : {
                opacity: [0.3, 0.5, 0.3],
              }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            />
            
            {/* Progress bar container */}
            <div className="relative h-2 sm:h-2.5 bg-muted/30 rounded-full overflow-hidden backdrop-blur-md border border-border/40 shadow-inner">
              {/* Animated shimmer */}
              <motion.div
                className="absolute inset-0"
                style={{
                  background: 'linear-gradient(90deg, transparent, hsl(var(--foreground) / 0.1), transparent)',
                }}
                animate={{ x: ['-100%', '200%'] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              />
              
              {/* Progress fill with rainbow gradient */}
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${displayProgress}%`,
                  background: 'linear-gradient(90deg, hsl(var(--neon-pink)), hsl(var(--primary)), hsl(var(--neon-purple)), hsl(var(--neon-cyan)), hsl(var(--accent)))',
                  backgroundSize: '200% 100%',
                  animation: 'gradient-shift 2s linear infinite',
                  boxShadow: '0 0 15px hsl(var(--primary) / 0.6), 0 0 30px hsl(var(--accent) / 0.4)',
                }}
                transition={{ type: "spring", stiffness: 100, damping: 25 }}
              />
              
              {/* Inner glow line */}
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${displayProgress}%`,
                  background: 'linear-gradient(to bottom, hsl(var(--foreground) / 0.3), transparent 50%)',
                }}
              />
              
              {/* Glowing tip with multiple layers */}
              {displayProgress > 0 && displayProgress < 100 && (
                <>
                  <motion.div
                    className="absolute top-1/2 -translate-y-1/2 w-8 h-8 sm:w-10 sm:h-10 rounded-full pointer-events-none"
                    style={{
                      left: `${displayProgress}%`,
                      marginLeft: '-16px',
                      background: 'radial-gradient(circle, hsl(var(--neon-cyan) / 0.8) 0%, transparent 70%)',
                      filter: 'blur(8px)',
                    }}
                    animate={{ opacity: [0.5, 1, 0.5], scale: [0.9, 1.1, 0.9] }}
                    transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  <motion.div
                    className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full pointer-events-none"
                    style={{
                      left: `${displayProgress}%`,
                      marginLeft: '-8px',
                      background: 'radial-gradient(circle, hsl(var(--foreground)) 0%, hsl(var(--neon-cyan)) 50%, transparent 80%)',
                    }}
                    animate={{ opacity: [0.8, 1, 0.8] }}
                    transition={{ duration: 0.5, repeat: Infinity, ease: 'easeInOut' }}
                  />
                </>
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
