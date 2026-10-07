import { memo, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useAnimation } from 'framer-motion';
import { Avatar, AvatarFallback, ProfileAvatarImage } from '@/components/ui/avatar';

interface WelcomeBackSplashProps {
  username?: string | null;
  avatarUrl?: string | null;
  profileId?: string | null;
  onComplete: () => void;
}

export const WELCOME_AVATAR_SIZE = 92;

type AvatarBox = { left: number; top: number; width: number; height: number };

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
    scale: Math.max(0.22, Math.min(slot.width, slot.height) / size),
    usedFallback: !avatar,
  };
}

export function readAccountAvatarRect(): AvatarBox | null {
  if (typeof document === 'undefined') return null;
  const nodes = document.querySelectorAll<HTMLElement>('[data-account-avatar]');
  for (const node of nodes) {
    const style = window.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
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

/**
 * Post-sign-in profile picture: pop in the center, swirl once, then land on the
 * account avatar. Portaled outside the router, so it never calls useLocation.
 * It stays unmounted while the login sheet is up and does not block sign-in.
 */
export const WelcomeBackSplash = memo(function WelcomeBackSplash({
  username,
  avatarUrl,
  profileId,
  onComplete,
}: WelcomeBackSplashProps) {
  const controls = useAnimation();
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const [holdingForAuth, setHoldingForAuth] = useState(
    () => typeof document !== 'undefined' && !!document.querySelector('[data-auth-shell]'),
  );
  const [motionKind, setMotionKind] = useState<'pending' | 'swirl' | 'direct'>('pending');
  const [phase, setPhase] = useState<'idle' | 'pop' | 'swirl' | 'fly' | 'done'>('idle');
  const [fly, setFly] = useState<{ x: number; y: number; fallback: boolean } | null>(null);
  const [origin] = useState(() =>
    typeof window === 'undefined'
      ? { x: 0, y: 0 }
      : welcomeCenter({ width: window.innerWidth, height: window.innerHeight }),
  );
  const initial = username?.trim()?.[0]?.toUpperCase() || 'V';

  useEffect(() => {
    const tick = () => setHoldingForAuth(!!document.querySelector('[data-auth-shell]'));
    tick();
    const id = window.setInterval(tick, 120);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (holdingForAuth) return;
    let cancelled = false;
    const reduced = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setMotionKind(reduced ? 'direct' : 'swirl');
    const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });

    const run = async () => {
      try {
        const center = welcomeCenter(viewport());
        const publish = (avatar: Awaited<ReturnType<typeof waitForAccountAvatar>>) => {
          const dest = welcomeFlyTarget(viewport(), avatar);
          if (!cancelled) setFly({ x: dest.x, y: dest.y, fallback: dest.usedFallback });
          return dest;
        };
        const avatarPromise = waitForAccountAvatar(reduced ? 500 : 1100).then(publish);
        setPhase('pop');
        await controls.set({ x: center.x, y: center.y, scale: 0.45, opacity: 0 });
        if (cancelled) return;
        await controls.start({
          x: center.x,
          y: center.y,
          scale: 1,
          opacity: 1,
          transition: { type: 'spring', stiffness: 420, damping: 26, mass: 0.72 },
        });
        if (cancelled) return;

        if (!reduced) {
          setPhase('swirl');
          const frames = welcomeSwirlFrames(center, viewport());
          await controls.start({
            x: frames.x,
            y: frames.y,
            scale: frames.scale,
            transition: { duration: 0.92, ease: [0.42, 0.02, 0.18, 1], times: frames.times },
          });
          if (cancelled) return;
        }

        setPhase('fly');
        let dest = await avatarPromise;
        if (dest.usedFallback) {
          const late = readAccountAvatarRect() ?? await waitForAccountAvatar(420);
          if (late) dest = publish(late);
        }
        if (cancelled) return;
        await controls.start({
          x: dest.x,
          y: dest.y,
          scale: dest.scale,
          opacity: 1,
          transition: reduced
            ? { duration: 0.38, ease: [0.22, 1, 0.36, 1] }
            : { type: 'spring', stiffness: 210, damping: 26, mass: 0.82 },
        });
        if (cancelled) return;

        let landed = dest;
        if (dest.usedFallback) {
          const late = readAccountAvatarRect();
          if (late) {
            const fix = welcomeFlyTarget(viewport(), late);
            landed = fix;
            setFly({ x: fix.x, y: fix.y, fallback: false });
            await controls.start({
              x: fix.x,
              y: fix.y,
              scale: fix.scale,
              opacity: 1,
              transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
            });
            if (cancelled) return;
          }
        }

        await controls.start({
          x: landed.x,
          y: landed.y,
          scale: landed.scale,
          opacity: 0,
          transition: { duration: reduced ? 0.12 : 0.18 },
        });
        if (cancelled) return;
        setPhase('done');
        onCompleteRef.current();
      } catch {
        if (!cancelled) onCompleteRef.current();
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [holdingForAuth, controls]);

  if (typeof document === 'undefined' || holdingForAuth) return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      data-welcome-motion={motionKind}
      data-welcome-phase={phase}
      data-fly-x={fly ? String(Math.round(fly.x)) : undefined}
      data-fly-y={fly ? String(Math.round(fly.y)) : undefined}
      data-fly-fallback={fly ? String(fly.fallback) : undefined}
      className="pointer-events-none"
      style={{ pointerEvents: 'none' }}
    >
      <span className="sr-only">Welcome back</span>
      <motion.div
        data-welcome-avatar=""
        aria-hidden
        initial={{ x: origin.x, y: origin.y, scale: 0.45, opacity: 0 }}
        animate={controls}
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          width: WELCOME_AVATAR_SIZE,
          height: WELCOME_AVATAR_SIZE,
          zIndex: 10000,
          pointerEvents: 'none',
          transformOrigin: 'center center',
        }}
      >
        <Avatar className="h-full w-full shadow-[0_16px_40px_rgba(0,0,0,0.45)] ring-2 ring-white/80">
          <ProfileAvatarImage
            profileId={profileId}
            src={avatarUrl || undefined}
            priority
            transformSize={192}
            alt=""
          />
          <AvatarFallback className="bg-gradient-to-br from-primary/30 to-accent/30 text-2xl font-bold text-foreground">
            {initial}
          </AvatarFallback>
        </Avatar>
      </motion.div>
    </div>,
    document.body,
  );
});
