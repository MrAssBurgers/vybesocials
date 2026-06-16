/**
 * FollowPlusButton — TikTok-style follow badge that sits under the
 * author avatar on a clip. Tap to follow:
 *   + (idle)  →  ✓ (confirm)  →  confetti burst  →  fly into avatar & unmount
 */
import { memo, useEffect, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Plus } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { useQueryClient } from '@tanstack/react-query';
import { triggerHaptic } from '@/lib/haptics';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface FollowPlusButtonProps {
  authorId: string;
  className?: string;
}

type Phase = 'idle' | 'confirming' | 'flying' | 'gone';

const CONFETTI_COLORS = [
  '#f43f5e', '#fb7185', '#a78bfa', '#8b5cf6',
  '#06b6d4', '#22d3ee', '#fbbf24', '#34d399',
];

export const FollowPlusButton = memo(function FollowPlusButton({
  authorId,
  className,
}: FollowPlusButtonProps) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>('idle');
  const [mounted, setMounted] = useState(false);

  // Hide for self + check existing follow state
  useEffect(() => {
    let cancelled = false;
    if (!profile?.id || !authorId || profile.id === authorId) {
      setPhase('gone');
      return;
    }
    (async () => {
      const { data } = await db
        .from('follows')
        .select('id')
        .eq('follower_id', profile.id)
        .eq('following_id', authorId)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        setPhase('gone');
      } else {
        setMounted(true);
      }
    })();
    return () => { cancelled = true; };
  }, [profile?.id, authorId]);

  const handleFollow = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (phase !== 'idle' || !profile?.id) return;

    setPhase('confirming');
    triggerHaptic('success');

    // Optimistic DB write
    const { error } = await db.from('follows').insert({
      follower_id: profile.id,
      following_id: authorId,
    });

    if (error && !String(error.message).toLowerCase().includes('duplicate')) {
      // Rollback
      setPhase('idle');
      toast.error('Could not follow. Try again.');
      return;
    }

    // Fire notification (best effort)
    db.from('notifications').insert({
      user_id: authorId,
      type: 'follow',
      actor_id: profile.id,
    }).then(() => {});

    queryClient.invalidateQueries({ queryKey: ['profile'] });
    queryClient.invalidateQueries({ queryKey: ['suggested-friends'] });

    // Confetti shows during confirming, then fly into avatar
    setTimeout(() => setPhase('flying'), 650);
    setTimeout(() => {
      setPhase('gone');
      setMounted(false);
    }, 1050);
  }, [phase, profile?.id, authorId, queryClient]);

  if (!mounted || phase === 'gone') return null;

  return (
    <div
      className={cn(
        'absolute left-1/2 -translate-x-1/2 -bottom-2.5 pointer-events-none',
        className,
      )}
      style={{ zIndex: 5 }}
    >
      <AnimatePresence>
        {(phase as Phase) !== 'gone' && (
          <motion.button
            key="badge"
            type="button"
            onClick={handleFollow}
            initial={{ scale: 0, opacity: 0 }}
            animate={
              phase === 'flying'
                ? { scale: 0, opacity: 0, y: -22 }
                : { scale: 1, opacity: 1, y: 0 }
            }
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 22 }}
            whileTap={{ scale: 0.85 }}
            className={cn(
              'pointer-events-auto relative h-6 w-6 rounded-full',
              'flex items-center justify-center shadow-lg ring-2 ring-white',
              phase === 'idle'
                ? 'bg-gradient-to-br from-rose-500 to-pink-600'
                : 'bg-gradient-to-br from-emerald-400 to-emerald-600',
            )}
            aria-label="Follow"
          >
            <AnimatePresence mode="popLayout" initial={false}>
              {phase === 'idle' ? (
                <motion.span
                  key="plus"
                  initial={{ scale: 0, rotate: -90 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0, rotate: 90 }}
                  transition={{ duration: 0.18 }}
                  className="inline-flex"
                >
                  <Plus className="h-3.5 w-3.5 text-white" strokeWidth={3.5} />
                </motion.span>
              ) : (
                <motion.span
                  key="check"
                  initial={{ scale: 0, rotate: -90 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                  className="inline-flex"
                >
                  <Check className="h-3.5 w-3.5 text-white" strokeWidth={3.5} />
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Confetti burst */}
      <AnimatePresence>
        {phase === 'confirming' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {Array.from({ length: 14 }).map((_, i) => {
              const angle = (i * (360 / 14)) * (Math.PI / 180);
              const distance = 38 + (i % 3) * 6;
              return (
                <motion.span
                  key={i}
                  className="absolute h-1.5 w-1.5 rounded-full"
                  style={{ background: CONFETTI_COLORS[i % CONFETTI_COLORS.length] }}
                  initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
                  animate={{
                    x: Math.cos(angle) * distance,
                    y: Math.sin(angle) * distance,
                    scale: [0, 1.4, 0],
                    opacity: [1, 1, 0],
                  }}
                  transition={{ duration: 0.6, ease: [0.2, 0.7, 0.3, 1] }}
                />
              );
            })}
          </div>
        )}
      </AnimatePresence>
    </div>
  );
});
