import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useAnimation } from 'framer-motion';
import { toast, useSonner } from 'sonner';
import type { ToastT, ToastToDismiss } from 'sonner';
import { Avatar, ProfileAvatarImage } from '@/components/ui/avatar';

interface WelcomeBackSplashProps {
  username?: string | null;
  avatarUrl?: string | null;
  profileId?: string | null;
  onComplete: () => void;
}

export const WELCOME_AVATAR_SIZE = 168;
export const WELCOME_ACCOUNT_PENDING = 'welcome-account-pending';
export const WELCOME_BACK_SPLASH = 'welcome-back-splash';

/** Punchy pop, then the photo is already moving. A few hundred milliseconds. */
export const WELCOME_POP_MS = 420;
/** One continuous swirl-and-fly after the pop. Kept inside 900–1400ms. */
export const WELCOME_FLIGHT_MS = 1080;
/** Confetti on the account picture. Brief, then the overlay is gone. */
export const WELCOME_BURST_MS = 420;
/** Reduced motion shows the greeting, then reveals the account picture. No click. */
export const WELCOME_REDUCED_MS = 420;

type AvatarBox = { left: number; top: number; width: number; height: number };
type WelcomePhase = 'pop' | 'flight' | 'done';

const CONFETTI_COLORS = ['#10182a', '#7dd3fc', '#d6e6f5', 'hsl(var(--accent))', '#8eb4d4'];

export type WelcomeNoticeSource = {
  title?: unknown;
  description?: unknown;
  type?: string;
  delete?: boolean;
};

/** Where the signed-in picture sits when the chrome avatar is not mounted yet. */
export function knownAccountAvatarSlot(width: number, height: number): AvatarBox {
  const desktop = width >= 1024;
  if (desktop) {
    return { left: 28, top: 84, width: 40, height: 40 };
  }
  const gutter = 12;
  const cap = width < 640 ? 420 : width < 768 ? 480 : 560;
  const navWidth = Math.min(cap, Math.max(0, width - gutter * 2));
  const navLeft = (width - navWidth) / 2;
  const tab = navWidth / 5;
  const size = 28;
  return {
    left: navLeft + tab * 4 + (tab - size) / 2,
    top: height - 10 - 64 + (64 - size) / 2,
    width: size,
    height: size,
  };
}

export function welcomeCenter(viewport: { width: number; height: number }, size = WELCOME_AVATAR_SIZE) {
  return {
    x: viewport.width / 2 - size / 2,
    y: Math.round(viewport.height * 0.42) - size / 2,
  };
}

/**
 * One smooth move from the center to the account picture.
 * A tight one-turn swirl rides along the flight and dies out at both ends,
 * so the photo leaves center already traveling and arrives without a second tween.
 */
export function welcomeFlightFrames(
  center: { x: number; y: number },
  dest: { x: number; y: number; scale: number },
  viewport: { width: number; height: number },
  size = WELCOME_AVATAR_SIZE,
) {
  const steps = 48;
  const sx = center.x + size / 2;
  const sy = center.y + size / 2;
  const ex = dest.x + size / 2;
  const ey = dest.y + size / 2;
  const dx = ex - sx;
  const dy = ey - sy;
  const travel = Math.hypot(dx, dy) || 1;
  const px = -dy / travel;
  const py = dx / travel;
  const radius = Math.max(44, Math.min(68, Math.min(viewport.width, viewport.height) * 0.12));
  const x: number[] = [];
  const y: number[] = [];
  const scale: number[] = [];
  const rotate: number[] = [];
  const times: number[] = [];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (i === 0) {
      x.push(center.x);
      y.push(center.y);
      scale.push(1);
      rotate.push(0);
      times.push(0);
      continue;
    }
    if (i === steps) {
      x.push(dest.x);
      y.push(dest.y);
      scale.push(dest.scale);
      rotate.push(0);
      times.push(1);
      continue;
    }
    // Ease-out travel: quick to leave, soft landing. Swirl envelope is zero at both ends.
    const along = 1 - (1 - t) ** 1.55;
    const envelope = Math.sin(Math.PI * t) ** 2;
    const angle = -Math.PI / 2 + t * Math.PI * 2;
    const ox = Math.cos(angle) * radius * envelope + px * radius * 0.32 * envelope;
    const oy = Math.sin(angle) * radius * 0.82 * envelope + py * radius * 0.32 * envelope;
    x.push(sx + dx * along + ox - size / 2);
    y.push(sy + dy * along + oy - size / 2);
    scale.push(1 + (dest.scale - 1) * along);
    rotate.push(Math.sin(angle) * 11 * envelope);
    times.push(Number(t.toFixed(4)));
  }

  return { x, y, scale, rotate, times };
}

export function welcomeFlyTarget(
  viewport: { width: number; height: number },
  avatar: AvatarBox | null,
  size = WELCOME_AVATAR_SIZE,
) {
  const slot = avatar ?? knownAccountAvatarSlot(viewport.width, viewport.height);
  return {
    x: slot.left + slot.width / 2 - size / 2,
    y: slot.top + slot.height / 2 - size / 2,
    scale: Math.max(0.15, Math.min(slot.width, slot.height) / size),
    usedFallback: !avatar,
  };
}

export function readAccountAvatarRect(): AvatarBox | null {
  if (typeof document === 'undefined') return null;
  const held = document.body.classList.contains(WELCOME_ACCOUNT_PENDING);
  const nodes = document.querySelectorAll<HTMLElement>('[data-account-avatar]');
  for (const node of nodes) {
    const style = window.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    // The hold hides the picture with opacity. It is still the landing target.
    if (!held && Number(style.opacity) === 0) continue;
    const rect = node.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) continue;
    if (rect.bottom <= 0 || rect.right <= 0) continue;
    if (rect.top >= window.innerHeight || rect.left >= window.innerWidth) continue;
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }
  return null;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function nextFrame() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

export function welcomeNoticeText(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (Array.isArray(value)) return value.map(welcomeNoticeText).filter(Boolean).join(' ').trim();
  return '';
}

const RETURN_NOTICE = /welcome|daily brief|you(?:'|’)re back|signed back|good to see you/i;
const ONLY_WELCOME = /^welcome back[\s!.✨]*$/i;

/** Copy already raised for this return (toasts), minus the heading itself. */
export function welcomeReturnNotices(sources: WelcomeNoticeSource[]): string[] {
  const lines: string[] = [];
  for (const source of sources) {
    if (!source || source.delete) continue;
    if (source.type === 'error' || source.type === 'loading') continue;
    const title = welcomeNoticeText(source.title);
    const description = welcomeNoticeText(source.description);
    const blob = `${title} ${description}`.trim();
    if (!blob || !RETURN_NOTICE.test(blob)) continue;
    const line = ONLY_WELCOME.test(title) ? description : [title, description].filter(Boolean).join(' — ');
    if (!line || ONLY_WELCOME.test(line) || lines.includes(line)) continue;
    lines.push(line);
  }
  return lines.slice(0, 3);
}

function toastSources(items: Array<ToastT | ToastToDismiss>): WelcomeNoticeSource[] {
  return items.filter((item): item is ToastT => 'title' in item || 'description' in item);
}

function prefersReducedMotion() {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function AvatarConfetti({ x, y }: { x: number; y: number }) {
  const pieces = Array.from({ length: 14 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 14 + (index % 2 === 0 ? 0.1 : -0.06);
    const dist = 18 + (index % 5) * 7;
    const wide = index % 3 === 0;
    return {
      id: index,
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist - 8,
      color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
      delay: (index % 4) * 0.012,
      rotate: (index % 2 === 0 ? 1 : -1) * (80 + index * 12),
      width: wide ? 7 : 5,
      height: wide ? 4 : 7,
      round: index % 4 === 0,
    };
  });
  const burst = WELCOME_BURST_MS / 1000;

  return (
    <div
      data-welcome-confetti=""
      aria-hidden
      className="pointer-events-none"
      style={{ position: 'fixed', left: x, top: y, width: 0, height: 0, zIndex: 10060 }}
    >
      {[0, 1].map((ring) => (
        <motion.span
          key={`ring-${ring}`}
          initial={{ scale: 0.35, opacity: 0.95 }}
          animate={{ scale: 2.15 + ring * 0.45, opacity: 0 }}
          transition={{ duration: burst * 0.85, delay: ring * 0.05, ease: [0.16, 0.84, 0.28, 1] }}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: 26,
            height: 26,
            marginLeft: -13,
            marginTop: -13,
            borderRadius: 999,
            border: ring === 0 ? '2px solid #7dd3fc' : '2px solid rgba(255,255,255,0.85)',
          }}
        />
      ))}
      {pieces.map((piece) => (
        <motion.span
          key={piece.id}
          initial={{ x: 0, y: 0, opacity: 1, scale: 0.45, rotate: 0 }}
          animate={{ x: piece.dx, y: piece.dy, opacity: 0, scale: 1, rotate: piece.rotate }}
          transition={{ duration: burst * 0.9, delay: piece.delay, ease: [0.16, 0.84, 0.32, 1] }}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: piece.width,
            height: piece.height,
            marginLeft: -piece.width / 2,
            marginTop: -piece.height / 2,
            borderRadius: piece.round ? 999 : 1.5,
            background: piece.color,
          }}
        />
      ))}
    </div>
  );
}

/**
 * Post-sign-in profile picture. It pops in the center on its own once the login
 * sheet is gone, then swirls to the account avatar. Portaled outside the router,
 * so it never calls useLocation. It stays unmounted while the login sheet is up.
 * Position is x/y on a fixed origin — framer's transform would wipe a Tailwind
 * -translate class.
 */
export const WelcomeBackSplash = memo(function WelcomeBackSplash({
  avatarUrl,
  profileId,
  onComplete,
}: WelcomeBackSplashProps) {
  const controls = useAnimation();
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const reducedRef = useRef(prefersReducedMotion());
  const aliveRef = useRef(true);
  const [holdingForAuth, setHoldingForAuth] = useState(
    () => typeof document !== 'undefined' && !!document.querySelector('[data-auth-shell]'),
  );
  const [dismissed, setDismissed] = useState(false);
  const [motionKind, setMotionKind] = useState<'swirl' | 'direct'>(() => (
    prefersReducedMotion() ? 'direct' : 'swirl'
  ));
  const [phase, setPhase] = useState<WelcomePhase>('pop');
  const [fly, setFly] = useState<{ x: number; y: number; fallback: boolean } | null>(null);
  const [confetti, setConfetti] = useState<{ x: number; y: number } | null>(null);
  const [origin] = useState(() =>
    typeof window === 'undefined'
      ? { x: 0, y: 0 }
      : welcomeCenter({ width: window.innerWidth, height: window.innerHeight }),
  );
  const { toasts } = useSonner();
  const notices = welcomeReturnNotices([
    ...toastSources(toast.getToasts()),
    ...toasts,
  ]);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    const tick = () => setHoldingForAuth(!!document.querySelector('[data-auth-shell]'));
    tick();
    const id = window.setInterval(tick, 80);
    return () => window.clearInterval(id);
  }, []);

  useLayoutEffect(() => {
    if (holdingForAuth || dismissed) return;
    document.body.classList.add(WELCOME_ACCOUNT_PENDING, WELCOME_BACK_SPLASH);
    return () => {
      document.body.classList.remove(WELCOME_ACCOUNT_PENDING, WELCOME_BACK_SPLASH);
    };
  }, [holdingForAuth, dismissed]);

  const finish = useCallback(() => {
    if (!aliveRef.current) return;
    document.body.classList.remove(WELCOME_ACCOUNT_PENDING);
    setDismissed(true);
    onCompleteRef.current();
  }, []);

  useEffect(() => {
    if (holdingForAuth || dismissed) return;
    let cancelled = false;
    const reduced = prefersReducedMotion();
    reducedRef.current = reduced;
    setMotionKind(reduced ? 'direct' : 'swirl');
    const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });

    const run = async () => {
      const center = welcomeCenter(viewport());
      try {
        if (reduced) {
          await controls.set({ x: center.x, y: center.y, scale: 1, opacity: 1, rotate: 0 });
          if (cancelled || !aliveRef.current) return;
          await sleep(WELCOME_REDUCED_MS);
          if (cancelled || !aliveRef.current) return;
          finish();
          return;
        }

        await controls.set({ x: center.x, y: center.y, scale: 0.62, opacity: 0, rotate: 0 });
        if (cancelled || !aliveRef.current) return;
        await controls.start({
          x: center.x,
          y: center.y,
          scale: [0.62, 1.08, 1],
          opacity: [0, 1, 1],
          rotate: 0,
          transition: {
            duration: WELCOME_POP_MS / 1000,
            ease: [0.16, 0.84, 0.28, 1],
            times: [0, 0.58, 1],
          },
        });
        if (cancelled || !aliveRef.current) return;

        let avatar = readAccountAvatarRect();
        if (!avatar) {
          await nextFrame();
          if (cancelled || !aliveRef.current) return;
          avatar = readAccountAvatarRect();
        }
        const dest = welcomeFlyTarget(viewport(), avatar);
        if (cancelled || !aliveRef.current) return;
        setPhase('flight');
        setFly({ x: dest.x, y: dest.y, fallback: dest.usedFallback });
        const frames = welcomeFlightFrames(center, dest, viewport());
        await controls.start({
          x: frames.x,
          y: frames.y,
          scale: frames.scale,
          rotate: frames.rotate,
          opacity: 1,
          transition: {
            duration: WELCOME_FLIGHT_MS / 1000,
            ease: 'linear',
            times: frames.times,
          },
        });
        if (cancelled || !aliveRef.current) return;

        const landed = readAccountAvatarRect() ?? avatar;
        const point = landed
          ? { x: landed.left + landed.width / 2, y: landed.top + landed.height / 2 }
          : { x: dest.x + WELCOME_AVATAR_SIZE / 2, y: dest.y + WELCOME_AVATAR_SIZE / 2 };
        document.querySelector('[data-welcome-avatar]')?.setAttribute('data-welcome-landed', '');
        document.body.classList.remove(WELCOME_ACCOUNT_PENDING);
        setConfetti(point);
        setPhase('done');
        await sleep(WELCOME_BURST_MS);
        if (cancelled || !aliveRef.current) return;
        finish();
      } catch {
        if (!cancelled && aliveRef.current) finish();
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [holdingForAuth, dismissed, controls, finish]);

  if (typeof document === 'undefined' || holdingForAuth || dismissed) return null;

  const greeting = phase === 'pop';

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      aria-labelledby={greeting ? 'welcome-back-title' : undefined}
      data-welcome-root=""
      data-welcome-motion={motionKind}
      data-welcome-phase={phase}
      data-welcome-auto=""
      data-welcome-pop-ms={String(WELCOME_POP_MS)}
      data-welcome-flight-ms={String(WELCOME_FLIGHT_MS)}
      data-fly-x={fly ? String(Math.round(fly.x)) : undefined}
      data-fly-y={fly ? String(Math.round(fly.y)) : undefined}
      data-fly-fallback={fly ? String(fly.fallback) : undefined}
      className="pointer-events-none"
    >
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          zIndex: 10000,
          opacity: greeting ? 1 : 0,
          transition: 'opacity 160ms linear',
          background:
            'radial-gradient(ellipse at 50% 42%, rgba(7,11,20,0.78) 0%, rgba(7,11,20,0.34) 38%, rgba(7,11,20,0) 70%)',
        }}
      />
      {greeting && (
        <div
          className="pointer-events-none fixed inset-x-0 z-[10002] mx-auto flex w-[min(92vw,380px)] flex-col items-center gap-2 px-6 text-center"
          style={{ top: origin.y + WELCOME_AVATAR_SIZE + 18 }}
        >
          <h1 id="welcome-back-title" className="text-[1.65rem] font-bold tracking-tight text-white">
            Welcome back
          </h1>
          {notices.length > 0 && (
            <ul data-welcome-notices="" className="space-y-1 text-sm leading-snug text-white/80">
              {notices.map((line) => (
                <li key={line} className="line-clamp-3">{line}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <motion.div
        data-welcome-avatar=""
        aria-hidden
        initial={{
          x: origin.x,
          y: origin.y,
          scale: reducedRef.current ? 1 : 0.62,
          opacity: reducedRef.current ? 1 : 0,
          rotate: 0,
        }}
        animate={controls}
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          width: WELCOME_AVATAR_SIZE,
          height: WELCOME_AVATAR_SIZE,
          zIndex: 10050,
          pointerEvents: 'none',
          transformOrigin: 'center center',
          willChange: 'transform, opacity',
        }}
      >
        <Avatar className="h-full w-full bg-[#10182a] shadow-[0_18px_48px_rgba(2,6,16,0.55)] ring-2 ring-white/85">
          <ProfileAvatarImage
            profileId={profileId}
            src={avatarUrl || undefined}
            priority
            transformSize={336}
            alt=""
          />
        </Avatar>
      </motion.div>
      {confetti && <AvatarConfetti x={confetti.x} y={confetti.y} />}
    </div>,
    document.body,
  );
});
