import { memo, useCallback, useRef, useState } from 'react';
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
import { displayNameForConversation } from '@/lib/dmMemberResolve';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTrashConversation } from '@/hooks/useTrashedConversations';
import { useDmInboxActions } from '@/hooks/useDmInboxActions';
import { useConversationRowGesture } from '@/hooks/useConversationRowGesture';
import { DmConversationCard } from './DmConversationCard';
import { shouldUseListMotion } from '@/lib/performanceConfig';
import type { ActivityType } from '@/components/chat/LiveActivityIndicator';
import type { DMConversationPreview } from '@/features/dms/dm.types';
import { triggerHaptic } from '@/lib/haptics';

/** Right swipe — toggle read/unread. */
const READ_TOGGLE_PX = 64;
const MAX_SWIPE_RIGHT = 88;

/** Left swipe — reveal Pin / Mute / Archive tray. */
const ACTIONS_OPEN_PX = -168;
const ACTIONS_SNAP_PX = ACTIONS_OPEN_PX / 2;
const DELETE_ZONE_PX = -228;
const MAX_SWIPE_LEFT = -260;

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
  optionsOpenForRow?: boolean;
  onClick: () => void;
  onWarm?: () => void;
  onOpenOptions: (preview: DMConversationPreview) => void;
  onStoryTap?: (profileId: string) => void;
  onQuickReply?: (conversationId: string) => void;
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
  optionsOpenForRow = false,
  onClick,
  onWarm,
  onOpenOptions,
  onStoryTap,
  onQuickReply,
}: SwipeableDmConversationRowProps) {
  const isMobile = useIsMobile();
  const listMotionEnabled = shouldUseListMotion();
  const trashConversation = useTrashConversation();
  const inboxActions = useDmInboxActions(conversation);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const baseXRef = useRef(0);
  const openXRef = useRef(0);

  const x = useMotionValue(0);
  const readOpacity = useTransform(x, [0, 16, READ_TOGGLE_PX], [0, 0.5, 1]);
  const trayOpacity = useTransform(x, [-20, ACTIONS_OPEN_PX], [0, 1]);
  const deleteOpacity = useTransform(x, [DELETE_ZONE_PX, ACTIONS_OPEN_PX], [1, 0]);

  const displayName = preview?.displayName
    || displayNameForConversation(conversation, profileId, authUid, 'Chat');

  const unreadCountVal = preview?.unreadCount ?? conversation.unread_count ?? 0;
  const isUnread = preview?.isUnread ?? (unreadCountVal > 0 || conversation._hasUnread);

  const snapTo = useCallback(
    (target: number) => {
      const spring = listMotionEnabled
        ? { type: 'spring' as const, stiffness: 520, damping: 38, mass: 0.75 }
        : { duration: 0.12 };
      animate(x, target, spring);
    },
    [listMotionEnabled, x],
  );

  const closeTray = useCallback(() => {
    openXRef.current = 0;
    snapTo(0);
  }, [snapTo]);

  const handleTrash = useCallback(() => {
    trashConversation.mutate(conversation.id);
  }, [conversation.id, trashConversation]);

  const resolveSwipeRelease = useCallback(
    (target: number) => {
      if (target >= READ_TOGGLE_PX) {
        triggerHaptic('light');
        inboxActions.toggleRead(isUnread);
        openXRef.current = 0;
        snapTo(0);
        return;
      }
      if (target <= DELETE_ZONE_PX) {
        triggerHaptic('warning');
        openXRef.current = 0;
        snapTo(0);
        setShowDeleteConfirm(true);
        return;
      }
      if (target <= ACTIONS_SNAP_PX) {
        triggerHaptic('light');
        openXRef.current = ACTIONS_OPEN_PX;
        snapTo(ACTIONS_OPEN_PX);
        return;
      }
      openXRef.current = 0;
      snapTo(0);
    },
    [inboxActions, isUnread, snapTo],
  );

  const openOptions = useCallback(() => {
    if (!preview) return;
    onOpenOptions({ ...preview });
  }, [onOpenOptions, preview]);

  const {
    handlePointerDown,
    handleClickCapture,
    openFromKeyboard,
    isSwiping,
  } = useConversationRowGesture({
    disabled: isDeleting,
    onTap: onClick,
    onWarm,
    onHold: openOptions,
    isTrayOpen: () => openXRef.current !== 0,
    onCloseTray: closeTray,
    onSwipeMove: (dx) => {
      x.set(clampSwipeTarget(baseXRef.current + dx));
    },
    onSwipeEnd: () => {
      resolveSwipeRelease(x.get());
    },
  });

  const handlePointerDownWrapped = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      baseXRef.current = x.get();
      handlePointerDown(e);
    },
    [handlePointerDown, x],
  );

  const runTrayAction = useCallback((mutate: () => void) => {
    triggerHaptic('light');
    mutate();
    closeTray();
  }, [closeTray]);

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
      onStoryTap={onStoryTap}
      onQuickReply={
        onQuickReply && preview
          ? () => onQuickReply(preview.conversationId)
          : undefined
      }
    />
  );

  const rowA11y = {
    'aria-haspopup': 'dialog' as const,
    'aria-expanded': optionsOpenForRow,
    'aria-label': `Open options for ${displayName}`,
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      event.preventDefault();
      openFromKeyboard();
      return;
    }
    if (event.key === ' ') {
      event.preventDefault();
      openFromKeyboard();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      onClick();
    }
  };

  if (!isMobile) {
    return (
      <>
        <div
          onContextMenu={(e) => {
            e.preventDefault();
            openOptions();
          }}
          onPointerEnter={() => onWarm?.()}
        >
          <div
            role="button"
            tabIndex={0}
            className="dm-inbox-row-tap w-full text-left"
            onClick={onClick}
            onKeyDown={handleKeyDown}
            {...rowA11y}
          >
            {card}
          </div>
        </div>
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
          className="absolute inset-y-0 right-0 flex items-stretch pointer-events-none"
          style={{ opacity: trayOpacity }}
        >
          <button
            type="button"
            className="dm-inbox-swipe-action dm-inbox-swipe-action--pin dm-vfx-press pointer-events-auto"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => runTrayAction(() => inboxActions.togglePin.mutate(!inboxActions.isPinned))}
            aria-label={inboxActions.isPinned ? 'Unpin conversation' : 'Pin conversation'}
          >
            <Pin className="h-5 w-5" />
            <span>{inboxActions.isPinned ? 'Unpin' : 'Pin'}</span>
          </button>
          <button
            type="button"
            className="dm-inbox-swipe-action dm-inbox-swipe-action--mute dm-vfx-press pointer-events-auto"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => runTrayAction(() => inboxActions.toggleMute.mutate(!inboxActions.isMuted))}
            aria-label={inboxActions.isMuted ? 'Unmute conversation' : 'Mute conversation'}
          >
            <VolumeX className="h-5 w-5" />
            <span>{inboxActions.isMuted ? 'Unmute' : 'Mute'}</span>
          </button>
          <button
            type="button"
            className="dm-inbox-swipe-action dm-inbox-swipe-action--archive dm-vfx-press pointer-events-auto"
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
          onPointerDown={handlePointerDownWrapped}
          onClickCapture={handleClickCapture}
          onPointerEnter={() => onWarm?.()}
          onKeyDown={handleKeyDown}
          {...rowA11y}
        >
          {card}
        </motion.div>
      </div>
      {deleteConfirmDialog}
    </>
  );
});
