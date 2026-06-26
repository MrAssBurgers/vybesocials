import { memo } from 'react';
import { motion } from 'framer-motion';
import { Users, Pin } from 'lucide-react';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';
import { safeDmMembers } from '@/lib/persistedCollections';
import { displayNameForConversation } from '@/lib/dmMemberResolve';
import { formatDmPreviewContent } from '@/lib/callChatMessages';
import { compactTime } from '@/lib/compactTime';
import { resolveProfileAvatarUrl } from '@/lib/profileAvatarCache';
import { Avatar, AvatarFallback, ProfileAvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

export interface DmConversationCardProps {
  conversation: LoadedDMConversation;
  profileId?: string;
  authUid?: string;
  onClick: () => void;
  onWarm?: () => void;
  index?: number;
}

export const DmConversationCard = memo(function DmConversationCard({
  conversation,
  profileId,
  authUid,
  onClick,
  onWarm,
  index = 0,
}: DmConversationCardProps) {
  const unread = conversation.unread_count || 0;
  const isUnread = unread > 0 || conversation._hasUnread;
  const name = displayNameForConversation(conversation, profileId, authUid, 'Chat');
  const otherMember = !conversation.is_group
    ? safeDmMembers(conversation.members).find((m) => m.user_id !== profileId)
    : null;
  const other = otherMember?.profile;
  const avatar = conversation.is_group
    ? conversation.avatar_url
    : resolveProfileAvatarUrl(other?.id, other?.avatar_url);
  const isPinned = Boolean(
    safeDmMembers(conversation.members).find((m) => m.user_id === profileId)?.is_pinned,
  );

  const lastMsg = conversation.last_message;
  const preview = (() => {
    try {
      return lastMsg
        ? formatDmPreviewContent(
            lastMsg,
            Boolean(lastMsg.sender_id && profileId && lastMsg.sender_id === profileId),
            56,
          )
        : 'Say hey 👋';
    } catch {
      return 'Say hey 👋';
    }
  })();

  const timeLabel = lastMsg?.created_at ? compactTime(lastMsg.created_at) : null;

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.24), duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      onClick={onClick}
      onPointerEnter={onWarm}
      className={cn(
        'dm-inbox-card group w-full text-left',
        isUnread && 'dm-inbox-card--unread',
        isPinned && 'dm-inbox-card--pinned',
      )}
    >
      <div className="dm-inbox-card-glow" aria-hidden />

      <div className="relative flex items-center gap-3.5 min-w-0">
        <div className="relative flex-shrink-0">
          <div
            className={cn(
              'dm-inbox-avatar-ring',
              isUnread && 'dm-inbox-avatar-ring--live',
            )}
          >
            {conversation.is_group ? (
              <Avatar className="h-[52px] w-[52px] border-2 border-background/80">
                {avatar ? (
                  <ProfileAvatarImage src={avatar} transformSize={128} />
                ) : (
                  <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-primary-foreground">
                    <Users className="h-5 w-5" />
                  </AvatarFallback>
                )}
              </Avatar>
            ) : (
              <Avatar className="h-[52px] w-[52px] border-2 border-background/80">
                <ProfileAvatarImage
                  profileId={other?.id}
                  src={avatar || undefined}
                  transformSize={128}
                />
                <AvatarFallback className="text-sm font-bold bg-gradient-to-br from-primary/90 to-accent/90 text-primary-foreground">
                  {String(name || '?')[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
            )}
          </div>
          {isPinned && (
            <span className="dm-inbox-pin" aria-label="Pinned">
              <Pin className="h-2.5 w-2.5" />
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0 py-0.5">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <p className={cn('dm-inbox-name truncate', isUnread && 'dm-inbox-name--unread')}>
              {name}
            </p>
            {timeLabel && (
              <span className={cn('dm-inbox-time shrink-0', isUnread && 'dm-inbox-time--unread')}>
                {timeLabel}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <p className={cn('dm-inbox-preview truncate flex-1', isUnread && 'dm-inbox-preview--unread')}>
              {preview}
            </p>
            {isUnread && (
              <span className="dm-inbox-unread-badge" aria-label={`${unread || 1} unread`}>
                {unread > 9 ? '9+' : unread || '•'}
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.button>
  );
});
