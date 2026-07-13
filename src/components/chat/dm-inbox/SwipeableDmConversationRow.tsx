import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { Archive, Mail, MailOpen, Pin, Trash2, VolumeX } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
/** Max movement still treated as a tap (open chat / close tray) after classification. */
const TAP_SLOP_PX = 14;

/** Right swipe — toggle read/unread. */
const READ_TOGGLE_PX = 64;
const MAX_SWIPE_RIGHT = 88;

/** Left swipe — reveal Pin / Mute / Archive tray. */
const ACTIONS_OPEN_PX = -168;
const ACTIONS_SNAP_PX = ACTIONS_OPEN_PX / 2;
/** Destructive (delete) requires dragging well past the tray, then a confirm dialog. */
const DELETE_ZONE_PX = -228;
const MAX_SWIPE_LEFT = -260;

type GestureState = 'idle' | 'pending' | 'holding' | 'swiping' | 'scrolling';

function asDisplayLabel(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  return undefined;
}

/** Clamps a proposed absolute row offset with elastic resistance past each zone boundary. */
function clampSwipeTarget(target: number): number {
  if (target >= 0) {
    const clamped = Math.min(target, MAX_SWIPE_RIGHT);
    return clamped > READ_TOGGLE_PX
      ? READ_TOGGLE_PX + (clamped - READ_TOGGLE_PX) * 0.3
      : clamped;
  }
  const clamped = Math.max(target, MAX_SWIPE_LEFT);
  if (clamped < DELETE_ZONE_PX) {
    return DELETE_ZONE_PX + (clamped - DELETE_ZONE_PX) * 0.25;
  }
  if (clamped < ACTIONS_OPEN_PX) {
    return ACTIONS_OPEN_PX + (clamped - ACTIONS_OPEN_PX) * 0.55;
  }
  return clamped;
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
  onWarm,
}: SwipeableDmConversationRowProps) {
  const isMobile = useIsMobile();
  const listMotionEnabled = shouldUseListMotion();
  const trashConversation = useTrashConversation();
  const inboxActions = useDmInboxActions(conversation);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSwiping, setIsSwiping] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const stateRef = useRef<GestureState>('idle');
  const startRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const baseXRef = useRef(0);
  /** Rest position of the row when idle — 0 (closed) or ACTIONS_OPEN_PX (tray revealed). */
  const openXRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gestureConsumedRef = useRef(false);

  const x = useMotionValue(0);
  const readOpacity = useTransform(x, [0, 16, READ_TOGGLE_PX], [0, 0.5, 1]);
  const trayOpacity = useTransform(x, [-20, ACTIONS_OPEN_PX], [0, 1]);
  const deleteOpacity = useTransform(x, [DELETE_ZONE_PX, ACTIONS_OPEN_PX], [1, 0]);

  const other = !conversation.is_group
    ? resolveOtherMemberFromConversation(conversation, profileId, authUid)
    : null;
  const otherMember = other?.profile;
  const displayName = displayNameForConversation(conversation, profileId, authUid, 'Chat');

  const unreadCountVal = preview?.unreadCount ?? conversation.unread_count ?? 0;
  const isUnread = preview?.isUnread ?? (unreadCountVal > 0 || conversation._hasUnread);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const snapTo = useCallback(
    (target: number) => {
      const spring = listMotionEnabled
        ? { type: 'spring' as const, stiffness: 520, damping: 38, mass: 0.75 }
        : { duration: 0.12 };
      animate(x, target, spring);
    },
    [listMotionEnabled, x],
  );

  const resetGesture = useCallback(() => {
    clearTimer();
    stateRef.current = 'idle';
    startRef.current = null;
    gestureConsumedRef.current = false;
    setIsSwiping(false);
  }, [clearTimer]);

  const handleTrash = useCallback(() => {
    trashConversation.mutate(conversation.id);
  }, [conversation.id, trashConversation]);

  const closeTray = useCallback(() => {
    openXRef.current = 0;
    snapTo(0);
  }, [snapTo]);

  const resolveSwipeRelease = useCallback(
    (target: number) => {
      if (target >= READ_TOGGLE_PX) {
        if (navigator.vibrate) navigator.vibrate(10);
        inboxActions.toggleRead(isUnread);
        openXRef.current = 0;
        snapTo(0);
        return;
      }
      if (target <= DELETE_ZONE_PX) {
        if (navigator.vibrate) navigator.vibrate([15, 30, 15]);
        openXRef.current = 0;
        snapTo(0);
        setShowDeleteConfirm(true);
        return;
      }
      if (target <= ACTIONS_SNAP_PX) {
        if (navigator.vibrate) navigator.vibrate(8);
        openXRef.current = ACTIONS_OPEN_PX;
        snapTo(ACTIONS_OPEN_PX);
        return;
      }
      openXRef.current = 0;
      snapTo(0);
    },
    [inboxActions, isUnread, snapTo],
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
        x.set(clampSwipeTarget(baseXRef.current + dx));
      }
    },
    [clearTimer, isDeleting, x],
  );

  const handleDocumentPointerUp = useCallback(
    (e: PointerEvent) => {
      const start = startRef.current;
      if (!start || e.pointerId !== start.pointerId) return;

      const state = stateRef.current;
      const target = x.get();
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      const isTap =
        !gestureConsumedRef.current &&
        absDx <= TAP_SLOP_PX &&
        absDy <= TAP_SLOP_PX;

      if (state === 'swiping') {
        resolveSwipeRelease(target);
      } else if (isTap && (state === 'pending' || state === 'scrolling')) {
        if (openXRef.current !== 0) {
          closeTray();
        } else {
          onWarm?.();
          onClick();
        }
      }

      resetGesture();
    },
    [closeTray, onClick, onWarm, resetGesture, resolveSwipeRelease, x],
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
      baseXRef.current = x.get();
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
    [clearTimer, isDeleting, x],
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

  const runTrayAction = useCallback((mutate: () => void) => {
    if (navigator.vibrate) navigator.vibrate(8);
    mutate();
    closeTray();
  }, [closeTray]);

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

  const deleteConfirmDialog = (
    <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
          <AlertDialogDescription>
            This chat will be moved to trash. You can recover it within 30 days or delete it permanently.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setIsDeleting(true);
              const exitSpring = listMotionEnabled
                ? { duration: 0.32, ease: [0.4, 0, 0.2, 1] as const }
                : { duration: 0.18 };
              void animate(x, -420, exitSpring).then(() => handleTrash());
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Move to Trash
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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
        {deleteConfirmDialog}
      </>
    );
  }

  return (
    <>
      <div className="dm-inbox-swipe-row relative touch-pan-y">
        <motion.div
          className="absolute inset-0 flex items-center justify-start pointer-events-none pl-5 bg-primary/10"
          style={{ opacity: readOpacity }}
          aria-hidden
        >
          <div className="flex items-center gap-2 text-primary">
            {isUnread ? <MailOpen className="h-5 w-5" /> : <Mail className="h-5 w-5" />}
            <span className="text-sm font-semibold">{isUnread ? 'Mark read' : 'Mark unread'}</span>
          </div>
        </motion.div>

        <motion.div
          className="absolute inset-y-0 right-0 flex items-stretch"
          style={{ opacity: trayOpacity }}
        >
          <button
            type="button"
            className="dm-inbox-swipe-action dm-inbox-swipe-action--pin dm-vfx-press"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => runTrayAction(() => inboxActions.togglePin.mutate(!inboxActions.isPinned))}
            aria-label={inboxActions.isPinned ? 'Unpin conversation' : 'Pin conversation'}
          >
            <Pin className="h-5 w-5" />
            <span>{inboxActions.isPinned ? 'Unpin' : 'Pin'}</span>
          </button>
          <button
            type="button"
            className="dm-inbox-swipe-action dm-inbox-swipe-action--mute dm-vfx-press"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => runTrayAction(() => inboxActions.toggleMute.mutate(!inboxActions.isMuted))}
            aria-label={inboxActions.isMuted ? 'Unmute conversation' : 'Mute conversation'}
          >
            <VolumeX className="h-5 w-5" />
            <span>{inboxActions.isMuted ? 'Unmute' : 'Mute'}</span>
          </button>
          <button
            type="button"
            className="dm-inbox-swipe-action dm-inbox-swipe-action--archive dm-vfx-press"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => runTrayAction(() => inboxActions.archive.mutate())}
            aria-label="Archive conversation"
          >
            <Archive className="h-5 w-5" />
            <span>Archive</span>
          </button>
        </motion.div>

        <motion.div
          className="absolute inset-0 flex items-center justify-end pr-6 bg-destructive pointer-events-none"
          style={{ opacity: deleteOpacity }}
          aria-hidden
        >
          <div className="flex items-center gap-2 text-destructive-foreground">
            <Trash2 className="h-5 w-5" />
            <span className="text-sm font-semibold">Release to delete</span>
          </div>
        </motion.div>

        <motion.div
          role="button"
          tabIndex={0}
          className="relative bg-background dm-inbox-row-tap"
          style={{ x, opacity: isDeleting ? 0 : 1 }}
          onPointerDown={handlePointerDown}
          onClickCapture={handleClickCapture}
          onPointerEnter={handlePointerEnter}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onClick();
            }
          }}
          aria-label={`Open chat with ${displayName}`}
        >
          {card}
        </motion.div>
      </div>
      {optionsSheet}
      {deleteConfirmDialog}
    </>
  );
});
