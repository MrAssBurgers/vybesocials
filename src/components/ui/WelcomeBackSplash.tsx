import { memo, useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';

interface WelcomeBackSplashProps {
  username?: string | null;
  avatarUrl?: string | null;
  onComplete: () => void;
}

const BURST_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--accent))',
  'hsl(280 90% 65%)',
  'hsl(330 100% 65%)',
  'hsl(190 100% 60%)',
  'hsl(45 100% 60%)',
  'hsl(160 80% 55%)',
  'hsl(220 100% 65%)',
];

interface BurstParticle {
  id: number;
  angle: number;
  distance: number;
  color: string;
  size: number;
  delay: number;
  shape: 'circle' | 'square';
  rotation: number;
}

function generateParticles(count: number): BurstParticle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    angle: (360 / count) * i + (Math.random() * 24 - 12),
    distance: 140 + Math.random() * 220,
    color: BURST_COLORS[i % BURST_COLORS.length],
    size: 5 + Math.random() * 7,
    delay: Math.random() * 0.12,
    shape: Math.random() > 0.5 ? 'circle' : 'square',
    rotation: Math.random() * 720 - 360,
  }));
}

export const WelcomeBackSplash = memo(function WelcomeBackSplash({
  username,
  avatarUrl,
  onComplete,
}: WelcomeBackSplashProps) {
  const [visible, setVisible] = useState(true);
  const [showBurst, setShowBurst] = useState(false);
  const particles = useMemo(() => generateParticles(60), []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowBurst(true);
      setVisible(false);
    }, 2800);
    return () => clearTimeout(timer);
  }, []);

  const displayName = username || 'you';

  return (
    <>
      {/* Radial burst particles */}
      <AnimatePresence>
        {showBurst && (
          <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 2147483647 }}>
            {particles.map((p) => {
              const rad = (p.angle * Math.PI) / 180;
              const tx = Math.cos(rad) * p.distance;
              const ty = Math.sin(rad) * p.distance;
              return (
                <motion.div
                  key={p.id}
                  initial={{ x: '-50%', y: '-50%', scale: 1, opacity: 1 }}
                  animate={{
                    x: tx,
                    y: ty,
                    scale: 0,
                    opacity: 0,
                  }}
                  transition={{
                    duration: 0.7,
                    delay: p.delay,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className="absolute rounded-full"
                  style={{
                    top: '50%',
                    left: '50%',
                    width: p.size,
                    height: p.size,
                    backgroundColor: p.color,
                  }}
                />
              );
            })}
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence onExitComplete={onComplete}>
        {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.08, filter: 'blur(12px)' }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 flex flex-col items-center justify-center bg-background overflow-hidden"
          style={{ zIndex: 2147483646 }}
        >
          {/* Ambient gradient mesh */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <motion.div
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 0.5, scale: 1 }}
              transition={{ duration: 1.2, ease: 'easeOut' }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{
                width: 'min(500px, 90vw)',
                height: 'min(500px, 90vw)',
                background: 'radial-gradient(circle, hsl(var(--primary) / 0.2) 0%, hsl(var(--accent) / 0.08) 50%, transparent 70%)',
                filter: 'blur(60px)',
              }}
            />
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.3 }}
              transition={{ delay: 0.4, duration: 1 }}
              className="absolute"
              style={{
                top: '30%', right: '15%',
                width: 'min(200px, 40vw)', height: 'min(200px, 40vw)',
                background: 'radial-gradient(circle, hsl(var(--accent) / 0.3) 0%, transparent 70%)',
                filter: 'blur(40px)',
                animation: 'splash-float-2 6s ease-in-out infinite',
              }}
            />
          </div>

          {/* Floating sparkle particles */}
          {[...Array(6)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{
                opacity: [0, 0.6, 0],
                y: [-20, -60],
                x: [0, (i % 2 === 0 ? 15 : -15)],
              }}
              transition={{
                delay: 0.5 + i * 0.2,
                duration: 1.8,
                ease: 'easeOut',
                repeat: 0,
              }}
              className="absolute"
              style={{
                top: `${45 + (i % 3) * 8}%`,
                left: `${25 + i * 10}%`,
                width: 4, height: 4,
                borderRadius: '50%',
                background: `hsl(var(--${i % 2 === 0 ? 'primary' : 'accent'}))`,
              }}
            />
          ))}

          {/* Avatar with ring */}
          <motion.div
            initial={{ scale: 0, opacity: 0, rotate: -10 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ delay: 0.15, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="relative mb-5"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: [1, 1.2, 1], opacity: [0, 0.4, 0] }}
              transition={{ delay: 0.9, duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute inset-0 rounded-full"
              style={{
                margin: -8,
                border: '2px solid hsl(var(--primary) / 0.3)',
              }}
            />
            <div
              className="w-20 h-20 rounded-full overflow-hidden ring-2 ring-primary/30"
              style={{
                background: 'linear-gradient(135deg, hsl(var(--primary) / 0.2), hsl(var(--accent) / 0.2))',
              }}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="eager"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-2xl font-bold text-primary/60">
                    {displayName[0]?.toUpperCase() || 'V'}
                  </span>
                </div>
              )}
            </div>
          </motion.div>

          {/* Welcome text */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col items-center gap-1.5 text-center px-6"
          >
            <div className="flex items-center gap-2">
              <motion.div
                initial={{ rotate: -20, scale: 0 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ delay: 0.5, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              >
                <Sparkles className="w-5 h-5 text-primary" />
              </motion.div>
              <h1
                className="text-xl font-display font-bold tracking-tight"
                style={{
                  background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                Welcome back
              </h1>
              <motion.div
                initial={{ rotate: 20, scale: 0 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ delay: 0.55, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              >
                <Sparkles className="w-5 h-5 text-accent" />
              </motion.div>
            </div>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.5 }}
              className="text-base font-semibold text-foreground"
            >
              @{displayName}
            </motion.p>
          </motion.div>

          {/* Tagline */}
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 0.5, y: 0 }}
            transition={{ delay: 0.9, duration: 0.5 }}
            className="text-[11px] text-muted-foreground mt-4 tracking-wide uppercase font-medium"
          >
            let's vybe ✨
          </motion.p>

          {/* Bottom gradient bar */}
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.3, duration: 2.2, ease: [0.22, 1, 0.36, 1] }}
            className="absolute bottom-0 left-0 right-0 h-[2px] origin-left"
            style={{
              background: 'linear-gradient(90deg, hsl(var(--primary)), hsl(var(--accent)), hsl(var(--primary)))',
              backgroundSize: '200% 100%',
              animation: 'splash-bar-glow 2s ease-in-out infinite',
            }}
          />
        </motion.div>
      )}
      </AnimatePresence>
    </>
  );
});
