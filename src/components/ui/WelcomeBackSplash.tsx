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

type AvatarBox = { left: number; top: number; width: number; height: number };
type WelcomePhase = 'hold' | 'swirl' | 'fly' | 'done';

const CONFETTI_COLORS = ['#10182a', '#7dd3fc', '#d6e6f5', 'hsl(var(--accent))', '#8eb4d4'];
const CONFETTI_MS = 680;

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

/** One smooth orbit that leaves center and returns, so the fly has a single handoff. */
export function welcomeSwirlFrames(
  center: { x: number; y: number },
  viewport: { width: number; height: number },
  size = WELCOME_AVATAR_SIZE,
) {
  const cx = center.x + size / 2;
  const cy = center.y + size / 2;
  const radius = Math.max(84, Math.min(viewport.width, viewport.height) * 0.28);
  const steps = 14;
  const x: number[] = [];
  const y: number[] = [];
  const scale: number[] = [];
  const times: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = -Math.PI / 2 + t * Math.PI * 2;
    const reach = radius * Math.sin(t * Math.PI);
    x.push(cx + Math.cos(angle) * reach - size / 2);
    y.push(cy + Math.sin(angle) * reach * 0.78 - size / 2);
    scale.push(1 - 0.08 * Math.sin(t * Math.PI));
    times.push(Number(t.toFixed(4)));
  }
  return { x, y, scale, times };
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

export async function waitForAccountAvatar(timeoutMs: number): Promise<AvatarBox | null> {
  const start = performance.now();
  let found = readAccountAvatarRect();
  while (!found && performance.now() - start < timeoutMs) {
    await sleep(80);
    found = readAccountAvatarRect();
  }
  return found;
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
  const pieces = Array.from({ length: 12 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 12 + (index % 2 === 0 ? 0.12 : -0.08);
    const dist = 16 + (index % 5) * 8;
    const wide = index % 3 === 0;
    return {
      id: index,
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist - 6,
      color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
      delay: (index % 4) * 0.018,
      rotate: (index % 2 === 0 ? 1 : -1) * (70 + index * 14),
      width: wide ? 8 : 5,
      height: wide ? 4 : 8,
      round: index % 4 === 0,
    };
  });

  return (
    <div
      data-welcome-confetti=""
      aria-hidden
      className="pointer-events-none"
      style={{ position: 'fixed', left: x, top: y, width: 0, height: 0, zIndex: 10060 }}
    >
      {pieces.map((piece) => (
        <motion.span
          key={piece.id}
          initial={{ x: 0, y: 0, opacity: 1, scale: 0.55, rotate: 0 }}
          animate={{ x: piece.dx, y: piece.dy, opacity: 0, scale: 1, rotate: piece.rotate }}
          transition={{ duration: 0.62, delay: piece.delay, ease: [0.16, 0.84, 0.32, 1] }}
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
            boxShadow: '0 0 0 1px rgba(255,255,255,0.28)',
          }}
        />
      ))}
    </div>
  );
}

/**
 * Post-sign-in profile picture. It holds in the center until Close, then swirls
 * and lands on the account avatar. Portaled outside the router, so it never
 * calls useLocation. It stays unmounted while the login sheet is up.
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
  const flyingRef = useRef(false);
  const aliveRef = useRef(true);
  const [holdingForAuth, setHoldingForAuth] = useState(
    () => typeof document !== 'undefined' && !!document.querySelector('[data-auth-shell]'),
  );
  const [dismissed, setDismissed] = useState(false);
  const [motionKind, setMotionKind] = useState<'pending' | 'swirl' | 'direct'>('pending');
  const [phase, setPhase] = useState<WelcomePhase>('hold');
  const [fly, setFly] = useState<{ x: number; y: number; fallback: boolean } | null>(null);
  const [confetti, setConfetti] = useState<{ x: number; y: number } | null>(null);
  const [origin] = useState(() =>
    typeof window === 'undefined'
      ? { x: 0, y: 0 }
      : welcomeCenter({ width: window.innerWidth, height: window.innerHeight }),
  );
  const closeRef = useRef<HTMLButtonElement>(null);
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
    const id = window.setInterval(tick, 120);
    return () => window.clearInterval(id);
  }, []);

  useLayoutEffect(() => {
    if (holdingForAuth || dismissed) return;
    document.body.classList.add(WELCOME_ACCOUNT_PENDING, WELCOME_BACK_SPLASH);
    return () => {
      document.body.classList.remove(WELCOME_ACCOUNT_PENDING, WELCOME_BACK_SPLASH);
    };
  }, [holdingForAuth, dismissed]);

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
        if (cancelled || flyingRef.current) return;
        if (reduced) {
          await controls.set({ x: center.x, y: center.y, scale: 1, opacity: 1 });
        } else {
          await controls.set({ x: center.x, y: center.y, scale: 0.72, opacity: 0 });
          if (cancelled || flyingRef.current) return;
          await controls.start({
            x: center.x,
            y: center.y,
            scale: 1,
            opacity: 1,
            transition: { type: 'spring', stiffness: 380, damping: 28, mass: 0.7 },
          });
        }
      } catch {
        if (!cancelled && !flyingRef.current && aliveRef.current) {
          try {
            await controls.set({ x: center.x, y: center.y, scale: 1, opacity: 1 });
          } catch { /* Close still dismisses if the pop cannot start. */ }
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [holdingForAuth, dismissed, controls]);

  const finish = useCallback(() => {
    if (!aliveRef.current) return;
    document.body.classList.remove(WELCOME_ACCOUNT_PENDING);
    setDismissed(true);
    onCompleteRef.current();
  }, []);

  const flyHome = useCallback(async () => {
    const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });
    const center = welcomeCenter(viewport());
    try {
      controls.stop();
      const frames = welcomeSwirlFrames(center, viewport());
      await controls.start({
        x: frames.x,
        y: frames.y,
        scale: frames.scale,
        opacity: 1,
        transition: { duration: 0.92, ease: [0.42, 0.02, 0.18, 1], times: frames.times },
      });
      if (!aliveRef.current) return;
      setPhase('fly');
      let avatar = readAccountAvatarRect() ?? await waitForAccountAvatar(700);
      let dest = welcomeFlyTarget(viewport(), avatar);
      if (dest.usedFallback) {
        const late = readAccountAvatarRect() ?? await waitForAccountAvatar(420);
        if (late) {
          avatar = late;
          dest = welcomeFlyTarget(viewport(), late);
        }
      }
      if (!aliveRef.current) return;
      setFly({ x: dest.x, y: dest.y, fallback: dest.usedFallback });
      await controls.start({
        x: dest.x,
        y: dest.y,
        scale: dest.scale,
        opacity: 1,
        transition: { type: 'spring', stiffness: 220, damping: 26, mass: 0.8 },
      });
      if (!aliveRef.current) return;
      const landed = readAccountAvatarRect() ?? avatar;
      const point = landed
        ? { x: landed.left + landed.width / 2, y: landed.top + landed.height / 2 }
        : { x: dest.x + WELCOME_AVATAR_SIZE / 2, y: dest.y + WELCOME_AVATAR_SIZE / 2 };
      document.querySelector('[data-welcome-avatar]')?.setAttribute('data-welcome-landed', '');
      document.body.classList.remove(WELCOME_ACCOUNT_PENDING);
      setConfetti(point);
      setPhase('done');
      await sleep(CONFETTI_MS);
      finish();
    } catch {
      finish();
    }
  }, [controls, finish]);

  const beginFlight = useCallback(() => {
    if (flyingRef.current || dismissed) return;
    flyingRef.current = true;
    if (reducedRef.current || prefersReducedMotion()) {
      reducedRef.current = true;
      finish();
      return;
    }
    setPhase('swirl');
    void flyHome();
  }, [dismissed, finish, flyHome]);

  useEffect(() => {
    if (holdingForAuth || dismissed || phase !== 'hold') return;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        beginFlight();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [holdingForAuth, dismissed, phase, beginFlight]);

  if (typeof document === 'undefined' || holdingForAuth || dismissed) return null;

  const holding = phase === 'hold';

  return createPortal(
    <div
      role={holding ? 'dialog' : 'status'}
      aria-modal={holding ? true : undefined}
      aria-live="polite"
      aria-labelledby={holding ? 'welcome-back-title' : undefined}
      data-welcome-root=""
      data-welcome-motion={motionKind}
      data-welcome-phase={phase}
      data-fly-x={fly ? String(Math.round(fly.x)) : undefined}
      data-fly-y={fly ? String(Math.round(fly.y)) : undefined}
      data-fly-fallback={fly ? String(fly.fallback) : undefined}
      className="pointer-events-none"
    >
      {holding && (
        <div
          aria-hidden
          className="pointer-events-auto fixed inset-0 bg-[#070b14]/80"
          style={{ zIndex: 10000 }}
        />
      )}
      {holding && (
        <div
          className="pointer-events-none fixed inset-x-0 z-[10002] mx-auto flex w-[min(92vw,380px)] flex-col items-center gap-2 px-6 text-center"
          style={{ top: origin.y + WELCOME_AVATAR_SIZE + 22 }}
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
        initial={{ x: origin.x, y: origin.y, scale: reducedRef.current ? 1 : 0.72, opacity: reducedRef.current ? 1 : 0 }}
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
      {holding && (
        <button
          ref={closeRef}
          type="button"
          onClick={beginFlight}
          className="pointer-events-auto fixed inset-x-0 z-[10003] mx-auto h-11 w-fit min-w-[8.5rem] rounded-full bg-[#10182a] px-8 text-sm font-semibold text-white shadow-[0_10px_28px_rgba(2,6,16,0.45)] ring-1 ring-white/20"
          style={{ bottom: 'max(1.25rem, calc(env(safe-area-inset-bottom, 0px) + 1.25rem))' }}
        >
          Close
        </button>
      )}
      {confetti && <AvatarConfetti x={confetti.x} y={confetti.y} />}
    </div>,
    document.body,
  );
});
