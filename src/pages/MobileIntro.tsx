import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowRight, Sparkles, Camera, MessageCircle, Users, Palette, Shield, Trophy, Smartphone } from 'lucide-react';
import { isIOSAppShell } from '@/lib/despiaBridge';
import { isNativePerfMode } from '@/lib/nativePerfMode';
import { VYBE_INTRO_VERSION } from '@/lib/mobileIntroVersion';

export { VYBE_INTRO_VERSION };

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
    body: 'Show or scan a private QR code — you\'re friends in seconds. No usernames, no awkward "what\'s your handle?"',
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

/** Compositor-only slide — no React paint mid-tween. */
const SLIDE_MS = 320;
const SLIDE_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const N = SLIDES.length;

export default function MobileIntro({ onDone }: { onDone?: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  /** Chrome index — dots / CTA label. Updated only AFTER transform settles. */
  const [index, setIndex] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  /** Logical slide target while animating (may lead `index`). */
  const indexRef = useRef(0);
  const animatingRef = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const dragging = useRef(false);
  const lockHorizontal = useRef(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reducedMotion = useRef(false);

  const calmNative = isIOSAppShell() || isNativePerfMode();

  useEffect(() => {
    try {
      reducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch { /* ignore */ }
  }, []);

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
    const ms = reducedMotion.current ? 0 : SLIDE_MS;
    if (animate && ms > 0) {
      track.style.transition = `transform ${ms}ms ${SLIDE_EASE}`;
    } else {
      track.style.transition = 'none';
    }
    track.style.transform = `translate3d(${xPx}px, 0, 0)`;
  }, []);

  const settleChrome = useCallback((clamped: number) => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    const ms = reducedMotion.current ? 0 : SLIDE_MS;
    settleTimer.current = setTimeout(() => {
      animatingRef.current = false;
      indexRef.current = clamped;
      setIndex(clamped);
    }, ms + 16);
  }, []);

  const snapTo = useCallback((next: number, opts?: { fromDrag?: boolean }) => {
    const clamped = Math.max(0, Math.min(N - 1, next));
    const width = widthOf();
    const target = -clamped * width;
    const track = trackRef.current;

    // Mid-tween Next: freeze at live offset, then retarget (flush so CSS restart sticks)
    if (animatingRef.current && !opts?.fromDrag) {
      applyTrack(readTrackX(), false);
      if (track) void track.offsetWidth;
    }

    const currentX = readTrackX();
    if (clamped === indexRef.current && Math.abs(currentX - target) < 1 && !animatingRef.current) {
      applyTrack(target, false);
      return;
    }

    indexRef.current = clamped;
    animatingRef.current = true;
    applyTrack(target, true);
    // Defer React chrome (dots / CTA label) until transform ends — kills mid-slide paint
    settleChrome(clamped);
  }, [applyTrack, readTrackX, settleChrome, widthOf]);

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
    if (next >= N) {
      finish();
      return;
    }
    snapTo(next);
  }, [finish, snapTo]);

  useEffect(() => {
    const onResize = () => {
      applyTrack(-indexRef.current * widthOf(), false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [applyTrack, widthOf]);

  useEffect(() => {
    applyTrack(0, false);
  }, [applyTrack]);

  const onPointerDown = (e: React.PointerEvent) => {
    startX.current = e.clientX;
    startY.current = e.clientY;
    dragging.current = true;
    lockHorizontal.current = false;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    animatingRef.current = false;
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
    }
    const width = widthOf();
    const base = -indexRef.current * width;
    let offset = dx;
    if ((indexRef.current === 0 && dx > 0) || (indexRef.current === N - 1 && dx < 0)) {
      offset = dx * 0.35;
    }
    applyTrack(base + offset, false);
  };

  const endDrag = (clientX: number) => {
    if (!dragging.current && !lockHorizontal.current) return;
    const wasHorizontal = lockHorizontal.current;
    dragging.current = false;
    lockHorizontal.current = false;
    if (!wasHorizontal) return;
    const dx = clientX - startX.current;
    if (dx < -56) snapTo(indexRef.current + 1, { fromDrag: true });
    else if (dx > 56) snapTo(indexRef.current - 1, { fromDrag: true });
    else snapTo(indexRef.current, { fromDrag: true });
  };

  // CTA label follows settled chrome index; advance uses live indexRef
  const isLast = index === N - 1;

  return (
    <div
      data-allow-animation="true"
      className={`fixed inset-0 z-[9999] h-[100dvh] max-h-[100dvh] bg-background text-foreground overflow-hidden overscroll-none flex flex-col mobile-intro${calmNative ? ' mobile-intro--native' : ''}`}
    >
      {/* Static wash — never toggles opacity/class on slide */}
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
          style={{ width: `${N * 100}%` }}
        >
          {SLIDES.map((s, slideIndex) => {
            const Icon = s.icon;
            const isActiveSlide = slideIndex === index;
            return (
              <div
                key={s.title}
                className="mobile-intro-slide h-full shrink-0 flex flex-col items-center justify-center px-7"
                style={{ width: `${100 / N}%` }}
                aria-hidden={!isActiveSlide}
              >
                <div className="w-full max-w-sm flex flex-col items-center text-center">
                  <div
                    className={`relative mb-8 h-24 w-24 rounded-3xl bg-gradient-to-br ${s.accent} p-[1.5px] mobile-intro-icon-ring`}
                  >
                    <div className="mobile-intro-icon-face h-full w-full rounded-3xl flex items-center justify-center">
                      <Icon className="h-10 w-10 text-foreground" strokeWidth={1.8} aria-hidden />
                    </div>
                  </div>

                  <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground/80">
                    {s.eyebrow}
                  </p>
                  {isActiveSlide ? (
                    <h1 className="mt-2 text-4xl sm:text-5xl font-bold tracking-tight mobile-intro-title text-foreground">
                      {s.title}
                    </h1>
                  ) : (
                    <p className="mt-2 text-4xl sm:text-5xl font-bold tracking-tight mobile-intro-title text-foreground">
                      {s.title}
                    </p>
                  )}
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
              className={`mobile-intro-dot${i === index ? ' mobile-intro-dot--on' : ''}`}
              aria-label={`Go to slide ${i + 1}`}
              aria-current={i === index ? 'true' : undefined}
            />
          ))}
        </div>

        {/* Plain button — no liquid-glass / backdrop-filter remount thrash */}
        <button
          type="button"
          onClick={() => (indexRef.current >= N - 1 ? finish() : go(1))}
          className="mobile-intro-cta w-full max-w-sm h-14 rounded-2xl text-base font-semibold text-primary-foreground active:scale-[0.98] transition-transform"
        >
          {isLast ? "Let's go" : 'Next'}
          <ArrowRight className="ml-1.5 inline-block h-5 w-5 align-text-bottom" aria-hidden />
        </button>
      </div>
    </div>
  );
}
