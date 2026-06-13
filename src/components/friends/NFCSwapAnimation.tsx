import { motion, AnimatePresence } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { haptics } from '@/lib/haptics';
import { useEffect, useState, useRef } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

type SwapPhase =
  | 'idle'
  | 'appear'
  | 'charge'
  | 'collide'
  | 'swap'
  | 'linked'
  | 'complete';

/** Shared timeline (ms from syncStartAt) — both phones use identical keys. */
const PHASE_AT: Record<Exclude<SwapPhase, 'idle'>, number> = {
  appear: 0,
  charge: 380,
  collide: 780,
  swap: 1180,
  linked: 1680,
  complete: 2400,
};

const TOTAL_MS = 2800;

interface NFCSwapAnimationProps {
  isActive: boolean;
  syncStartAt?: number;
  /** Only the scanner sends the friend request at the linked phase. */
  performAutoAdd?: boolean;
  myProfile: {
    username: string;
    avatar_url: string | null;
  } | null;
  theirProfile: {
    username: string;
    avatar_url: string | null;
  } | null;
  onComplete?: () => void;
  onAutoAdd?: () => void;
}

export function NFCSwapAnimation({
  isActive,
  syncStartAt,
  performAutoAdd = true,
  myProfile,
  theirProfile,
  onComplete,
  onAutoAdd,
}: NFCSwapAnimationProps) {
  const [phase, setPhase] = useState<SwapPhase>('idle');
  const firedAutoAdd = useRef(false);
  const firedComplete = useRef(false);
  const callbacksRef = useRef({ onAutoAdd, onComplete });
  callbacksRef.current = { onAutoAdd, onComplete };

  useEffect(() => {
    if (!isActive || !myProfile || !theirProfile) {
      setPhase('idle');
      firedAutoAdd.current = false;
      firedComplete.current = false;
      return;
    }

    firedAutoAdd.current = false;
    firedComplete.current = false;

    const anchor = syncStartAt ?? Date.now();
    let raf = 0;

    const tick = () => {
      const elapsed = Date.now() - anchor;
      let next: SwapPhase = 'appear';
      if (elapsed >= PHASE_AT.complete) next = 'complete';
      else if (elapsed >= PHASE_AT.linked) next = 'linked';
      else if (elapsed >= PHASE_AT.swap) next = 'swap';
      else if (elapsed >= PHASE_AT.collide) next = 'collide';
      else if (elapsed >= PHASE_AT.charge) next = 'charge';

      setPhase((prev) => {
        if (prev !== next) {
          if (next === 'charge') haptics.impact();
          if (next === 'collide') haptics.success();
          if (next === 'swap') haptics.impact();
          if (next === 'linked') haptics.success();
          if (next === 'complete') haptics.success();
        }
        return next;
      });

      if (elapsed >= PHASE_AT.linked && performAutoAdd && !firedAutoAdd.current) {
        firedAutoAdd.current = true;
        callbacksRef.current.onAutoAdd?.();
      }

      if (elapsed >= TOTAL_MS && !firedComplete.current) {
        firedComplete.current = true;
        callbacksRef.current.onComplete?.();
        return;
      }

      if (elapsed < TOTAL_MS + 200) {
        raf = requestAnimationFrame(tick);
      }
    };

    const delay = Math.max(0, anchor - Date.now());
    const startTimer = window.setTimeout(() => {
      raf = requestAnimationFrame(tick);
    }, delay);

    return () => {
      clearTimeout(startTimer);
      cancelAnimationFrame(raf);
    };
  }, [isActive, myProfile, theirProfile, syncStartAt, performAutoAdd]);

  if (!isActive || !myProfile || !theirProfile) return null;

  const showBurst = phase === 'collide' || phase === 'swap' || phase === 'linked';
  const showCheck = phase === 'linked' || phase === 'complete';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden bg-black"
      >
        {/* Aurora backdrop */}
        <motion.div
          className="pointer-events-none absolute inset-0"
          animate={{
            opacity: phase === 'charge' ? 0.95 : phase === 'collide' ? 1 : 0.7,
          }}
          style={{
            background:
              'radial-gradient(120% 80% at 50% 20%, hsl(var(--primary) / 0.35), transparent 55%), radial-gradient(90% 60% at 20% 80%, hsl(var(--accent) / 0.25), transparent 50%), radial-gradient(90% 60% at 80% 70%, hsl(var(--primary) / 0.2), transparent 45%)',
          }}
        />

        {/* Shockwave rings */}
        {showBurst && (
          <>
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="pointer-events-none absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary/40"
                initial={{ scale: 0.3, opacity: 0.8 }}
                animate={{ scale: [0.3, 2.8 + i * 0.4], opacity: [0.7, 0] }}
                transition={{ duration: 0.9, delay: i * 0.12, ease: 'easeOut' }}
              />
            ))}
          </>
        )}

        {/* Floating particles */}
        <div className="pointer-events-none absolute inset-0">
          {[...Array(24)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute h-1 w-1 rounded-full bg-primary/80"
              style={{
                left: `${10 + (i * 17) % 80}%`,
                top: `${15 + (i * 23) % 70}%`,
              }}
              animate={{
                opacity: phase === 'idle' ? 0 : [0, 1, 0],
                scale: [0, 1.5, 0],
                y: [0, -40 - (i % 5) * 12, 0],
              }}
              transition={{
                duration: 1.8,
                delay: (i % 8) * 0.08,
                repeat: phase === 'complete' ? 0 : Infinity,
                ease: 'easeInOut',
              }}
            />
          ))}
        </div>

        {/* VYBE mark — flashes on collide */}
        <motion.div
          className="pointer-events-none absolute top-[12%] flex flex-col items-center gap-2"
          animate={{
            opacity: phase === 'collide' || phase === 'swap' ? 1 : 0.35,
            scale: phase === 'collide' ? [1, 1.15, 1] : 1,
          }}
        >
          <VybeMiniIcon size={28} showSparkles />
          <span className="text-[10px] font-bold uppercase tracking-[0.35em] text-primary/80">
            Friend Link
          </span>
        </motion.div>

        {/* Avatars */}
        <div className="relative flex h-[320px] w-full max-w-md items-center justify-center px-6">
          {/* Me */}
          <motion.div
            className="absolute z-20"
            animate={{
              x:
                phase === 'appear' || phase === 'charge'
                  ? -72
                  : phase === 'collide' || phase === 'swap'
                    ? 0
                    : phase === 'linked' || phase === 'complete'
                      ? 58
                      : -72,
              y:
                phase === 'swap'
                  ? [-8, -48, 0]
                  : phase === 'collide'
                    ? [0, -12, 0]
                    : 0,
              scale: phase === 'collide' ? [1, 1.12, 1] : 1,
              rotate: phase === 'swap' ? [0, 8, 0] : 0,
            }}
            transition={{
              type: 'spring',
              stiffness: 280,
              damping: 22,
            }}
          >
            <Avatar className="h-28 w-28 border-[3px] border-background shadow-[0_0_40px_hsl(var(--primary)/0.45)]">
              <AvatarImage src={myProfile.avatar_url || undefined} />
              <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-2xl font-black text-white">
                {myProfile.username[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <p className="mt-2 text-center text-[11px] font-semibold text-primary">
              @{myProfile.username}
            </p>
          </motion.div>

          {/* Them */}
          <motion.div
            className="absolute z-20"
            animate={{
              x:
                phase === 'appear' || phase === 'charge'
                  ? 72
                  : phase === 'collide' || phase === 'swap'
                    ? 0
                    : phase === 'linked' || phase === 'complete'
                      ? -58
                      : 72,
              y: phase === 'swap' ? [8, 48, 0] : phase === 'collide' ? [0, 12, 0] : 0,
              scale: phase === 'collide' ? [1, 1.12, 1] : 1,
              rotate: phase === 'swap' ? [0, -8, 0] : 0,
            }}
            transition={{
              type: 'spring',
              stiffness: 280,
              damping: 22,
              delay: phase === 'appear' ? 0.05 : 0,
            }}
          >
            <Avatar className="h-28 w-28 border-[3px] border-background shadow-[0_0_40px_hsl(var(--accent)/0.45)]">
              <AvatarImage src={theirProfile.avatar_url || undefined} />
              <AvatarFallback className="bg-gradient-to-br from-accent to-primary text-2xl font-black text-white">
                {theirProfile.username[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <p className="mt-2 text-center text-[11px] font-semibold text-accent">
              @{theirProfile.username}
            </p>
          </motion.div>

          {/* Center fusion orb */}
          <motion.div
            className={cn(
              'absolute z-30 flex items-center justify-center rounded-full',
              showCheck
                ? 'h-16 w-16 bg-emerald-500/20 ring-2 ring-emerald-400'
                : 'h-14 w-14 bg-primary/20 ring-2 ring-primary/50',
            )}
            initial={{ scale: 0, opacity: 0 }}
            animate={{
              scale: phase === 'collide' ? [0, 1.4, 1] : showCheck ? 1 : phase === 'charge' ? [0.6, 1, 0.6] : 0,
              opacity: phase === 'appear' ? 0 : 1,
            }}
            transition={{ type: 'spring', bounce: 0.35 }}
          >
            {showCheck ? (
              <Check className="h-8 w-8 text-emerald-400" strokeWidth={3} />
            ) : (
              <motion.div
                className="h-3 w-3 rounded-full bg-primary shadow-[0_0_20px_hsl(var(--primary))]"
                animate={{ scale: [1, 1.4, 1] }}
                transition={{ duration: 0.5, repeat: Infinity }}
              />
            )}
          </motion.div>
        </div>

        {/* Status copy */}
        <motion.div
          className="absolute bottom-[18%] px-6 text-center"
          key={phase}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <p className="text-xl font-black tracking-tight text-white">
            {phase === 'appear' && 'Link detected'}
            {phase === 'charge' && 'Charging VYBE…'}
            {phase === 'collide' && 'Connecting souls'}
            {phase === 'swap' && 'Swapping profiles'}
            {phase === 'linked' && "You're connected!"}
            {phase === 'complete' && 'Opening chat…'}
          </p>
          <p className="mt-2 text-sm text-white/55">
            {phase === 'linked' || phase === 'complete'
              ? `You & @${theirProfile.username} are now friends`
              : 'Hold tight — syncing both phones'}
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
