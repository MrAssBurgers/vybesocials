/**
 * HoldToShare — wraps a share trigger and adds an Instagram/TikTok-style
 * long-press quick menu of the user's top-talked-to friends.
 *
 * Tap behavior is preserved (calls the wrapped child's onClick / opens
 * whatever the parent already does). Hold ~350ms to open the floating
 * avatar bar, drag onto a friend (haptic on hover), release to send.
 */
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Send } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/lib/auth';
import { triggerHaptic } from '@/lib/haptics';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { sendShareToUser, type SharePostType } from '@/lib/sendShareToUser';
import { getQuickShareTargets, type QuickShareTarget } from '@/lib/quickShareTargets';
import { useQueryClient } from '@tanstack/react-query';

const HOLD_MS = 350;
const MOVE_CANCEL_PX = 8; // before menu opens, this much movement = treat as scroll, cancel
const TARGET_ATTR = 'data-quick-share-target';

interface HoldToShareProps {
  postId: string;
  postType: SharePostType;
  mediaUrl?: string | null;
  /** Visual element to wrap (button, icon, etc). */
  children: ReactNode;
  /** Optional class on wrapping span. */
  className?: string;
  /** Disable hold behavior (still renders children & their onClick). */
  disabled?: boolean;
}

export const HoldToShare = memo(function HoldToShare({
  postId,
  postType,
  mediaUrl,
  children,
  className,
  disabled,
}: HoldToShareProps) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<QuickShareTarget[]>([]);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [sentId, setSentId] = useState<string | null>(null);

  const holdTimerRef = useRef<number | null>(null);
  const startPointRef = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);
  const openRef = useRef(false);
  const lastHoverRef = useRef<string | null>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => () => clearHoldTimer(), []);

  const clearHoldTimer = () => {
    if (holdTimerRef.current != null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const closeMenu = useCallback(() => {
    setOpen(false);
    openRef.current = false;
    setHoverId(null);
    lastHoverRef.current = null;
    setAnchor(null);
  }, []);

  const openMenu = useCallback(
    async (x: number, y: number) => {
      if (!profile?.id) return;
      const list = await getQuickShareTargets(profile.id, 4);
      if (list.length === 0) return; // no targets — skip menu, tap handler still works
      triggerHaptic('medium');
      setTargets(list);
      setAnchor({ x, y });
      setOpen(true);
      openRef.current = true;
    },
    [profile?.id],
  );

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (disabled || !profile?.id) return;
      // Only primary pointer
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      startPointRef.current = { x: e.clientX, y: e.clientY };
      movedRef.current = false;
      clearHoldTimer();
      holdTimerRef.current = window.setTimeout(() => {
        if (movedRef.current) return;
        const p = startPointRef.current;
        if (!p) return;
        openMenu(p.x, p.y);
      }, HOLD_MS);
    },
    [disabled, profile?.id, openMenu],
  );

  // Global pointer listeners while open OR while waiting for hold.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      // Pre-open: cancel hold if user scrolls.
      if (!openRef.current) {
        const start = startPointRef.current;
        if (!start) return;
        const dx = Math.abs(e.clientX - start.x);
        const dy = Math.abs(e.clientY - start.y);
        if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) {
          movedRef.current = true;
          clearHoldTimer();
        }
        return;
      }
      // Open: hit-test against avatar targets
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const targetEl = el?.closest(`[${TARGET_ATTR}]`) as HTMLElement | null;
      const id = targetEl?.getAttribute(TARGET_ATTR) ?? null;
      if (id !== lastHoverRef.current) {
        lastHoverRef.current = id;
        setHoverId(id);
        if (id) triggerHaptic('light');
      }
    };

    const onUp = (e: PointerEvent) => {
      const wasOpen = openRef.current;
      clearHoldTimer();

      if (!wasOpen) {
        startPointRef.current = null;
        return;
      }

      // Menu was open — suppress the synthetic click that follows pointerup.
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 350);

      // Released — check final target under pointer
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const targetEl = el?.closest(`[${TARGET_ATTR}]`) as HTMLElement | null;
      const id = targetEl?.getAttribute(TARGET_ATTR) ?? null;

      if (id && profile?.id) {
        const recipient = targets.find((t) => t.id === id);
        triggerHaptic('success');
        setSentId(id);
        // Fire send (don't await — UI feedback first)
        sendShareToUser({
          recipientProfileId: id,
          senderProfileId: profile.id,
          postId,
          postType,
          mediaUrl,
        }).then((ok) => {
          if (ok) {
            queryClient.invalidateQueries({ queryKey: ['dm-conversations'] });
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
            const name =
              recipient?.display_name || recipient?.username || 'friend';
            toast.success(`Sent to ${name}`);
          } else {
            toast.error('Could not send. Tap to try again.');
          }
        });
        // Hold menu open briefly to show shoot-off, then close.
        window.setTimeout(() => {
          setSentId(null);
          closeMenu();
        }, 520);
      } else {
        triggerHaptic('light');
        closeMenu();
      }
      startPointRef.current = null;
    };

    const onCancel = () => {
      clearHoldTimer();
      if (openRef.current) closeMenu();
      startPointRef.current = null;
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openRef.current) closeMenu();
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey);
    };
  }, [closeMenu, mediaUrl, postId, postType, profile?.id, queryClient, targets]);

  // Suppress click that fires after a successful long-press release.
  const handleClickCapture = useCallback((e: React.MouseEvent) => {
    if (suppressClickRef.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  // Compute floating menu placement (above anchor, clamped to viewport).
  const menuPos = (() => {
    if (!anchor) return null;
    const W = 280;
    const H = 110;
    const margin = 12;
    const vw = typeof window !== 'undefined' ? window.innerWidth : 360;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 640;
    let x = anchor.x - W / 2;
    let y = anchor.y - H - 24;
    if (y < margin) y = Math.min(anchor.y + 24, vh - H - margin);
    if (x < margin) x = margin;
    if (x + W > vw - margin) x = vw - margin - W;
    return { x, y, w: W };
  })();

  return (
    <>
      <span
        className={cn('inline-flex', className)}
        style={{ touchAction: open ? 'none' : 'manipulation' }}
        onPointerDown={handlePointerDown}
        onClickCapture={handleClickCapture}
      >
        {children}
      </span>

      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {open && menuPos && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                  className="fixed inset-0 z-[1100] bg-black/30"
                  style={{ pointerEvents: 'none' }}
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.85, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 6 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 24 }}
                  className="fixed z-[1101] rounded-2xl bg-card/90 backdrop-blur-xl border border-border/60 shadow-2xl px-3 py-2.5"
                  style={{
                    left: menuPos.x,
                    top: menuPos.y,
                    width: menuPos.w,
                    pointerEvents: 'none',
                  }}
                >
                  <div className="flex items-center gap-1.5 px-1 pb-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    <Send className="h-3 w-3" />
                    Send to…
                  </div>
                  <div className="flex items-end justify-around gap-2">
                    {targets.map((t) => {
                      const isHover = hoverId === t.id;
                      const isSent = sentId === t.id;
                      return (
                        <div
                          key={t.id}
                          {...{ [TARGET_ATTR]: t.id }}
                          className="flex flex-col items-center gap-1 px-1 py-1 rounded-xl transition-colors"
                          style={{ pointerEvents: 'auto' }}
                        >
                          <motion.div
                            animate={
                              isSent
                                ? { y: -90, opacity: 0, scale: 0.6, rotate: -12 }
                                : isHover
                                  ? { scale: 1.18, y: -4 }
                                  : { scale: 1, y: 0 }
                            }
                            transition={
                              isSent
                                ? { duration: 0.5, ease: [0.4, 0, 0.2, 1] }
                                : { type: 'spring', stiffness: 380, damping: 22 }
                            }
                            className={cn(
                              'rounded-full ring-2 ring-transparent',
                              isHover && 'ring-primary shadow-lg shadow-primary/30',
                            )}
                          >
                            <Avatar className="h-12 w-12">
                              <AvatarImage src={t.avatar_url || undefined} alt={t.username} />
                              <AvatarFallback>
                                {(t.display_name || t.username || '?').slice(0, 1).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                          </motion.div>
                          <span
                            className={cn(
                              'text-[10px] font-medium max-w-[60px] truncate transition-colors',
                              isHover ? 'text-primary' : 'text-foreground/80',
                            )}
                          >
                            {t.display_name || t.username}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
});
