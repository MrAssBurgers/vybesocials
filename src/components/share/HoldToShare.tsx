/**
 * HoldToShare — TikTok/Instagram-style long-press quick-share.
 *
 * - Tap = wrapped child's onClick (e.g. open full ShareSheet).
 * - Hold ~280ms WITHOUT releasing = floating bar of top 4 recent friends opens.
 * - Drag finger across friends = haptic on hover-enter.
 * - Release over a friend = send + airplane shoot-off animation.
 * - Release off-target = silent close.
 * - If user has zero recent friends, the hold falls back to the tap action
 *   (so the gesture is never a dead end).
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

const HOLD_MS = 280;
const MOVE_CANCEL_PX = 10;
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
  /** Fallback fired when hold cannot open the menu (e.g. no recent friends). */
  onTapFallback?: () => void;
}

export const HoldToShare = memo(function HoldToShare({
  postId,
  postType,
  mediaUrl,
  children,
  className,
  disabled,
  onTapFallback,
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
      if (list.length === 0) {
        // Fallback to full share sheet — never leave the gesture hanging.
        onTapFallback?.();
        return;
      }
      triggerHaptic('medium');
      setTargets(list);
      setAnchor({ x, y });
      setOpen(true);
      openRef.current = true;
    },
    [profile?.id, onTapFallback],
  );

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (disabled || !profile?.id) return;
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

      // Suppress synthetic click that follows pointerup so we don't ALSO open ShareSheet.
      suppressClickRef.current = true;
      window.setTimeout(() => { suppressClickRef.current = false; }, 400);

      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const targetEl = el?.closest(`[${TARGET_ATTR}]`) as HTMLElement | null;
      const id = targetEl?.getAttribute(TARGET_ATTR) ?? null;

      if (id && profile?.id) {
        const recipient = targets.find((t) => t.id === id);
        triggerHaptic('success');
        setSentId(id);
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
            const name = recipient?.display_name || recipient?.username || 'friend';
            toast.success(`Sent to ${name}`);
          } else {
            toast.error('Could not send. Tap to try again.');
          }
        });
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

  const handleClickCapture = useCallback((e: React.MouseEvent) => {
    if (suppressClickRef.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  // Floating menu placement (above anchor, clamped to viewport).
  const menuPos = (() => {
    if (!anchor) return null;
    const W = 320;
    const H = 130;
    const margin = 12;
    const vw = typeof window !== 'undefined' ? window.innerWidth : 360;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 640;
    let x = anchor.x - W / 2;
    let y = anchor.y - H - 28;
    if (y < margin) y = Math.min(anchor.y + 28, vh - H - margin);
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
                  transition={{ duration: 0.14 }}
                  className="fixed inset-0 z-[1100] bg-black/40"
                  style={{ pointerEvents: 'none' }}
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.85, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 6 }}
                  transition={{ type: 'spring', stiffness: 340, damping: 24 }}
                  className="fixed z-[1101] rounded-2xl bg-background/95 backdrop-blur-xl border border-primary/20 shadow-2xl shadow-primary/20 px-3 py-3"
                  style={{
                    left: menuPos.x,
                    top: menuPos.y,
                    width: menuPos.w,
                    pointerEvents: 'none',
                  }}
                >
                  <div className="flex items-center gap-1.5 px-1 pb-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
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
                          className="flex flex-col items-center gap-1.5 px-1 py-1 rounded-xl"
                          style={{ pointerEvents: 'auto' }}
                        >
                          <motion.div
                            animate={
                              isSent
                                ? { y: -120, opacity: 0, scale: 0.5, rotate: -18 }
                                : isHover
                                  ? { scale: 1.22, y: -10 }
                                  : { scale: 1, y: 0 }
                            }
                            transition={
                              isSent
                                ? { duration: 0.5, ease: [0.4, 0, 0.2, 1] }
                                : { type: 'spring', stiffness: 380, damping: 22 }
                            }
                            className={cn(
                              'rounded-full ring-2 transition-shadow',
                              isHover
                                ? 'ring-primary shadow-lg shadow-primary/50'
                                : 'ring-transparent',
                            )}
                          >
                            <Avatar className="h-14 w-14">
                              <AvatarImage src={t.avatar_url || undefined} alt={t.username} />
                              <AvatarFallback>
                                {(t.display_name || t.username || '?').slice(0, 1).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                          </motion.div>
                          <span
                            className={cn(
                              'text-[11px] font-medium max-w-[64px] truncate transition-colors',
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
