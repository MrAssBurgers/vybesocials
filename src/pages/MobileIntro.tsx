import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowRight, Sparkles, Camera, MessageCircle, Users, Palette, Shield, Trophy, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isIOSAppShell } from '@/lib/despiaBridge';
import { isNativePerfMode } from '@/lib/nativePerfMode';

// Bump this when slides change to re-trigger the intro for existing users.
export const VYBE_INTRO_VERSION = '3';

const SLIDES = [
  {
    icon: Sparkles,
    eyebrow: 'Welcome to',
    title: 'VYBE',
    body: 'A social home built for real connection — quiet when you want it, alive when you don\'t.',
    accent: 'from-primary to-accent',
  },
  {
    icon: Camera,
    eyebrow: 'Share your moments',
    title: 'Stories & Clips',
    body: 'Post photos, short videos, and 24-hour stories with filters, music, and AI-powered effects.',
    accent: 'from-pink-500 to-primary',
  },
  {
    icon: MessageCircle,
    eyebrow: 'Stay close',
    title: 'Chat, Call, Vybe',
    body: 'DMs, group chats, voice and video calls — all encrypted, all in one place.',
    accent: 'from-accent to-cyan-400',
  },
  {
    icon: Smartphone,
    eyebrow: 'Meet in person',
    title: 'Friend Link',
    body: 'Tap phones together or scan QR — you\'re friends in seconds. No usernames, no awkward "what\'s your handle?"',
    accent: 'from-emerald-400 to-cyan-400',
  },
  {
    icon: Users,
    eyebrow: 'Find your people',
    title: 'Communities & Spaces',
    body: 'Drop into live audio Spaces, join communities around what you love, see friends on the map.',
    accent: 'from-violet-500 to-fuchsia-500',
  },
  {
    icon: Palette,
    eyebrow: 'Make it yours',
    title: 'Themes that adapt',
    body: 'Custom themes, fonts, layouts and an AI that reshapes your feed to match your real vibe.',
    accent: 'from-amber-400 to-orange-500',
  },
  {
    icon: Trophy,
    eyebrow: 'Get rewarded',
    title: 'Earn & level up',
    body: 'Daily streaks, XP, badges and seasonal drops — the more you VYBE, the more you unlock.',
    accent: 'from-yellow-400 to-amber-500',
  },
  {
    icon: Shield,
    eyebrow: 'Built for you',
    title: 'Safe by default',
    body: 'Strong privacy controls, parental tools, and instant reporting — so you stay in charge.',
    accent: 'from-emerald-400 to-cyan-400',
  },
];

/** Compositor-friendly slide — no spring overshoot, no Framer JS frames. */
const SLIDE_MS = 320;
const SLIDE_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

export default function MobileIntro({ onDone }: { onDone?: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [index, setIndex] = useState(0);
  const [sliding, setSliding] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef(0);
  const startX = useRef(0);
  const startY = useRef(0);
  const dragging = useRef(false);
  const lockHorizontal = useRef(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const calmNative = isIOSAppShell() || isNativePerfMode();

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  useEffect(() => {
    document.body.classList.add('hide-bottom-nav');
    const html = document.documentElement;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    html.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.classList.remove('hide-bottom-nav');
      html.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
      if (settleTimer.current) clearTimeout(settleTimer.current);
    };
  }, []);

  const widthOf = useCallback(() => viewportRef.current?.clientWidth ?? window.innerWidth, []);

  const readTrackX = useCallback(() => {
    const track = trackRef.current;
    if (!track) return 0;
    const raw = getComputedStyle(track).transform;
    if (!raw || raw === 'none') return 0;
    try {
      return new DOMMatrixReadOnly(raw).m41;
    } catch {
      const m = raw.match(/matrix(?:3d)?\(([^)]+)\)/);
      if (!m) return 0;
      const parts = m[1].split(',').map((v) => Number(v.trim()));
      return parts.length === 16 ? parts[12] : parts[4] || 0;
    }
  }, []);

  const applyTrack = useCallback((xPx: number, animate: boolean) => {
    const track = trackRef.current;
    if (!track) return;
    if (animate) {
      track.style.willChange = 'transform';
      track.style.transition = `transform ${SLIDE_MS}ms ${SLIDE_EASE}`;
    } else {
      track.style.transition = 'none';
    }
    track.style.transform = `translate3d(${xPx}px, 0, 0)`;
  }, []);

  const settleAfter = useCallback((clamped: number) => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      setSliding(false);
      const track = trackRef.current;
      if (track) track.style.willChange = 'auto';
    }, SLIDE_MS + 40);
    indexRef.current = clamped;
    setIndex(clamped);
  }, []);

  const snapTo = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(SLIDES.length - 1, next));
    const width = widthOf();
    const target = -clamped * width;
    const currentX = readTrackX();
    if (clamped === indexRef.current && Math.abs(currentX - target) < 1) {
      setSliding(false);
      applyTrack(target, false);
      return;
    }
    setSliding(true);
    applyTrack(target, true);
    settleAfter(clamped);
  }, [applyTrack, readTrackX, settleAfter, widthOf]);
  const finish = useCallback(() => {
    try {
      localStorage.setItem('vybe_intro_seen', '1');
      localStorage.setItem('vybe_intro_version', VYBE_INTRO_VERSION);
    } catch { /* ignore */ }
    if (onDone) onDone();
    else {
      const from = (location.state as { from?: string } | null)?.from;
      if (from && from !== '/intro') navigate(from, { replace: true });
      else if (typeof window !== 'undefined' && localStorage.getItem('vybe-was-logged-in') === '1') navigate('/', { replace: true });
      else navigate('/auth', { replace: true });
    }
  }, [navigate, onDone, location.state]);

  const go = useCallback((dir: 1 | -1) => {
    const next = indexRef.current + dir;
    if (next < 0) {
      snapTo(0);
      return;
    }
    if (next >= SLIDES.length) {
      finish();
      return;
    }
    snapTo(next);
  }, [finish, snapTo]);

  // Keep track aligned if viewport resizes (orientation / safe-area).
  useEffect(() => {
    const onResize = () => {
      applyTrack(-indexRef.current * widthOf(), false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [applyTrack, widthOf]);

  // Initial position
  useEffect(() => {
    applyTrack(0, false);
  }, [applyTrack]);

  const onPointerDown = (e: React.PointerEvent) => {
    startX.current = e.clientX;
    startY.current = e.clientY;
    dragging.current = true;
    lockHorizontal.current = false;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    // Freeze at current visual offset (cancel mid-tween)
    applyTrack(readTrackX(), false);
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch { /* ignore */ }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    if (!lockHorizontal.current) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      lockHorizontal.current = Math.abs(dx) > Math.abs(dy) * 1.25;
      if (!lockHorizontal.current) {
        dragging.current = false;
        return;
      }
      setSliding(true);
      const track = trackRef.current;
      if (track) track.style.willChange = 'transform';
    }
    const width = widthOf();
    const base = -indexRef.current * width;
    let offset = dx;
    if ((indexRef.current === 0 && dx > 0) || (indexRef.current === SLIDES.length - 1 && dx < 0)) {
      offset = dx * 0.35;
    }
    applyTrack(base + offset, false);
  };

  const endDrag = (clientX: number) => {
    if (!dragging.current && !lockHorizontal.current) return;
    const wasHorizontal = lockHorizontal.current;
    dragging.current = false;
    lockHorizontal.current = false;
    if (!wasHorizontal) {
      setSliding(false);
      return;
    }
    const dx = clientX - startX.current;
    if (dx < -56) snapTo(indexRef.current + 1);
    else if (dx > 56) snapTo(indexRef.current - 1);
    else snapTo(indexRef.current);
  };

  const isLast = index === SLIDES.length - 1;

  return (
    <div
      ref={rootRef}
      data-allow-animation="true"
      className={`fixed inset-0 z-[9999] h-[100dvh] max-h-[100dvh] bg-background text-foreground overflow-hidden overscroll-none flex flex-col mobile-intro${sliding ? ' mobile-intro--sliding' : ''}${calmNative ? ' mobile-intro--native' : ''}`}
    >
      {/* Static soft wash — no per-slide accent swap, no filter:blur remounts */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden mobile-intro-aura" aria-hidden>
        <div className="mobile-intro-orb mobile-intro-orb--a" />
        <div className="mobile-intro-orb mobile-intro-orb--b" />
      </div>

      <div className="flex justify-end p-5 pt-[max(1rem,var(--sat,env(safe-area-inset-top,0px)))] relative z-10">
        <button
          type="button"
          onClick={finish}
          className="text-sm text-muted-foreground/80 active:scale-95 transition-transform"
        >
          Skip
        </button>
      </div>

      <div
        ref={viewportRef}
        className="flex-1 min-h-0 overflow-hidden select-none touch-pan-y mobile-intro-viewport"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endDrag(e.clientX)}
        onPointerCancel={(e) => endDrag(e.clientX)}
        onPointerLeave={(e) => {
          if (dragging.current) endDrag(e.clientX);
        }}
      >
        <div
          ref={trackRef}
          className="flex h-full mobile-intro-track"
          style={{ width: `${SLIDES.length * 100}%` }}
        >
          {SLIDES.map((s, i) => {
            const Icon = s.icon;
            return (
              <div
                key={s.title}
                className="mobile-intro-slide h-full shrink-0 flex flex-col items-center justify-center px-7"
                style={{ width: `${100 / SLIDES.length}%` }}
                aria-hidden={i !== index}
              >
                <div className="w-full max-w-sm flex flex-col items-center text-center">
                  <div
                    className={`relative mb-8 h-24 w-24 rounded-3xl bg-gradient-to-br ${s.accent} p-[1.5px] mobile-intro-icon-ring`}
                  >
                    <div className="mobile-intro-icon-face h-full w-full rounded-3xl flex items-center justify-center">
                      <Icon className="h-10 w-10 text-foreground" strokeWidth={1.8} />
                    </div>
                  </div>

                  <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground/80">
                    {s.eyebrow}
                  </p>
                  <h1 className={`mt-2 text-4xl sm:text-5xl font-bold tracking-tight mobile-intro-title bg-gradient-to-r ${s.accent}`}>
                    {s.title}
                  </h1>
                  <p className="mt-5 text-base sm:text-lg text-muted-foreground leading-relaxed">
                    {s.body}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="px-7 pb-[max(1.5rem,var(--sab,env(safe-area-inset-bottom,0px)))] flex flex-col items-center gap-6 relative z-10">
        <div className="flex items-center gap-1.5">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => snapTo(i)}
              className="relative h-1.5 w-6 overflow-hidden rounded-full bg-muted-foreground/30"
              aria-label={`Go to slide ${i + 1}`}
              aria-current={i === index ? 'true' : undefined}
            >
              <span
                className="absolute inset-y-0 left-0 rounded-full bg-primary origin-left"
                style={{
                  width: '100%',
                  transform: i === index ? 'scaleX(1)' : 'scaleX(0.28)',
                  opacity: i === index ? 1 : 0.35,
                  transition: `transform ${SLIDE_MS}ms ${SLIDE_EASE}, opacity ${SLIDE_MS}ms ${SLIDE_EASE}`,
                }}
              />
            </button>
          ))}
        </div>

        <Button
          size="lg"
          onClick={() => (isLast ? finish() : go(1))}
          className="w-full max-w-sm h-14 rounded-2xl text-base font-semibold bg-gradient-to-r from-primary to-accent text-primary-foreground mobile-intro-cta active:scale-[0.98] transition-transform"
        >
          {isLast ? "Let's go" : 'Next'}
          <ArrowRight className="ml-1.5 h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
