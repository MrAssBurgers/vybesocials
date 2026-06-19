import { memo, useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { isNativePerfMode } from '@/lib/nativePerfMode';

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
  const particles = useMemo(() => generateParticles(isNativePerfMode() ? 24 : 60), []);
  const reduceMotion = isNativePerfMode();

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    document.body.classList.add('welcome-back-visible');
    return () => {
      document.body.style.overflow = '';
      document.body.classList.remove('welcome-back-visible');
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), reduceMotion ? 1600 : 2400);
    return () => window.clearTimeout(timer);
  }, [reduceMotion]);

  const handleExitComplete = () => {
    if (reduceMotion) {
      onComplete();
      return;
    }
    setShowBurst(true);
    window.setTimeout(onComplete, 900);
  };

  const displayName = username || 'you';

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      <AnimatePresence>
        {showBurst && (
          <div
            className="fixed inset-0 pointer-events-none overflow-hidden overscroll-none"
            style={{ zIndex: 2147483647 }}
          >
            {particles.map((p) => {
              const rad = (p.angle * Math.PI) / 180;
              const tx = Math.cos(rad) * p.distance;
              const tyMid = Math.sin(rad) * p.distance - 40;
              const tyEnd = tyMid + 180;
              return (
                <motion.div
                  key={p.id}
                  initial={{ x: 0, y: 0, scale: 0.6, opacity: 1, rotate: 0 }}
                  animate={{
                    x: [0, tx * 0.6, tx],
                    y: [0, tyMid, tyEnd],
                    scale: [1, 1, 0.4],
                    opacity: [1, 1, 0],
                    rotate: p.rotation,
                  }}
                  transition={{
                    duration: 1.1,
                    delay: p.delay,
                    ease: [0.16, 1, 0.3, 1],
                    times: [0, 0.55, 1],
                  }}
                  className="absolute"
                  style={{
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: p.size,
                    height: p.shape === 'square' ? p.size * 1.4 : p.size,
                    backgroundColor: p.color,
                    borderRadius: p.shape === 'circle' ? '50%' : '2px',
                    boxShadow: `0 0 8px ${p.color}`,
                  }}
                />
              );
            })}
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence onExitComplete={handleExitComplete}>
        {visible && (
          <motion.div
            key="welcome-back-splash"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0.12 : 0.25, ease: 'easeOut' }}
            className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden overscroll-none"
            style={{
              zIndex: 2147483646,
              background: '#0B0B10',
              minHeight: '100dvh',
              paddingTop: 'env(safe-area-inset-top, 0px)',
              paddingBottom: 'env(safe-area-inset-bottom, 0px)',
              paddingLeft: 'env(safe-area-inset-left, 0px)',
              paddingRight: 'env(safe-area-inset-right, 0px)',
            }}
          >
            {!reduceMotion && (
              <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <motion.div
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 0.5, scale: 1 }}
                  transition={{ duration: 1.2, ease: 'easeOut' }}
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                  style={{
                    width: 'min(500px, 90vw)',
                    height: 'min(500px, 90vw)',
                    background:
                      'radial-gradient(circle, hsl(var(--primary) / 0.2) 0%, hsl(var(--accent) / 0.08) 50%, transparent 70%)',
                    filter: 'blur(60px)',
                  }}
                />
              </div>
            )}

            <div className="relative z-10 flex flex-col items-center justify-center px-6">
              <motion.div
                initial={{ scale: 0, opacity: 0, rotate: -10 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                transition={{ delay: 0.15, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                className="relative mb-5"
              >
                {!reduceMotion && (
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
                )}
                <div
                  className="w-20 h-20 rounded-full overflow-hidden ring-2 ring-primary/30"
                  style={{
                    background:
                      'linear-gradient(135deg, hsl(var(--primary) / 0.2), hsl(var(--accent) / 0.2))',
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

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="flex flex-col items-center gap-1.5 text-center"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
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
                  <Sparkles className="w-5 h-5 text-accent" />
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

              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 0.5, y: 0 }}
                transition={{ delay: 0.9, duration: 0.5 }}
                className="text-[11px] text-muted-foreground mt-4 tracking-wide uppercase font-medium"
              >
                let&apos;s vybe ✨
              </motion.p>
            </div>

            {!reduceMotion && (
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 0.3, duration: 2.2, ease: [0.22, 1, 0.36, 1] }}
                className="absolute bottom-0 left-0 right-0 h-[2px] origin-left"
                style={{
                  background:
                    'linear-gradient(90deg, hsl(var(--primary)), hsl(var(--accent)), hsl(var(--primary)))',
                  backgroundSize: '200% 100%',
                  animation: 'splash-bar-glow 2s ease-in-out infinite',
                }}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>,
    document.body,
  );
});
