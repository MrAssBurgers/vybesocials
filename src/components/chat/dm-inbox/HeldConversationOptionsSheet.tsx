import { ConversationOptionsSheet } from '@/components/chat/ConversationOptionsSheet';
import { relationshipLabelForPreview } from '@/lib/conversationOptionsLabel';
import { useDmInboxActions } from '@/hooks/useDmInboxActions';
import type { DMConversationPreview } from '@/features/dms/dm.types';

interface HeldConversationOptionsSheetProps {
  open: boolean;
  preview: DMConversationPreview;
  onOpenChange: (open: boolean) => void;
}

function HeldConversationOptionsSheetInner({
  open,
  preview,
  onOpenChange,
}: HeldConversationOptionsSheetProps) {
  const conversation = preview.conversation;
  const inboxActions = useDmInboxActions(conversation);
  const isUnread = preview.isUnread ?? (preview.unreadCount > 0);

  return (
    <ConversationOptionsSheet
      open={open}
      onOpenChange={onOpenChange}
      conversationId={conversation.id}
      otherUserId={!conversation.is_group ? preview.otherProfileId : undefined}
      otherUsername={preview.username}
      otherDisplayName={preview.displayName}
      otherAvatarUrl={preview.avatarUrl}
      isMuted={inboxActions.isMuted}
      isPinned={inboxActions.isPinned}
      isUnread={isUnread}
      isGroup={conversation.is_group}
      isOnline={preview.isOnline}
      relationshipLabel={relationshipLabelForPreview(preview)}
      onMarkUnread={() => inboxActions.markUnread.mutate()}
      onMarkRead={() => inboxActions.markRead.mutate()}
      onArchive={() => inboxActions.archive.mutate()}
      onTogglePin={() => inboxActions.togglePin.mutate(!inboxActions.isPinned)}
      onToggleMute={() => inboxActions.toggleMute.mutate(!inboxActions.isMuted)}
      onToggleLock={() => inboxActions.toggleLock.mutate(true)}
    />
  );
}

export function HeldConversationOptionsSheet({
  open,
  preview,
  onOpenChange,
}: {
  open: boolean;
  preview: DMConversationPreview | null;
  onOpenChange: (open: boolean) => void;
}) {
  if (!preview) return null;
  return (
    <HeldConversationOptionsSheetInner
      open={open}
      preview={preview}
      onOpenChange={onOpenChange}
    />
  );
}
