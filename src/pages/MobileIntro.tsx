import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Sparkles, Heart, Users, Layers, Crown, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';

const SLIDES = [
  {
    icon: Sparkles,
    eyebrow: 'Welcome to',
    title: 'VYBE',
    body: 'A social home that actually feels like you — quiet when you want it, alive when you don\'t.',
    accent: 'from-primary to-accent',
  },
  {
    icon: Heart,
    eyebrow: 'Our vision',
    title: 'Real connection',
    body: 'Built for the people you actually care about — not strangers fighting for your attention.',
    accent: 'from-pink-500 to-primary',
  },
  {
    icon: Users,
    eyebrow: 'Your people',
    title: 'Communities that move',
    body: 'Drop into spaces, join calls, share moments. Discover your people without the noise.',
    accent: 'from-accent to-cyan-400',
  },
  {
    icon: Layers,
    eyebrow: "We're building",
    title: 'Mini Apps',
    body: 'Tiny tools and games that live inside VYBE — playable in a tap, shareable in a swipe.',
    accent: 'from-violet-500 to-fuchsia-500',
  },
  {
    icon: Crown,
    eyebrow: 'Coming soon',
    title: 'VYBE+',
    body: 'A premium tier with exclusive themes, AI boosts, creator perks, and early access drops.',
    accent: 'from-amber-400 to-orange-500',
  },
  {
    icon: Zap,
    eyebrow: 'Made for you',
    title: 'Your DNA, smarter',
    body: 'An AI that learns you and reshapes your feed, theme and layout to fit your real vibe.',
    accent: 'from-cyan-400 to-primary',
  },
];

const EASE = [0.16, 1, 0.3, 1] as const;

export default function MobileIntro({ onDone }: { onDone?: () => void }) {
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const startX = useRef(0);

  const finish = useCallback(() => {
    try { localStorage.setItem('vybe_intro_seen', '1'); } catch {}
    if (onDone) onDone();
    else navigate('/auth', { replace: true });
  }, [navigate, onDone]);

  const go = useCallback((dir: 1 | -1) => {
    setDirection(dir);
    setIndex(i => {
      const next = i + dir;
      if (next < 0) return 0;
      if (next >= SLIDES.length) { finish(); return i; }
      return next;
    });
  }, [finish]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -60) go(1);
    else if (info.offset.x > 60) go(-1);
  };

  const slide = SLIDES[index];
  const Icon = slide.icon;
  const isLast = index === SLIDES.length - 1;

  return (
    <div className="fixed inset-0 z-[9999] bg-background text-foreground overflow-hidden flex flex-col">
      {/* Ambient gradient that shifts per slide */}
      <AnimatePresence mode="sync">
        <motion.div
          key={`bg-${index}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: EASE }}
          className="pointer-events-none absolute inset-0 -z-10"
        >
          <div className={`absolute -top-32 left-1/2 -translate-x-1/2 h-[520px] w-[520px] rounded-full bg-gradient-to-br ${slide.accent} opacity-30 blur-[100px]`} />
          <div className={`absolute -bottom-32 left-1/3 h-[420px] w-[420px] rounded-full bg-gradient-to-tr ${slide.accent} opacity-20 blur-[110px]`} />
        </motion.div>
      </AnimatePresence>

      {/* Skip */}
      <div className="flex justify-end p-5 pt-[calc(env(safe-area-inset-top)+1rem)]">
        <button
          onClick={finish}
          className="text-sm text-muted-foreground/80 active:scale-95 transition-transform"
        >
          Skip
        </button>
      </div>

      {/* Slide content */}
      <motion.div
        className="flex-1 flex flex-col items-center justify-center px-7 select-none"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.18}
        onDragEnd={onDragEnd}
        onPointerDown={(e) => { startX.current = e.clientX; }}
      >
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={index}
            custom={direction}
            initial={{ opacity: 0, x: direction * 40, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: direction * -40, scale: 0.96 }}
            transition={{ duration: 0.45, ease: EASE }}
            className="w-full max-w-sm flex flex-col items-center text-center"
          >
            <motion.div
              initial={{ scale: 0.6, opacity: 0, rotate: -8 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ duration: 0.6, ease: EASE, delay: 0.1 }}
              className={`relative mb-8 h-24 w-24 rounded-3xl bg-gradient-to-br ${slide.accent} p-[1.5px] shadow-[0_20px_60px_-20px_hsl(var(--primary)/0.6)]`}
            >
              <div className="h-full w-full rounded-3xl bg-background/90 backdrop-blur-xl flex items-center justify-center">
                <Icon className="h-10 w-10 text-foreground" strokeWidth={1.8} />
              </div>
              <motion.div
                aria-hidden
                animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                className={`absolute inset-0 rounded-3xl bg-gradient-to-br ${slide.accent} blur-xl -z-10`}
              />
            </motion.div>

            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: EASE, delay: 0.18 }}
              className="text-xs uppercase tracking-[0.22em] text-muted-foreground/80"
            >
              {slide.eyebrow}
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE, delay: 0.24 }}
              className={`mt-2 text-4xl sm:text-5xl font-bold tracking-tight bg-gradient-to-r ${slide.accent} bg-clip-text text-transparent`}
            >
              {slide.title}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE, delay: 0.32 }}
              className="mt-5 text-base sm:text-lg text-muted-foreground leading-relaxed"
            >
              {slide.body}
            </motion.p>
          </motion.div>
        </AnimatePresence>
      </motion.div>

      {/* Dots + CTA */}
      <div className="px-7 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] flex flex-col items-center gap-6">
        <div className="flex items-center gap-1.5">
          {SLIDES.map((_, i) => (
            <motion.button
              key={i}
              onClick={() => { setDirection(i > index ? 1 : -1); setIndex(i); }}
              className="h-1.5 rounded-full bg-muted-foreground/30"
              animate={{ width: i === index ? 24 : 6, backgroundColor: i === index ? 'hsl(var(--primary))' : undefined }}
              transition={{ duration: 0.35, ease: EASE }}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>

        <Button
          size="lg"
          onClick={() => isLast ? finish() : go(1)}
          className={`w-full max-w-sm h-14 rounded-2xl text-base font-semibold bg-gradient-to-r ${slide.accent} text-primary-foreground shadow-[0_10px_40px_-10px_hsl(var(--primary)/0.7)] active:scale-[0.98] transition-transform`}
        >
          {isLast ? "Let's go" : 'Next'}
          <ArrowRight className="ml-1.5 h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
