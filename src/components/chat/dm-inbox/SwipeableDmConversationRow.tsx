import { memo, useCallback, useRef, useState } from 'react';
import { motion, useMotionValue, useTransform, type PanInfo } from 'framer-motion';
import { CornerUpLeft, MoreHorizontal, Trash2 } from 'lucide-react';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';
import { resolveOtherMemberFromConversation, displayNameForConversation } from '@/lib/dmMemberResolve';
import { safeDmMembers } from '@/lib/persistedCollections';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTrashConversation } from '@/hooks/useTrashedConversations';
import { useDmInboxActions } from '@/hooks/useDmInboxActions';
import { ConversationOptionsSheet } from '@/components/chat/ConversationOptionsSheet';
import { DmConversationCard } from './DmConversationCard';
import type { ActivityType } from '@/components/chat/LiveActivityIndicator';

const REPLY_THRESHOLD = 56;
const MANAGE_THRESHOLD = -48;
const TRASH_THRESHOLD = -110;

const GPU_LAYER_STYLE = {
  willChange: 'transform, opacity',
  backfaceVisibility: 'hidden' as const,
  transform: 'translateZ(0)',
};

function asDisplayLabel(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  return undefined;
}

interface SwipeableDmConversationRowProps {
  conversation: LoadedDMConversation;
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
  const trashConversation = useTrashConversation();
  const inboxActions = useDmInboxActions(conversation);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressRef = useRef(false);
  const isDraggingRef = useRef(false);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);

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

  const handleTrash = useCallback(() => {
    trashConversation.mutate(conversation.id);
  }, [conversation.id, trashConversation]);

  const handleClick = useCallback(() => {
    if (isDraggingRef.current || isLongPressRef.current) return;
    onClick();
  }, [onClick]);

  const handleDragEnd = useCallback((_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const wasHorizontalSwipe = Math.abs(info.offset.x) > 12;
    if (info.offset.x >= REPLY_THRESHOLD && onQuickReply) {
      if (navigator.vibrate) navigator.vibrate(10);
      onQuickReply();
    } else if (info.offset.x <= MANAGE_THRESHOLD && info.offset.x > TRASH_THRESHOLD) {
      if (navigator.vibrate) navigator.vibrate(8);
      setOptionsOpen(true);
    } else if (info.offset.x <= TRASH_THRESHOLD) {
      if (navigator.vibrate) navigator.vibrate([15, 30, 15]);
      setIsDeleting(true);
      window.setTimeout(() => handleTrash(), 360);
    }
    if (wasHorizontalSwipe) {
      isDraggingRef.current = true;
      window.setTimeout(() => {
        isDraggingRef.current = false;
      }, 350);
    }
  }, [handleTrash, onQuickReply]);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    isLongPressRef.current = false;
    const point = 'touches' in e ? e.touches[0] : e;
    touchStartPosRef.current = { x: point.clientX, y: point.clientY };
    clearLongPress();
    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      if (navigator.vibrate) navigator.vibrate(12);
      setOptionsOpen(true);
    }, 480);
  }, [clearLongPress]);

  const handleTouchMove = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (!touchStartPosRef.current) return;
    const point = 'touches' in e ? e.touches[0] : e;
    const dx = Math.abs(point.clientX - touchStartPosRef.current.x);
    const dy = Math.abs(point.clientY - touchStartPosRef.current.y);
    if (dx > 8 || dy > 8) clearLongPress();
  }, [clearLongPress]);

  const handleTouchEnd = useCallback(() => {
    clearLongPress();
    touchStartPosRef.current = null;
    window.setTimeout(() => {
      isLongPressRef.current = false;
    }, 50);
  }, [clearLongPress]);

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
      profileId={profileId}
      authUid={authUid}
      isActive={isActive}
      priority={priority}
      isTyping={isTyping}
      presenceActivity={presenceActivity}
      onClick={handleClick}
      onWarm={onWarm}
    />
  );

  const touchHandlers = {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
    onMouseDown: handleTouchStart,
    onMouseMove: handleTouchMove,
    onMouseUp: handleTouchEnd,
    onMouseLeave: handleTouchEnd,
  };

  if (!isMobile) {
    return (
      <>
        <div
          onContextMenu={(e) => {
            e.preventDefault();
            setOptionsOpen(true);
          }}
          {...touchHandlers}
        >
          {card}
        </div>
        {optionsSheet}
      </>
    );
  }

  return (
    <>
      <div className="relative mb-0.5 gpu-layer">
        <motion.div
          className="absolute inset-0 flex items-center justify-start pointer-events-none rounded-2xl gpu-layer pl-4"
          style={{ opacity: replyOpacity, ...GPU_LAYER_STYLE }}
        >
          <div className="flex flex-col items-center gap-0.5 text-primary">
            <CornerUpLeft className="h-5 w-5" />
            <span className="text-[10px] font-medium">Reply</span>
          </div>
        </motion.div>

        <motion.div
          className="absolute inset-0 flex items-center justify-end pointer-events-none rounded-2xl gpu-layer pr-4"
          style={{ opacity: manageOpacity, ...GPU_LAYER_STYLE }}
        >
          <div className="flex flex-col items-center gap-0.5 text-muted-foreground">
            <MoreHorizontal className="h-5 w-5" />
            <span className="text-[10px] font-medium">More</span>
          </div>
        </motion.div>

        <motion.div
          className="absolute inset-0 flex items-center justify-end pointer-events-none rounded-2xl gpu-layer"
          style={{
            opacity: deleteBgOpacity,
            background: 'hsl(var(--destructive))',
            ...GPU_LAYER_STYLE,
          }}
        >
          <motion.div
            style={{ opacity: deleteOpacity, ...GPU_LAYER_STYLE }}
            className="flex flex-col items-center gap-0.5 text-destructive-foreground pr-6"
          >
            <Trash2 className="h-5 w-5" />
            <span className="text-[10px] font-medium">Delete</span>
          </motion.div>
        </motion.div>

        <motion.div
          className="relative overflow-hidden rounded-2xl gpu-layer"
          style={{ x, ...GPU_LAYER_STYLE }}
          drag="x"
          dragConstraints={{ left: -140, right: 72 }}
          dragElastic={0.1}
          dragMomentum={false}
          onDragEnd={handleDragEnd}
          animate={isDeleting ? { x: -400, opacity: 0 } : { x: 0, opacity: 1 }}
          transition={
            isDeleting
              ? { duration: 0.35, ease: [0.4, 0, 0.2, 1] }
              : { type: 'spring', stiffness: 400, damping: 35 }
          }
        >
          <div {...touchHandlers}>{card}</div>
        </motion.div>
      </div>
      {optionsSheet}
    </>
  );
});
