import { memo, useCallback, useRef, useState } from 'react';
import { motion, useMotionValue, useTransform, type PanInfo } from 'framer-motion';
import { Trash2 } from 'lucide-react';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';
import { resolveOtherMemberFromConversation, displayNameForConversation } from '@/lib/dmMemberResolve';
import { safeDmMembers } from '@/lib/persistedCollections';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTrashConversation } from '@/hooks/useTrashedConversations';
import { ConversationOptionsSheet } from '@/components/chat/ConversationOptionsSheet';
import { DmConversationCard } from './DmConversationCard';
import { cn } from '@/lib/utils';

const SWIPE_THRESHOLD = -72;

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
  onClick: () => void;
  onWarm?: () => void;
  index?: number;
}

export const SwipeableDmConversationRow = memo(function SwipeableDmConversationRow({
  conversation,
  profileId,
  authUid,
  onClick,
  onWarm,
  index = 0,
}: SwipeableDmConversationRowProps) {
  const isMobile = useIsMobile();
  const trashConversation = useTrashConversation();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressRef = useRef(false);
  const isDraggingRef = useRef(false);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);

  const x = useMotionValue(0);
  const deleteOpacity = useTransform(x, [-120, -40, -15, 0], [1, 0.8, 0, 0]);
  const deleteScale = useTransform(x, [-120, -40, -15, 0], [1, 0.95, 0.5, 0.3]);
  const deleteBgOpacity = useTransform(x, [-100, -30, -10, 0], [1, 0.6, 0, 0]);
  const deleteVisibility = useTransform(x, (v) => (v < -5 ? 'visible' : 'hidden') as 'visible' | 'hidden');

  const other = !conversation.is_group
    ? resolveOtherMemberFromConversation(conversation, profileId, authUid)
    : null;
  const otherMember = other?.profile;
  const displayName = displayNameForConversation(conversation, profileId, authUid, 'Chat');
  const myMembership = safeDmMembers(conversation.members).find((m) => m.user_id === profileId);
  const isPinned = Boolean(myMembership?.is_pinned);
  const isMuted = Boolean(myMembership?.is_muted);

  const handleTrash = useCallback(() => {
    trashConversation.mutate(conversation.id);
  }, [conversation.id, trashConversation]);

  const handleClick = useCallback(() => {
    if (isDraggingRef.current || isLongPressRef.current) return;
    onClick();
  }, [onClick]);

  const handleDragEnd = useCallback((_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const wasHorizontalSwipe = Math.abs(info.offset.x) > 12;
    if (info.offset.x < SWIPE_THRESHOLD) {
      if (navigator.vibrate) navigator.vibrate([15, 30, 15]);
      setIsDeleting(true);
      setTimeout(() => handleTrash(), 400);
    }
    if (wasHorizontalSwipe) {
      isDraggingRef.current = true;
      window.setTimeout(() => {
        isDraggingRef.current = false;
      }, 350);
    }
  }, [handleTrash]);

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
      otherUserId={!conversation.is_group ? otherMember?.id : undefined}
      otherUsername={!conversation.is_group ? asDisplayLabel(otherMember?.username) : undefined}
      otherDisplayName={displayName}
      otherAvatarUrl={typeof otherMember?.avatar_url === 'string' ? otherMember.avatar_url : undefined}
      isMuted={isMuted}
      isPinned={isPinned}
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
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleTouchStart}
          onMouseMove={handleTouchMove}
          onMouseUp={handleTouchEnd}
          onMouseLeave={handleTouchEnd}
        >
          <DmConversationCard
            conversation={conversation}
            profileId={profileId}
            authUid={authUid}
            onClick={handleClick}
            onWarm={onWarm}
            index={index}
          />
        </div>
        {optionsSheet}
      </>
    );
  }

  return (
    <>
      <div className="relative mb-0.5">
        <motion.div
          className="absolute inset-0 flex items-center justify-end pointer-events-none rounded-2xl"
          style={{
            opacity: deleteBgOpacity,
            visibility: deleteVisibility,
            background: 'hsl(var(--destructive))',
          }}
        >
          <motion.div
            style={{ scale: deleteScale, opacity: deleteOpacity }}
            className="flex flex-col items-center gap-0.5 text-destructive-foreground pr-6"
          >
            <Trash2 className="h-5 w-5" />
            <span className="text-[10px] font-medium">Delete</span>
          </motion.div>
        </motion.div>

        <motion.div
          className="relative overflow-hidden rounded-2xl"
          style={{ x }}
          drag="x"
          dragConstraints={{ left: -120, right: 0 }}
          dragElastic={0.1}
          dragMomentum={false}
          onDragEnd={handleDragEnd}
          animate={isDeleting ? { x: -400, opacity: 0, height: 0, marginBottom: 0 } : { x: 0 }}
          transition={
            isDeleting
              ? { duration: 0.35, ease: [0.4, 0, 0.2, 1] }
              : { type: 'spring', stiffness: 400, damping: 35 }
          }
        >
          <div
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleTouchStart}
            onMouseMove={handleTouchMove}
            onMouseUp={handleTouchEnd}
            onMouseLeave={handleTouchEnd}
          >
            <DmConversationCard
              conversation={conversation}
              profileId={profileId}
              authUid={authUid}
              onClick={handleClick}
              onWarm={onWarm}
              index={index}
            />
          </div>
        </motion.div>
      </div>
      {optionsSheet}
    </>
  );
});
