import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { CornerUpLeft, MoreHorizontal, Trash2 } from 'lucide-react';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';
import { resolveOtherMemberFromConversation, displayNameForConversation } from '@/lib/dmMemberResolve';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTrashConversation } from '@/hooks/useTrashedConversations';
import { useDmInboxActions } from '@/hooks/useDmInboxActions';
import { ConversationOptionsSheet } from '@/components/chat/ConversationOptionsSheet';
import { DmConversationCard } from './DmConversationCard';
import { shouldUseListMotion } from '@/lib/performanceConfig';
import type { ActivityType } from '@/components/chat/LiveActivityIndicator';
import type { DMConversationPreview } from '@/features/dms/dm.types';

const SWIPE_ACTIVATE_PX = 12;
const HOLD_MS = 480;
const HOLD_CANCEL_PX = 8;
const REPLY_THRESHOLD = 56;
const MANAGE_THRESHOLD = -48;
const TRASH_THRESHOLD = -110;
const MAX_SWIPE_RIGHT = 72;
const MAX_SWIPE_LEFT = -140;

type GestureState = 'idle' | 'pending' | 'holding' | 'swiping' | 'scrolling';

function asDisplayLabel(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  return undefined;
}

function clampSwipeX(dx: number): number {
  if (dx > 0) {
    const clamped = Math.min(dx, MAX_SWIPE_RIGHT);
    return clamped > REPLY_THRESHOLD
      ? REPLY_THRESHOLD + (clamped - REPLY_THRESHOLD) * 0.25
      : clamped;
  }
  const clamped = Math.max(dx, MAX_SWIPE_LEFT);
  return clamped < TRASH_THRESHOLD
    ? TRASH_THRESHOLD + (clamped - TRASH_THRESHOLD) * 0.2
    : clamped;
}

interface SwipeableDmConversationRowProps {
  conversation: LoadedDMConversation;
  preview?: DMConversationPreview;
  profileId?: string;
  authUid?: string;
  isActive?: boolean;
  priority?: boolean;
  isTyping?: boolean;
  presenceActivity?: ActivityType;
  onClick: () => void;
  onQuickReply?: () => void;
  onWarm?: () => void;
}

export const SwipeableDmConversationRow = memo(function SwipeableDmConversationRow({
  conversation,
  preview,
  profileId,
  authUid,
  isActive,
  priority,
  isTyping,
  presenceActivity,
  onClick,
  onQuickReply,
  onWarm,
}: SwipeableDmConversationRowProps) {
  const isMobile = useIsMobile();
  const listMotionEnabled = shouldUseListMotion();
  const trashConversation = useTrashConversation();
  const inboxActions = useDmInboxActions(conversation);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSwiping, setIsSwiping] = useState(false);

  const stateRef = useRef<GestureState>('idle');
  const startRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gestureConsumedRef = useRef(false);

  const x = useMotionValue(0);
  const replyOpacity = useTransform(x, [0, 15, REPLY_THRESHOLD], [0, 0.5, 1]);
  const manageOpacity = useTransform(x, [MANAGE_THRESHOLD, -15, 0], [1, 0.5, 0]);
  const deleteOpacity = useTransform(x, [-140, TRASH_THRESHOLD, -40, 0], [1, 0.85, 0, 0]);
  const deleteBgOpacity = useTransform(x, [-120, -35, -10, 0], [1, 0.5, 0, 0]);

  const other = !conversation.is_group
    ? resolveOtherMemberFromConversation(conversation, profileId, authUid)
    : null;
  const otherMember = other?.profile;
  const displayName = displayNameForConversation(conversation, profileId, authUid, 'Chat');

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const snapBack = useCallback(() => {
    const spring = listMotionEnabled
      ? { type: 'spring' as const, stiffness: 520, damping: 38, mass: 0.75 }
      : { duration: 0.12 };
    animate(x, 0, spring);
  }, [listMotionEnabled, x]);

  const resetGesture = useCallback(() => {
    clearTimer();
    stateRef.current = 'idle';
    startRef.current = null;
    gestureConsumedRef.current = false;
    setIsSwiping(false);
    snapBack();
  }, [clearTimer, snapBack]);

  const handleTrash = useCallback(() => {
    trashConversation.mutate(conversation.id);
  }, [conversation.id, trashConversation]);

  const runSwipeAction = useCallback(
    (offset: number): boolean => {
      if (offset >= REPLY_THRESHOLD && onQuickReply) {
        if (navigator.vibrate) navigator.vibrate(10);
        onQuickReply();
        return true;
      }
      if (offset <= MANAGE_THRESHOLD && offset > TRASH_THRESHOLD) {
        if (navigator.vibrate) navigator.vibrate(8);
        setOptionsOpen(true);
        return true;
      }
      if (offset <= TRASH_THRESHOLD) {
        if (navigator.vibrate) navigator.vibrate([15, 30, 15]);
        setIsDeleting(true);
        setIsSwiping(false);
        const exitSpring = listMotionEnabled
          ? { duration: 0.32, ease: [0.4, 0, 0.2, 1] as const }
          : { duration: 0.18 };
        void animate(x, -420, exitSpring).then(() => handleTrash());
        return false;
      }
      return true;
    },
    [handleTrash, listMotionEnabled, onQuickReply, x],
  );

  const handleDocumentPointerMove = useCallback(
    (e: PointerEvent) => {
      const start = startRef.current;
      if (!start || e.pointerId !== start.pointerId || isDeleting) return;

      const state = stateRef.current;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (state === 'holding' || state === 'scrolling') return;

      if (state === 'pending') {
        if (absDy > HOLD_CANCEL_PX && absDy > absDx) {
          clearTimer();
          stateRef.current = 'scrolling';
          return;
        }
        if (absDx > SWIPE_ACTIVATE_PX && absDx > absDy) {
          clearTimer();
          stateRef.current = 'swiping';
          gestureConsumedRef.current = true;
          setIsSwiping(true);
        }
        if (absDx > HOLD_CANCEL_PX || absDy > HOLD_CANCEL_PX) {
          clearTimer();
        }
        return;
      }

      if (state === 'swiping') {
        x.set(clampSwipeX(dx));
      }
    },
    [clearTimer, isDeleting, x],
  );

  const handleDocumentPointerUp = useCallback(
    (e: PointerEvent) => {
      const start = startRef.current;
      if (!start || e.pointerId !== start.pointerId) return;

      const state = stateRef.current;
      const offset = x.get();

      if (state === 'swiping') {
        const shouldSnapBack = runSwipeAction(offset);
        if (!shouldSnapBack) {
          clearTimer();
          stateRef.current = 'idle';
          startRef.current = null;
          gestureConsumedRef.current = true;
          return;
        }
      } else if (state === 'pending' && !gestureConsumedRef.current) {
        onWarm?.();
        onClick();
      }

      resetGesture();
    },
    [clearTimer, onClick, onWarm, resetGesture, runSwipeAction, x],
  );

  useEffect(() => {
    const doc = document;
    doc.addEventListener('pointermove', handleDocumentPointerMove);
    doc.addEventListener('pointerup', handleDocumentPointerUp);
    doc.addEventListener('pointercancel', resetGesture);
    return () => {
      doc.removeEventListener('pointermove', handleDocumentPointerMove);
      doc.removeEventListener('pointerup', handleDocumentPointerUp);
      doc.removeEventListener('pointercancel', resetGesture);
    };
  }, [handleDocumentPointerMove, handleDocumentPointerUp, resetGesture]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (isDeleting || e.button !== 0) return;
      startRef.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
      stateRef.current = 'pending';
      gestureConsumedRef.current = false;
      clearTimer();
      timerRef.current = setTimeout(() => {
        if (stateRef.current !== 'pending') return;
        stateRef.current = 'holding';
        gestureConsumedRef.current = true;
        if (navigator.vibrate) navigator.vibrate(12);
        setOptionsOpen(true);
      }, HOLD_MS);
    },
    [clearTimer, isDeleting],
  );

  const handleClickCapture = useCallback((e: React.MouseEvent) => {
    if (!gestureConsumedRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    gestureConsumedRef.current = false;
  }, []);

  const handlePointerEnter = useCallback(() => {
    onWarm?.();
  }, [onWarm]);

  const optionsSheet = (
    <ConversationOptionsSheet
      open={optionsOpen}
      onOpenChange={setOptionsOpen}
      conversationId={conversation.id}
      otherUserId={!conversation.is_group ? (otherMember?.id as string | undefined) : undefined}
      otherUsername={!conversation.is_group ? asDisplayLabel(otherMember?.username) : undefined}
      otherDisplayName={displayName}
      otherAvatarUrl={typeof otherMember?.avatar_url === 'string' ? otherMember.avatar_url : undefined}
      isMuted={inboxActions.isMuted}
      isPinned={inboxActions.isPinned}
      onMarkUnread={() => inboxActions.markUnread.mutate()}
      onArchive={() => inboxActions.archive.mutate()}
      onTogglePin={() => inboxActions.togglePin.mutate(!inboxActions.isPinned)}
      onToggleMute={() => inboxActions.toggleMute.mutate(!inboxActions.isMuted)}
      onToggleLock={() => inboxActions.toggleLock.mutate(true)}
    />
  );

  const card = (
    <DmConversationCard
      conversation={conversation}
      preview={preview}
      profileId={profileId}
      authUid={authUid}
      isActive={isActive}
      priority={priority}
      isTyping={isTyping}
      presenceActivity={presenceActivity}
      isSwiping={isSwiping}
    />
  );

  if (!isMobile) {
    return (
      <>
        <div
          onContextMenu={(e) => {
            e.preventDefault();
            setOptionsOpen(true);
          }}
          onPointerEnter={handlePointerEnter}
        >
          <div
            role="button"
            tabIndex={0}
            className="dm-inbox-row-tap w-full text-left"
            onClick={onClick}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onClick();
              }
            }}
          >
            {card}
          </div>
        </div>
        {optionsSheet}
      </>
    );
  }

  return (
    <>
      <div className="dm-inbox-swipe-row relative touch-pan-y">
        <motion.div
          className="absolute inset-0 flex items-center justify-start pointer-events-none pl-5 bg-primary/10"
          style={{ opacity: replyOpacity }}
          aria-hidden
        >
          <div className="flex items-center gap-2 text-primary">
            <CornerUpLeft className="h-5 w-5" />
            <span className="text-sm font-semibold">Reply</span>
          </div>
        </motion.div>

        <motion.div
          className="absolute inset-0 flex items-center justify-end pointer-events-none pr-5 bg-muted/80"
          style={{ opacity: manageOpacity }}
          aria-hidden
        >
          <div className="flex items-center gap-2 text-foreground/80">
            <MoreHorizontal className="h-5 w-5" />
            <span className="text-sm font-semibold">More</span>
          </div>
        </motion.div>

        <motion.div
          className="absolute inset-0 flex items-center justify-end pointer-events-none bg-destructive"
          style={{ opacity: deleteBgOpacity }}
          aria-hidden
        >
          <motion.div
            className="flex items-center gap-2 text-destructive-foreground pr-5"
            style={{ opacity: deleteOpacity }}
          >
            <Trash2 className="h-5 w-5" />
            <span className="text-sm font-semibold">Delete</span>
          </motion.div>
        </motion.div>

        <motion.div
          className="relative bg-background"
          style={{ x, opacity: isDeleting ? 0 : 1 }}
          onPointerDown={handlePointerDown}
          onClickCapture={handleClickCapture}
          onPointerEnter={handlePointerEnter}
        >
          {card}
        </motion.div>
      </div>
      {optionsSheet}
    </>
  );
});
